/**
 * 应用装配：把静态托管、上游转发、/api/v1、AI 网关与本地控制端点组装成一个 http.Server。
 *
 * 三个入口的职责边界：
 *   /api/v1/*     新的聚合查询（前端只认这个）
 *   /<upstream>/* 兼容旧前缀转发（改造期间不断档，一个版本周期后下线）
 *   /ai/*         模型网关
 */
import http from 'node:http'
import { createAiHandler } from './ai-gateway.mjs'
import { createForwarder } from './upstream/forward.mjs'
import { createTransport } from './upstream/transport.mjs'
import { matchUpstream, UPSTREAMS } from './upstream/registry.mjs'
import { createStaticHandler } from './http/static.mjs'
import { createRouter } from './http/router.mjs'
import { createLogger, hostAllowed, parseUrl } from './http/middleware.mjs'
import { sendError, sendJson } from './http/respond.mjs'

export const EXIT_SNIPPET = [
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

/**
 * @param {{
 *   config: ReturnType<typeof import('./config.mjs').loadConfig>,
 *   readAsset: (key:string)=>Promise<Buffer|null>|Buffer|null,
 *   showExitButton?: boolean,
 *   apiRouter?: ReturnType<typeof createRouter>|null,
 *   health?: { record: Function, snapshot: Function }|null,
 *   transport?: ReturnType<typeof createTransport>,
 *   onExit?: () => void,
 * }} opts
 */
export function createApp(opts) {
  const { config, readAsset, apiRouter, health, onExit } = opts
  const log = createLogger(config.logLevel)
  const transport = opts.transport ?? createTransport({ ports: config.proxyPorts, log: (m) => log.info('transport', { msg: m }) })
  const forwarder = createForwarder({ transport, config, health, log: (m) => log.warn('forward', { msg: m }) })
  const handleAi = createAiHandler({ log: (m) => log.info('ai', { msg: m }) })
  const serveStatic = createStaticHandler({
    readAsset,
    injectHtml: opts.showExitButton ? EXIT_SNIPPET : '',
    onMissing: 'dist not found, run `npm run build` first',
  })

  const server = http.createServer(async (req, res) => {
    const started = Date.now()
    const { pathname } = parseUrl(req)

    res.on('finish', () => {
      if (pathname.startsWith('/api/') || pathname.startsWith('/ai/')) {
        log.debug('request', { path: pathname, status: res.statusCode, ms: Date.now() - started })
      }
    })

    if (!hostAllowed(req, { allowAnyHost: config.host === '0.0.0.0' })) {
      sendError(res, 403, 'BAD_REQUEST', '仅允许本机访问')
      return
    }

    // ── 本地控制端点 ──────────────────────────────────────────
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
      setTimeout(() => {
        try {
          server.close()
        } catch {
          /* 已关闭 */
        }
        if (onExit) onExit()
        else process.exit(0)
      }, 150)
      return
    }
    if (pathname === '/proxy-status') {
      sendJson(res, 200, {
        proxy: transport.proxyUrl || null,
        source: transport.proxySource,
        profile: config.profile,
        upstreams: UPSTREAMS.length,
        cache: forwarder.stats(),
        at: Date.now(),
      })
      return
    }

    // ── AI 网关 ──────────────────────────────────────────────
    if (pathname.startsWith('/ai/')) {
      const handled = await handleAi(req, res, pathname)
      if (!handled) sendError(res, 404, 'NO_DATA', '未知的 AI 路由')
      return
    }

    // ── 云端 v2 接口（认证 + 租户隔离）────────────────────────
    if (pathname.startsWith('/api/v2/')) {
      if (opts.cloudRouter && (await opts.cloudRouter.dispatch(req, res, pathname, { config, log }))) return
      sendError(res, 404, 'NO_DATA', `未知接口 ${pathname}`)
      return
    }

    // ── 本地聚合接口 ──────────────────────────────────────────
    if (pathname.startsWith('/api/')) {
      if (apiRouter && (await apiRouter.dispatch(req, res, pathname, { config, log }))) return
      sendError(res, 404, 'NO_DATA', `未知接口 ${pathname}`)
      return
    }

    // ── 旧前缀转发（兼容层）──────────────────────────────────
    const route = matchUpstream(pathname)
    if (route) {
      await forwarder.handle(req, res, route)
      return
    }

    await serveStatic(req, res, pathname)
  })

  return { server, transport, forwarder, log }
}
