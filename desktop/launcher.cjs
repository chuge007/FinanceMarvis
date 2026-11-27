'use strict'
/**
 * Marvis 桌面单文件版启动器（Node SEA 入口，CommonJS）。
 *
 * 它只做「桌面外壳」该做的事：
 *   1. 端口选择与单实例复用；
 *   2. 把内嵌的 server/ 源码解压到临时目录，再 import 启动数据服务；
 *   3. 内嵌 dist/ 静态资源托管（SPA 回源 + 右下角退出按钮）；
 *   4. 打开默认浏览器。
 *
 * 关键变化：服务端逻辑不再复制一份，而是复用 server/index.mjs 的 bootstrap()。
 * SEA 不能 require 外部 ESM，所以先把预编译时打包进来的 server 源码落到临时目录，
 * 再从磁盘 import —— 这样 dev / 生产 / exe 三种形态跑的是同一份代码。
 *
 * 调试：node desktop/launcher.cjs（从项目根目录执行，走磁盘源码）
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { pathToFileURL } = require('node:url')

let sea = null
try {
  sea = require('node:sea')
} catch {
  /* 普通 node 调试模式 */
}
const IS_SEA = !!(sea && sea.isSea())
const DIST = path.resolve(process.cwd(), 'dist')
const LOG_FILE = path.join(os.tmpdir(), 'marvis-exe.log')
const BASE_PORT = Number(process.env.MARVIS_PORT || 5173)
const RUNTIME_DIR = path.join(os.tmpdir(), 'marvis-runtime')

// exe 默认精简形态：只用免 key 源，不探测 Key / 客户端
if (!process.env.MARVIS_PROFILE) process.env.MARVIS_PROFILE = 'lean'

function log() {
  const line = '[' + new Date().toLocaleString('zh-CN') + '] ' + Array.from(arguments).join(' ') + '\r\n'
  try {
    fs.appendFileSync(LOG_FILE, line)
  } catch {
    /* 忽略日志失败 */
  }
  try {
    process.stdout.write(line)
  } catch {
    /* GUI 子系统无控制台 */
  }
}

function fatal(err) {
  log('致命错误: ' + (err && err.stack ? err.stack : String(err)))
  try {
    const msg = String(err && err.message ? err.message : err).replace(/'/g, "''")
    spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-WindowStyle',
        'Hidden',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('" +
          msg +
          "','Marvis 启动失败','OK','Error')",
      ],
      { detached: true, stdio: 'ignore', windowsHide: true },
    ).unref()
  } catch {
    /* 弹窗失败也不影响日志 */
  }
  setTimeout(() => process.exit(1), 1500)
}

process.on('uncaughtException', (e) => log('未捕获异常: ' + (e && e.stack ? e.stack : e)))
process.on('unhandledRejection', (e) => log('未处理拒绝: ' + (e && e.stack ? e.stack : e)))

// ───────────────────────── 内嵌资源 ─────────────────────────
let MANIFEST = null
function manifest() {
  if (MANIFEST) return MANIFEST
  const raw = readAsset('assets-manifest.json')
  MANIFEST = raw ? JSON.parse(raw.toString('utf8')) : []
  return MANIFEST
}

function readAsset(key) {
  if (IS_SEA) {
    try {
      const a = sea.getAsset(key)
      if (a == null) return null
      return typeof a === 'string' ? Buffer.from(a, 'utf8') : Buffer.from(a)
    } catch {
      return null
    }
  }
  try {
    return fs.readFileSync(path.join(DIST, key))
  } catch {
    return null
  }
}

/**
 * 把打包进来的 server 源码写到临时目录。
 * 每次启动都覆盖写：总量约 200KB，比做版本对比更简单可靠。
 */
