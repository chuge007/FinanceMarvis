/**
 * StrategyLab 生产转发后端（原生 Node，无需额外依赖框架）。
 *
 * 职责：
 *  1. 静态托管 `dist/` 构建产物（SPA，非 API 请求回源 index.html）；
 *  2. 将六个上游数据源同域转发，规避浏览器 CORS / 反爬 / 地区封锁：
 *     - /eastmoney-news    → np-listapi.eastmoney.com（注入 eastmoney Referer）
 *     - /yahoo             → query1.finance.yahoo.com（注入 UA/Referer）
 *     - /cboe              → www.cboe.com（CBOE 官方期权统计，注入 UA/Referer）
 *     - /eastmoney-kline   → push2his.eastmoney.com
 *     - /eastmoney-quote   → push2.eastmoney.com
 *     - /convex            → convextrade.com/api/public
 *
 * ConvexTrade 对中国大陆按地区封锁：
 *  - 服务部署在海外时直连即可；
 *  - 服务部署在大陆且本机有出海代理时，设置 HTTPS_PROXY=http://127.0.0.1:7897 之类即可经代理转发；
 *  - 不设置 HTTPS_PROXY 时退回直连（用于海外部署 / 本地无代理测试）。
 *
 * 启动：node server/proxy.mjs   （PORT 环境变量可改端口，默认 8080）
 * 需先执行 npm run build 生成 dist。
 */
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { createAiHandler } from './ai-gateway.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 8080)
const PROXY_PORTS = [7897, 7890, 10809, 1080]

