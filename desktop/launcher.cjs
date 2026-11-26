'use strict'
/**
 * Marvis 桌面单文件版启动器（Node SEA 入口，CommonJS）
 *
 * 一个 exe 同时承担：
 *  1. 内嵌 dist/ 全部静态资源并托管（SPA 回源）；
 *  2. 同域转发 6 个上游数据源，绕开 CORS / 反爬 / 地区封锁；
 *  3. 自动挑选可用端口、自动打开默认浏览器、单实例复用；
 *  4. 页面右下角提供「退出程序」按钮，优雅关闭服务。
 *
 * 调试（未注入 SEA）：node desktop/launcher.cjs  （从项目根目录执行）
 */
const http = require('node:http')
const https = require('node:https')
const tls = require('node:tls')
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')

let sea = null
try { sea = require('node:sea') } catch { /* 普通 node 调试模式 */ }
const IS_SEA = !!(sea && sea.isSea())
const DIST = path.resolve(process.cwd(), 'dist')
const LOG_FILE = path.join(os.tmpdir(), 'marvis-exe.log')
const BASE_PORT = Number(process.env.MARVIS_PORT || 5173)

function log() {
  const line = '[' + new Date().toLocaleString('zh-CN') + '] ' + Array.from(arguments).join(' ') + '\r\n'
  try { fs.appendFileSync(LOG_FILE, line) } catch { /* 忽略日志失败 */ }
  try { process.stdout.write(line) } catch { /* GUI 子系统无控制台 */ }
}

