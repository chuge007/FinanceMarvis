/**
 * 内置 AI 网关（ESM）：把前端同域请求转发到任意 OpenAI 兼容上游。
 *
 * 为什么需要它：
 *  浏览器不能直连大模型接口——Key 会出现在前端、上游也不发 CORS 头。
 *  所以前端只 POST 同域 `/ai/chat`，由本服务代为访问上游，并把 SSE 原样回传。
 *
 * 凭证来源（优先级从高到低）：
 *  1. 服务端环境变量 AI_BASE_URL / AI_API_KEY / AI_MODEL
 *     —— 部署方统一配置，使用者打开软件就能用，本地无需填写。
 *  2. 请求头 x-ai-base / x-ai-key / x-ai-model
 *     —— 使用者自己带 Key，存在本机 localStorage，不上传任何第三方。
 *  设置 AI_BASE_URL 后请求头被忽略，避免公网部署时被改成任意内网地址。
 *
 * 路由：
 *  GET  /ai/config → { configured, model, baseUrl }（baseUrl 只回显 host，不泄露 Key）
 *  POST /ai/chat   → 透传上游 /chat/completions
 */
import http from 'node:http'
import https from 'node:https'

const BODY_LIMIT = 4 * 1024 * 1024
const UPSTREAM_TIMEOUT = 120_000

/**
 * 规范化 base URL：
 *  - 去掉尾部斜杠
 *  - 已经是 /chat/completions 的去掉该段
 *  - 末尾不是 /vN 的补 /v1（DeepSeek、OpenAI 这类只给域名的写法）
 * @param {string} raw
 * @returns {string}
 */
export function normalizeBase(raw) {
  let base = String(raw ?? '').trim().replace(/\/+$/, '')
  if (!base) return ''
  base = base.replace(/\/chat\/completions$/, '')
  if (!/\/v\d+[a-z]*$/i.test(base)) base += '/v1'
  return base
}

/**
 * 解析本次请求使用的上游凭证。
 * @param {import('node:http').IncomingMessage} req
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveCredential(req, env = process.env) {
  const envBase = normalizeBase(env.AI_BASE_URL)
  if (envBase) {
    return { base: envBase, key: String(env.AI_API_KEY ?? '').trim(), model: String(env.AI_MODEL ?? '').trim(), source: 'server' }
  }
  const base = normalizeBase(req.headers['x-ai-base'])
  const key = String(req.headers['x-ai-key'] ?? '').trim()
  const model = String(req.headers['x-ai-model'] ?? '').trim()
  return { base, key, model, source: base ? 'client' : 'none' }
}

function sendJson(res, status, payload) {
  if (res.headersSent) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function fail(res, status, message) {
  sendJson(res, status, { error: { message, type: 'ai_gateway_error' } })
}

/** 读取并解析 JSON 请求体（带体积上限，防止误发超大 payload 卡死进程）。 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        reject(new Error('请求体过大（上限 4MB）'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 创建 AI 路由处理器。
 * @param {{ env?: NodeJS.ProcessEnv, log?: (msg: string) => void }} options
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, pathname: string) => Promise<boolean>}
 *          返回 true 表示该请求已被 AI 路由接管。
 */
