/**
 * 台股月营收（台湾证券交易所开放数据，免费、无需 key）。
 *
 *   https://openapi.twse.com.tw/v1/opendata/t187ap05_L
 *
 * 为什么用它做 AI 产业链景气：台积电、鸿海、广达、纬创都在列，
 * 月营收每月 10 日前公布上月数据，是硬件链**最高频的官方经营读数**，
 * 比等季度财报早两个月。
 *
 * 字段名是中文且会随版本微调，这里做「模糊键匹配」，解析不到就返回空，不猜。
 */
import { reportSource } from '../shared/utils/sourceHealth';

export interface TwseRevenue {
  code: string;
  name: string;
  /** 当月营收同比（%） */
  yoy: number | null;
  /** 数据年月，如 2026-10 */
  month: string;
}

const TTL = 6 * 60 * 60_000;
const BASE = import.meta.env.VITE_UPSTREAM === 'direct'
  ? 'https://openapi.twse.com.tw'
  : '/twse';

let cache: { ts: number; data: Record<string, TwseRevenue> } | null = null;
let inflight: Promise<Record<string, TwseRevenue>> | null = null;

function pick(row: Record<string, unknown>, keywords: string[]): string {
  for (const key of Object.keys(row)) {
    const normalized = key.replace(/\s/g, '');
    if (keywords.every((k) => normalized.includes(k))) {
      const value = row[key];
      if (value !== undefined && value !== null) return String(value).trim();
    }
  }
  return '';
}

function normalizeMonth(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length >= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
  }
  return raw;
}

/**
 * 取指定台股代码的最新月营收同比；codes 为空则返回全部。
 * 失败返回空对象（页面显示「缺」），不抛异常。
 */
export async function fetchTwseRevenue(codes: string[]): Promise<Record<string, TwseRevenue>> {
  const want = new Set(codes);
  if (!cache || Date.now() - cache.ts >= TTL) {
    if (!inflight) {
      inflight = (async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        try {
          const resp = await fetch(`${BASE}/v1/opendata/t187ap05_L`, {
            headers: { accept: 'application/json' },
            signal: ctrl.signal,
          });
          if (!resp.ok) {
            reportSource('twse', false, `台股月营收 HTTP ${resp.status}`);
            return {};
          }
          const json = await resp.json();
          if (!Array.isArray(json)) {
            reportSource('twse', false, '台股月营收返回格式异常');
            return {};
          }
          const out: Record<string, TwseRevenue> = {};
          for (const item of json as Record<string, unknown>[]) {
            const code = pick(item, ['公司代號']) || pick(item, ['公司', '代號']);
            if (!code) continue;
            const rawYoy = pick(item, ['去年同月增減']) || pick(item, ['增減']);
            const yoy = Number(String(rawYoy).replace(/[^\d.-]/g, ''));
            out[code] = {
              code,
              name: pick(item, ['公司名稱']) || pick(item, ['公司', '名稱']),
              yoy: Number.isFinite(yoy) ? yoy : null,
              month: normalizeMonth(pick(item, ['資料年月'])),
            };
          }
          if (!Object.keys(out).length) {
            reportSource('twse', false, '台股月营收未能解析出数据');
            return {};
          }
          reportSource('twse', true);
          return out;
        } catch (err) {
          reportSource('twse', false, err instanceof Error ? err.message : '台股月营收不可达');
          return {};
        } finally {
          clearTimeout(timer);
        }
      })();
    }
    try {
      const data = await inflight;
      cache = { ts: Date.now(), data };
    } finally {
      inflight = null;
    }
  }

  if (!want.size) return cache?.data ?? {};
  const filtered: Record<string, TwseRevenue> = {};
  for (const code of want) {
    const hit = cache?.data?.[code];
    if (hit) filtered[code] = hit;
  }
  return filtered;
}