function probePort(host, port, ms = 350) {
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

/** 与 vite.config.ts / launcher.cjs 保持同一优先级。 */
async function detectProxy() {
  const explicit = process.env.MARVIS_PROXY
  if (explicit) return { url: explicit, source: 'env' }
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY
  if (envProxy) return { url: envProxy, source: 'env' }
  for (const port of PROXY_PORTS) {
    if (await probePort('127.0.0.1', port)) return { url: `http://127.0.0.1:${port}`, source: 'detected' }
  }
  return { url: '', source: 'none' }
}

const PROXY = await detectProxy()
const OUTBOUND_PROXY = PROXY.url
let proxyAgent = null

function makeAgent() {
  if (!OUTBOUND_PROXY) return undefined
  if (!proxyAgent) proxyAgent = new HttpsProxyAgent(OUTBOUND_PROXY)
  return proxyAgent
}

// 通用浏览器 UA（Yahoo 等接口用反爬校验 User-Agent）
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const CONN_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

// 上游路由表：prefix -> { origin, headers, viaProxy }
// viaProxy=true 的源在本机直连会被地区限制（Yahoo/CBOE/Convex），经探测到的出海代理转发；
// 东财/FRED/腾讯/新浪保持直连，实测经海外代理反而失败。
const ROUTES = [
  {
    prefix: '/eastmoney-news',
    origin: 'https://np-listapi.eastmoney.com',
    headers: { Referer: 'https://www.eastmoney.com/', Origin: 'https://www.eastmoney.com' },
    viaProxy: false,
  },
  {
    prefix: '/yahoo',
    origin: 'https://query1.finance.yahoo.com',
    headers: { 'User-Agent': UA, Referer: 'https://finance.yahoo.com/', Origin: 'https://finance.yahoo.com' },
    viaProxy: true,
  },
  {
    prefix: '/yahoo-alt',
    origin: 'https://query2.finance.yahoo.com',
    headers: { 'User-Agent': UA, Referer: 'https://finance.yahoo.com/', Origin: 'https://finance.yahoo.com' },
    viaProxy: true,
  },
  {
    prefix: '/cboe',
    origin: 'https://www.cboe.com',
    headers: { 'User-Agent': UA, Referer: 'https://www.cboe.com/', Origin: 'https://www.cboe.com' },
    viaProxy: true,
  },
  {
    prefix: '/eastmoney-kline',
    origin: 'https://push2his.eastmoney.com',
    headers: { Referer: 'https://quote.eastmoney.com/', Origin: 'https://quote.eastmoney.com' },
    viaProxy: false,
  },
  {
    prefix: '/eastmoney-quote',
    origin: 'https://push2.eastmoney.com',
    headers: { Referer: 'https://quote.eastmoney.com/', Origin: 'https://quote.eastmoney.com' },
    viaProxy: false,
  },
  {
    // 腾讯行业板块榜：东财不可达时的真实替代源
    prefix: '/tencent-rank',
    origin: 'https://proxy.finance.qq.com',
    headers: { 'User-Agent': UA, Referer: 'https://gu.qq.com/' },
    viaProxy: false,
  },
  {
    // 新浪板块：第二兜底（GBK 页面）
    prefix: '/sina-sector',
    origin: 'https://vip.stock.finance.sina.com.cn',
    headers: { 'User-Agent': UA, Referer: 'https://finance.sina.com.cn/' },
    viaProxy: false,
  },
  {
    prefix: '/convex',
    origin: 'https://convextrade.com/api/public',
    headers: {},
    viaProxy: true,
  },
  {
    // 美国财政部官方收益率曲线 CSV：公开页面，国内可直连
    prefix: '/treasury',
    origin: 'https://home.treasury.gov',
    headers: { 'User-Agent': UA, Referer: 'https://home.treasury.gov/' },
  },
  {
    // 美联储官网 FOMC 日历：公开页面，国内可直连，无需出海代理
    prefix: '/fed',
    origin: 'https://www.federalreserve.gov',
    headers: { 'User-Agent': UA, Referer: 'https://www.federalreserve.gov/' },
    viaProxy: false,
  },
  {
    // FRED 图表 CSV 直链：一次请求拿整条序列，免 key。实测经 7897 不可用，保持直连。
    prefix: '/fred',
    origin: 'https://fred.stlouisfed.org',
    headers: { 'User-Agent': UA, Referer: 'https://fred.stlouisfed.org/' },
    viaProxy: false,
  },
  {
    // FRED 直连被地区限制时的代理通道（部分节点可达）
    prefix: '/fred-proxy',
    origin: 'https://fred.stlouisfed.org',
    headers: { 'User-Agent': UA, Referer: 'https://fred.stlouisfed.org/' },
    viaProxy: true,
  },
  {
    // 台湾证交所开放数据：台股月营收汇总表，免 key
    prefix: '/twse',
    origin: 'https://openapi.twse.com.tw',
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    viaProxy: false,
  },
]

/** 向 https 上游转发请求（支持可选出海代理，代理失败时 GET 回退直连一次）。 */
function proxyRequest(req, res, route, allowRetry = true) {
  const target = route.origin + (req.url ?? '').slice(route.prefix.length)
  let u
  try {
    u = new URL(target)
  } catch {
    res.statusCode = 400
    res.end('Bad upstream url')
    return
  }

  const headers = { ...route.headers }
  if (req.headers['user-agent']) headers['user-agent'] = req.headers['user-agent']
  headers['accept'] = req.headers['accept'] ?? '*/*'
  if (route.prefix !== '/convex') {
    // 上游按 Content-Type 判断，非 GET/POST 场景一般无 body，仅透传时的 content-type
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
  }

  const agent = route.viaProxy ? makeAgent() : undefined
  const preq = https.request(
    {
      method: req.method,
      host: u.host,
      path: u.pathname + u.search,
      headers,
      agent,
      timeout: 15000,
    },
    (pres) => {
      res.statusCode = pres.statusCode ?? 502
      const passthrough = ['content-type', 'content-length', 'cache-control', 'expires', 'last-modified', 'etag']
      for (const k of passthrough) {
        const v = pres.headers[k]
        if (v !== undefined && v !== null) res.setHeader(k, v)
      }
      pres.pipe(res)
    },
  )
  preq.on('timeout', () => preq.destroy(new Error('upstream timeout')))
  preq.on('error', (err) => {
    if (agent && allowRetry && !res.headersSent && (req.method === 'GET' || req.method === 'HEAD')) {
      console.warn(`[proxy] ${route.prefix} 经代理失败，回退直连：${err.message}`)
      proxyRequest(req, res, { ...route, viaProxy: false }, false)
      return
    }
    if (!res.headersSent) {
      res.statusCode = 502
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(`Upstream error: ${err.message}`)
    } else {
      res.destroy()
    }
  })
  req.pipe(preq)
}

/** 静态文件服务，SPA 回源 index.html。 */
async function serveStatic(req, res, pathname) {
  // 防止路径穿越
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  let file = path.join(DIST, safe)
  if (safe.endsWith('/')) file = path.join(file, 'index.html')

  try {
    const st = await fs.stat(file)
    if (st.isDirectory()) file = path.join(file, 'index.html')
    const data = await fs.readFile(file)
    const ext = path.extname(file).toLowerCase()
    res.statusCode = 200
    res.setHeader('content-type', CONN_TYPES[ext] ?? 'application/octet-stream')
    res.end(data)
  } catch {
    // SPA fallback：非静态资源路径回源 index.html
    try {
      const data = await fs.readFile(path.join(DIST, 'index.html'))
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(data)
    } catch {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('dist not found, run `npm run build` first')
    }
  }
}

// 内置 AI 网关：/ai/config、/ai/chat（详见 server/ai-gateway.mjs）
const handleAi = createAiHandler({ log: (msg) => console.log(msg) })

const server = http.createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0]
  if (pathname === '/proxy-status') {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify({ proxy: OUTBOUND_PROXY || null, source: PROXY.source, at: Date.now() }))
    return
  }
  if (pathname.startsWith('/ai/')) {
    void handleAi(req, res, pathname).then((handled) => {
      if (handled) return
      res.statusCode = 404
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: { message: '未知的 AI 路由' } }))
    })
    return
  }
  const route = ROUTES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
  if (route) {
    proxyRequest(req, res, route)
    return
  }
  serveStatic(req, res, pathname)
})

server.listen(PORT, '127.0.0.1', () => {
  const via = OUTBOUND_PROXY ? ` (经代理 ${OUTBOUND_PROXY})` : ''
  console.log(`[StrategyLab] 生产服务已启动: http://127.0.0.1:${PORT}`)
  console.log(`[StrategyLab] 仅监听回环地址，局域网其它设备无法访问`)
  console.log(`[StrategyLab] 静态目录: ${DIST}`)
  console.log(`[StrategyLab] 转发: /convex /eastmoney-news /yahoo /yahoo-alt /cboe /eastmoney-kline /eastmoney-quote /tencent-rank /sina-sector /treasury /fred /fed /twse${via}`)
  console.log(
    OUTBOUND_PROXY
      ? `[StrategyLab] 出海代理: ${OUTBOUND_PROXY}（${PROXY.source}；Yahoo/CBOE/Convex 经此通道）`
      : '[StrategyLab] 未检测到出海代理：Yahoo/CBOE/Convex 走直连（可能有地区限制）',
  )
  console.log(
    process.env.AI_BASE_URL
      ? `[StrategyLab] AI 网关: 服务端统一配置 ${process.env.AI_BASE_URL}（模型 ${process.env.AI_MODEL || '未指定'}）`
      : '[StrategyLab] AI 网关: 未配置 AI_BASE_URL，由前端「AI 设置」自填接口与 Key',
  )
})
