/**
 * 通用上游转发层：TTL 缓存 + 代理回退 + 健康记录。
 *
 * 改造前每次页面刷新都直接穿透上游（30s 全站轮询 × 多标签页），
 * 这里是请求量的收敛点：同一 URL 在 TTL 内只打一次上游。
 */

const PASS_HEADERS = ['content-type', 'content-length', 'cache-control', 'expires', 'last-modified', 'etag']

export function createForwarder({ transport, config, health, log = () => {} }) {
  /** @type {Map<string, {expires:number, status:number, headers:Record<string,any>, body:Buffer}>} */
  const cache = new Map()
  let hits = 0
  let misses = 0

  function cacheKey(route, url) {
    return `${route.id}:${url}`
  }

  function sweep(now = Date.now()) {
    if (cache.size < 512) return
    for (const [k, v] of cache) if (v.expires <= now) cache.delete(k)
  }

  function readCache(key) {
    const entry = cache.get(key)
    if (!entry) return null
    if (entry.expires <= Date.now()) {
      cache.delete(key)
      return null
    }
    return entry
  }

  function writeCache(key, entry, ttlSec) {
    if (!ttlSec || ttlSec <= 0) return
    cache.set(key, { ...entry, expires: Date.now() + ttlSec * 1000 })
    sweep()
  }

  function collectBody(req) {
    return new Promise((resolve) => {
      const chunks = []
      let size = 0
      req.on('data', (c) => {
        size += c.length
        if (size > config.maxBodyBytes) {
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : null))
      req.on('error', () => resolve(null))
    })
  }

  /** 转发一次；代理失败时 GET/HEAD 回退直连一次（与旧行为一致）。 */
  async function attempt(route, req, body, viaProxy) {
    const target = route.origin + (req.url ?? '').slice(route.prefix.length)
    const headers = { ...route.headers }
    if (req.headers['user-agent']) headers['user-agent'] = String(req.headers['user-agent'])
    headers.accept = String(req.headers.accept ?? '*/*')
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['content-type']) {
      headers['content-type'] = String(req.headers['content-type'])
    }
    if (body) headers['content-length'] = String(body.length)

    const started = Date.now()
    const res = await transport.request({
      url: target,
      method: req.method,
      headers,
      body,
      viaProxy,
      timeoutMs: config.upstreamTimeoutMs,
    })
    return { ...res, tookMs: Date.now() - started }
  }

  async function handle(req, res, route) {
    if (!['GET', 'HEAD', 'POST'].includes(req.method ?? 'GET')) {
      res.statusCode = 405
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('Method Not Allowed')
      return
    }

    const body = req.method === 'POST' ? await collectBody(req) : null
    const key = cacheKey(route, req.url ?? '/')
    const cached = req.method === 'GET' ? readCache(key) : null

    if (cached) {
      hits += 1
      res.statusCode = cached.status
      for (const [k, v] of Object.entries(cached.headers)) res.setHeader(k, v)
      res.setHeader('x-marvis-cache', 'hit')
      res.end(cached.body)
      return
    }
    misses += 1

    let result = await attempt(route, req, body, !!route.viaProxy)
    if (result.status === 0 && route.viaProxy && (req.method === 'GET' || req.method === 'HEAD')) {
      log(`[forward] ${route.id} 经代理失败（${result.error}），回退直连`)
      result = await attempt(route, req, body, false)
    }

    if (result.status === 0) {
      health?.record(route.id, false, null, result.error ?? '上游不可达')
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.end(`Upstream error: ${result.error ?? 'unknown'}`)
      }
      return
    }

    health?.record(route.id, result.status < 500, result.tookMs, result.status >= 400 ? `HTTP ${result.status}` : null)

    const outHeaders = {}
    for (const k of PASS_HEADERS) {
      const v = result.headers[k]
      if (v !== undefined && v !== null) outHeaders[k] = v
    }
    // 上游可能返回分块 gzip，长度由 Node 重算，避免缓存与压缩不一致
    delete outHeaders['content-length']

    res.statusCode = result.status
    for (const [k, v] of Object.entries(outHeaders)) res.setHeader(k, v)
    res.setHeader('x-marvis-cache', 'miss')
    res.end(result.body)

    if (req.method === 'GET' && result.status >= 200 && result.status < 300) {
      writeCache(key, { status: result.status, headers: outHeaders, body: result.body }, route.ttl ?? 0)
    }
  }

  return {
    handle,
    invalidate(prefix) {
      for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key)
    },
    stats() {
      return { entries: cache.size, hits, misses }
    },
  }
}
