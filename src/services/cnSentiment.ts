/**
 * A股情绪真实数据源
 *
 * 数据链路（全部真实行情驱动，无随机模拟）：
 *   1. 指数日K：腾讯 ifzq（web.ifzq.gtimg.cn，fetch + CORS 放行）→ 指数动能 / 量能 / 风格强弱 / 趋势
 *   2. 指数实时：腾讯 qt.gtimg.cn（JSONP）→ 无历史K线时的单点真实兜底
 *   3. 两市涨跌家数：东方财富 push2 ulist（JSONP）→ 市场宽度
 */
import type { SentimentSnapshot, SentimentSubIndex } from '../types/sentiment';

// ─── 东财 JSONP 加载器 ───
function loadEastmoneyJsonp<T>(url: string, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cbName = `em_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const sid = `em_script_${cbName}`;
    let done = false;
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('eastmoney jsonp timeout'));
    }, timeout);
    const cleanup = () => {
      window.clearTimeout(timer);
      try {
        delete (window as any)[cbName];
      } catch {
        /* noop */
      }
      document.getElementById(sid)?.remove();
    };
    (window as any)[cbName] = (data: T) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(data);
    };
    const script = document.createElement('script');
    script.id = sid;
    script.src = `${url}${url.includes('?') ? '&' : '?'}cb=${cbName}`;
    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('eastmoney jsonp network error'));
    };
    document.head.appendChild(script);
  });
}

// ─── 指数配置（腾讯代码） ───
interface CNAxis {
  key: string;
  name: string;
  code: string; // 腾讯代码，如 sh000001
}
const CN_INDEXES: CNAxis[] = [
  { key: 'SH', name: '上证指数', code: 'sh000001' },
  { key: 'SZ', name: '深证成指', code: 'sz399001' },
  { key: 'CYB', name: '创业板指', code: 'sz399006' },
  { key: 'HS300', name: '沪深300', code: 'sh000300' },
];

interface CNDailyBar {
  date: string; // 'YYYY-MM-DD'
  close: number;
  prevClose: number;
  pct: number; // 相对昨日收盘涨跌幅 %
  volume: number; // 成交量（手）
}

// ─── 拉取指数最近 N 根日K（腾讯 ifzq，fetch + CORS 放行，含当日） ───
async function fetchCNIndexKlines(lmt = 20): Promise<Record<string, CNDailyBar[]>> {
  const entries = await Promise.allSettled(
    CN_INDEXES.map(async (ix) => {
      const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${ix.code},day,,,${lmt},qfq`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!resp.ok) throw new Error(`ifzq ${resp.status}`);
      const json = await resp.json();
      const node = json?.data?.[ix.code];
      const rows: string[][] = node?.qfqday || node?.day || [];
      if (!rows.length) throw new Error('empty kline');
      // rows: [date, open, close, high, low, volume]
      const bars: CNDailyBar[] = rows.map((r, i) => {
        const close = parseFloat(r[2]);
        const prevClose = i > 0 ? parseFloat(rows[i - 1][2]) : parseFloat(r[1]) || close;
        const volume = parseFloat(r[5]) || 0;
        return {
          date: r[0],
          close,
          prevClose,
          pct: prevClose ? ((close - prevClose) / prevClose) * 100 : 0,
          volume,
        };
      });
      return [ix.key, bars] as const;
    }),
  );
  const out: Record<string, CNDailyBar[]> = {};
  for (const r of entries) {
    if (r.status === 'fulfilled' && r.value[1].length) out[r.value[0]] = r.value[1];
  }
  return out;
}

// ─── 腾讯 qt 实时指数（JSONP，无历史K线时的单点实时兜底） ───
interface CNAxisReal {
  key: string;
  symbol: string;
  name: string;
}
const CN_INDEXES_REAL: CNAxisReal[] = [
  { key: 'SH', symbol: 'sh000001', name: '上证指数' },
  { key: 'SZ', symbol: 'sz399001', name: '深证成指' },
  { key: 'CYB', symbol: 'sz399006', name: '创业板指' },
  { key: 'HS300', symbol: 'sh000300', name: '沪深300' },
];

function loadTencentScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('tencent index network error'));
    };
    document.head.appendChild(script);
  });
}

// 返回 key → { pct, volume(手), amount(元) }
async function fetchTencentIndexReal(): Promise<
  Record<string, { pct: number; volume: number; amount: number }>
> {
  const symbols = CN_INDEXES_REAL.map((i) => i.symbol);
  const url = `https://qt.gtimg.cn/q=${symbols.join(',')}`;
  await loadTencentScript(url);
  const out: Record<string, { pct: number; volume: number; amount: number }> = {};
  for (const ix of CN_INDEXES_REAL) {
    const raw = (window as any)[`v_${ix.symbol}`];
    if (typeof raw !== 'string') continue;
    const f = raw.split('~');
    if (f.length < 40) continue;
    out[ix.key] = {
      pct: parseFloat(f[32]) || 0,
      volume: parseFloat(f[36]) || 0,
      amount: (parseFloat(f[37]) || 0) * 1e4, // 万元 → 元
    };
  }
  return out;
}

// ─── 沪深两市涨跌家数（东财市场统计，沪市+深市汇总） ───
async function fetchCNBreadth(): Promise<{ up: number; down: number; flat: number } | null> {
  const url =
    'https://push2.eastmoney.com/api/qt/ulist.np/get?ut=fa5fd1943c7b386f172d6893dbfba10b&fltt=2&invt=2&fields=f104,f105,f106&secids=1.000001,0.399001';
  const data = await loadEastmoneyJsonp<any>(url);
  const diff: any[] = data?.data?.diff ?? [];
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const d of diff) {
    up += Number(d?.f104) || 0;
    down += Number(d?.f105) || 0;
    flat += Number(d?.f106) || 0;
  }
  return up + down + flat > 0 ? { up, down, flat } : null;
}

const clampScore = (v: number) => Math.max(5, Math.min(95, Math.round(v)));
const classify = (v: number) =>
  v >= 75 ? 'Extreme Greed' : v >= 55 ? 'Greed' : v >= 45 ? 'Neutral' : v >= 25 ? 'Fear' : 'Extreme Fear';

/**
 * 计算 A股真实情绪快照。数据源异常时返回 null（由调用方决定兜底策略）。
 * 降级链：腾讯 ifzq 历史K线（完整四因子+趋势） → 腾讯 qt 实时单点（无历史时） → null
 */
export async function fetchCNSentimentReal(): Promise<SentimentSnapshot | null> {
  // 指数历史K线 + 两市涨跌家数并行探测
  const [klines, breadth] = await Promise.all([fetchCNIndexKlines(20), fetchCNBreadth()]);

  const hs300 = klines['HS300'];
  const sh = klines['SH'];
  const cyb = klines['CYB'];
  const hasHistory = !!(hs300 && hs300.length >= 2 && sh && sh.length >= 2 && cyb && cyb.length >= 2);

  if (hasHistory) {
    return computeFromHistory({ hs300, sh, cyb, breadth });
  }

  // 历史K线缺失 → 腾讯 qt 实时单点兜底（仍为真实行情）
  try {
    const real = await fetchTencentIndexReal();
    if (real['HS300'] && real['SH']) {
      return computeFromRealTime(real, breadth);
    }
  } catch {
    // 实时源也失败，交由上层走旧模型兜底
  }
  return null;
}

