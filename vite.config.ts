import { defineConfig, type Plugin, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import https from 'node:https'
import net from 'node:net'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { createAiHandler } from './server/ai-gateway.mjs'

// ConvexTrade / Yahoo / CBOE 对本机直连有地区限制：直连 Yahoo 返回 403，
// 经本机 7897 返回 200。Node 不会自动使用 Windows 系统代理，所以这里显式探测。
const CONVEX_UPSTREAM = 'https://convextrade.com/api/public'
const PROXY_PORTS = [7897, 7890, 10809, 1080]
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

let outboundProxy = ''
let proxySource: 'env' | 'detected' | 'none' = 'none'

function probePort(host: string, port: number, ms = 350): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let done = false
    const finish = (ok: boolean) => {
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

/** 优先级：MARVIS_PROXY > HTTPS_PROXY/ALL_PROXY > 本机常见端口 > 直连。 */
async function detectProxy(): Promise<{ url: string; source: 'env' | 'detected' | 'none' }> {
  const explicit = process.env.MARVIS_PROXY
  if (explicit) return { url: explicit, source: 'env' }
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY
  if (envProxy) return { url: envProxy, source: 'env' }
  for (const port of PROXY_PORTS) {
    if (await probePort('127.0.0.1', port)) return { url: `http://127.0.0.1:${port}`, source: 'detected' }
  }
  return { url: '', source: 'none' }
}

function proxyStatusPlugin(proxy: string, source: string): Plugin {
  return {
    name: 'marvis-proxy-status',
    configureServer(server) {
      server.middlewares.use('/proxy-status', (_req, res) => {
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify({ proxy: proxy || null, source, at: Date.now() }))
      })
    },
  }
}

// ConvexTrade 对中国大陆出口按地区封锁；经本机代理转发，失败时回退直连一次。
function convexProxyViaLocalPlugin(proxyUrl: string): Plugin {
  if (!proxyUrl || process.env.MARVIS_DISABLE_CONVEX_PROXY) {
    return { name: 'convex-proxy-disabled' }
  }
  const agent = new HttpsProxyAgent(proxyUrl)
  return {
    name: 'convex-proxy-via-local',
    configureServer(server) {
      server.middlewares.use('/convex', (req, res) => {
        const target = CONVEX_UPSTREAM + (req.url ?? '').replace(/^\/convex/, '')
        const u = new URL(target)
        const headers: Record<string, string> = {}
        if (req.headers['user-agent']) headers['user-agent'] = String(req.headers['user-agent'])
        headers['accept'] = String(req.headers['accept'] ?? '*/*')
        if (req.headers['content-type']) headers['content-type'] = String(req.headers['content-type'])

        const send = (useAgent: boolean) => {
          const preq = https.request(
            {
              method: req.method,
              host: u.host,
              path: u.pathname + u.search,
              headers,
              agent: useAgent ? agent : undefined,
              timeout: 12_000,
            },
            (pres) => {
              res.statusCode = pres.statusCode ?? 502
              for (const [k, v] of Object.entries(pres.headers)) {
                if (v !== undefined) res.setHeader(k, v as string | number | readonly string[])
              }
              pres.pipe(res)
            },
          )
          preq.on('timeout', () => preq.destroy(new Error('upstream timeout')))
          preq.on('error', (err) => {
            if (useAgent && !res.headersSent) {
              server.config.logger.warn(`[proxy] /convex 经代理失败，回退直连：${err.message}`)
              send(false)
              return
            }
            if (!res.headersSent) {
              res.statusCode = 502
              res.end(String(err.message))
            }
          })
          req.pipe(preq)
        }

        send(true)
      })
    },
  }
}

// 内置 AI 网关（dev）：与生产 server/proxy.mjs 共用 server/ai-gateway.mjs，
// 让 `npm run dev` 下前端调 /ai/chat 也能正常转发，不必额外起后端。
function aiGatewayPlugin(): Plugin {
  const handleAi = createAiHandler({ log: (msg: string) => console.log(msg) })
  return {
    name: 'marvis-ai-gateway',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '/').split('?')[0]
        if (!pathname.startsWith('/ai/')) return next()
        void handleAi(req, res, pathname).then((handled) => {
          if (!handled) next()
        })
      })
    },
  }
}

