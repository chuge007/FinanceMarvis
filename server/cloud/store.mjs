/**
 * 云端仓储：用户、BYOK 凭据、研究结论、雷达分数、审计日志。
 *
 * 所有写入都带租户隔离字段；凭据只存密文；审计记录不可删除。
 */
import crypto from 'node:crypto'
import { hashPassword, verifyPassword } from './auth.mjs'
import { encrypt, decrypt, mask, isProvider } from './credentials.mjs'

const now = () => Math.floor(Date.now() / 1000)

export function createStore(db, config) {
  async function createUser({ username, password, role = 'viewer' }) {
    if (!username || !password) throw new Error('username 与 password 必填')
    const id = crypto.randomUUID()
    await db.run(
      'INSERT INTO users (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)',
      id,
      username,
      hashPassword(password),
      role,
      now(),
    )
    await log(id, 'user.create', username, `role=${role}`)
    return getUser(id)
  }

  async function getUser(id) {
    const row = await db.get('SELECT id, username, role, created_at FROM users WHERE id = ?', id)
    return row ?? null
  }

  async function findUserByUsername(username) {
    return db.get('SELECT * FROM users WHERE username = ?', username)
  }

  async function authenticate(username, password) {
    const row = await findUserByUsername(username)
    if (!row || !verifyPassword(password, row.password)) return null
    await log(row.id, 'user.login', username)
    return getUser(row.id)
  }

  async function listUsers() {
    return db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC')
  }

  async function setCredential(userId, provider, value) {
    if (!isProvider(provider)) throw new Error(`不支持的凭据类型: ${provider}`)
    const blob = JSON.stringify(encrypt(value, config.masterKey, userId))
    await db.run(
      `INSERT INTO credentials (user_id, provider, blob, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at`,
      userId,
      provider,
      blob,
      now(),
    )
    await log(userId, 'credential.set', provider, mask(value))
    return { userId, provider, masked: mask(value) }
  }

  async function getCredential(userId, provider) {
    const row = await db.get('SELECT blob FROM credentials WHERE user_id = ? AND provider = ?', userId, provider)
    if (!row) return ''
    return decrypt(JSON.parse(row.blob), config.masterKey, userId)
  }

  async function listCredentials(userId) {
    const rows = await db.all('SELECT provider, blob, updated_at FROM credentials WHERE user_id = ?', userId)
    return rows.map((r) => ({
      provider: r.provider,
      masked: mask(decryptSafe(JSON.parse(r.blob), userId)),
      updatedAt: r.updated_at,
    }))
  }

  function decryptSafe(blob, userId) {
    try {
      return decrypt(blob, config.masterKey, userId)
    } catch {
      return ''
    }
  }

  async function saveFinding(finding, userId) {
    await db.run(
      `INSERT INTO findings (id, user_id, payload, source, confidence, as_of, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, source=excluded.source,
         confidence=excluded.confidence, as_of=excluded.as_of`,
      finding.id,
      userId,
      JSON.stringify(finding),
      finding.source,
      finding.confidence,
      finding.asOf,
      now(),
    )
    await log(userId, 'finding.save', finding.id, `${finding.source}/${finding.confidence}`)
    return finding
  }

  async function listFindings(userId, limit = 50) {
    const rows = await db.all(
      'SELECT payload FROM findings WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      userId,
      limit,
    )
    return rows.map((r) => JSON.parse(r.payload))
  }

  async function saveRadar(market, payload, source, asOf) {
    await db.run(
      'INSERT INTO radar_scores (market, payload, source, as_of, created_at) VALUES (?, ?, ?, ?, ?)',
      market,
      JSON.stringify(payload),
      source,
      asOf,
      now(),
    )
  }

  async function latestRadar(market) {
    const row = await db.get(
      'SELECT payload, source, as_of, created_at FROM radar_scores WHERE market = ? ORDER BY created_at DESC LIMIT 1',
      market,
    )
    return row ? { ...row, payload: JSON.parse(row.payload) } : null
  }

  async function log(userId, action, target, detail) {
    await db.run(
      'INSERT INTO audit_log (user_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?)',
      userId ?? null,
      action,
      target ?? null,
      detail ?? null,
      now(),
    )
  }

  async function listAudit({ userId, action, limit = 200 } = {}) {
    // 固定 SQL + NULL 安全比较，不做字符串拼接（后端规范 B-SQL-CONCAT）
    return db.all(
      `SELECT id, user_id, action, target, detail, at FROM audit_log
       WHERE (? IS NULL OR user_id = ?) AND (? IS NULL OR action = ?)
       ORDER BY at DESC LIMIT ?`,
      userId ?? null,
      userId ?? null,
      action ?? null,
      action ?? null,
      limit,
    )
  }

  return {
    createUser,
    getUser,
    findUserByUsername,
    authenticate,
    listUsers,
    setCredential,
    getCredential,
    listCredentials,
    saveFinding,
    listFindings,
    saveRadar,
    latestRadar,
    log,
    listAudit,
  }
}
