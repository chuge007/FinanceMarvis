/**
 * 结构层数据：板块相对强弱（RS）与宽度。
 *
 * 数据原则：
 *  - 美股：用板块 ETF 真实日线 vs SPY 计算 RS，不再使用模拟“资金流”。
 *  - A 股：用东方财富真实板块快照；若回退到模型，直接标记不可用，不冒充真实。
 *  - 只有快照、没有历史的指标，明确写“仅当日”，让用户知道还不能算相关性。
 */
import { fetchStockCandles } from '../../services/api';
import { fetchSectorFlows } from '../../services/fundflow';
import type { Market } from '../../stores/useAppStore';

export interface StructureItem {
  id: string;
  name: string;
  /** 近 5 日相对基准超额（百分点） */
  rs5: number | null;
  /** 近 20 日相对基准超额（百分点） */
  rs20: number | null;
  /** 当日涨跌或资金净流入，仅作展示 */
  change: number | null;
  flow: number | null;
}

export interface StructureSnapshot {
  market: Market;
  source: 'real' | 'unavailable';
  asOf: string | null;
  breadth: number | null;
  dispersion: number | null;
  items: StructureItem[];
  top: StructureItem[];
  bottom: StructureItem[];
  note: string;
}

interface CacheEntry {
  ts: number;
  data: StructureSnapshot;
}

const cache = new Map<Market, CacheEntry>();
const TTL = 5 * 60_000;

const US_SECTORS: { id: string; name: string }[] = [
  { id: 'XLK', name: '科技' },
  { id: 'XLF', name: '金融' },
  { id: 'XLE', name: '能源' },
  { id: 'XLV', name: '医疗' },
  { id: 'XLY', name: '可选消费' },
  { id: 'XLP', name: '必需消费' },
  { id: 'XLI', name: '工业' },
  { id: 'XLU', name: '公用事业' },
];

function unavailable(market: Market, note: string): StructureSnapshot {
  return {
    market,
    source: 'unavailable',
    asOf: null,
    breadth: null,
    dispersion: null,
    items: [],
    top: [],
    bottom: [],
    note,
  };
}

function ret(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const prev = closes[closes.length - 1 - days];
  const cur = closes[closes.length - 1];
  if (!(prev > 0) || !(cur > 0)) return null;
  return ((cur / prev) - 1) * 100;
}

function std(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

async function fetchUS(): Promise<StructureSnapshot> {
  const symbols = ['SPY', ...US_SECTORS.map((s) => s.id)];
  const results = await Promise.allSettled(
    symbols.map((s) => fetchStockCandles(s, 'US', '6mo', '1d')),
  );

  const candleMap = new Map<string, { time: string; close: number }[]>();
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const rows = r.value
      .map((c) => ({ time: c.time, close: Number(c.close) }))
      .filter((c) => Number.isFinite(c.close) && c.close > 0);
    if (rows.length >= 25) candleMap.set(symbols[i], rows);
  });

  const spy = candleMap.get('SPY');
  if (!spy) return unavailable('US', 'SPY 日线不可用，结构层暂不判断');

  const spyCloses = spy.map((c) => c.close);
  const spy5 = ret(spyCloses, 5);
  const spy20 = ret(spyCloses, 20);

  const items: StructureItem[] = [];
  US_SECTORS.forEach((s) => {
    const rows = candleMap.get(s.id);
    if (!rows) return;
    const closes = rows.map((c) => c.close);
    const r5 = ret(closes, 5);
    const r20 = ret(closes, 20);
    items.push({
      id: s.id,
      name: s.name,
      rs5: r5 !== null && spy5 !== null ? +(r5 - spy5).toFixed(2) : null,
      rs20: r20 !== null && spy20 !== null ? +(r20 - spy20).toFixed(2) : null,
      change: r5 !== null ? +r5.toFixed(2) : null,
      flow: null,
    });
  });

  if (items.length < 3) return unavailable('US', '板块 ETF 日线不足 3 条，结构层暂不判断');

  const valid = items.filter((i) => i.rs20 !== null) as (StructureItem & { rs20: number })[];
  const breadth = valid.length ? (valid.filter((i) => i.rs20 > 0).length / valid.length) * 100 : null;
  const dispersion = valid.length ? (std(valid.map((i) => i.rs20)) ?? 0) * 1 : null;
  const sorted = [...items].sort((a, b) => (b.rs20 ?? -999) - (a.rs20 ?? -999));

  return {
    market: 'US',
    source: 'real',
    asOf: spy[spy.length - 1]?.time ?? null,
    breadth,
    dispersion,
    items: sorted,
    top: sorted.slice(0, 5),
    bottom: sorted.slice(-5).reverse(),
    note: `美股 ${items.length} 个代表板块 ETF vs SPY · 真实日线`,
  };
}

async function fetchCN(): Promise<StructureSnapshot> {
  try {
    const { flows } = await fetchSectorFlows('CN');
    // 东财优先；不可达时腾讯行业榜（含 5/20/60 日）或新浪板块（仅当日）都是真实数据。
    const real = flows.filter(
      (f) => f.source === 'eastmoney' || f.source === 'tencent' || f.source === 'sina',
    );
    if (!real.length) return unavailable('CN', '东财/腾讯/新浪板块源均未返回真实数据，结构层暂不判断');

    const items: StructureItem[] = real.map((f) => ({
      id: f.id,
      name: f.name,
      // 腾讯提供 5/20 日真实涨跌；东财/新浪只有当日快照，退化为当日。
      rs5: f.rs5 ?? f.pctChg,
      rs20: f.rs20 ?? f.pctChg,
      change: f.pctChg,
      // 新浪没有主力净流入，保持 null，不把 0 当真实流入。
      flow: f.flowAvailable ? f.netFlow : null,
    }));
    const sorted = [...items].sort((a, b) => (b.rs20 ?? -999) - (a.rs20 ?? -999));
    const values = items.map((i) => i.rs20).filter((v): v is number => v !== null);
    const breadth = values.length ? (values.filter((v) => v > 0).length / values.length) * 100 : null;

    const source = real[0]?.source;
    const sourceLabel = source === 'tencent' ? '腾讯行业' : source === 'sina' ? '新浪板块' : '东财板块';
    const hasHistory = real.some((f) => f.rs5 !== undefined && f.rs20 !== undefined);
    const hasFlow = real.some((f) => f.flowAvailable);
    const note = `A 股 ${items.length} 个${sourceLabel} · 真实${hasHistory ? ' · 5/20 日涨跌' : '快照 · 仅当日'}${hasFlow ? ' · 主力净流入' : ' · 主力净流入不可用'}`;

    return {
      market: 'CN',
      source: 'real',
      asOf: new Date().toISOString().slice(0, 10),
      breadth,
      dispersion: values.length ? std(values) : null,
      items: sorted,
      top: sorted.slice(0, 5),
      bottom: sorted.slice(-5).reverse(),
      note,
    };
  } catch {
    return unavailable('CN', '东财/腾讯/新浪板块源均不可用，结构层暂不判断');
  }
}

export async function fetchStructure(market: Market, force = false): Promise<StructureSnapshot> {
  const hit = cache.get(market);
  if (!force && hit && Date.now() - hit.ts < TTL) return hit.data;
  const data = market === 'CN' ? await fetchCN() : await fetchUS();
  cache.set(market, { ts: Date.now(), data });
  return data;
}
