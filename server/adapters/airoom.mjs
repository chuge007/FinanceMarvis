/**
 * airoom 第三方环境分数（可选导入）。
 *
 * 实测 2026-11-26：官网页面可达（301 → 200，66KB），但页面**没有** CSV 直链，
 * 只有「去官网手动下载 / 去 GitHub 取 SKILL」的说明文字。
 * 所以这里不做网络爬虫假装能拿到数据，而是支持用户把官方 CSV 放到
 *   <dataDir>/airoom/APIshujubaocun.csv
 * 后导入。没有文件时整条链路标「不可得」，跨市场雷达改用本地真实序列自算分数。
 *
 * 字段口径来自官方 SKILL.md，CSV 中中英文表头都兼容。
 */
import fs from 'node:fs'
import path from 'node:path'

const FILE_NAME = 'APIshujubaocun.csv'
const HEADERS = {
  date: ['日期前缀', 'date', 'date_prefix'],
  market: ['市场名称+处理数量', '市场名称', 'market name', 'market'],
  turnover: ['成交额总和', 'total turnover', 'turnover'],
  average: ['平均值', 'average value', 'average'],
  environment: ['环境', 'environment'],
  up8: ['涨跌幅>8%的数量', '涨跌幅>8%', 'rise>8%'],
  down8: ['涨跌幅<-8%的数量', '涨跌幅<-8%', 'fall<-8%'],
  qualified: ['统计数量（符合持有条件标的数）', '统计数量', 'qualified'],
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const cells = (line) => line.split(',').map((c) => c.replace(/^"|"$/g, '').trim())
  const header = cells(lines[0])
  const idx = {}
  for (const [key, aliases] of Object.entries(HEADERS)) {
    idx[key] = header.findIndex((h) => aliases.some((a) => h.toLowerCase().includes(a.toLowerCase())))
  }
  const out = []
  for (let i = 1; i < lines.length; i++) {
    const row = cells(lines[i])
    const get = (key) => (idx[key] >= 0 ? row[idx[key]] : '')
    const date = String(get('date')).slice(0, 10)
    const market = get('market')
    const envRaw = String(get('environment')).trim()
    if (!market || !date) continue
    out.push({
      date,
      market,
      turnover: Number(get('turnover')) || null,
      average: Number(get('average')) || null,
      environment: envRaw,
      up8: Number(get('up8')) || null,
      down8: Number(get('down8')) || null,
      qualified: Number(get('qualified')) || null,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function createAiroornSource({ config, log = () => {} }) {
  const file = path.join(config.dataDir, 'airoom', FILE_NAME)
  return {
    id: 'airoom',
    label: 'airoom 第三方环境分数',
    source: 'airoom:csv',
    available: fs.existsSync(file),
    file,
    hint: fs.existsSync(file)
      ? '已导入官方 CSV'
      : `官网未提供 CSV 直链；请把 ${FILE_NAME} 放到 ${path.dirname(file)} 后重启`,
    async fetch() {
      if (!fs.existsSync(file)) return { available: false, reason: this.hint }
      try {
        const rows = parseCsv(fs.readFileSync(file, 'utf8'))
        if (!rows.length) return { available: false, reason: 'CSV 解析为空，请检查表头' }
        log(`[airoom] 导入 ${rows.length} 行，最新 ${rows[rows.length - 1].date}`)
        return { available: true, rows }
      } catch (err) {
        return { available: false, reason: `CSV 读取失败: ${err?.message ?? err}` }
      }
    },
  }
}
