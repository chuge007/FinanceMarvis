/**
 * 云端接口（/api/v2）。
 *
 * v1 是本地单机接口，v2 在 v1 之上加认证、租户隔离、任务与凭据。
 * 所有响应仍走 {data, meta} 信封，前端的降级渲染逻辑不用改。
 */
import { envelope, sendError, sendJson } from '../http/respond.mjs'
import { authorize, signToken } from '../cloud/auth.mjs'
import { readJsonBody } from '../http/middleware.mjs'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * @param {ReturnType<typeof import('../http/router.mjs').createRouter>} router
 */
export function registerCloudRoutes(router, { config, store, queue }) {
  function guard(req, res, permission = 'read') {
    const user = authorize(req, config.jwtSecret, permission)
    if (!user) sendError(res, 401, 'UNAUTHORIZED', '需要登录或权限不足')
    return user
  }

  // ── 认证 ──────────────────────────────────────────────────
  router.post('/api/v2/auth/login', async (req, res) => {
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      body = {}
    }
    const username = body.username
    const password = body.password
    const user = await store.authenticate(String(username ?? ''), String(password ?? ''))
    if (!user) {
      sendError(res, 401, 'UNAUTHORIZED', '用户名或密码错误')
      return
    }
    const token = signToken({ sub: user.id, role: user.role, username: user.username }, config.jwtSecret, config.tokenTtlSec)
    sendJson(res, 200, envelope({ token, user }, { source: 'cloud:auth', asOf: today() }))
  })

  router.get('/api/v2/me', (req, res) => {
    const user = guard(req, res)
    if (user) sendJson(res, 200, envelope(user, { source: 'cloud:auth', asOf: today() }))
  })

  router.get('/api/v2/users', async (req, res) => {
    if (!guard(req, res, 'manage_users')) return
    sendJson(res, 200, envelope({ users: await store.listUsers() }, { source: 'cloud:store', asOf: today() }))
  })

  // ── BYOK 凭据 ─────────────────────────────────────────────
  router.get('/api/v2/credentials', async (req, res) => {
    const user = guard(req, res)
    if (!user) return
    const rows = await store.listCredentials(user.sub)
    sendJson(res, 200, envelope({ credentials: rows }, { source: 'cloud:credentials', asOf: today() }))
  })

  router.put('/api/v2/credentials/:provider', async (req, res, ctx) => {
    const user = guard(req, res, 'research')
    if (!user) return
    const provider = ctx.params.provider
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      body = {}
    }
    // 凭据只能走请求体：进 URL 会落进访问日志与 Referer（后端规范 B-SECRET-QUERY）
    const value = body.value
    if (!value) {
      sendError(res, 400, 'BAD_REQUEST', '缺少凭据值（请放在请求体中）')
      return
    }
    try {
      const saved = await store.setCredential(user.sub, provider, String(value))
      sendJson(res, 200, envelope(saved, { source: 'cloud:credentials', asOf: today() }))
    } catch (err) {
      sendError(res, 400, 'BAD_REQUEST', err?.message ?? '凭据保存失败')
    }
  })

  // ── 研究结论 ──────────────────────────────────────────────
  router.get('/api/v2/findings', async (req, res, ctx) => {
    const user = guard(req, res)
    if (!user) return
    const limit = Number(ctx.query.get('limit') ?? 50)
    const findings = await store.listFindings(user.sub, limit)
    sendJson(
      res,
      200,
      envelope(
        { findings },
        {
          source: 'cloud:findings',
          asOf: today(),
          ...(findings.some((f) => f.confidence === 'unstructured')
            ? { note: '部分结论未能结构化，仅作文档附件' }
            : {}),
        },
      ),
    )
  })

  router.post('/api/v2/tasks', async (req, res) => {
    const user = guard(req, res, 'research')
    if (!user) return
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      body = {}
    }
    const kind = body.kind
    if (!kind) {
      sendError(res, 400, 'BAD_REQUEST', '缺少任务类型')
      return
    }
    const id = await queue.enqueue(kind, { ...body, userId: user.sub })
    await store.log(user.sub, 'task.submit', id, kind)
    sendJson(res, 202, envelope({ id, status: 'waiting' }, { source: 'cloud:queue', asOf: today() }))
  })

  router.get('/api/v2/tasks/:id', (req, res, ctx) => {
    const user = guard(req, res)
    if (!user) return
    const task = queue.get(ctx.params.id)
    if (!task || (task.payload?.userId && task.payload.userId !== user.sub)) {
      sendError(res, 404, 'NO_DATA', '任务不可得')
      return
    }
    sendJson(res, 200, envelope(task, { source: 'cloud:queue', asOf: today() }))
  })

  router.get('/api/v2/tasks', (req, res) => {
    const user = guard(req, res)
    if (!user) return
    sendJson(res, 200, envelope({ tasks: queue.list(user.sub) }, { source: 'cloud:queue', asOf: today() }))
  })

  // ── 跨市场雷达 ────────────────────────────────────────────
  router.get('/api/v2/radar', async (req, res, ctx) => {
    if (!guard(req, res)) return
    const market = ctx.query.get('market') ?? 'global'
    const row = await store.latestRadar(market)
    if (!row) {
      sendJson(res, 200, envelope({ radar: null }, { source: 'cloud:radar', asOf: null, missing: ['雷达数据尚未生成'] }))
      return
    }
    sendJson(
      res,
      200,
      envelope(
        { radar: row.payload },
        { source: row.source, asOf: row.as_of, caliber: '第三方环境分数与本地自算分数分列' },
      ),
    )
  })

  // ── 审计 ──────────────────────────────────────────────────
  router.get('/api/v2/audit', async (req, res, ctx) => {
    const user = guard(req, res, 'audit')
    if (!user) return
    const rows = await store.listAudit({
      userId: ctx.query.get('userId') ?? undefined,
      action: ctx.query.get('action') ?? undefined,
      limit: Number(ctx.query.get('limit') ?? 200),
    })
    sendJson(res, 200, envelope({ rows }, { source: 'cloud:audit', asOf: today() }))
  })
}
