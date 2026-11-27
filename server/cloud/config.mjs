/**
 * 云端配置。
 *
 * 设计原则：云端能力是「可选启用」的，不装 PostgreSQL / Redis / BullMQ 时
 * 自动降级到现有的 SQLite + 内存队列，保证本地 exe 与 dev 不受影响。
 */
import path from 'node:path'

function bool(v, fallback = false) {
  if (v == null || v === '') return fallback
  return String(v).toLowerCase() === '1' || String(v).toLowerCase() === 'true'
}

export function loadCloudConfig() {
  const enabled = bool(process.env.MARVIS_CLOUD)
  const dataDir = process.env.MARVIS_DATA_DIR || path.resolve(process.cwd(), 'data', 'cloud')
  return {
    enabled,
    port: Number(process.env.MARVIS_CLOUD_PORT || 8180),
    databaseUrl: process.env.DATABASE_URL || '',
    redisUrl: process.env.REDIS_URL || '',
    jwtSecret: process.env.JWT_SECRET || '',
    masterKey: process.env.MARVIS_MASTER_KEY || '',
    dataDir,
    objectDir: path.join(dataDir, 'objects'),
    /** 未装 pg 时用 SQLite 做单机云模拟；功能一致但不可多实例。 */
    fallbackToSqlite: true,
    tokenTtlSec: Number(process.env.JWT_TTL_SEC || 7 * 86400),
    /** Wind 任务并发上限：避开服务端 exit 75。 */
    windConcurrency: Number(process.env.WIND_CONCURRENCY || 2),
    /** 真实下单必须开启，且仍需用户二次确认。 */
    allowRealTrading: bool(process.env.MARVIS_ALLOW_REAL_TRADING),
  }
}
