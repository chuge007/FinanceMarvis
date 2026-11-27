/**
 * 出站传输层：代理探测 + CONNECT 隧道 + 统一请求。
 *
 * 为什么不用 https-proxy-agent：
 *   后端要能打进 Node SEA 单文件 exe，运行时装不到 node_modules。
 *   所以这里只用 node 内置 http/https/tls 自己实现 CONNECT 隧道，
 *   与 desktop/launcher.cjs 里已验证的写法保持一致。
 */
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import net from 'node:net'

const DEFAULT_PORTS = [7897, 7890, 10809, 1080]

/**
 * 服务端出站默认指纹。
 *
 * 实测教训：不带 User-Agent 时，FRED 连接会被静默丢包（表现为超时），
 * 东财带参数请求直接 socket hang up；同一 URL 用 curl 却 200。
 * 因为 curl 自带 UA。所以这里统一注入，不依赖每个适配器自己记得加。
 */
const DEFAULT_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: '*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

export function probePort(host, port, ms = 350) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(ms)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/**
 * 优先级：MARVIS_PROXY > HTTPS_PROXY/ALL_PROXY > 本机常见端口 > 直连。
 * 与 vite.config.ts、desktop/launcher.cjs 完全一致，避免 dev 与 exe 行为分叉。
 */
export async function detectProxy(ports = DEFAULT_PORTS) {
  const explicit = process.env.MARVIS_PROXY
  if (explicit) return { url: explicit, source: 'env' }
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY
  if (envProxy) return { url: envProxy, source: 'env' }
  for (const port of ports) {
    if (await probePort('127.0.0.1', port)) return { url: `http://127.0.0.1:${port}`, source: 'detected' }
  }
  return { url: '', source: 'none' }
}

/** 用 CONNECT 隧道把 TLS 连接经本地 HTTP 代理送出去。 */
function tlsThroughProxy(proxyUrl, host, port) {
  return new Promise((resolve, reject) => {
    let p
    try {
      p = new URL(proxyUrl)
    } catch (err) {
      reject(err)
      return
    }
    const creq = http.request({
      host: p.hostname,
      port: Number(p.port || 80),
      method: 'CONNECT',
      path: `${host}:${port}`,
      headers: { Host: `${host}:${port}` },
      agent: false,
      timeout: 8000,
    })
    creq.on('connect', (pres, socket, head) => {
      if (pres.statusCode !== 200) {
        socket.destroy()
        reject(new Error(`CONNECT 返回 ${pres.statusCode}`))
        return
      }
      const secured = tls.connect({ socket, servername: host }, () => resolve(secured))
      secured.once('error', reject)
      if (head && head.length) secured.unshift(head)
    })
    creq.on('timeout', () => creq.destroy(new Error('代理 CONNECT 超时')))
    creq.on('error', reject)
    creq.end()
  })
}

class ConnectProxyAgent extends https.Agent {
  constructor(proxyUrl) {
    super({ keepAlive: false })
    this.proxyUrl = proxyUrl
  }

  createConnection(options, cb) {
    const host = options.servername || options.host
    const port = options.port || 443
    tlsThroughProxy(this.proxyUrl, host, port).then(
      (sock) => cb(null, sock),
      (err) => cb(err),
    )
  }
}

/**
 * 传输器：持有代理状态与 agent 缓存，供适配器与转发层共用。
 */
/**
 * @param {{ports?: number[], log?: (message: string) => void}} [opts]
 */
