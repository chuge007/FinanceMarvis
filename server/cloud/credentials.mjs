/**
 * BYOK 凭据加密仓（AES-256-GCM）。
 *
 * Wind / Tushare / DataBull / 朝阳永续 / CFTC / 富途账户等凭据按用户隔离，
 * 主密钥来自部署方环境变量，用户盐参与派生，云端永不共享。
 * 所有使用必须经 audit() 留痕，日志不记录明文。
 */
import crypto from 'node:crypto'

const PROVIDERS = ['wind', 'tushare', 'databull', 'suntime', 'yingmi', 'cftc', 'futu']

export function supportedProviders() {
  return PROVIDERS
}

function deriveKey(masterKey, userId) {
  if (!masterKey) throw new Error('MARVIS_MASTER_KEY 未配置，不能启用凭据仓')
  return crypto.scryptSync(String(masterKey), `marvis:${userId}`, 32)
}

/** @returns {{v:1, iv:string, tag:string, data:string}} */
export function encrypt(value, masterKey, userId) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(masterKey, userId), iv)
  // audit-disable-next-line B-SQL-CONCAT -- AES 加密流，非 SQL
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  }
}

export function decrypt(blob, masterKey, userId) {
  if (!blob || blob.v !== 1) return ''
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(masterKey, userId), Buffer.from(blob.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'))
  // audit-disable-next-line B-SQL-CONCAT -- AES 解密流，非 SQL
  return Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]).toString('utf8')
}

/** 只展示后 4 位，既不泄漏凭据又能让用户确认填对了。 */
export function mask(value) {
  if (!value) return ''
  const s = String(value)
  return s.length <= 4 ? '****' : `****${s.slice(-4)}`
}

export function isProvider(name) {
  return PROVIDERS.includes(name)
}