// ── 历史K线模式（完整四因子 + 近20日趋势） ──
function computeFromHistory(data: {
  hs300: CNDailyBar[];
  sh: CNDailyBar[];
  cyb: CNDailyBar[];
  breadth: { up: number; down: number; flat: number } | null;
}): SentimentSnapshot {
  const { hs300, sh, cyb, breadth } = data;

  // ── 1. 指数动能：沪深300 当日涨跌 + 相对20日均线(不含今日)偏离 ──
  const last = hs300[hs300.length - 1];
  const hist = hs300.slice(0, -1);
  const ma20 = hist.reduce((s, b) => s + b.close, 0) / Math.max(1, hist.length);
  const deviation = ma20 ? ((last.close - ma20) / ma20) * 100 : 0;
  const momentum = clampScore(50 + last.pct * 5 + deviation * 2.5);

  // ── 2. 量能动能：上证今日成交量在近20日区间的相对水位 ──
  const shVols = sh.map((b) => b.volume);
  const todayVol = shVols[shVols.length - 1];
  const histVol = shVols.slice(0, -1);
  const hi = Math.max(...histVol);
  const lo = Math.min(...histVol);
  const rank = hi > lo ? (todayVol - lo) / (hi - lo) : 0.5;
  const volume = clampScore(30 + rank * 60);

  // ── 3. 市场宽度：上涨家数占比（缺失时用指数方向近似） ──
  let breadthScore: number;
  let breadthDesc: string;
  let breadthReading: string;
  if (breadth) {
    const total = breadth.up + breadth.down + breadth.flat;
    const upRatio = (breadth.up / total) * 100;
    breadthScore = clampScore(upRatio - 5);
    breadthDesc = `两市上涨 ${breadth.up} / 下跌 ${breadth.down} / 平 ${breadth.flat}，涨家占比 ${upRatio.toFixed(0)}%`;
    breadthReading = breadthScore > 55 ? '普涨' : '分化';
  } else {
    const approx = clampScore(48 + last.pct * 5);
    breadthScore = approx;
    breadthDesc = '涨跌家数暂不可用，以沪深300涨跌方向近似';
    breadthReading = approx > 55 ? '偏普涨' : '偏分化';
  }

  // ── 4. 风格强弱：创业板指 vs 沪深300 当日强度差（成长风格情绪） ──
  const cybLast = cyb[cyb.length - 1];
  const rel = (cybLast ? cybLast.pct : 0) - last.pct;
  const style = clampScore(50 + rel * 6);

  const composite = Math.round(momentum * 0.3 + volume * 0.25 + breadthScore * 0.3 + style * 0.15);
  const classification = classify(composite);

  // ── 近20日趋势：上证指数每日真实涨跌 → 情绪值 ──
  const trend = sh.slice(-20).map((b) => ({
    date: b.date.slice(5).replace('-', '/'),
    value: clampScore(50 + b.pct * 8),
  }));

  const subIndices: SentimentSubIndex[] = [
    {
      key: 'index_momentum',
      name: '指数动能',
      value: momentum,
      description: `沪深300 ${last.pct >= 0 ? '+' : ''}${last.pct.toFixed(2)}%，较20日均线 ${deviation >= 0 ? '+' : ''}${deviation.toFixed(2)}%`,
      reading: momentum > 55 ? '趋势向上' : '动能不足',
    },
    {
      key: 'volume',
      name: '量能动能',
      value: volume,
      description: '上证成交量处于近20日区间' + (rank >= 0.66 ? '高位' : rank >= 0.34 ? '中位' : '低位'),
      reading: volume > 55 ? '放量' : '缩量',
    },
    {
      key: 'breadth',
      name: '市场宽度',
      value: breadthScore,
      description: breadthDesc,
      reading: breadthReading,
    },
    {
      key: 'style',
      name: '风格强弱',
      value: style,
      description: `创业板指 ${cybLast.pct >= 0 ? '+' : ''}${cybLast.pct.toFixed(2)}% vs 沪深300`,
      reading: style > 55 ? '成长占优' : '权重占优',
    },
  ];

  return {
    value: composite,
    classification,
    timestamp: new Date().toISOString(),
    trend,
    subIndices,
    vix: null,
    reading:
      classification.includes('Greed')
        ? `A股情绪偏热（${composite}），${breadth ? '涨家占比 ' + Math.round((breadth.up / (breadth.up + breadth.down + breadth.flat)) * 100) + '%，' : ''}成交处近20日${rank >= 0.66 ? '高位' : '中位'}。追高需谨慎，重点观察量能能否持续。`
        : classification.includes('Fear')
          ? `A股情绪偏冷（${composite}），${breadth ? '仅 ' + Math.round((breadth.up / (breadth.up + breadth.down + breadth.flat)) * 100) + '% 个股上涨，' : ''}市场缩量调整。逆向者可分批关注超跌优质标的，但需控制仓位。`
          : `A股多空均衡（${composite}），${breadth ? '上涨占比 ' + Math.round((breadth.up / (breadth.up + breadth.down + breadth.flat)) * 100) + '%，' : ''}方向暂不明朗，建议观望或依据基本面择机布局。`,
  };
}

