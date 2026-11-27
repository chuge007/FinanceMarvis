/**
 * 请求中间件：URL 解析、JSON body、来源校验、请求日志。
 *
 * 来源校验是必要的：本地服务若监听在回环地址，浏览器仍可能被恶意页面
 * 通过 DNS rebinding 打进来。只放行 127.0.0.1 / localhost 的 Host。
 */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

export function parseUrl(req) {
  const raw = req.url ?? '/'
  const qIndex = raw.indexOf('?')
  const pathname = qIndex >= 0 ? raw.slice(0, qIndex) : raw
  const query = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : '')
  return { pathname, query, raw }
}

export function hostAllowed(req, { allowAnyHost = false } = {}) {
  if (allowAnyHost) return true
  const host = String(req.headers.host ?? '')
  const name = host.replace(/:\d+$/, '')
  return LOCAL_HOSTS.has(name)
}

export function readJsonBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (err) {
        reject(new Error(`JSON 解析失败: ${err.message}`))
      }
    })
    req.on('error', reject)
  })
}

/** 结构化日志：只记源 id / 耗时 / 状态，绝不打印 Key 与响应体。 */
export function createLogger(level = 'info') {
  const order = { debug: 10, info: 20, warn: 30, error: 40 }
  const min = order[level] ?? 20
  function write(lv, event, fields) {
    if ((order[lv] ?? 20) < min) return
    const line = { t: new Date().toISOString(), lv, event, ...fields }
    const text = JSON.stringify(line)
    if (lv === 'error') console.error(text)
    else console.log(text)
  }
  return {
    debug: (e, f) => write('debug', e, f),
    info: (e, f) => write('info', e, f),
    warn: (e, f) => write('warn', e, f),
    error: (e, f) => write('error', e, f),
  }
}
