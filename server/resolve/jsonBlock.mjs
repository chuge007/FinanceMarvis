/**
 * 结构化解析第一层：从 Alice 返回的 Markdown 中提取约定的 ```json 代码块。
 */
import { toFinding } from './confidence.mjs'

/**
 * 抽取所有 json 代码块，逐个尝试，返回第一个通过 schema 校验的 Finding。
 * @param {string} markdown
 */
export function resolveJsonBlock(markdown, base) {
  if (!markdown) return null
  const re = /```(?:json|JSON)\s*\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(markdown))) {
    try {
      const obj = JSON.parse(m[1])
      const candidate = obj?.finding ?? obj?.result ?? obj
      const finding = toFinding(candidate, 'json', base)
      if (finding) return finding
    } catch {
      // 继续找下一个块
    }
  }
  return null
}
