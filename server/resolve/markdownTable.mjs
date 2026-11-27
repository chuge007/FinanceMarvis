/**
 * 结构化解析第二层：把 Markdown 表格映射成因子列表。
 *
 * 只在 json 块不存在或校验失败时使用，置信度降为 medium。
 */
import { toFinding } from './confidence.mjs'

/** 解析第一张表格，返回 {headers, rows}。 */
export function parseFirstTable(markdown) {
  if (!markdown) return null
  const lines = markdown.split(/\r?\n/)
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) continue
    const split = (line) =>
      line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    const headers = split(lines[i])
    const rows = []
    for (let j = i + 2; j < lines.length; j++) {
      if (!lines[j].includes('|')) break
      const cells = split(lines[j])
      if (cells.length !== headers.length) continue
      rows.push(cells)
    }
    if (rows.length) return { headers, rows }
  }
  return null
}

export function resolveMarkdownTable(markdown, base) {
  const table = parseFirstTable(markdown)
  if (!table) return null
  const nameIdx = table.headers.findIndex((h) => /指标|因子|item|factor|name/i.test(h))
  const valueIdx = table.headers.findIndex((h) => /数值|值|value/i.test(h))
  if (nameIdx < 0 || valueIdx < 0) return null

  const factors = table.rows.map((row) => ({
    name: row[nameIdx],
    value: Number.isFinite(Number(row[valueIdx])) ? Number(row[valueIdx]) : row[valueIdx],
    direction: /负|低|风险|negative/i.test(row[valueIdx]) ? 'negative' : 'neutral',
  }))
  const firstParagraph = markdown.split(/\r?\n/).find((l) => l.trim().length > 20 && !l.includes('|')) ?? ''
  return toFinding(
    { framework: 'Markdown 表格提取', conclusion: firstParagraph.trim(), factors },
    'table',
    base,
  )
}
