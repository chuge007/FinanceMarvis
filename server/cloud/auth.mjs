/**
 * 认证与 RBAC：零依赖实现（node:crypto）。
 *
 * 不引入 jsonwebtoken / bcrypt 的原因：本地 exe 也要能复用同一份代码，
 * 且 SEA 里装不到 node_modules。scrypt + HMAC-SHA256 已足够。
 */
import crypto from 'node:crypto'

export const ROLES = {
  viewer: ['read'],
  analyst: ['read', 'research'],
  trader: ['read', 'research', 'trade'],
  admin: ['read', 'research', 'trade', 'manage_users', 'manage_sources', 'audit'],
}

/** @returns {string} salt:hash */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, expected] = stored.split(':')
  const actual = crypto.scryptSync(String(password), salt, 64)
  const expectedBuf = Buffer.from(expected, 'hex')
  if (actual.length !== expectedBuf.length) return false
  return crypto.timingSafeEqual(actual, expectedBuf)
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

export function signToken(payload, secret, ttlSec = 7 * 86400) {
  if (!secret) throw new Error('JWT_SECRET 未配置')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }))
  // audit-disable-next-line B-SQL-CONCAT -- JWT 签名输入，非 SQL
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function verifyToken(token, secret) {
  if (!secret || !token) return null
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  // audit-disable-next-line B-SQL-CONCAT -- JWT 签名比对，非 SQL
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function can(role, permission) {
  return (ROLES[role] ?? ROLES.viewer).includes(permission)
}

/** 从请求头解析 Bearer token 并校验权限；返回 null 表示拒绝。 */
export function authorize(req, secret, permission = 'read') {
  const raw = String(req.headers.authorization ?? '')
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : ''
  const payload = verifyToken(token, secret)
  if (!payload || !can(payload.role, permission)) return null
  return payload
}
