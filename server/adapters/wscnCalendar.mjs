/**
 * 华尔街见闻财经日历（公开接口，实测需经出海代理）。
 *
 * 只有未来 1-2 个月数据；预排规则不能当实际值，界面必须标「预排」。
 */
const BASE = 'https://api-one-wscn.awtmt.com/apiv1/finance/macrodatas'

function toSec(date) {
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

export const SNAPSHOTS = [
  {
    id: 'global:calendar',
    label: '全球财经日历（未来 14 天）',
    source: 'wscn',
    ttlSec: 3600,
    async fetch(ctx) {
      const now = Math.floor(Date.now() / 1000)
      const start = toSec(new Date().toISOString().slice(0, 10)) ?? now
      const end = start + 14 * 86400
      const url = `${BASE}?start=${start}&end=${end}`
      const res = await ctx.transport.getJson(url, { viaProxy: true, timeoutMs: 15_000 })
      if (res.status < 200 || res.status >= 300) {
        return { available: false, reason: `WSCN 返回 ${res.status || '不可达'}（需出海代理）` }
      }
      // 实测返回：{code:20000, message:"OK", data:{items:[...]}}
      const raw = Array.isArray(res.json)
        ? res.json
        : Array.isArray(res.json?.data)
          ? res.json.data
          : Array.isArray(res.json?.data?.items)
            ? res.json.data.items
            : []
      const events = raw
        .map((e) => ({
          // WSCN 的 public_date 是 Unix 秒，必须转成 YYYY-MM-DD，否则前端按字符串分组会全挤成一组
          publicDate: (() => {
            const raw = e.public_date ?? e.publicDate
            const n = Number(raw)
            if (Number.isFinite(n) && n > 1e9) return new Date(n * 1000).toISOString().slice(0, 10)
            return String(raw ?? '').slice(0, 10)
          })(),
          country: e.country ?? '',
          title: e.title ?? '',
          importance: Number(e.importance) || 0,
          calendarType: e.calendar_type ?? e.calendarType ?? '',
          actual: e.actual ?? null,
          forecast: e.forecast ?? null,
          previous: e.previous ?? null,
          revised: e.revised ?? null,
          unit: e.unit ?? '',
          period: e.period ?? '',
        }))
        .filter((e) => e.publicDate && e.title)
        .sort((a, b) => String(a.publicDate).localeCompare(String(b.publicDate)))
      if (!events.length) return { available: false, reason: 'WSCN 返回空事件列表' }
      return { available: true, events, caliber: '华尔街见闻公开日历，仅未来 1-2 个月；预排项不替代实际值' }
    },
  },
]
