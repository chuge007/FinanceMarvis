import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import https from 'node:https'
import { HttpsProxyAgent } from 'https-proxy-agent'

// ConvexTrade 对中国大陆出口按地区封锁（CF blocked-country），本机直连 403。
// 本机 7897 是 Clash 类本地代理，其出海节点可正常访问，故 /convex 请求经该代理转发。
const LOCAL_PROXY = 'http://127.0.0.1:7897'
const CONVEX_UPSTREAM = 'https://convextrade.com/api/public'
const OUTBOUND_PROXY = process.env.HTTPS_PROXY || process.env.ALL_PROXY || ''

function convexProxyViaLocalPlugin(): Plugin {
  if (!process.env.MARVIS_DISABLE_CONVEX_PROXY) {
    const agent = new HttpsProxyAgent(LOCAL_PROXY)
    return {
      name: 'convex-proxy-via-local',
      configureServer(server) {
        server.middlewares.use('/convex', (req, res) => {
          // 经本地代理向 ConvexTrade 转发：代理软件不支持 CONNECT 时退回直连。
          const target = CONVEX_UPSTREAM + (req.url ?? '').replace(/^\/convex/, '')
          const u = new URL(target)
          const headers: Record<string, string> = {}
          if (req.headers['user-agent']) headers['user-agent'] = String(req.headers['user-agent'])
          headers['accept'] = String(req.headers['accept'] ?? '*/*')
          if (req.headers['content-type']) headers['content-type'] = String(req.headers['content-type'])
          const preq = https.request(
            {
              method: req.method,
              host: u.host,
              path: u.pathname + u.search,
              headers,
              agent,
            },
            (pres) => {
              res.statusCode = pres.statusCode ?? 502
              for (const [k, v] of Object.entries(pres.headers)) {
                if (v !== undefined) res.setHeader(k, v as string | number | readonly string[])
              }
              pres.pipe(res)
            },
          )
          preq.on('error', (err) => {
            res.statusCode = 502
            res.end(String(err.message))
          })
          req.pipe(preq)
        })
      },
    }
  }
  return { name: 'convex-proxy-disabled' }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), convexProxyViaLocalPlugin()],
  server: {
    proxy: {
      // 东方财富快讯接口无 CORS 头，前端直连会被浏览器拦截，
      // 经本域代理转发规避跨域（dev 环境有效；生产构建需自建相同转发后端）。
      '/eastmoney-news': {
        target: 'https://np-listapi.eastmoney.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/eastmoney-news/, ''),
        // 东财接口按 Referer 白名单做 WAF 校验（localhost 直连返回 567 拦截页），
        // 转发时注入其认可的 Referer/Origin 绕过校验。
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://www.eastmoney.com/');
            proxyReq.setHeader('Origin', 'https://www.eastmoney.com');
          });
        },
      },
      // Yahoo Finance 行情/K线接口对浏览器直连会 449 反爬或跨域拦截，
      // 经本域代理转发 + 注入浏览器 UA/Referer 提升美股现价与日线命中率（dev 生效）。
      '/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/yahoo/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
            proxyReq.setHeader('Referer', 'https://finance.yahoo.com/');
            proxyReq.setHeader('Origin', 'https://finance.yahoo.com');
          });
        },
      },
      // CBOE 官网日度市场统计页面内嵌 JSON，无浏览器直连 CORS；本域转发并注入浏览器头。
      // 若设置 HTTPS_PROXY / ALL_PROXY，则经出海代理访问（大陆环境需要）。
      '/cboe': {
        target: 'https://www.cboe.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/cboe/, ''),
        agent: OUTBOUND_PROXY ? new HttpsProxyAgent(OUTBOUND_PROXY) : undefined,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
            proxyReq.setHeader('Referer', 'https://www.cboe.com/');
            proxyReq.setHeader('Origin', 'https://www.cboe.com');
          });
        },
      },
      // 东财 K线/行情接口无 CORS 头，本域代理转发 + 注入 Referer（dev 生效）。
      // 作为美股现价与K线的国内可用兜底源（Yahoo 在大陆被地理封锁）。
      '/eastmoney-kline': {
        target: 'https://push2his.eastmoney.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/eastmoney-kline/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://quote.eastmoney.com/');
            proxyReq.setHeader('Origin', 'https://quote.eastmoney.com');
          });
        },
      },
      '/eastmoney-quote': {
        target: 'https://push2.eastmoney.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/eastmoney-quote/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://quote.eastmoney.com/');
            proxyReq.setHeader('Origin', 'https://quote.eastmoney.com');
          });
        },
      },
      // ConvexTrade 宏观序列：由 convexProxyViaLocalPlugin 的本地代理中间件处理（见上方插件），
      // 因上游对中国大陆直连地区封锁，经本机 7897 局域代理转发。
    },
  },
})
