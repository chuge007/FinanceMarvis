/**
 * 服务装配：数据库 + 适配器 + 调度 + API。
 *
 * 这一层是「数据平台」，与 HTTP 无关：可以单独被 CLI、定时任务或测试调用。
 */
import { openDatabase } from './data/db.mjs'
import { buildAdapters } from './adapters/index.mjs'
import { createScheduler } from './jobs/scheduler.mjs'
import { createRouter } from './http/router.mjs'
import { registerSeriesRoutes } from './api/series.mjs'
import { registerAnalysisRoutes } from './api/analysis.mjs'
import { registerHealthRoutes } from './api/health.mjs'
import { registerRadarRoutes } from './api/radar.mjs'
import { createSidecar } from './local/sidecar.mjs'
import { createDataSidecar } from './local/dataSidecar.mjs'
import { registerWindRoutes } from './api/wind.mjs'
import { registerFutuRoutes } from './api/futu.mjs'
import { registerDataSidecarRoutes } from './api/dataSidecar.mjs'
import { registerStrategyRoutes } from './api/strategy.mjs'
import { registerCapabilityCallRoutes } from './api/capabilityCall.mjs'
import { registerKeyChannelRoutes } from './api/keyChannels.mjs'
import { createWindClient } from './adapters/wind.mjs'

/**
 * @param {{config:any, transport:any, log?: (message: string) => void}} opts
 */
export async function createServices({ config, transport, log = () => {} }) {
  const startedAt = Date.now()
  const db = await openDatabase({ dataDir: config.dataDir, log })

  const health = {
    record(id, ok, latencyMs, error) {
      db.recordHealth({ id, ok, latencyMs, error, cooldownUntil: ok ? null : Date.now() + 5 * 60_000 })
    },
    snapshot() {
      return db.listHealth()
    },
  }

  // 数据侧车（AkShare / EDGAR / ccxt）：与富途侧车独立进程/独立依赖
  const dataSidecar = createDataSidecar({ config, log })

  const adapters = buildAdapters({ transport, config, log })
  const scheduler = createScheduler({ db, adapters, transport, config, log, health, dataSidecar })

  const apiRouter = createRouter()
  registerSeriesRoutes(apiRouter, { db, adapters, config })
  registerAnalysisRoutes(apiRouter, { db, adapters })
  registerHealthRoutes(apiRouter, { db, adapters, scheduler, startedAt })
  registerRadarRoutes(apiRouter, { db, config, log })

  // 富途侧车懒启动：未装 Python / futu-api 时不影响其它功能
  const sidecar = createSidecar({ config, log })
  registerFutuRoutes(apiRouter, { sidecar, config })

  registerDataSidecarRoutes(apiRouter, { dataSidecar })

  // 本地回测：只读主源落库序列，结果落 snapshot，重启不丢
  registerStrategyRoutes(apiRouter, { db, adapters })

  // 能力清单通用调用：装库后可直接试取公开数据函数
  registerCapabilityCallRoutes(apiRouter, { dataSidecar })
  registerKeyChannelRoutes(apiRouter, { config })

  const wind = createWindClient({ transport, config, log })
  registerWindRoutes(apiRouter, { wind })

  return { db, adapters, scheduler, apiRouter, health, sidecar, dataSidecar, wind, startedAt }
}
