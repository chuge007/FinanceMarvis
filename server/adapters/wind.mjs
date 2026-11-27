/**
 * Wind Alice A2A 客户端（结构化版）。
 *
 * 本地 skill 源码证实：Alice 没有 Wind 数据库直连，全部经 A2A JSON-RPC：
 *   message/send → tasks/get → tasks/resubscribe，返回 Markdown 正文与附件 URL。
 * 所以这里实现同样的协议，并在 prompt 末尾追加结构化输出约定，
 * 再用三层解析器（json 块 → Markdown 表格 → unstructured）收敛成 ResearchFinding。
 *
 * 没有 WIND_API_KEY 时整条链路标不可得，不冒充可用。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

import { resolveJsonBlock } from '../resolve/jsonBlock.mjs'
import { resolveMarkdownTable } from '../resolve/markdownTable.mjs'
import { unstructuredFinding } from '../resolve/confidence.mjs'

const ENDPOINT = process.env.WIND_ALICE_API_URL || 'https://mcp.wind.com.cn/skills/alice'

/** 结构化输出约定：原样追加到用户 prompt，不改写用户原话。 */
export const STRUCTURE_HINT = `

请在回答末尾附上且仅附上一个 \`\`\`json 代码块，字段严格如下：
{
  "framework": "使用的分析框架",
  "conclusion": "一句话结论",
  "factors": [{"name":"指标名","value":数值或字符串,"direction":"positive|negative|neutral"}],
  "score": 0到100的数字,
  "asOf": "数据日期 YYYY-MM-DD"
}
请明确区分「数据事实」与「基于事实的推断」；取不到的数据写不可得，不要估算。`

function readKeyFromDisk() {
  for (const dir of ['.wind-aifinmarket', '.wind-alice']) {
    const file = path.join(os.homedir(), dir, 'config.env')
    try {
      if (!fs.existsSync(file)) continue
      const text = fs.readFileSync(file, 'utf8')
      const m = text.match(/^WIND_API_KEY\s*=\s*(.+)$/m)
      if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
    } catch {
      /* 读不到就当没有 */
    }
  }
  return ''
}

export function createWindClient({ transport, config, log = () => {} }) {
  const endpoint = ENDPOINT
  let key = config.keys?.wind || readKeyFromDisk()

  function setKey(value) {
    key = String(value || '')
  }

  function authHeaders() {
    return {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${key}`,
    }
  }

  async function rpc(method, params, timeoutMs = 60_000) {
    if (!key) return { ok: false, error: '未配置 WIND_API_KEY' }
    const res = await transport.request({
      url: endpoint,
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
      viaProxy: true,
      timeoutMs,
    })
    if (res.status === 0) return { ok: false, error: res.error ?? '不可达' }
    const text = res.body.toString('utf8')
    // A2A 可能返回 SSE；取第一条 data: 中的 JSON
    const dataLine = text.split(/\r?\n/).find((l) => l.startsWith('data:'))
    const payload = dataLine ? dataLine.slice(5).trim() : text
    try {
      const json = JSON.parse(payload)
      if (json.error) return { ok: false, error: json.error.message ?? 'A2A 调用失败' }
      return { ok: true, result: json.result ?? json }
    } catch {
      return { ok: false, error: 'A2A 返回不是合法 JSON' }
    }
  }

  async function probe() {
    if (!key) return { available: false, reason: '未配置 WIND_API_KEY（环境变量或 ~/.wind-aifinmarket/config.env）' }
    // status 是只读子命令，不扣额度；这里只做本地凭据检查，避免探活烧积分
    return { available: true, reason: '凭据已就绪，提交研究任务后由服务端校验额度' }
  }

  /** 提交研究任务；返回 taskId。原话不改，只追加结构化约定。 */
  async function submit(prompt, opts = {}) {
    const fullPrompt = opts.structured === false ? prompt : prompt + STRUCTURE_HINT
    const res = await rpc('message/send', {
      message: {
        messageId: crypto.randomUUID(),
        role: 'user',
        parts: [{ kind: 'text', text: fullPrompt }],
      },
    }, opts.timeoutMs ?? 60_000)
    if (!res.ok) return res
    const taskId = res.result?.id ?? res.result?.taskId ?? res.result?.task?.id ?? ''
    return { ok: !!taskId, taskId, raw: res.result }
  }

  /** 轮询任务。调用方负责退避；10 分钟内重复 prompt 会被服务端拒（exit 76）。 */
  async function poll(taskId) {
    return rpc('tasks/get', { id: taskId })
  }

  function extractMarkdown(result) {
    const artifacts = result?.artifacts ?? result?.task?.artifacts ?? []
    const texts = []
    for (const a of artifacts) {
      for (const part of a.parts ?? []) {
        if (part?.kind === 'text' && part.text) texts.push(part.text)
      }
      if (typeof a?.text === 'string') texts.push(a.text)
    }
    const fromAgent = result?.agentResult?.value ?? result?.status?.message?.parts?.[0]?.text
    return [fromAgent, ...texts].filter(Boolean).join('\n\n')
  }

  /**
   * 三层结构化解析：json 块 → Markdown 表格 → unstructured。
   * 任何一层成功都带 confidence；全失败时保留原文为文档，不进因子体系。
   */
  function resolve(markdown, taskId) {
    const base = { source: 'wind:alice', asOf: new Date().toISOString().slice(0, 10), rawRef: taskId }
    return resolveJsonBlock(markdown, base)
      ?? resolveMarkdownTable(markdown, base)
      ?? unstructuredFinding(markdown, base)
  }

  return { probe, submit, poll, resolve, extractMarkdown, setKey, get endpoint() { return endpoint } }
}
