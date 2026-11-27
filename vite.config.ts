import { defineConfig, type Plugin, type UserConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import https from 'node:https'
import net from 'node:net'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { createAiHandler } from './server/ai-gateway.mjs'
import { UPSTREAMS } from './server/upstream/registry.mjs'

// ConvexTrade / Yahoo / CBOE 对本机直连有地区限制：直连 Yahoo 返回 403，
// 经本机 7897 返回 200。Node 不会自动使用 Windows 系统代理，所以这里显式探测。
const CONVEX_UPSTREAM = 'https://convextrade.com/api/public'
const PROXY_PORTS = [7897, 7890, 10809, 1080]

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

/**
 * dev 内置数据服务：`npm run dev` 一条命令就能用 /api/v1。
 *
 * 复用 server/services.mjs 的同一套装配，不另写一份 dev 逻辑（这正是改造前
 * 三处路由漂移的根源）。不想在 dev 里跑后端时设 MARVIS_NO_API=1。
 */
function dataApiPlugin(): Plugin {
  let services: any = null
  return {
    name: 'marvis-data-api',
    // 只在 dev server 生效：build 时不该启动调度器去抓数据
    apply: 'serve',
    async configureServer(server) {
      if (process.env.MARVIS_NO_API === '1') {
        console.log('[data] MARVIS_NO_API=1，dev 不启动数据服务')
        return
      }
      try {
        const { loadConfig } = await import('./server/config.mjs')
        const { createTransport } = await import('./server/upstream/transport.mjs')
        const { createServices } = await import('./server/services.mjs')
        const cfg = loadConfig({ distDir: 'dist' })
        const transport = createTransport({ ports: cfg.proxyPorts })
        await transport.init()
        services = await createServices({ config: cfg, transport, log: (m: string) => console.log(m) })
        services.scheduler.start()
        console.log(`[data] dev 数据服务已挂载（${cfg.profile}，库 ${cfg.dataDir}）`)
      } catch (err) {
        console.warn('[data] dev 数据服务启动失败，/api/v1 将返回 503：', err)
        return
      }

      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '/').split('?')[0]
        if (!pathname.startsWith('/api/')) return next()
        void services.apiRouter
          .dispatch(req, res, pathname, { config: {}, log: () => undefined })
          .then((handled: boolean) => {
            if (!handled) next()
          })
          .catch(next)
      })
    },
  }
}

// 内置 AI 网关（dev）：与生产 server/app.mjs 共用 server/ai-gateway.mjs，
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

/**
 * dev 代理表由注册表生成，不再手写 14 条。
 * 新增数据源只需在 server/upstream/registry.mjs 加一条，dev / 生产 / exe 同时生效。
 */
function buildProxyTable(agent: HttpsProxyAgent<string> | undefined): Record<string, ProxyOptions> {
  const table: Record<string, ProxyOptions> = {}
  for (const u of UPSTREAMS) {
    if (u.devManual) continue
    table[u.prefix] = {
      target: u.origin,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(new RegExp(`^${u.prefix}`), ''),
      agent: u.viaProxy ? agent : undefined,
      headers: u.headers,
    }
  }
  return table
}

export default defineConfig(async (): Promise<UserConfig> => {
  const detected = await detectProxy()
  outboundProxy = detected.url
  proxySource = detected.source
  const agent = outboundProxy ? new HttpsProxyAgent(outboundProxy) : undefined

  console.log(
    outboundProxy
      ? `[proxy] ${UPSTREAMS.filter((u) => u.viaProxy).length} 个出海源 → ${outboundProxy}（${proxySource}）`
      : '[proxy] 未检测到本机出海代理：Yahoo/CBOE/Convex 走直连（可能有地区限制）',
  )

  return {
    plugins: [
      react(),
      tailwindcss(),
      proxyStatusPlugin(outboundProxy, proxySource),
      convexProxyViaLocalPlugin(outboundProxy),
      dataApiPlugin(),
      aiGatewayPlugin(),
    ],
    server: {
      proxy: buildProxyTable(agent),
    },
  }
})
