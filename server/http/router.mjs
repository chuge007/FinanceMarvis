/**
 * 极简路由：精确路径 + 路径参数（:id），零依赖。
 *
 * 后端不引框架是刻意选择：SEA 单文件里装不到 node_modules，
 * 而路由需求只有「十来个接口 + 静态托管」，自己写 60 行比引 Fastify 更稳。
 */

export function createRouter() {
  /** @type {Array<{method:string, segments:string[], handler:Function}>} */
  const routes = []

  function add(method, pattern, handler) {
    routes.push({ method, segments: pattern.split('/').filter(Boolean), handler })
    return api
  }

  function match(method, pathname) {
    const parts = pathname.split('/').filter(Boolean)
    for (const r of routes) {
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue
      if (r.segments.length !== parts.length) continue
      const params = {}
      let ok = true
      for (let i = 0; i < r.segments.length; i++) {
        const seg = r.segments[i]
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i])
        else if (seg !== parts[i]) {
          ok = false
          break
        }
      }
      if (ok) return { handler: r.handler, params }
    }
    return null
  }

  const api = {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    put: (p, h) => add('PUT', p, h),
    delete: (p, h) => add('DELETE', p, h),
    /**
     * @param {import('node:http').IncomingMessage} req
     * @param {import('node:http').ServerResponse} res
     * @returns {Promise<boolean>} 是否已处理
     */
    async dispatch(req, res, pathname, ctx) {
      const hit = match(req.method ?? 'GET', pathname)
      if (!hit) return false
      const raw = req.url ?? ''
      const qi = raw.indexOf('?')
      const query = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '')
      try {
        await hit.handler(req, res, { ...ctx, params: hit.params, query })
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: { code: 'INTERNAL', message: String(err?.message ?? err) } }))
        }
      }
      return true
    },
    size: () => routes.length,
  }
  return api
}
