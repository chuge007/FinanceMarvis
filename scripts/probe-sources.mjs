/**
 * 数据源 / 代理诊断：一条命令看清本机网络到底能访问哪些上游。
 *
 * 用法：
 *   npm run probe
 *   MARVIS_PROXY=http://127.0.0.1:7890 npm run probe
 *
 * 只读：不修改任何文件，不发 POST，只做 GET/HEAD 探测。
 */
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { HttpsProxyAgent } from 'https-proxy-agent'

const PROXY_PORTS = [7897, 7890, 10809, 1080]
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function probePort(host, port, ms = 350) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(ms)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function detectProxy() {
  const explicit = process.env.MARVIS_PROXY
  if (explicit) return { url: explicit, source: 'MARVIS_PROXY' }
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY
  if (envProxy) return { url: envProxy, source: '环境变量' }
  for (const port of PROXY_PORTS) {
    if (await probePort('127.0.0.1', port)) return { url: `http://127.0.0.1:${port}`, source: '自动探测' }
  }
  return { url: '', source: '未检测到' }
}

function get(url, proxyUrl, timeout = 8_000) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    let parsed
    try {
      parsed = new URL(url)
    } catch (err) {
      finish({ ok: false, status: 0, bytes: 0, note: err.message })
      return
    }
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
    const req = https.request(
      {
        host: parsed.host,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: 'application/json,text/csv,text/html,*/*',
          'Accept-Encoding': 'identity',
        },
        agent,
        timeout,
      },
      (res) => {
        let bytes = 0
        const ok = res.statusCode >= 200 && res.statusCode < 400
        res.on('data', (chunk) => {
          bytes += chunk.length
          // 只需要确认可访问，不下载整页；达到上限就收尾，避免 CBOE 这类大页面拖住脚本。
          if (bytes >= 400_000) {
            finish({ ok, status: res.statusCode, bytes, note: '已截断（只验证可达）' })
            req.destroy()
          }
        })
        res.on('end', () => finish({ ok, status: res.statusCode, bytes, note: '' }))
        res.on('error', (err) => finish({ ok: false, status: 0, bytes, note: err.message }))
      },
    )
    req.on('timeout', () => {
      req.destroy()
      finish({ ok: false, status: 0, bytes: 0, note: '超时' })
    })
    req.on('error', (err) => finish({ ok: false, status: 0, bytes: 0, note: err.message }))
    req.end()
  })
}

const results = []
async function check(name, url, { proxy = '', required = false } = {}) {
  const result = await get(url, proxy)
  results.push({ name, ...result, required })
  const status = result.status || 'ERR'
  const size = result.bytes ? `${Math.round(result.bytes / 1024)}KB` : '-'
  console.log(`${result.ok ? ' OK ' : 'FAIL'}  ${name.padEnd(22)} ${String(status).padEnd(5)} ${size.padEnd(7)} ${result.note}`)
}

console.log('Marvis 数据源诊断')
console.log('='.repeat(78))

const proxy = await detectProxy()
console.log(`代理: ${proxy.url || '无'}（${proxy.source}）`)
for (const port of PROXY_PORTS) {
  const open = await probePort('127.0.0.1', port)
  console.log(`  127.0.0.1:${port} ${open ? 'LISTEN' : 'closed'}`)
}
console.log('')

console.log('-- Yahoo --')
await check('Yahoo 直连', 'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d')
if (proxy.url) {
  await check('Yahoo 经代理', 'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d', { proxy: proxy.url })
  await check('Yahoo spark 批量', 'https://query1.finance.yahoo.com/v7/finance/spark?symbols=SPY,QQQ&range=5d&interval=1d', { proxy: proxy.url })
}

console.log('\n-- 宏观 / 期权 --')
await check('FRED 直连', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10')
const year = new Date().getFullYear()
await check(
  '财政部收益率曲线',
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`,
)
await check(
  '财政部实际利率曲线',
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_real_yield_curve&field_tdr_date_value=${year}&page&_format=csv`,
)
if (proxy.url) {
  await check('CBOE 经代理', 'https://www.cboe.com/markets/us/options/market-statistics/daily/', { proxy: proxy.url })
  await check('Convex 经代理', 'https://convextrade.com/api/public/data/DGS10?limit=2&format=json', { proxy: proxy.url })
}

console.log('\n-- 中国数据 --')
await check('东财 直连', 'https://push2.eastmoney.com/api/qt/stock/get?secid=105.SPY&fields=f43,f57,f58')
await check('腾讯行业榜', 'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=hy&sort_type=price&direct=down&offset=0&count=5')
await check('新浪板块', 'https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=class')
await check('腾讯指数K线', 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000001,day,,,5,qfq')

const failed = results.filter((r) => !r.ok)
console.log('\n' + '='.repeat(78))
if (!failed.length) {
  console.log('全部可用。')
} else {
  console.log(`不可用 ${failed.length} 项：`)
  for (const item of failed) {
    let advice = '检查网络或上游状态'
    if (item.name.includes('Yahoo') && !item.name.includes('代理')) advice = '直连 403 属于地区限制；确保 7897 代理已启动，或设置 MARVIS_PROXY'
    else if (item.name.includes('Yahoo') && item.name.includes('代理')) advice = '代理已启动但 Yahoo 仍失败，换节点或检查代理是否支持 CONNECT'
    else if (item.name.includes('东财')) advice = '东财被网络重置，应用会自动切换腾讯行业榜 / 新浪板块，无需手工处理'
    else if (item.name.includes('腾讯')) advice = '腾讯行业榜失败时会退到新浪；两条都失败则 A 股结构显示“缺”'
    else if (item.name.includes('FRED')) advice = 'FRED 直连偶发失败；应用会先走 Convex 镜像，稍后重试'
    else if (item.name.includes('Convex')) advice = 'ConvexTrade 可能改路径或暂时不可用；应用会自动退回 FRED 官方 CSV'
    console.log(`  - ${item.name}：${advice}`)
  }
}
console.log('\n提示：应用内 /proxy-status 会显示实际使用的代理；首页数据健康条展开可见各源失败原因。')