function extractServer() {
  const keys = manifest().filter((k) => k.startsWith('server/') || k.startsWith('core/') || k.startsWith('sidecar/'))
  if (!keys.some((k) => k.startsWith('server/'))) {
    throw new Error('内嵌资源里没有 server/ 源码，请用 node desktop/make-exe.mjs 重新打包')
  }
  for (const key of keys) {
    if (key.includes('..')) continue
    const target = path.join(RUNTIME_DIR, key)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const data = readAsset(key)
    if (data) fs.writeFileSync(target, data)
  }
  const sidecarScript = path.join(RUNTIME_DIR, 'sidecar', 'main.py')
  if (fs.existsSync(sidecarScript)) process.env.MARVIS_SIDECAR_SCRIPT = sidecarScript
  const dataSidecarScript = path.join(RUNTIME_DIR, 'sidecar', 'data_main.py')
  if (fs.existsSync(dataSidecarScript)) process.env.MARVIS_DATA_SIDECAR_SCRIPT = dataSidecarScript
  return path.join(RUNTIME_DIR, 'server', 'index.mjs')
}

// ───────────────────────── 服务启动 ─────────────────────────
let appRef = null

async function bootServer() {
  let entry
  if (IS_SEA) {
    entry = pathToFileURL(extractServer()).href
  } else {
    entry = pathToFileURL(path.resolve(__dirname, '..', 'server', 'index.mjs')).href
  }
  const mod = await import(entry)
  appRef = await mod.bootstrap({
    readAsset,
    showExitButton: true,
    onExit: () => process.exit(0),
  })
  return appRef
}

// 静态资源由数据服务的 createApp 统一托管（readAsset 注入），
// 启动器不再自带 MIME 表与转发逻辑。
function openBrowser(url) {
  if (process.env.MARVIS_NO_BROWSER) {
    log('MARVIS_NO_BROWSER=1，跳过自动打开浏览器: ' + url)
    return
  }
  const fallback = () => {
    try {
      spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    } catch (e) {
      log('打开浏览器失败: ' + e.message)
    }
  }
  try {
    const child = spawn('cmd.exe', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', fallback)
    child.unref()
  } catch {
    fallback()
  }
}

function pingExisting(port) {
  return new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port, path: '/__marvis_ping', timeout: 400 }, (res) => {
      let d = ''
      res.on('data', (c) => {
        d += c
      })
      res.on('end', () => resolve(d.indexOf('marvis-ok') >= 0))
    })
    r.on('timeout', () => {
      r.destroy()
      resolve(false)
    })
    r.on('error', () => resolve(false))
  })
}

async function main() {
  try {
    if (await pingExisting(BASE_PORT)) {
      log('检测到已运行的 Marvis 实例，直接打开页面')
      openBrowser('http://127.0.0.1:' + BASE_PORT + '/')
      setTimeout(() => process.exit(0), 400)
      return
    }

    const app = await bootServer()
    const server = app.server
    let currentPort = BASE_PORT
    let portTries = 0

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && portTries < 20) {
        portTries += 1
        currentPort = BASE_PORT + portTries
        log('端口 ' + (currentPort - 1) + ' 被占用，尝试 ' + currentPort)
        server.listen(currentPort, '127.0.0.1')
      } else if (err.code === 'EADDRINUSE') {
        currentPort = 0
        log('端口均被占用，改由系统分配随机端口')
        server.listen(0, '127.0.0.1')
      } else {
        fatal(err)
      }
    })

    server.on('listening', () => {
      const addr = server.address()
      const url = 'http://127.0.0.1:' + addr.port + '/'
      log('Marvis 已启动: ' + url + (IS_SEA ? ' [SEA 单文件模式]' : ' [调试模式]'))
      log('静态资源: ' + (IS_SEA ? '内嵌 ' + manifest().filter((k) => !k.startsWith('server/')).length + ' 个文件' : DIST))
      log('日志文件: ' + LOG_FILE)
      app.startScheduler()
      openBrowser(url)
    })

    server.listen(currentPort, '127.0.0.1')
  } catch (e) {
    fatal(e)
  }
}

void main()
