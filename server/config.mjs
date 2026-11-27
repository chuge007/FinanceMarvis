/**
 * 运行配置：一处决定端口、数据目录、形态开关。
 *
 * 形态（profile）：
 *   lean  —— exe 精简版，只启用免 key 源，不加载可选适配器
 *   full  —— 本地服务/开发版，探测 Key 与客户端，能接的都接
 *
 * 所有路径都不写死到代码里：exe 场景下 dist 来自内嵌资源，数据目录必须在
 * 用户可写位置（%APPDATA%/Marvis），否则升级重打包会冲掉历史库。
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

/** 本机 Key 文件：只存用户数据目录，不进 git、不进 exe、不进浏览器 localStorage。 */
export function keysFilePath() {
  return path.join(defaultDataDir(), 'keys.env')
}

/** 读取 KEY=VALUE 文本；环境变量优先，文件兜底。返回掩码无关的明文给服务端内部使用。 */
export function readKeysFile() {
  const out = {}
  try {
    const file = keysFilePath()
    if (!fs.existsSync(file)) return out
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const text = line.trim()
      if (!text || text.startsWith('#')) continue
      const i = text.indexOf('=')
      if (i <= 0) continue
      const k = text.slice(0, i).trim()
      const v = text.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
      if (k) out[k] = v
    }
  } catch {
    /* 读不到按未配置处理 */
  }
  return out
}

/** 写入本机 Key 文件（600 权限语义：Windows 仅当前用户可读由数据目录 ACL 保证）。 */
export function writeKeysFile(values) {
  const file = keysFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const lines = ['# Marvis 本机 Key 配置（环境变量优先）', '# 本文件不进 git / exe / localStorage', '']
  for (const [k, v] of Object.entries(values || {})) {
    const key = String(k).replace(/[^A-Z0-9_]/gi, '')
    if (key) lines.push(`${key}=${String(v ?? '').trim()}`)
  }
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8', { mode: 0o600 })
  return file
}

function defaultDataDir() {
  if (process.env.MARVIS_DATA_DIR) return process.env.MARVIS_DATA_DIR
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'Marvis')
  }
  return path.join(os.homedir(), '.marvis')
}

/**
 * @param {Partial<ReturnType<typeof loadConfig>>} overrides
 */
export function loadConfig(overrides = {}) {
  const profile = (process.env.MARVIS_PROFILE || 'full').toLowerCase() === 'lean' ? 'lean' : 'full'
  const fileKeys = readKeysFile()
  const base = {
    profile,
    host: process.env.MARVIS_HOST || '127.0.0.1',
    port: Number(process.env.MARVIS_PORT || process.env.PORT || 0),
    dataDir: defaultDataDir(),
    /** 前端口径：exe 下由内嵌资源提供，dev/生产由 dist 目录提供 */
    distDir: path.resolve(process.cwd(), 'dist'),
    /** 代理探测顺序 */
    proxyPorts: [7897, 7890, 10809, 1080],
    /** 转发层默认超时 */
    upstreamTimeoutMs: 15_000,
    /** 单次响应体上限（防止上游异常返回把内存打爆） */
    maxBodyBytes: 8 * 1024 * 1024,
    /** 是否允许回填历史（lean 也允许，只是源少） */
    backfillOnStart: process.env.MARVIS_NO_BACKFILL !== '1',
    /** 真实交易需显式开启；默认只有模拟盘 */
    allowRealTrading: process.env.MARVIS_ALLOW_REAL_TRADING === '1',
    /** 可选 Key（用户填了才启用） */
    keys: {
      tushare: process.env.TUSHARE_TOKEN || fileKeys.TUSHARE_TOKEN || '',
      databull: process.env.DATABULL_API_KEY || fileKeys.DATABULL_API_KEY || '',
      /** Socrata 匿名请求会被 403，填了 app token 才能稳定取 CFTC 持仓。 */
      cftc: process.env.CFTC_APP_TOKEN || fileKeys.CFTC_APP_TOKEN || '',
      /** FMP 免费档 250 次/天；402 为时点性配额耗尽，抓到即降级不重试。 */
      fmp: process.env.FMP_API_KEY || fileKeys.FMP_API_KEY || '',
      'alpha-vantage': process.env.ALPHA_VANTAGE_API_KEY || fileKeys.ALPHA_VANTAGE_API_KEY || '',
      twelvedata: process.env.TWELVEDATA_API_KEY || fileKeys.TWELVEDATA_API_KEY || '',
      'nasdaq-data-link': process.env.NASDAQ_DATA_LINK_API_KEY || fileKeys.NASDAQ_DATA_LINK_API_KEY || '',
    },
    /** 可选客户端探测地址 */
    clients: {
      futuOpenD: process.env.FUTU_OPEND || '127.0.0.1:11111',
      /** 数据侧车 HTTP 回环地址；脚本路径由 launcher 注入 MARVIS_DATA_SIDECAR_SCRIPT。 */
      dataSidecar: process.env.MARVIS_DATA_SIDECAR || `127.0.0.1:${process.env.MARVIS_SIDECAR_DATA_PORT || 8765}`,
      dataSidecarPort: Number(process.env.MARVIS_SIDECAR_DATA_PORT || 8765),
    },
    logLevel: (process.env.MARVIS_LOG_LEVEL || 'info').toLowerCase(),
  }
  return { ...base, ...overrides }
}