function fatal(err) {
  log('致命错误: ' + (err && err.stack ? err.stack : String(err)))
  try {
    const msg = String(err && err.message ? err.message : err).replace(/'/g, "''")
    spawn('powershell.exe', [
      '-NoProfile', '-WindowStyle', 'Hidden', '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('" + msg + "','Marvis 启动失败','OK','Error')"
    ], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch { /* 弹窗失败也不影响日志 */ }
  setTimeout(() => process.exit(1), 1500)
}

process.on('uncaughtException', (e) => log('未捕获异常: ' + (e && e.stack ? e.stack : e)))
process.on('unhandledRejection', (e) => log('未处理拒绝: ' + (e && e.stack ? e.stack : e)))

// ───────────────────────── 内嵌静态资源 ─────────────────────────
let MANIFEST = null
function manifest() {
  if (MANIFEST) return MANIFEST
  const raw = readAsset('assets-manifest.json')
  MANIFEST = raw ? JSON.parse(raw.toString('utf8')) : []
  return MANIFEST
}

function readAsset(key) {
  if (IS_SEA) {
    try {
      const a = sea.getAsset(key)
      if (a == null) return null
      return typeof a === 'string' ? Buffer.from(a, 'utf8') : Buffer.from(a)
    } catch { return null }
  }
  try { return fs.readFileSync(path.join(DIST, key)) } catch { return null }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
}

// 注入到首页右下角的退出控件（仅内存注入，不改 dist 源文件）
const EXIT_SNIPPET = [
  '<style>#__marvis_exit{position:fixed;right:14px;bottom:14px;z-index:2147483647;',
  'padding:6px 12px;border:1px solid rgba(255,255,255,.22);border-radius:999px;',
  'background:rgba(18,22,30,.72);color:#c9d2df;font:12px/1.4 "Microsoft YaHei",sans-serif;',
  'cursor:pointer;backdrop-filter:blur(6px);user-select:none;transition:.2s}',
  '#__marvis_exit:hover{background:rgba(200,60,60,.85);color:#fff;border-color:transparent}',
  '</style>',
  '<div id="__marvis_exit" title="关闭 Marvis 后台服务">退出程序</div>',
  '<script>(function(){var b=document.getElementById("__marvis_exit");if(!b)return;',
  'b.onclick=function(){b.textContent="已停止 · 可关闭页面";b.style.pointerEvents="none";',
  'fetch("/__marvis_exit").catch(function(){});};})();</script>',
].join('')

function serveStatic(req, res, pathname) {
  let key
  try { key = decodeURIComponent(pathname).replace(/^\/+/, '') } catch { key = '' }
  if (!key || key.includes('..')) key = 'index.html'

  let data = readAsset(key)
  let resolvedKey = key
  if (!data && !path.extname(key)) {
    data = readAsset('index.html')
    resolvedKey = 'index.html'
  }
  if (!data) {
    res.statusCode = 404
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('404 Not Found')
    return
  }
  if (resolvedKey === 'index.html') {
    data = Buffer.from(data.toString('utf8').replace('</body>', EXIT_SNIPPET + '</body>'))
  }
  res.statusCode = 200
  res.setHeader('content-type', MIME[path.extname(resolvedKey).toLowerCase()] || 'application/octet-stream')
  res.setHeader('cache-control', 'no-cache')
  res.end(data)
}

// ───────────────────────── 上游转发 ─────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const ROUTES = [
  { prefix: '/eastmoney-news', origin: 'https://np-listapi.eastmoney.com',
    headers: { Referer: 'https://www.eastmoney.com/', Origin: 'https://www.eastmoney.com' }, viaProxy: false },
  { prefix: '/yahoo', origin: 'https://query1.finance.yahoo.com',
    headers: { 'User-Agent': UA, Referer: 'https://finance.yahoo.com/', Origin: 'https://finance.yahoo.com' }, viaProxy: true },
  { prefix: '/yahoo-alt', origin: 'https://query2.finance.yahoo.com',
    headers: { 'User-Agent': UA, Referer: 'https://finance.yahoo.com/', Origin: 'https://finance.yahoo.com' }, viaProxy: true },
  { prefix: '/cboe', origin: 'https://www.cboe.com',
    headers: { 'User-Agent': UA, Referer: 'https://www.cboe.com/', Origin: 'https://www.cboe.com' }, viaProxy: true },
  { prefix: '/eastmoney-kline', origin: 'https://push2his.eastmoney.com',
    headers: { Referer: 'https://quote.eastmoney.com/', Origin: 'https://quote.eastmoney.com' }, viaProxy: false },
  { prefix: '/eastmoney-quote', origin: 'https://push2.eastmoney.com',
    headers: { Referer: 'https://quote.eastmoney.com/', Origin: 'https://quote.eastmoney.com' }, viaProxy: false },
  { prefix: '/tencent-rank', origin: 'https://proxy.finance.qq.com',
    headers: { 'User-Agent': UA, Referer: 'https://gu.qq.com/' }, viaProxy: false },
  { prefix: '/sina-sector', origin: 'https://vip.stock.finance.sina.com.cn',
    headers: { 'User-Agent': UA, Referer: 'https://finance.sina.com.cn/' }, viaProxy: false },
  { prefix: '/convex', origin: 'https://convextrade.com/api/public', headers: {}, viaProxy: true },
  // 美国财政部官方收益率曲线 CSV：国内可直连
  { prefix: '/treasury', origin: 'https://home.treasury.gov',
    headers: { 'User-Agent': UA, Referer: 'https://home.treasury.gov/' }, viaProxy: false },
  // 美联储 FOMC 日历：国内可直连，不走出海代理
  { prefix: '/fed', origin: 'https://www.federalreserve.gov',
    headers: { 'User-Agent': UA, Referer: 'https://www.federalreserve.gov/' }, viaProxy: false },
  // FRED 图表 CSV 直链：免 key，一次拿整条序列
  { prefix: '/fred', origin: 'https://fred.stlouisfed.org',
    headers: { 'User-Agent': UA, Referer: 'https://fred.stlouisfed.org/' }, viaProxy: false },
  // FRED 直连失败时的代理通道
  { prefix: '/fred-proxy', origin: 'https://fred.stlouisfed.org',
    headers: { 'User-Agent': UA, Referer: 'https://fred.stlouisfed.org/' }, viaProxy: true },
  // 台湾证交所开放数据：台股月营收汇总表
  { prefix: '/twse', origin: 'https://openapi.twse.com.tw',
    headers: { 'User-Agent': UA, Accept: 'application/json' }, viaProxy: false },
]

let PROXY_URL = ''
let PROXY_SOURCE = 'none'
const proxyAgents = new Map()

function probePort(host, port, ms) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port })
    let done = false
    const finish = (ok) => { if (!done) { done = true; s.destroy(); resolve(ok) } }
    s.setTimeout(ms || 400)
    s.once('connect', () => finish(true))
    s.once('timeout', () => finish(false))
    s.once('error', () => finish(false))
  })
}

