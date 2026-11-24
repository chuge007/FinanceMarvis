/**
 * 一键把整个项目打成单个 Windows exe（Node SEA + postject）。
 *
 *   node desktop/make-exe.mjs            # 先 npm run build，再产出 Marvis.exe
 *   node desktop/make-exe.mjs --no-build # 用已有 dist 直接打包
 *   node desktop/make-exe.mjs --console  # 保留控制台窗口（默认无窗口 GUI 模式）
 *
 * 产物：项目根目录 Marvis.exe（约等于 node.exe 体积，内含前端全部资源与转发服务）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const DESKTOP = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DESKTOP, '..')
const DIST = path.join(ROOT, 'dist')
const EXE = path.join(ROOT, 'Marvis.exe')
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
const args = process.argv.slice(2)
const noBuild = args.includes('--no-build')
const keepConsole = args.includes('--console')

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: false, ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} 失败，退出码 ${r.status}`)
}

async function writeWithRetry(file, data, label = file, tries = 10) {
  for (let i = 0; i < tries; i++) {
    try {
      fs.writeFileSync(file, data)
      return
    } catch (e) {
      const retryable = ['EBUSY', 'EPERM', 'EACCES'].includes(e.code)
      if (!retryable || i === tries - 1) throw e
      const wait = 300 * (i + 1)
      console.log(`      ${label} 被占用，${wait}ms 后重试（${i + 1}/${tries - 1}）...`)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

function walk(dir, base = '') {
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = base ? base + '/' + name : name
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel))
    else out.push(rel)
  }
  return out
}

// 1. 构建前端
if (!noBuild) {
  console.log('\n[1/6] 构建前端 dist ...')
  // 直接用 node 调本地 CLI，避免 Windows 下 .cmd 需要 shell 的兼容问题
  run(process.execPath, [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-b'])
  run(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'])
} else {
  console.log('\n[1/6] 跳过构建，使用现有 dist')
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/index.html 不存在，请先构建')

// 2. 生成资源清单与 SEA 配置
console.log('[2/6] 生成资源清单 ...')
const files = walk(DIST)
// sea-config 里的路径按进程 cwd 解析，统一用绝对路径避免歧义
const assets = { 'assets-manifest.json': path.join(DESKTOP, 'assets-manifest.json') }
for (const f of files) assets[f] = path.join(DIST, f)
fs.writeFileSync(path.join(DESKTOP, 'assets-manifest.json'), JSON.stringify(files))
fs.writeFileSync(path.join(DESKTOP, 'sea-config.json'), JSON.stringify({
  type: 'sea',
  main: path.join(DESKTOP, 'launcher.cjs'),
  output: path.join(DESKTOP, 'sea.blob'),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets,
}, null, 2))
console.log(`      内嵌 ${files.length} 个静态文件`)

// 3. 生成 SEA blob
console.log('[3/6] 生成 SEA blob ...')
const blob = path.join(DESKTOP, 'sea.blob')
if (fs.existsSync(blob)) fs.rmSync(blob)
run(process.execPath, ['--experimental-sea-config', path.join(DESKTOP, 'sea-config.json')])
if (!fs.existsSync(blob)) throw new Error('sea.blob 未生成')

// 4. 复制同版本 node.exe 作为 exe 载体
console.log('[4/6] 复制 Node 运行时 ...')
if (fs.existsSync(EXE)) {
  // 旧文件可能被预览面板/回收站策略占用；删除失败时直接尝试覆盖
  try { fs.rmSync(EXE) } catch { /* 忽略，走覆盖路径 */ }
}
try {
  await writeWithRetry(EXE, fs.readFileSync(process.execPath), 'Marvis.exe')
} catch (e) {
  throw new Error('无法写入 Marvis.exe，请先关闭正在运行的 Marvis 实例：' + e.message)
}
if (!fs.readFileSync(EXE).includes(Buffer.from(SEA_FUSE))) {
  throw new Error('该 node.exe 不含 SEA fuse，可能不支持单文件打包')
}

// 5. 注入 blob
console.log('[5/6] 注入应用数据 ...')
const { inject } = require('postject')
await inject(EXE, 'NODE_SEA_BLOB', fs.readFileSync(blob), { overwrite: true, sentinelFuse: SEA_FUSE })
fs.rmSync(blob, { force: true })

// 6. 可选：改为 GUI 子系统（双击不弹黑窗）
if (!keepConsole) {
  console.log('[6/6] 切换为无控制台窗口模式 ...')
  const buf = fs.readFileSync(EXE)
  const pe = buf.readUInt32LE(0x3c)
  if (buf.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw new Error('PE 头解析失败')
  const opt = pe + 24
  const magic = buf.readUInt16LE(opt)
  if (magic !== 0x10b && magic !== 0x20b) throw new Error('未知的 PE 可选头: 0x' + magic.toString(16))
  const subsystemOffset = opt + 68
  console.log('      原 subsystem=' + buf.readUInt16LE(subsystemOffset) + ' → 2 (GUI)')
  buf.writeUInt16LE(2, subsystemOffset)
  await writeWithRetry(EXE, buf, 'Marvis.exe')
} else {
  console.log('[6/6] 保留控制台窗口')
}

const mb = (fs.statSync(EXE).size / 1024 / 1024).toFixed(1)
console.log(`\n完成：${EXE}  (${mb} MB)`)
console.log('双击即可运行：自动启动本地服务并打开浏览器；页面右下角「退出程序」可关闭服务。')
