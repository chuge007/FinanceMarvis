/**
 * Key 通道登记：/api/v1/key-channels
 *
 * 如实报告每个 Key 通道是否已配置；未配置时明确「缺」，不静默降级成模拟值。
 * 已配置的通道给出实际取数端点（Alpha Vantage / Twelve Data / Nasdaq Data Link）。
 */
import { envelope, sendError, sendJson } from '../http/respond.mjs'
import { readJsonBody } from '../http/middleware.mjs'
import { readKeysFile, writeKeysFile, keysFilePath } from '../config.mjs'

const CHANNELS = [
  {
    id: 'tushare', key: 'tushare', label: 'Tushare Pro',
    scope: 'A 股财务三表 / 指标 / 两融 / 龙虎榜（主源，带 ann_date）',
    env: 'TUSHARE_TOKEN', endpoint: 'https://api.tushare.pro',
  },
  {
    id: 'fmp', key: 'fmp', label: 'FMP',
    scope: '美股 EOD / 基本面备源；402/429 立即回落 Yahoo',
    env: 'FMP_API_KEY', endpoint: 'https://financialmodelingprep.com/stable',
  },
  {
    id: 'databull', key: 'databull', label: 'DataBull',
    scope: 'A 股指数 / 实时 Tick / 新闻',
    env: 'DATABULL_API_KEY', endpoint: 'https://api.databull.cn',
  },
  {
    id: 'cftc', key: 'cftc', label: 'CFTC',
    scope: '美国期货持仓 COT；匿名 403，需 app token',
    env: 'CFTC_APP_TOKEN', endpoint: 'https://www.cftc.gov',
  },
  {
    id: 'alpha-vantage', key: 'alpha-vantage', label: 'Alpha Vantage',
    scope: '美股 / 外汇 / 加密日线与技术指标',
    env: 'ALPHA_VANTAGE_API_KEY', endpoint: 'https://www.alphavantage.co/query',
  },
  {
    id: 'twelvedata', key: 'twelvedata', label: 'Twelve Data',
    scope: '全球行情 / 技术指标 / 汇率',
    env: 'TWELVEDATA_API_KEY', endpoint: 'https://api.twelvedata.com',
  },
  {
    id: 'nasdaq-data-link', key: 'nasdaq-data-link', label: 'Nasdaq Data Link',
    scope: '另类数据集 / 全球宏观',
    env: 'NASDAQ_DATA_LINK_API_KEY', endpoint: 'https://data.nasdaq.com/api/v3',
  },
]

function masked(key) {
  if (!key) return ''
  const s = String(key)
  return s.length <= 4 ? '****' : `****${s.slice(-4)}`
}

export function registerKeyChannelRoutes(router, { config }) {
  router.get('/api/v1/key-channels', (_req, res) => {
    const fileKeys = readKeysFile()
    const channels = CHANNELS.map((c) => {
      const fromEnv = !!process.env[c.env]
      const key = config.keys?.[c.key] || ''
      return {
        id: c.id, label: c.label, scope: c.scope, env: c.env, endpoint: c.endpoint,
        configured: !!key,
        source: fromEnv ? '环境变量' : (fileKeys[c.env] ? '本机文件' : '未配置'),
        masked: masked(key),
        editable: !fromEnv,
        status: key ? '已配置' : '需配置 Key',
      }
    })
    const missing = channels.filter((c) => !c.configured).map((c) => `${c.label}:${c.env}`)
    sendJson(res, 200, envelope(
      { channels },
      {
        source: 'config:key-channels',
        asOf: new Date().toISOString().slice(0, 10),
        ...(missing.length ? { missing } : {}),
        note: `本机文件 ${keysFilePath()}；环境变量优先。保存后需重启生效`,
      },
    ))
  })

  /** 保存 Key 到本机数据目录；空字符串表示删除该 Key。 */
  router.post('/api/v1/key-channels', async (req, res) => {
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      sendError(res, 400, 'BAD_REQUEST', '请求体不是合法 JSON')
      return
    }
    const current = readKeysFile()
    for (const c of CHANNELS) {
      if (process.env[c.env]) continue // 环境变量优先，不覆盖
      if (Object.prototype.hasOwnProperty.call(body, c.env)) {
        const value = String(body[c.env] ?? '').trim()
        if (value) current[c.env] = value
        else delete current[c.env]
      }
    }
    writeKeysFile(current)
    sendJson(res, 200, envelope(
      { saved: true, path: keysFilePath() },
      { source: 'config:key-channels', asOf: new Date().toISOString().slice(0, 10), note: '已保存到本机；重启应用后生效' },
    ))
  })
}
