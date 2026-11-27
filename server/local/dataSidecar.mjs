/**
 * 数据侧车管理：独立 Python 进程 + HTTP 回环 + 懒启动 + 失败冷却。
 *
 * 与富途侧车（server/local/sidecar.mjs）刻意隔离：
 *   - 富途是 stdio JSON-RPC，数据侧车是 HTTP 127.0.0.1:<port>；
 *   - 依赖分开，futu-api 装不上不影响 AkShare/EDGAR/ccxt，反之亦然。
 *   - 未装 Python 或依赖时 probe() 返回 available:false，所有调用方标「缺」，不模拟。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.resolve(HERE, '..', '..', 'sidecar', 'data_main.py')
const BUNDLED_PYTHON = path.resolve(HERE, '..', '..', 'runtime', 'python312', 'python.exe')

/** 优先用项目自带 Python 3.12；exe 环境没有 runtime/ 时仍回落到系统 python。 */
function resolvePython() {
  if (process.env.MARVIS_PYTHON) return process.env.MARVIS_PYTHON
  try {
    if (fs.existsSync(BUNDLED_PYTHON)) return BUNDLED_PYTHON
  } catch { /* 无文件系统权限时按未安装处理 */ }
  return 'python'
}
const ALLOWED = new Set([
  'health',
  'akshare.stock_lhb', 'akshare.fund_nav', 'akshare.margin',
  'akshare.sector_flow', 'akshare.futures', 'akshare.forex',
  'baostock.kline',
  'edgar.filings', 'edgar.13f',
  'ccxt.ticker', 'ccxt.ohlcv',
  'python.call',
])

export function isDataMethodAllowed(method) {
  return ALLOWED.has(method)
}

export function createDataSidecar({ config, log = () => {} } = {}) {
  let child = null
  let lastError = ''
  let lastProbe = null
  let cooldownUntil = 0
  let consecutiveFailures = 0

  function scriptPath() {
    return process.env.MARVIS_DATA_SIDECAR_SCRIPT || SCRIPT
  }

  function port() {
    return Number(config?.clients?.dataSidecarPort || process.env.MARVIS_SIDECAR_DATA_PORT || 8765)
  }

  function base() {
    const addr = config?.clients?.dataSidecar || process.env.MARVIS_DATA_SIDECAR || `127.0.0.1:${port()}`
    return `http://${addr}`
  }

  function start() {
    if (child && child.exitCode == null) return true
    if (Date.now() < cooldownUntil) return false
    const python = resolvePython()
    try {
      child = spawn(python, [scriptPath(), '--port', String(port()), '--host', '127.0.0.1'], {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      })
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8').trim()
        if (text) log(`[data-sidecar] ${text.slice(0, 300)}`)
      })
      child.on('error', (err) => {
        lastError = err?.message ?? String(err)
      })
      child.on('exit', (code) => {
        lastError = `data-sidecar 退出 code=${code}`
        child = null
      })
      return true
    } catch (err) {
      lastError = err?.message ?? String(err)
      return false
    }
  }

  /** 进程刚 spawn 时 HTTP 还没 bind；首个请求做有限重试，避免假阴性。 */
  async function postJsonOnce(payload, timeoutMs) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const resp = await fetch(`${base()}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })
      return await resp.json()
    } finally {
      clearTimeout(timer)
    }
  }

  // baostock 登录 + 历史 K 线在首次调用时可能超过 20s，统一放宽到 45s。
  async function call(method, params = {}, timeoutMs = 45_000) {
    if (!isDataMethodAllowed(method)) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: `不允许的方法 ${method}` } }
    }
    if (Date.now() < cooldownUntil) {
      return { ok: false, error: { code: 'COOLDOWN', message: `数据侧车失败冷却中至 ${new Date(cooldownUntil).toISOString()}` } }
    }
    if (!start()) {
      return { ok: false, error: { code: 'SIDECAR_UNAVAILABLE', message: lastError || 'Python 数据侧车启动失败' } }
    }
    let json = null
    let lastErr = ''
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        json = await postJsonOnce({ method, params }, timeoutMs)
        break
      } catch (err) {
        lastErr = err?.message ?? '无法连接数据侧车'
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
      }
    }
    if (!json) {
      consecutiveFailures += 1
      if (consecutiveFailures >= 3) {
        cooldownUntil = Date.now() + 10 * 60_000
        consecutiveFailures = 0
      }
      return { ok: false, error: { code: 'SIDECAR_UNAVAILABLE', message: lastErr } }
    }
    if (!json.ok) {
      // CAPABILITY_ERROR 是单次能力调用的参数/上游失败，不触发全局冷却，避免连坐其它数据源。
      if (json.error?.code !== 'CAPABILITY_ERROR') {
        consecutiveFailures += 1
      }
      if (consecutiveFailures >= 3) {
        cooldownUntil = Date.now() + 10 * 60_000
        consecutiveFailures = 0
      }
      return { ok: false, error: json.error ?? { code: 'UPSTREAM_ERROR', message: '侧车返回失败' } }
    }
    consecutiveFailures = 0
    return { ok: true, result: json.data }
  }

  async function probe(force = false) {
    if (!force && lastProbe) return lastProbe
    const res = await call('health', {}, 6000)
    lastProbe = res.ok
      ? {
          available: !!res.result?.available,
          python: res.result?.python ?? '',
          libs: res.result?.libs ?? {},
          importErrors: res.result?.importErrors ?? {},
          lastError: '',
        }
      : {
          available: false,
          python: '',
          libs: {},
          importErrors: {},
          lastError: res.error?.message ?? '探测失败',
        }
    return lastProbe
  }

  function close() {
    if (!child) return
    try {
      child.kill()
    } catch {
      /* 已退出 */
    }
    child = null
    lastProbe = null
  }

  return { call, probe, close, get lastError() { return lastError } }
}
