/**
 * 统一响应信封与错误码。
 *
 * 前端依赖这个形状做三件事：取数据、显示数据日期、显示「不可得」。
 * 所以 meta 不是可选的装饰，而是契约的一部分。
 */

/** @typedef {{source:string, asOf:string|null, caliber?:string, stale?:boolean, degraded?:boolean, missing?:string[], note?:string}} Meta */

/** @param {any} data @param {Meta} meta */
export function envelope(data, meta) {
  return {
    data,
    meta: {
      source: meta.source ?? 'unknown',
      asOf: meta.asOf ?? null,
      ...(meta.caliber ? { caliber: meta.caliber } : {}),
      ...(meta.stale ? { stale: true } : {}),
      ...(meta.degraded ? { degraded: true } : {}),
      ...(meta.missing && meta.missing.length ? { missing: meta.missing } : {}),
      ...(meta.note ? { note: meta.note } : {}),
    },
  }
}

export function sendJson(res, status, payload) {
  if (res.headersSent) return
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', String(body.length))
  res.end(body)
}

export function sendText(res, status, text) {
  if (res.headersSent) return
  const body = Buffer.from(text, 'utf8')
  res.statusCode = status
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.setHeader('content-length', String(body.length))
  res.end(body)
}

/** 统一错误：code 让前端能做差异化文案，而不是解析字符串。 */
export function sendError(res, status, code, message, detail) {
  sendJson(res, status, {
    error: { code, message, ...(detail ? { detail } : {}) },
    meta: { source: 'server', asOf: null },
  })
}

export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  NO_DATA: 404,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  DEGRADED: 503,
  INTERNAL: 500,
}