export function createAiHandler({ env = process.env, log = () => {} } = {}) {
  async function handleConfig(req, res) {
    const envBase = normalizeBase(env.AI_BASE_URL)
    let host = ''
    if (envBase) {
      try {
        host = new URL(envBase).host
      } catch {
        host = ''
      }
    }
    sendJson(res, 200, {
      configured: Boolean(envBase),
      model: envBase ? String(env.AI_MODEL ?? '') : '',
      baseUrl: host,
    })
  }

  /** GET /ai/models：代为拉取上游模型列表，避免浏览器直连上游被 CORS 拦住。 */
  async function handleModels(req, res) {
    const cred = resolveCredential(req, env)
    if (!cred.base) return fail(res, 400, '未配置模型接口')

    let target
    try {
      target = new URL(cred.base + '/models')
    } catch {
      return fail(res, 400, 'Base URL 格式不正确')
    }

    const transport = target.protocol === 'http:' ? http : https
    const headers = { accept: 'application/json' }
    if (cred.key) headers.authorization = `Bearer ${cred.key}`

    const upstream = transport.request(
      {
        method: 'GET',
        host: target.hostname,
        port: target.port || (target.protocol === 'http:' ? 80 : 443),
        path: target.pathname + target.search,
        headers,
        timeout: 20_000,
      },
      (pres) => {
        const chunks = []
        pres.on('data', (c) => chunks.push(c))
        pres.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          res.statusCode = pres.statusCode ?? 502
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(raw)
        })
        pres.on('error', () => fail(res, 502, '拉取模型列表失败'))
      },
    )
    upstream.on('timeout', () => upstream.destroy(new Error('上游超时')))
    upstream.on('error', (err) => fail(res, 502, `上游不可达：${err.message}`))
    upstream.end()
  }

  async function handleChat(req, res) {
    if (req.method !== 'POST') return fail(res, 405, '请使用 POST')

    const cred = resolveCredential(req, env)
    if (!cred.base) {
      return fail(res, 400, '未配置模型接口：请在「AI 设置」里填写 Base URL、API Key 与模型名')
    }

    let body
    try {
      body = await readJsonBody(req)
    } catch (err) {
      return fail(res, 400, err instanceof Error ? err.message : '请求体解析失败')
    }

    const messages = Array.isArray(body.messages) ? body.messages : []
    if (!messages.length) return fail(res, 400, 'messages 不能为空')

    const model = String(body.model || cred.model || '').trim()
    if (!model) return fail(res, 400, '缺少模型名（model）')

    const stream = body.stream !== false
    const payload = JSON.stringify({
      model,
      messages,
      stream,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
      ...(typeof body.max_tokens === 'number' ? { max_tokens: body.max_tokens } : {}),
    })

    let target
    try {
      target = new URL(cred.base + '/chat/completions')
    } catch {
      return fail(res, 400, 'Base URL 格式不正确')
    }

    const transport = target.protocol === 'http:' ? http : https
    const headers = {
      'content-type': 'application/json',
      accept: stream ? 'text/event-stream' : 'application/json',
    }
    if (cred.key) headers.authorization = `Bearer ${cred.key}`

    const upstream = transport.request(
      {
        method: 'POST',
        host: target.hostname,
        port: target.port || (target.protocol === 'http:' ? 80 : 443),
        path: target.pathname + target.search,
        headers,
        timeout: UPSTREAM_TIMEOUT,
      },
      (pres) => {
        const contentType = pres.headers['content-type'] ?? (stream ? 'text/event-stream; charset=utf-8' : 'application/json')
        res.statusCode = pres.statusCode ?? 502
        res.setHeader('content-type', String(contentType))
        res.setHeader('cache-control', 'no-cache, no-transform')
        res.setHeader('x-accel-buffering', 'no')
        if (pres.headers['content-length']) res.setHeader('content-length', String(pres.headers['content-length']))
        if (pres.statusCode && pres.statusCode >= 400) {
          // 上游报错通常是一次性 JSON，而不是 SSE；整体缓冲后原样返回，便于前端提示。
          const chunks = []
          pres.on('data', (c) => chunks.push(c))
          pres.on('end', () => {
            if (!res.writableEnded) res.end(Buffer.concat(chunks))
          })
          pres.on('error', () => res.destroy())
          return
        }
        pres.pipe(res)
        pres.on('error', () => res.destroy())
      },
    )

    upstream.on('timeout', () => upstream.destroy(new Error('上游超时（120s）')))
    upstream.on('error', (err) => {
      log(`[ai] 上游请求失败: ${err.message} → ${cred.base}`)
      if (!res.headersSent) {
        fail(res, 502, `上游不可达：${err.message}`)
      } else {
        res.destroy()
      }
    })
    // 客户端断开（点“停止”）时及时掐掉上游连接，避免继续烧 token。
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy()
    })

    upstream.end(payload)
  }

  return async function handleAi(req, res, pathname) {
    try {
      if (pathname === '/ai/config') {
        await handleConfig(req, res)
        return true
      }
      if (pathname === '/ai/models') {
        await handleModels(req, res)
        return true
      }
      if (pathname === '/ai/chat') {
        await handleChat(req, res)
        return true
      }
      return false
    } catch (err) {
      fail(res, 500, err instanceof Error ? err.message : 'AI 网关异常')
      return true
    }
  }
}