export function createTransport({ ports = DEFAULT_PORTS, log = () => {} } = {}) {
  let proxyUrl = ''
  let proxySource = 'none'
  /** @type {Map<string, ConnectProxyAgent>} */
  const agents = new Map()

  function agentFor(viaProxy) {
    if (!viaProxy || !proxyUrl) return undefined
    if (!agents.has(proxyUrl)) agents.set(proxyUrl, new ConnectProxyAgent(proxyUrl))
    return agents.get(proxyUrl)
  }

  async function init() {
    const detected = await detectProxy(ports)
    proxyUrl = detected.url
    proxySource = detected.source
    log(
      proxyUrl
        ? `[transport] 出海代理 ${proxyUrl}（${proxySource}）`
        : '[transport] 未检测到出海代理，需出海源将直连',
    )
    return { url: proxyUrl, source: proxySource }
  }

  /**
   * 统一请求。返回 { status, headers, body }，不抛异常（网络失败也返回 status:0）。
   * @param {{url:string, method?:string, headers?:Record<string,string>, body?:string|Buffer, viaProxy?:boolean, timeoutMs?:number}} opts
   */
  async function request(opts) {
    const {
      url,
      method = 'GET',
      headers = {},
      body,
      viaProxy = false,
      timeoutMs = 15_000,
    } = opts

    let u
    try {
      u = new URL(url)
    } catch (err) {
      return { status: 0, headers: {}, body: Buffer.alloc(0), error: `URL 非法: ${err.message}` }
    }

    const isHttps = u.protocol === 'https:'
    const mod = isHttps ? https : http
    const agent = isHttps ? agentFor(viaProxy) : undefined

    // 直连优先用内置 fetch(undici)。
    // 实测：fred.stlouisfed.org 在 Cloudflare 后面，https.request 的 TLS 指纹会被静默丢包（超时），
    // 同一 URL 用 fetch / curl 都是 200。代理通道 fetch 不支持自定义 agent，仍走 https.request。
    if (!viaProxy) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const resp = await fetch(url, {
          method,
          headers: { ...DEFAULT_HEADERS, ...headers },
          body: body ?? undefined,
          signal: ctrl.signal,
          redirect: 'follow',
        })
        const buf = Buffer.from(await resp.arrayBuffer())
        const outHeaders = {}
        resp.headers.forEach((v, k) => {
          outHeaders[k] = v
        })
        return { status: resp.status, headers: outHeaders, body: buf }
      } catch (err) {
        return { status: 0, headers: {}, body: Buffer.alloc(0), error: err?.message ?? 'fetch 失败' }
      } finally {
        clearTimeout(timer)
      }
    }

    return new Promise((resolve) => {
      let settled = false
      const done = (payload) => {
        if (settled) return
        settled = true
        resolve(payload)
      }

      const req = mod.request(
        {
          method,
          hostname: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: u.pathname + u.search,
          headers: { ...DEFAULT_HEADERS, ...headers },
          agent,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = []
          let size = 0
          const limit = 8 * 1024 * 1024
          res.on('data', (c) => {
            size += c.length
            if (size > limit) {
              res.destroy(new Error('响应体超过 8MB 上限'))
              return
            }
            chunks.push(c)
          })
          res.on('end', () =>
            done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
          )
          res.on('error', (err) => done({ status: 0, headers: {}, body: Buffer.alloc(0), error: err.message }))
        },
      )

      req.on('timeout', () => req.destroy(new Error(`上游超时 ${timeoutMs}ms`)))
      req.on('error', (err) => done({ status: 0, headers: {}, body: Buffer.alloc(0), error: err.message }))
      if (body) req.end(body)
      else req.end()
    })
  }

  async function getText(url, opts = {}) {
    const res = await request({ url, ...opts })
    return { ...res, text: res.body.toString('utf8') }
  }

  async function getJson(url, opts = {}) {
    const res = await getText(url, opts)
    if (!res.text) return { ...res, json: null }
    try {
      return { ...res, json: JSON.parse(res.text) }
    } catch {
      return { ...res, json: null, error: 'JSON 解析失败' }
    }
  }

  return {
    init,
    request,
    getText,
    getJson,
    agentFor,
    get proxyUrl() {
      return proxyUrl
    },
    get proxySource() {
      return proxySource
    },
  }
}
