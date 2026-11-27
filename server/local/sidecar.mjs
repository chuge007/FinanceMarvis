/**
 * Python 侧车管理：spawn + stdio JSON-RPC + 超时 + 懒启动。
 *
 * 为什么不用 HTTP：富途 OpenD 是本机私有 TCP 协议，只有 Python SDK 能说；
 * Node 侧只发命令、收结果。stdio 最少依赖、无端口冲突、进程退出自动断链。
 *
 * 侧车不可用（未装 Python / futu-api / OpenD）时：
 *   probe() 返回 available:false，所有 futu 接口显式标「不可得」，不影响其它功能。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.resolve(HERE, '..', '..', 'sidecar', 'main.py')

const ALLOWED = new Set([
  'ping', 'snapshot', 'kline', 'curKline', 'rtData', 'ticker', 'orderbook',
  'brokerQueue', 'capitalFlow', 'capitalDistribution', 'optionChain', 'optionExpiry',
  'stockFilter', 'subscribe', 'unsubscribe', 'subscriptionStatus',
  'accounts', 'portfolio', 'orders', 'placeOrder', 'cancelOrder',
])

export function isAllowedMethod(method) {
  return ALLOWED.has(method)
}

export function createSidecar({ config, log = () => {} } = {}) {
  let child = null
  let seq = 0
  let lastError = ''
  let lastProbe = null
  const pending = new Map()

  function scriptPath() {
    // exe 形态由 launcher 注入解压后的路径
    return process.env.MARVIS_SIDECAR_SCRIPT || SCRIPT
  }

  function start() {
    if (child && child.exitCode == null) return true
    const python = process.env.MARVIS_PYTHON || 'python'
    try {
      child = spawn(python, [scriptPath()], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true,
      })
    } catch (err) {
      lastError = err?.message ?? String(err)
      return false
    }

    let buffer = ''
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      for (;;) {
        const i = buffer.indexOf('\n')
        if (i < 0) break
        const line = buffer.slice(0, i).trim()
        buffer = buffer.slice(i + 1)
        if (!line) continue
        let msg
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        const entry = pending.get(msg.id)
        if (!entry) continue
        pending.delete(msg.id)
        clearTimeout(entry.timer)
        entry.resolve(msg)
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim()
      if (text) log(`[sidecar] ${text.slice(0, 300)}`)
    })

    child.on('error', (err) => {
      lastError = err?.message ?? String(err)
      failAll(lastError)
    })
    child.on('exit', (code) => {
      lastError = `sidecar 退出 code=${code}`
      failAll(lastError)
      child = null
    })
    return true
  }

  function failAll(reason) {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer)
      entry.resolve({ ok: false, id, error: { code: 'SIDECAR_DOWN', message: reason }, ms: 0 })
    }
    pending.clear()
  }

  async function call(method, params = {}, env = 'SIMULATE', timeoutMs = 20_000) {
    if (!isAllowedMethod(method)) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: `不允许的方法 ${method}` }, ms: 0 }
    }
    if (!start()) {
      return { ok: false, error: { code: 'SIDECAR_UNAVAILABLE', message: lastError || 'Python 侧车启动失败' }, ms: 0 }
    }

    const id = `m${++seq}`
    const payload = JSON.stringify({ id, method, params, env }) + '\n'
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve({ ok: false, error: { code: 'TIMEOUT', message: `${method} 超时 ${timeoutMs}ms` }, ms: timeoutMs })
      }, timeoutMs)
      pending.set(id, { resolve, timer })
      child.stdin.write(payload, (err) => {
        if (err) {
          pending.delete(id)
          clearTimeout(timer)
          resolve({ ok: false, error: { code: 'SIDECAR_WRITE', message: err.message }, ms: 0 })
        }
      })
    })
  }

  async function probe(force = false) {
    if (!force && lastProbe) return lastProbe
    const res = await call('ping', {}, 'SIMULATE', 6000)
    lastProbe = res.ok
      ? {
          available: !!res.result?.available,
          importError: res.result?.importError || '',
          subscriptions: res.result?.subscriptions ?? null,
          lastError: '',
        }
      : { available: false, importError: '', lastError: res.error?.message ?? '探测失败' }
    return lastProbe
  }

  function close() {
    if (!child) return
    try {
      child.stdin.end()
    } catch {
      /* 已关闭 */
    }
    try {
      child.kill()
    } catch {
      /* 已退出 */
    }
    child = null
    failAll('sidecar 已关闭')
  }

  return { call, probe, close, get lastError() { return lastError } }
}
