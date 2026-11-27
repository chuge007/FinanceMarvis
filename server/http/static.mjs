/**
 * 静态托管：磁盘（dev/生产）与内嵌资源（exe）两种来源共用一套逻辑。
 *
 * exe 形态没有真实 dist 目录，dist 全量进 SEA assets，
 * 所以这里把「读文件」抽象成 readAsset(key)，由调用方注入。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

/** 从磁盘读 dist；SPA 路由回源 index.html。 */
export function diskAssetReader(distDir) {
  return async (key) => {
    const safe = path.normalize(key).replace(/^(\.\.[/\\])+/, '')
    const file = path.join(distDir, safe)
    if (!file.startsWith(distDir)) return null
    try {
      const st = await fs.stat(file)
      if (st.isDirectory()) return null
      return await fs.readFile(file)
    } catch {
      return null
    }
  }
}

/**
 * @param {{ readAsset: (key:string)=>Promise<Buffer|null>|Buffer|null, injectHtml?: string, onMissing?: string }} opts
 */
export function createStaticHandler({ readAsset, injectHtml = '', onMissing }) {
  return async function serveStatic(req, res, pathname) {
    let key
    try {
      key = decodeURIComponent(pathname).replace(/^\/+/, '')
    } catch {
      key = ''
    }
    if (!key || key.includes('..')) key = 'index.html'

    let data = await readAsset(key)
    let resolvedKey = key
    if (!data && !path.extname(key)) {
      data = await readAsset('index.html')
      resolvedKey = 'index.html'
    }
    if (!data) {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(onMissing ?? '404 Not Found')
      return
    }
    if (resolvedKey === 'index.html' && injectHtml) {
      data = Buffer.from(data.toString('utf8').replace('</body>', `${injectHtml}</body>`))
    }
    res.statusCode = 200
    res.setHeader('content-type', MIME[path.extname(resolvedKey).toLowerCase()] ?? 'application/octet-stream')
    // 入口不缓存，带 hash 的静态资源可长缓存
    res.setHeader('cache-control', resolvedKey === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable')
    res.end(data)
  }
}
