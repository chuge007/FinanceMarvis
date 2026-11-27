/**
 * 本地服务入口。
 *
 * 两种用法：
 *   1. 直接运行 `node server/index.mjs`（或 npm run serve）—— 自己监听端口；
 *   2. 被 desktop/launcher.cjs（exe）导入并调用 bootstrap() —— 由它负责端口、
 *      单实例与打开浏览器，这里只负责装配。
 *
 * 之所以导出 bootstrap，是为了让 exe 形态复用同一份服务端代码：
 * 改造前 launcher.cjs 把路由表和 AI 网关整套复制了一遍，任何改动都要改两处。
 */
import { pathToFileURL } from 'node:url'
import { loadConfig } from './config.mjs'
import { createTransport } from './upstream/transport.mjs'
import { createServices } from './services.mjs'
import { createApp } from './app.mjs'
import { diskAssetReader } from './http/static.mjs'
import { createLogger } from './http/middleware.mjs'
import { loadCloudConfig } from './cloud/config.mjs'
import { createCloud } from './cloud/index.mjs'

/**
 * 装配数据平台 + HTTP 服务，不负责监听。
 * @param {{config?:any, readAsset:Function, showExitButton?:boolean, onExit?:Function, log?:any}} opts
 */
export async function bootstrap(opts) {
  const cloudConfig = loadCloudConfig()
  // 云模式把冷数据仓放到独立目录，与本机 exe 的数据隔离
  const config = opts.config ?? (cloudConfig.enabled ? loadConfig({ dataDir: cloudConfig.dataDir }) : loadConfig())
  const log = opts.log ?? createLogger(config.logLevel)
  const transport = createTransport({ ports: config.proxyPorts, log: (m) => log.info('transport', { msg: m }) })
  await transport.init()

  const services = await createServices({ config, transport, log: (m) => log.info('service', { msg: m }) })

  const cloud = cloudConfig.enabled
    ? await createCloud(cloudConfig, { log: (m) => log.info('cloud', { msg: m }) })
    : null
  if (cloud) cloud.registerWorkers(services)

  const { server, forwarder } = createApp({
    config,
    transport,
    apiRouter: services.apiRouter,
    cloudRouter: cloud?.router,
    health: services.health,
    readAsset: opts.readAsset ?? diskAssetReader(config.distDir),
    showExitButton: !!opts.showExitButton,
    onExit: opts.onExit,
  })

  let started = false
  function startScheduler() {
    if (started) return
    started = true
    if (config.backfillOnStart) services.scheduler.start()
  }

  function shutdown() {
    services.scheduler.stop()
    try {
      services.db.close()
    } catch {
      /* 已关闭 */
    }
    try {
      server.close()
    } catch {
      /* 已关闭 */
    }
  }

  return { server, services, transport, forwarder, cloud, config, log, startScheduler, shutdown }
}

async function main() {
  const config = loadConfig()
  const log = createLogger(config.logLevel)
  const app = await bootstrap({ config, log, readAsset: diskAssetReader(config.distDir) })
  const { server } = app

  const basePort = Number(process.env.PORT || 8080)
  let tries = 0
  let port = basePort

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries < 20) {
      tries += 1
      port = basePort + tries
      log.warn('port', { msg: `端口被占用，尝试 ${port}` })
      server.listen(port, config.host)
      return
    }
    log.error('server', { msg: err.message })
    process.exit(1)
  })

  server.on('listening', () => {
    log.info('server', { msg: `Marvis 数据服务已启动 http://${config.host}:${port}` })
    log.info('server', { msg: `数据目录 ${config.dataDir}（${config.profile} 形态）` })
    app.startScheduler()
  })

  server.listen(port, config.host)

  const shutdown = () => {
    log.info('server', { msg: '正在关闭' })
    app.shutdown()
    setTimeout(() => process.exit(0), 300)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

const isDirectRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isDirectRun) {
  main().catch((err) => {
    console.error('[marvis] 启动失败:', err)
    process.exit(1)
  })
}