export default defineConfig(async (): Promise<UserConfig> => {
  const detected = await detectProxy()
  outboundProxy = detected.url
  proxySource = detected.source
  const agent = outboundProxy ? new HttpsProxyAgent(outboundProxy) : undefined

  console.log(
    outboundProxy
      ? `[proxy] Yahoo / CBOE / Convex → ${outboundProxy}（${proxySource}）`
      : '[proxy] 未检测到本机出海代理：Yahoo/CBOE/Convex 走直连（可能有地区限制）',
  )

  return {
    plugins: [
      react(),
      tailwindcss(),
      proxyStatusPlugin(outboundProxy, proxySource),
      convexProxyViaLocalPlugin(outboundProxy),
      aiGatewayPlugin(),
    ],
    server: {
      proxy: {
        // 东方财富快讯接口无 CORS 头，前端直连会被浏览器拦截，
        // 经本域代理转发规避跨域（dev 环境有效；生产构建需自建相同转发后端）。
        '/eastmoney-news': {
          target: 'https://np-listapi.eastmoney.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/eastmoney-news/, ''),
          // 东财接口按 Referer 白名单做 WAF 校验（localhost 直连返回 567 拦截页）。
          headers: { Referer: 'https://www.eastmoney.com/', Origin: 'https://www.eastmoney.com' },
        },
        // Yahoo Finance 行情/K线接口对浏览器直连会 449 反爬或跨域拦截。
        // headers 必须在转发前写入：Vite 8 的 proxyReq 事件触发时 headersSent 已为 true，
        // 再 setHeader 会抛 ERR_HTTP_HEADERS_SENT（实测），所以用静态 headers。
        '/yahoo': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/yahoo/, ''),
          agent,
          headers: {
            'User-Agent': BROWSER_UA,
            Referer: 'https://finance.yahoo.com/',
            Origin: 'https://finance.yahoo.com',
          },
        },
        // query1 偶发 403 时的同源重试通道。前缀不能以 /yahoo 开头，否则会被上面的路由先匹配。
        '/yahoo-alt': {
          target: 'https://query2.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/yahoo-alt/, ''),
          agent,
          headers: {
            'User-Agent': BROWSER_UA,
            Referer: 'https://finance.yahoo.com/',
            Origin: 'https://finance.yahoo.com',
          },
        },
        // CBOE 官网日度市场统计页面内嵌 JSON，无浏览器直连 CORS。
        '/cboe': {
          target: 'https://www.cboe.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/cboe/, ''),
          agent,
          headers: {
            'User-Agent': BROWSER_UA,
            Referer: 'https://www.cboe.com/',
            Origin: 'https://www.cboe.com',
          },
        },
        // 东财 K线/行情接口：国内站点，直连，不走海外代理。
        '/eastmoney-kline': {
          target: 'https://push2his.eastmoney.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/eastmoney-kline/, ''),
          headers: { Referer: 'https://quote.eastmoney.com/', Origin: 'https://quote.eastmoney.com' },
        },
        '/eastmoney-quote': {
          target: 'https://push2.eastmoney.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/eastmoney-quote/, ''),
          headers: { Referer: 'https://quote.eastmoney.com/', Origin: 'https://quote.eastmoney.com' },
        },
        // 腾讯行业板块榜：东财被网络重置时的真实替代源（国内站点，直连）。
        '/tencent-rank': {
          target: 'https://proxy.finance.qq.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/tencent-rank/, ''),
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://gu.qq.com/' },
        },
        // 新浪板块：第二兜底（GBK 页面，前端用 TextDecoder('gbk') 解码）。
        '/sina-sector': {
          target: 'https://vip.stock.finance.sina.com.cn',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/sina-sector/, ''),
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://finance.sina.com.cn/' },
        },
        // 台湾证交所开放数据：台股月营收汇总表（JSON）
        '/twse': {
          target: 'https://openapi.twse.com.tw',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/twse/, ''),
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
        },
        // FRED 图表 CSV 直链：免 key，返回 text/csv。实测经 7897 不可用，保持直连。
        '/fred': {
          target: 'https://fred.stlouisfed.org',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/fred/, ''),
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://fred.stlouisfed.org/' },
        },
        // 美国财政部官方收益率曲线 CSV：FRED/Convex 不可达时的真实利率兜底（直连可用）。
        '/treasury': {
          target: 'https://home.treasury.gov',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/treasury/, ''),
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://home.treasury.gov/' },
        },
        // 美联储官网 FOMC 日历页：公开页面，国内直连即可。
        '/fed': {
          target: 'https://www.federalreserve.gov',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/fed/, ''),
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://www.federalreserve.gov/' },
        },
        // ConvexTrade 宏观序列：由 convexProxyViaLocalPlugin 的本地代理中间件处理（见上方插件）。
      },
    },
  }
})
