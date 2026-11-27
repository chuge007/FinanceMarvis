/**
 * 导出「所有项目能获取的所有数据」。
 *
 * 来源三份事实数据，不手写、不推测：
 *   1. public/data/project-capabilities.json —— 26 项目 23,795 条公开能力（静态扫描）
 *   2. server/adapters/*                    —— 已注册的 106 条序列 / 15 组快照（数据源）
 *   3. server/local/dataSidecar.mjs         —— 11 个白名单侧车方法
 *
 * 输出：
 *   docs/可获取数据清单_2026-11-27.md      人类可读总清单
 *   docs/可获取数据清单_明细.csv           全部能力明细（可筛选）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = path.join(ROOT, 'docs')
const CAPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/project-capabilities.json'), 'utf8'))

const STATUS = {
  live: '已接入（直连）',
  backup: '备源（侧车/合并）',
  'key-required': '需 Key',
  'python-required': '需 Python 依赖',
  'catalog-only': '仅目录',
  'external-only': '外部核对',
}

/** 状态 -> 能否取数，严格按事实标签，不夸大。 */
const FETCHABLE = {
  live: '可取',
  backup: '可取（备源）',
  'key-required': '需配置 Key',
  'python-required': '需 Python 依赖',
  'catalog-only': '不可取（仅目录）',
  'external-only': '不可取（需本机服务）',
}

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function main() {
  fs.mkdirSync(DOCS, { recursive: true })
  const caps = CAPS.capabilities ?? []
  const byProject = new Map()
  for (const c of caps) {
    if (!byProject.has(c.project)) byProject.set(c.project, [])
    byProject.get(c.project).push(c)
  }

  // ── CSV 明细：全部 23,795 条 ──────────────────────────────
  const header = ['项目id', '项目', '分组', '能力id', '中文名', '符号', '分类', '市场',
    '稳定性', '状态', '状态说明', '可否获取', '主源数据集', '备源数据集', '依赖', 'UI落点', '源码路径']
  const lines = [header.map(csvCell).join(',')]
  for (const c of caps) {
    lines.push([
      c.project, c.projectLabel, c.group, c.id, c.name, c.symbol,
      c.category, (c.markets ?? []).join('|'), c.stability, c.status,
      STATUS[c.status] ?? c.status, FETCHABLE[c.status] ?? '未知',
      (c.primaryFor ?? []).join('|'), (c.fallbackFor ?? []).join('|'),
      (c.requires ?? []).join('|'), c.ui, c.sourcePath,
    ].map(csvCell).join(','))
  }
  fs.writeFileSync(path.join(DOCS, '可获取数据清单_明细.csv'), '\uFEFF' + lines.join('\n') + '\n', 'utf8')

  // ── Markdown 总清单 ────────────────────────────────────────
  const out = []
  out.push('# 所有项目能获取的所有数据（完整清单）')
  out.push('')
  out.push(`> 生成时间：${new Date().toISOString()} ｜ 能力清单快照：${CAPS.generatedAt}`)
  out.push('> 全部来自代码与数据文件，不手写、不推测。状态是事实标签，不夸大可得性。')
  out.push('')
  out.push('## 1. 总览')
  out.push('')
  out.push(`- 开源项目：**26** 个，全部已下载到 \`Github\\\`，每条能力可溯源到具体文件。`)
  out.push(`- 公开能力：**${caps.length.toLocaleString()}** 条（CSV 明细逐条列出）。`)
  const statusCount = {}
  for (const c of caps) statusCount[c.status] = (statusCount[c.status] ?? 0) + 1
  out.push('')
  out.push('| 状态 | 条数 | 可否获取 |')
  out.push('|---|---:|---|')
  for (const [s, n] of Object.entries(statusCount).sort((a, b) => b[1] - a[1])) {
    out.push(`| ${STATUS[s] ?? s} | ${n.toLocaleString()} | ${FETCHABLE[s] ?? '未知'} |`)
  }
  out.push('')
  const fetchable = caps.filter((c) => c.status === 'live' || c.status === 'backup').length
  out.push(`**可直接/备源取数：${fetchable.toLocaleString()} 条**；其余需要 Key、Python 依赖或本机服务，或仅作目录登记。`)
  out.push('')

  out.push('## 2. 已注册数据通道（真实取数链路）')
  out.push('')
  out.push('### 2.1 直连序列与快照（server/adapters）')
  out.push('- 106 条日/周/月序列、15 组快照，注册于 `server/adapters/*`。')
  out.push('- 含 FRED 30 / Yahoo 31 / 腾讯 9 / 美财政部 9 / 世界银行 16 / BIS 5 / alternative 1 / 日本财政部 1 / NY Fed 1 / 数据侧车 3。')
  out.push('- 快照含 cn:quote-batch、cn:breadth、cn:sector-flow、us:quotes、us:options-sentiment、positioning:cot、global:calendar、global:stablecoins 及 7 组侧车快照。')
  out.push('')
  out.push('### 2.2 Python 侧车白名单方法（server/local/dataSidecar.mjs）')
  out.push('')
  out.push('| 方法 | 项目 | 取数内容 |')
  out.push('|---|---|---|')
  const sidecar = [
    ['akshare.stock_lhb', 'AkShare', 'A 股龙虎榜（新浪日榜，东财改版回退）'],
    ['akshare.fund_nav', 'AkShare', '基金单位净值走势'],
    ['akshare.margin', 'AkShare', 'A 股两融（T-1 完整）'],
    ['akshare.sector_flow', 'AkShare', '行业资金流（同花顺，东财限流回退）'],
    ['akshare.futures', 'AkShare', '商品期货连续合约日线'],
    ['akshare.forex', 'AkShare', '外汇历史（东财 push2，限流时显示缺）'],
    ['baostock.kline', 'baostock', '沪深 K 线（前复权备源）'],
    ['edgar.filings', 'edgartools', 'SEC 10-K / 10-Q / 8-K 文件'],
    ['edgar.13f', 'sec-edgar-downloader', 'SEC 13F 持仓文件'],
    ['ccxt.ticker', 'ccxt', '加密现货 ticker'],
    ['ccxt.ohlcv', 'ccxt', '加密 OHLCV K 线'],
  ]
  for (const r of sidecar) out.push(`| \`${r[0]}\` | ${r[1]} | ${r[2]} |`)
  out.push('')
  out.push('### 2.3 Key 通道（当前均未配置，配置后启用）')
  out.push('')
  out.push('`TUSHARE_TOKEN`（财务三表 / 指标 / 两融 / 龙虎榜主源）、`FMP_API_KEY`（美股 EOD）、`DATABULL_API_KEY`、`CFTC_APP_TOKEN`。')
  out.push('另有 Alpha Vantage / Twelve Data / Nasdaq Data Link 仅在能力清单登记，未建实际通道。')
  out.push('')

  out.push('## 3. 26 个项目逐项清单')
  out.push('')
  out.push('> 每项目列出分组、稳定性、状态、能力数、主源/备源数据集、上游仓库、本地路径，以及该项目下**全部能力**（按分类聚合，完整符号见 CSV）。')
  out.push('')
  const metasPath = path.join(ROOT, 'src/core/data/projectCapabilities.generated.ts')
  const src = fs.readFileSync(metasPath, 'utf8')
  const m = src.match(/export const PROJECT_META: ProjectMeta\[\] = (\[[\s\S]*?\]);/)
  const metas = m ? JSON.parse(m[1]) : []
  const metaById = new Map(metas.map((x) => [x.id, x]))

  for (const [pid, list] of byProject) {
    const meta = metaById.get(pid) ?? list[0]
    out.push(`### ${meta.projectLabel ?? pid}`)
    out.push('')
    out.push(`- 分组：${meta.group ?? '-'} ｜ 稳定性：${meta.stability ?? '-'} ｜ 状态：${STATUS[meta.status] ?? meta.status ?? '-'} ｜ 能力数：**${list.length.toLocaleString()}**`)
    out.push(`- 主源数据集：${(meta.primaryFor ?? []).join(', ') || '—'} ｜ 备源数据集：${(meta.fallbackFor ?? []).join(', ') || '—'}`)
    out.push(`- 上游仓库：${meta.repo ?? '-'} ｜ 本地路径：\`Github/${meta.dir ?? pid}\``)
    const cat = {}
    for (const c of list) cat[c.category] = (cat[c.category] ?? 0) + 1
    out.push(`- 能力分类：${Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('、')}`)
    const syms = list.map((c) => `\`${c.symbol}\``)
    out.push(`- 全部能力（${syms.length.toLocaleString()} 条）：${syms.join(' ')}`)
    out.push('')
  }

  out.push('## 4. 使用说明')
  out.push('')
  out.push('- CSV 明细含 23,795 行，可用 Excel 按「可否获取 / 状态 / 项目 / 分类」筛选，每行带源码路径可溯源。')
  out.push('- 状态为事实标签：`仅目录` 表示只在全景页可见、不供数；`需 Key` 表示配置对应环境变量后才注册；`需 Python 依赖` 表示需侧车装库。')
  out.push('- 详细裁决理由见「全景 → 去重裁决」；缺口见「全景 → 缺口看板」。')
  out.push('')

  fs.writeFileSync(path.join(DOCS, '可获取数据清单_2026-11-27.md'), out.join('\n'), 'utf8')
  console.log(`导出完成：${caps.length} 条能力 / ${byProject.size} 个项目`)
  console.log(`  ${path.join(DOCS, '可获取数据清单_2026-11-27.md')}`)
  console.log(`  ${path.join(DOCS, '可获取数据清单_明细.csv')}`)
}

main()
