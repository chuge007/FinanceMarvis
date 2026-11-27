/**
 * 云端运行形态装配。
 *
 * createApp 通过 opts.cloudRouter 挂载 /api/v2；未启用云模式时完全不加载这些模块，
 * 单机 exe 的体积与行为都不受影响。
 */
import { createCloudDb } from './db.mjs'
import { createStore } from './store.mjs'
import { createQueue } from './queue.mjs'
import { createRouter } from '../http/router.mjs'
import { registerCloudRoutes } from '../api/v2.mjs'
import { registerCloudWorkers } from './workers.mjs'

export async function createCloud(config, { log = () => {} } = {}) {
  const db = await createCloudDb(config)
  const store = createStore(db, config)
  const queue = createQueue(config, { log })
  await queue.init()

  const router = createRouter()
  registerCloudRoutes(router, { config, store, queue })

  log(`[cloud] 已启用：存储 ${db.mode}，队列 ${queue.mode}，凭据 ${config.masterKey ? 'AES-GCM' : '未配置主密钥'}`)
  return {
    db,
    store,
    queue,
    router,
    registerWorkers: (services) => registerCloudWorkers({ queue, store, config, log, services }),
  }
}
