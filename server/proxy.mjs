/**
 * StrategyLab 生产转发后端（原生 Node，无需额外依赖框架）。
 *
 * 职责：
 *  1. 静态托管 `dist/` 构建产物（SPA，非 API 请求回源 index.html）；
 *  2. 将五个上游数据源同域转发，规避浏览器 CORS / 反爬 / 地区封锁：
 *     - /eastmoney-news    → np-listapi.eastmoney.com（注入 eastmoney Referer）
 *     - /yahoo             → query1.finance.yahoo.com（注入 UA/Referer）
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
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpsProxyAgent } from 'https-proxy-agent'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 8080)
const OUTBOUND_PROXY = process.env.HTTPS_PROXY || process.env.ALL_PROXY || ''

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

// 上游路由表：prefix -> { origin, headers }
const ROUTES = [
  {
    prefix: '/eastmoney-news',
    origin: 'https://np-listapi.eastmoney.com',
    headers: { Referer: 'https://www.eastmoney.com/', Origin: 'https://www.eastmoney.com' },
  },
  {
    prefix: '/yahoo',
    origin: 'https://query1.finance.yahoo.com',
    headers: { 'User-Agent': UA, Referer: 'https://finance.yahoo.com/', Origin: 'https://finance.yahoo.com' },
  },
  {
    prefix: '/eastmoney-kline',
    origin: 'https://push2his.eastmoney.com',
    headers: { Referer: 'https://quote.eastmoney.com/', Origin: 'https://quote.eastmoney.com' },
  },
  {
    prefix: '/eastmoney-quote',
    origin: 'https://push2.eastmoney.com',
    headers: { Referer: 'https://quote.eastmoney.com/', Origin: 'https://quote.eastmoney.com' },
  },
  {
    prefix: '/convex',
    origin: 'https://convextrade.com/api/public',
    headers: {},
  },
]

function makeAgent() {
  return OUTBOUND_PROXY ? new HttpsProxyAgent(OUTBOUND_PROXY) : undefined
}

/** 向 https 上游转发请求（支持可选出海代理）。 */
function proxyRequest(req, res, route) {
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

  const preq = https.request(
    {
      method: req.method,
      host: u.host,
      path: u.pathname + u.search,
      headers,
      agent: makeAgent(),
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

const server = http.createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0]
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
  console.log(`[StrategyLab] 转发: /convex /eastmoney-news /yahoo /eastmoney-kline /eastmoney-quote${via}`)
})