async function detectProxy() {
  // 优先级与 vite.config.ts / server/proxy.mjs 一致：
  // 手动指定 > 环境变量 > 本机常见端口（项目约定 7897）> 直连
  const explicit = process.env.MARVIS_PROXY
  if (explicit) {
    PROXY_URL = explicit
    PROXY_SOURCE = 'env'
    log('出海代理(手动指定 MARVIS_PROXY): ' + PROXY_URL)
    return
  }
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || ''
  if (envProxy) {
    PROXY_URL = envProxy
    PROXY_SOURCE = 'env'
    log('使用系统代理: ' + PROXY_URL)
    return
  }
  for (const port of [7897, 7890, 10809, 1080]) {
    if (await probePort('127.0.0.1', port, 350)) {
      PROXY_URL = 'http://127.0.0.1:' + port
      PROXY_SOURCE = 'detected'
      log('检测到本机出海代理: ' + PROXY_URL + '（Yahoo / CBOE / Convex 走此通道）')
      return
    }
  }
  log('未检测到出海代理，/convex、/yahoo、/cboe 走直连（可能有地区限制，页面已有兜底数据源）')
}

function currentProxy() { return PROXY_URL }

/** 用 CONNECT 隧道把 TLS 连接经本地 HTTP 代理送出去（无需 https-proxy-agent）。 */
function tlsThroughProxy(proxyUrl, host, port) {
  return new Promise((resolve, reject) => {
    let p
    try { p = new URL(proxyUrl) } catch (e) { return reject(e) }
    const creq = http.request({
      host: p.hostname,
      port: Number(p.port || 80),
      method: 'CONNECT',
      path: host + ':' + port,
      headers: { Host: host + ':' + port },
      agent: false,
      timeout: 8000,
    })
    creq.on('connect', (pres, socket, head) => {
      if (pres.statusCode !== 200) {
        socket.destroy()
        return reject(new Error('CONNECT 返回 ' + pres.statusCode))
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
  constructor(proxyUrl) { super({ keepAlive: false }); this.proxyUrl = proxyUrl }
  createConnection(options, cb) {
    const host = options.servername || options.host
    const port = options.port || 443
    tlsThroughProxy(this.proxyUrl, host, port).then(
      (sock) => cb(null, sock),
      (err) => cb(err),
    )
  }
}

function agentFor(route) {
  if (!route.viaProxy) return undefined
  const p = currentProxy()
  if (!p) return undefined
  if (!proxyAgents.has(p)) proxyAgents.set(p, new ConnectProxyAgent(p))
  return proxyAgents.get(p)
}

function proxyRequest(req, res, route, allowRetry = true) {
  const target = route.origin + (req.url || '').slice(route.prefix.length)
  let u
  try { u = new URL(target) } catch {
    res.statusCode = 400
    res.end('Bad upstream url')
    return
  }
  const headers = Object.assign({}, route.headers)
  if (req.headers['user-agent']) headers['user-agent'] = String(req.headers['user-agent'])
  headers['accept'] = String(req.headers['accept'] || '*/*')
  if (route.prefix !== '/convex' && req.headers['content-type']) {
    headers['content-type'] = String(req.headers['content-type'])
  }

  let agent
  try { agent = agentFor(route) } catch (e) { log('代理初始化失败，改直连: ' + e.message) }

  const preq = https.request({
    method: req.method,
    host: u.host,
    port: 443,
    path: u.pathname + u.search,
    headers,
    agent,
    timeout: 15000,
  }, (pres) => {
    res.statusCode = pres.statusCode || 502
    for (const k of ['content-type', 'content-length', 'cache-control', 'expires', 'last-modified', 'etag']) {
      const v = pres.headers[k]
      if (v !== undefined && v !== null) res.setHeader(k, v)
    }
    pres.pipe(res)
  })
  preq.on('timeout', () => preq.destroy(new Error('上游超时')))
  preq.on('error', (err) => {
    if (agent && allowRetry && !res.headersSent && (req.method === 'GET' || req.method === 'HEAD')) {
      log(`[proxy] ${route.prefix} 经代理失败，回退直连: ${err.message}`)
      proxyRequest(req, res, Object.assign({}, route, { viaProxy: false }), false)
      return
    }
    if (!res.headersSent) {
      res.statusCode = 502
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('Upstream error: ' + err.message)
    } else {
      res.destroy()
    }
  })
  req.pipe(preq)
}

// ───────────────────────── 内置 AI 网关 ─────────────────────────
// 与 server/ai-gateway.mjs 同逻辑；exe 单文件运行时无法 require 外部模块，故内联一份精简实现。
// 凭证优先取环境变量（部署方统一配置），其次取请求头（使用者自带 Key，存本机 localStorage）。
function normalizeAiBase(raw) {
  let base = String(raw || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  base = base.replace(/\/chat\/completions$/, '')
  if (!/\/v\d+[a-z]*$/i.test(base)) base += '/v1'
  return base
}

function aiCredential(req) {
  const envBase = normalizeAiBase(process.env.AI_BASE_URL)
  if (envBase) {
    return {
      base: envBase,
      key: String(process.env.AI_API_KEY || '').trim(),
      model: String(process.env.AI_MODEL || '').trim(),
    }
  }
  return {
    base: normalizeAiBase(req.headers['x-ai-base']),
    key: String(req.headers['x-ai-key'] || '').trim(),
    model: String(req.headers['x-ai-model'] || '').trim(),
  }
}

function aiFail(res, status, message) {
  if (res.headersSent) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify({ error: { message: message, type: 'ai_gateway_error' } }))
}

function readAiBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 4 * 1024 * 1024) { reject(new Error('请求体过大（上限 4MB）')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { reject(new Error('请求体不是合法 JSON')) }
    })
    req.on('error', reject)
  })
}

async function handleAi(req, res, pathname) {
  if (pathname === '/ai/config') {
    const envBase = normalizeAiBase(process.env.AI_BASE_URL)
    let host = ''
    if (envBase) { try { host = new URL(envBase).host } catch { host = '' } }
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify({
      configured: Boolean(envBase),
      model: envBase ? String(process.env.AI_MODEL || '') : '',
      baseUrl: host,
    }))
    return
  }

  if (pathname === '/ai/models') {
    const cred = aiCredential(req)
    if (!cred.base) return aiFail(res, 400, '未配置模型接口')
    let target
    try { target = new URL(cred.base + '/models') } catch { return aiFail(res, 400, 'Base URL 格式不正确') }
    const transport = target.protocol === 'http:' ? http : https
    const headers = { accept: 'application/json' }
    if (cred.key) headers.authorization = 'Bearer ' + cred.key
    const preq = transport.request({
      method: 'GET',
      host: target.hostname,
      port: target.port || (target.protocol === 'http:' ? 80 : 443),
      path: target.pathname + target.search,
      headers,
      timeout: 20000,
    }, (pres) => {
      const chunks = []
      pres.on('data', (c) => chunks.push(c))
      pres.on('end', () => {
        res.statusCode = pres.statusCode || 502
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(Buffer.concat(chunks).toString('utf8'))
      })
      pres.on('error', () => aiFail(res, 502, '拉取模型列表失败'))
    })
    preq.on('timeout', () => preq.destroy(new Error('上游超时')))
    preq.on('error', (err) => aiFail(res, 502, '上游不可达：' + err.message))
    preq.end()
    return
  }

  if (req.method !== 'POST') return aiFail(res, 405, '请使用 POST')

  const cred = aiCredential(req)
  if (!cred.base) return aiFail(res, 400, '未配置模型接口：请在「AI 设置」里填写 Base URL、API Key 与模型名')

  let body
  try { body = await readAiBody(req) } catch (e) { return aiFail(res, 400, e.message) }
  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) return aiFail(res, 400, 'messages 不能为空')

  const model = String(body.model || cred.model || '').trim()
  if (!model) return aiFail(res, 400, '缺少模型名（model）')

  let target
  try { target = new URL(cred.base + '/chat/completions') } catch { return aiFail(res, 400, 'Base URL 格式不正确') }

  const stream = body.stream !== false
  const payload = JSON.stringify({
    model,
    messages,
    stream,
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
  })

  const transport = target.protocol === 'http:' ? http : https
  const headers = {
    'content-type': 'application/json',
    accept: stream ? 'text/event-stream' : 'application/json',
  }
  if (cred.key) headers.authorization = 'Bearer ' + cred.key

  const preq = transport.request({
    method: 'POST',
    host: target.hostname,
    port: target.port || (target.protocol === 'http:' ? 80 : 443),
    path: target.pathname + target.search,
    headers,
    timeout: 120000,
  }, (pres) => {
    const ct = pres.headers['content-type'] || (stream ? 'text/event-stream; charset=utf-8' : 'application/json')
    res.statusCode = pres.statusCode || 502
    res.setHeader('content-type', String(ct))
    res.setHeader('cache-control', 'no-cache, no-transform')
    res.setHeader('x-accel-buffering', 'no')
    if (pres.headers['content-length']) res.setHeader('content-length', String(pres.headers['content-length']))
    if ((pres.statusCode || 0) >= 400) {
      const chunks = []
      pres.on('data', (c) => chunks.push(c))
      pres.on('end', () => { if (!res.writableEnded) res.end(Buffer.concat(chunks)) })
      pres.on('error', () => res.destroy())
      return
    }
    pres.pipe(res)
    pres.on('error', () => res.destroy())
  })

  preq.on('timeout', () => preq.destroy(new Error('上游超时（120s）')))
  preq.on('error', (err) => {
    log('[ai] 上游请求失败: ' + err.message)
    if (!res.headersSent) aiFail(res, 502, '上游不可达：' + err.message)
    else res.destroy()
  })
  // 客户端点“停止”时及时掐断上游连接，避免继续消耗额度。
  res.on('close', () => { if (!res.writableEnded) preq.destroy() })
  preq.end(payload)
}