// ── 实时单点模式（无历史K线时，腾讯 qt 指数实时构建） ──
function computeFromRealTime(
  real: Record<string, { pct: number; volume: number; amount: number }>,
  breadth: { up: number; down: number; flat: number } | null,
): SentimentSnapshot {
  const hs300 = real['HS300'];
  const sh = real['SH'];
  const cyb = real['CYB'];
  const hasCyb = !!cyb;

  // 上证成交额绝对水位（元）：≥1万亿 视为放量
  const volRank = sh.amount >= 1.0e12 ? 0.85 : sh.amount >= 0.8e12 ? 0.6 : sh.amount >= 0.6e12 ? 0.4 : 0.2;
  const volume = clampScore(30 + volRank * 60);

  // 指数动能退化为当日涨跌
  const momentum = clampScore(50 + hs300.pct * 8);
  const style = clampScore(50 + ((hasCyb ? cyb.pct : 0) - hs300.pct) * 6);

  let breadthScore: number;
  let breadthDesc: string;
  let breadthReading: string;
  if (breadth) {
    const total = breadth.up + breadth.down + breadth.flat;
    const upRatio = (breadth.up / total) * 100;
    breadthScore = clampScore(upRatio - 5);
    breadthDesc = `两市上涨 ${breadth.up} / 下跌 ${breadth.down} / 平 ${breadth.flat}，涨家占比 ${upRatio.toFixed(0)}%`;
    breadthReading = breadthScore > 55 ? '普涨' : '分化';
  } else {
    breadthScore = clampScore(48 + hs300.pct * 5);
    breadthDesc = '涨跌家数暂不可用，以指数涨跌方向近似';
    breadthReading = breadthScore > 55 ? '偏普涨' : '偏分化';
  }

  const composite = Math.round(momentum * 0.3 + volume * 0.25 + breadthScore * 0.3 + style * 0.15);
  const classification = classify(composite);

  const subIndices: SentimentSubIndex[] = [
    {
      key: 'index_momentum',
      name: '指数动能',
      value: momentum,
      description: `沪深300 ${hs300.pct >= 0 ? '+' : ''}${hs300.pct.toFixed(2)}%（实时）`,
      reading: momentum > 55 ? '趋势向上' : '动能不足',
    },
    {
      key: 'volume',
      name: '量能动能',
      value: volume,
      description: `上证成交额 ${(sh.amount / 1e8).toFixed(0)} 亿（实时，${volRank >= 0.66 ? '高位' : volRank >= 0.34 ? '中位' : '低位'}）`,
      reading: volume > 55 ? '放量' : '缩量',
    },
    {
      key: 'breadth',
      name: '市场宽度',
      value: breadthScore,
      description: breadthDesc,
      reading: breadthReading,
    },
    {
      key: 'style',
      name: '风格强弱',
      value: style,
      description: `创业板指 ${hasCyb ? (cyb.pct >= 0 ? '+' : '') + cyb.pct.toFixed(2) + '%' : '—'} vs 沪深300（实时）`,
      reading: style > 55 ? '成长占优' : '权重占优',
    },
  ];

  return {
    value: composite,
    classification,
    timestamp: new Date().toISOString(),
    trend: [
      { date: '实时', value: momentum },
      { date: '实时', value: breadthScore },
    ],
    subIndices,
    vix: null,
    reading: `A股实时情绪（${composite}），基于当日指数与涨跌家数快照，历史趋势暂缺。`,
  };
}
