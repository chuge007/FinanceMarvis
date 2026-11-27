/**
 * 适配器总装配：把所有 SeriesDef / SnapshotDef 收成一张表，并做能力探测。
 *
 * 调度器只认这里导出的 SERIES / SNAPSHOTS，不再关心具体是哪个源。
 */
import { SERIES as FRED } from './fred.mjs'
import { SERIES as TREASURY } from './treasury.mjs'
import { SERIES as YAHOO } from './yahoo.mjs'
import { SERIES as TENCENT, SNAPSHOTS as TENCENT_SNAPSHOTS } from './tencent.mjs'
import { SERIES as ALTERNATIVE } from './alternative.mjs'
import { SNAPSHOTS as CBOE_SNAPSHOTS } from './cboe.mjs'
import { NYFED_SERIES, WORLDBANK_SERIES, CFTC_SNAPSHOTS, JGB_SERIES } from './macroGlobal.mjs'
import { SNAPSHOTS as WSCN_SNAPSHOTS } from './wscnCalendar.mjs'
import { BIS_SERIES, GLOBAL_INDEX_SERIES, SNAPSHOTS as GLOBAL_SNAPSHOTS } from './globalExtra.mjs'
import { createTushareClient, createDataBullClient, createFmpClient, createOptionalSeries, createOptionalSnapshots } from './optional.mjs'
import { SERIES as SIDECAR_SERIES, SNAPSHOTS as SIDECAR_SNAPSHOTS } from './dataSidecar.mjs'

export function buildAdapters({ transport, config, log }) {
  const tushare = createTushareClient({ transport, config, log })
  const databull = createDataBullClient({ transport, config })
  const fmp = createFmpClient({ transport, config })

  // ConvexTrade 的公开 API 已下线（2026-11-26 实测 404 Application not found），
  // 不再作为镜像源注册；宏观序列以 FRED 为主、财政部为备。
  const baseSeries = [
    ...FRED,
    ...TREASURY,
    ...YAHOO,
    ...TENCENT,
    ...ALTERNATIVE,
    ...NYFED_SERIES,
    ...WORLDBANK_SERIES,
    ...JGB_SERIES,
    ...BIS_SERIES,
    ...GLOBAL_INDEX_SERIES,
    ...SIDECAR_SERIES,
  ]

  const optionalSeries = config.profile === 'lean' ? [] : createOptionalSeries({ tushare, databull, fmp })

  const series = [...baseSeries, ...optionalSeries]
  // 东财 push2 系接口在当前网络被重置（socket hang up），指数与快照已由腾讯承接；
  // 保留 registry 里的 /eastmoney-* 转发给旧前端服务兜底，但不再挂适配器。
  const snapshots = [
    ...TENCENT_SNAPSHOTS,
    ...CBOE_SNAPSHOTS,
    ...CFTC_SNAPSHOTS,
    ...WSCN_SNAPSHOTS,
    ...GLOBAL_SNAPSHOTS,
    ...SIDECAR_SNAPSHOTS,
    ...(config.profile === 'lean' ? [] : createOptionalSnapshots({ tushare })),
  ]

  const capabilities = [
    {
      id: 'tushare',
      label: 'Tushare Pro（财务三表 / 两融 / 龙虎榜）',
      available: tushare.available,
      hint: tushare.available ? '已启用' : '在设置里填入 TUSHARE_TOKEN 后启用',
    },
    {
      id: 'databull',
      label: 'DataBull（指数 / 实时 Tick / 新闻）',
      available: databull.available,
      hint: databull.available ? '已启用' : '在设置里填入 DATABULL_API_KEY 后启用',
    },
    {
      id: 'fmp',
      label: 'FMP（美股 EOD 备源 / SPY）',
      available: fmp.available,
      hint: fmp.available ? '已启用；免费 250 次/天，402 时自动降级' : '在设置里填入 FMP_API_KEY 后启用',
    },
    {
      id: 'python-runtime',
      label: 'Python 3.11+ 运行时（侧车依赖）',
      available: false,
      hint: '本机 Python 3.8 不满足 AkShare / edgartools / ccxt；安装 3.11+ 并设 MARVIS_PYTHON 后重试',
    },
    {
      id: 'baostock',
      label: 'baostock（A 股 K 线备源）',
      available: false,
      hint: '需 Python 3.11+ 与 baostock；装库后在「数据」页查看探测结果',
    },
    {
      id: 'alpha-vantage',
      label: 'Alpha Vantage（S2 Key，登记）',
      available: false,
      hint: '能力已在「全景」登记；如需入链请自备 Key 并走 FMP 同类通道',
    },
    {
      id: 'twelvedata',
      label: 'Twelve Data（S2 Key，登记）',
      available: false,
      hint: '能力已在「全景」登记；如需入链请自备 Key 并走 FMP 同类通道',
    },
    {
      id: 'nasdaq-data-link',
      label: 'Nasdaq Data Link（另类数据集，登记）',
      available: false,
      hint: '多数数据集需 Key / 付费，能力已在「全景」登记，不静默供数',
    },
    {
      id: 'strategy-runner',
      label: '本地回测 / 绩效计算',
      available: false,
      hint: '回测引擎需 Python 3.11+；绩效公式区已可查看口径，夏普等指标待接入',
    },
    {
      id: 'cftc',
      label: 'CFTC 持仓报告（COT）',
      available: !!config.keys?.cftc,
      hint: config.keys?.cftc
        ? '已启用'
        : 'Socrata 匿名请求会 403；在 socrata.com 免费申请 app token 后设 CFTC_APP_TOKEN',
    },
    {
      id: 'futu',
      label: '富途 OpenD（实时逐笔 / 期权链）',
      available: false,
      hint: '需本机运行 OpenD（127.0.0.1:11111）并安装 Python futu-api',
    },
    {
      id: 'data-sidecar',
      label: 'Python 数据侧车（AkShare / SEC EDGAR / ccxt）',
      // 实际可用状态由 /api/v1/data-sidecar/status 探测；这里只给安装指引，不假报可用。
      available: false,
      hint: '运行 py -3.11 -m pip install -r sidecar/requirements-data.txt 后，在「数据」页查看探测结果',
    },
    {
      id: 'wind',
      label: 'Wind Alice（研报 / 信用 / 配置结论）',
      available: false,
      hint: '需安装 Wind Alice CLI 并完成登录',
    },
  ]

  log(`[adapters] 序列 ${series.length} 条，快照 ${snapshots.length} 组，可选通道 ${optionalSeries.length} 条`)

  return { series, snapshots, capabilities, clients: { tushare, databull } }
}