// ───────────────────────── 服务与启动 ─────────────────────────
const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0]
  if (pathname === '/proxy-status') {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify({ proxy: PROXY_URL || null, source: PROXY_SOURCE, at: Date.now() }))
    return
  }
  if (pathname.startsWith('/ai/')) {
    handleAi(req, res, pathname).catch((err) => aiFail(res, 500, err && err.message ? err.message : 'AI 网关异常'))
    return
  }
  if (pathname === '/__marvis_ping') {
    res.statusCode = 200
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('marvis-ok')
    return
  }
  if (pathname === '/__marvis_exit') {
    res.statusCode = 200
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('stopped')
    setTimeout(() => { try { server.close() } catch {} ; process.exit(0) }, 150)
    return
  }
  const route = ROUTES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
  if (route) return proxyRequest(req, res, route)
  serveStatic(req, res, pathname)
})

function openBrowser(url) {
  if (process.env.MARVIS_NO_BROWSER) { log('MARVIS_NO_BROWSER=1，跳过自动打开浏览器: ' + url); return }
  const fallback = () => {
    try { spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }).unref() } catch (e) { log('打开浏览器失败: ' + e.message) }
  }
  try {
    const child = spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', fallback)
    child.unref()
  } catch { fallback() }
}

function pingExisting(port) {
  return new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port, path: '/__marvis_ping', timeout: 400 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve(d.indexOf('marvis-ok') >= 0))
    })
    r.on('timeout', () => { r.destroy(); resolve(false) })
    r.on('error', () => resolve(false))
  })
}

let currentPort = BASE_PORT
let portTries = 0
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && portTries < 20) {
    portTries++
    currentPort = BASE_PORT + portTries
    log('端口 ' + (currentPort - 1) + ' 被占用，尝试 ' + currentPort)
    server.listen(currentPort, '127.0.0.1')
  } else if (err.code === 'EADDRINUSE') {
    currentPort = 0
    log('端口均被占用，改由系统分配随机端口')
    server.listen(0, '127.0.0.1')
  } else {
    fatal(err)
  }
})

server.on('listening', () => {
  const addr = server.address()
  const url = 'http://127.0.0.1:' + addr.port + '/'
  log('Marvis 已启动: ' + url + (IS_SEA ? ' [SEA 单文件模式]' : ' [调试模式]'))
  log('静态资源: ' + (IS_SEA ? '内嵌 ' + manifest().length + ' 个文件' : DIST))
  log('日志文件: ' + LOG_FILE)
  openBrowser(url)
})

async function main() {
  try {
    if (await pingExisting(BASE_PORT)) {
      log('检测到已运行的 Marvis 实例，直接打开页面')
      openBrowser('http://127.0.0.1:' + BASE_PORT + '/')
      setTimeout(() => process.exit(0), 400)
      return
    }
    await detectProxy()
    server.listen(currentPort, '127.0.0.1')
  } catch (e) { fatal(e) }
}

main()
