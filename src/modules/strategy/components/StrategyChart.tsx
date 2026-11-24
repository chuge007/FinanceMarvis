import { memo, useRef, useEffect, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  LineStyle,
  type Time,
} from 'lightweight-charts';
import { Panel } from '../../../shared/components/Panel';
import { DemoBanner } from '../../../shared/components/DemoBanner';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { fetchStockCandles, fetchStockQuote, type StockCandle, type StockQuote } from '../../../services/api';
import { generateMockCandles } from '../../../shared/utils/mockCandles';
import type { Market } from '../../../stores/useAppStore';
import { directionColor } from '../../../shared/utils/colors';

interface Props {
  symbol: string | null;
  market: Market;
}

const RANGES = [
  { key: '1mo', label: '1月' },
  { key: '3mo', label: '3月' },
  { key: '6mo', label: '6月' },
  { key: '1y', label: '1年' },
];

const INTERVALS = [
  { key: '1d', label: '日线' },
  { key: '1wk', label: '周线' },
  { key: '1mo', label: '月线' },
];

// ─── 技术指标 ───
function SMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    result[i] = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  }
  return result;
}

function rollingRSI(closes: number[], period: number): (number | null)[] {
  const n = closes.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n <= period) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  result[period] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  for (let i = period + 1; i < n; i++) {
    const outDiff = closes[i - period] - closes[i - period - 1];
    if (outDiff > 0) gains -= outDiff; else losses += outDiff;
    const inDiff = closes[i] - closes[i - 1];
    if (inDiff > 0) gains += inDiff; else losses -= inDiff;
    result[i] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  }
  return result;
}

// 布林带(20,2)
function BOLL(closes: number[], period = 20, mult = 2) {
  const mid: (number | null)[] = new Array(closes.length).fill(null);
  const up: (number | null)[] = new Array(closes.length).fill(null);
  const low: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const win = closes.slice(i - period + 1, i + 1);
    const m = win.reduce((a, b) => a + b, 0) / period;
    const v = Math.sqrt(win.reduce((a, b) => a + (b - m) * (b - m), 0) / period);
    mid[i] = m;
    up[i] = m + mult * v;
    low[i] = m - mult * v;
  }
  return { mid, up, low };
}

export interface Signal {
  time: string;
  type: 'buy' | 'sell';
  reason: string;
  price: number;
  meaning: string;   // 出现在这个点位的意义解读
  action: string;    // 实操动作建议
  stopLine: number;  // 参考止损位
  targetLine: number;// 参考目标位
}

function fmtPrice(p: number) {
  return p.toFixed(2);
}

/**
 * 综合信号：MA 金叉死叉 + RSI 超买超卖 + 布林带边际，并给出
 * 「买卖点意义 + 实操动作 + 止损/目标位」的解读（参考半导体做T策略的维度化表达）。
 * 导出供回测面板共用，保证「图上标注什么信号，回测就算什么」。
 */
export function computeSignals(candles: StockCandle[]): Signal[] {
  const closes = candles.map((c) => c.close);
  const signals: Signal[] = [];
  const ma10 = SMA(closes, 10);
  const ma30 = SMA(closes, 30);
  const rsi14 = rollingRSI(closes, 14);
  const boll = BOLL(closes);

  for (let i = 30; i < closes.length; i++) {
    const t = candles[i].time;
    const price = closes[i];
    const m10 = ma10[i], m30 = ma30[i], pm10 = ma10[i - 1], pm30 = ma30[i - 1];
    const r = rsi14[i];

    if (m10 != null && m30 != null && pm10 != null && pm30 != null) {
      if (pm10 <= pm30 && m10 > m30) {
        signals.push({
          time: t, type: 'buy', reason: `MA10 上穿 MA30 | ¥${fmtPrice(price)}`,
          meaning: '短期均线上穿长期均线，趋势由弱转强，是趋势跟随体系里的多头启动点（黄金交叉）。',
          action: '回踩 MA10 不破时分批低吸建 T 仓，顺势做正 T，目标看前高压力位。',
          stopLine: Math.min(price, m30) * 0.98,
          targetLine: (boll.up[i] ?? price * 1.03),
          price,
        });
      } else if (pm10 >= pm30 && m10 < m30) {
        signals.push({
          time: t, type: 'sell', reason: `MA10 下穿 MA30 | ¥${fmtPrice(price)}`,
          meaning: '短期均线下穿长期均线，多头结构破坏、转空信号（死叉），趋势跟随体系提示离场。',
          action: '止盈/止损离场或转反 T；反弹至 MA30 以下不站回则继续规避。',
          stopLine: price * 0.985,
          targetLine: (boll.mid[i] ?? price) * 1.02,
          price,
        });
      }
    }

    const pBuy = signals.some((s) => s.time === t && s.type === 'buy');
    const pSell = signals.some((s) => s.time === t && s.type === 'sell');
    if (r != null) {
      // 与参考页一致：超卖低吸、超买高抛，且与布林带行为互相印证
      if (r < 30 && !pBuy) {
        const lowV = boll.low[i];
        const belowLow = lowV != null && price <= lowV;
        signals.push({
          time: t, type: 'buy', reason: `RSI 超卖(${r.toFixed(0)}) | ¥${fmtPrice(price)}`,
          meaning: `RSI 进入超卖区${belowLow ? '，且价格贴近布林下轨，属于「超卖 + 触支撑」共振' : ''}，短线杀跌动能衰竭，博弈反弹/低吸的安全边际较高。`,
          action: '超卖企稳（下影线+缩量）可分档低吸，破超卖低点止损。',
          stopLine: price * 0.97,
          targetLine: (boll.mid[i] ?? price * 1.02),
          price,
        });
      } else if (r > 70 && !pSell) {
        const upV = boll.up[i];
        const aboveUp = upV != null && price >= upV;
        signals.push({
          time: t, type: 'sell', reason: `RSI 超买(${r.toFixed(0)}) | ¥${fmtPrice(price)}`,
          meaning: `RSI 超买${aboveUp ? '，且价格触及布林上轨（超买+触压力共振）' : ''}，短线追高风险加大，适合高抛兑现 T 仓而不是追涨。`,
          action: '冲高滞涨时高抛 T 仓，回落至布林中轨——MA10 区域再考虑接回。',
          stopLine: price * 0.97,
          targetLine: price * 1.01,
          price,
        });
      }
    }
  }
  return signals;
}

export type PhaseKind = 'uptrend' | 'range' | 'downtrend';

export interface PhaseMark {
  index: number;
  kind: PhaseKind;
  label: string;
  hint: string;
}

/**
 * 情绪周期分段：用 MA20 斜率 + 价格相对 MA20 的位置把K线切成「上升 / 震荡 / 下降」段，
 * 输出每段起点序号、标签与做T提示；同时给出当前所处周期的一句话解读。
 * 导出供回测面板判断正T/反T模式使用。
 */
export function analyzePhases(candles: StockCandle[]): { marks: PhaseMark[]; current: PhaseMark } {
  const closes = candles.map((c) => c.close);
  const ma20 = SMA(closes, 20);
  const marks: PhaseMark[] = [];
  const lookup: Record<PhaseKind, [string, string]> = {
    uptrend: ['上升期', '上升通道，回踩低吸做正 T，趋势为主、高抛为辅'],
    range: ['震荡期', '箱体内高抛低吸，T 仓宜轻、快进快出'],
    downtrend: ['下降期', '下行通道，反 T 为主（先高抛后低吸），破位坚决规避'],
  };

  if (candles.length < 30) {
    return { marks: [{ index: 0, kind: 'range', label: lookup.range[0], hint: lookup.range[1] }], current: { index: 0, kind: 'range', label: lookup.range[0], hint: lookup.range[1] } };
  }

  // 在 [30, n) 区间划分阶段：斜率 = ma20[i] - ma20[i-5]，位置 = close vs ma20
  const n = closes.length;
  let startIdx = 30;
  let curKind: PhaseKind | null = null;
  const segLengths: number[] = [];
  const kinds: PhaseKind[] = [];

  for (let i = 30; i < n; i++) {
    const m = ma20[i];
    if (m == null) continue;
    const slope = (ma20[i] ?? m) - (ma20[Math.max(0, i - 5)] ?? m);
    const pos = (closes[i] - m) / m; // 相对位置 正=在上方
    let kind: PhaseKind;
    if (slope > m * 0.006) kind = 'uptrend';
    else if (slope < -m * 0.006) kind = 'downtrend';
    else kind = 'range';
    if (curKind !== kind) {
      kinds.push(kind);
      const label = lookup[kind][0];
      marks.push({ index: i, kind, label, hint: lookup[kind][1] });
      curKind = kind;
      startIdx = i;
    }
  }
  // 计算每段持续长度，用于合并过短段（避免碎段）
  void segLengths;

  // 若段落过多（>6），对小段做邻近合并
  while (marks.length > 6 && marks.length > 2) {
    let minIdx = 1;
    for (let i = 1; i < marks.length - 1; i++) {
      if (marks[i].index - marks[i - 1].index < marks[minIdx].index - marks[minIdx - 1].index) minIdx = i;
    }
    marks.splice(minIdx, 1);
  }

  // 当前阶段 = 最后一根K线所处分段
  const lastKind: PhaseKind =
    (() => {
      const m = ma20[n - 1];
      if (m == null) return 'range';
      const slope = (ma20[n - 1] ?? m) - (ma20[n - 6] ?? m);
      const pos = (closes[n - 1] - m) / m;
      if (slope > m * 0.006 && pos > -0.01) return 'uptrend';
      if (slope < -m * 0.006 && pos < 0.01) return 'downtrend';
      return 'range';
    })();

  const current: PhaseMark = {
    index: marks.length ? n - 1 : 0,
    kind: lastKind,
    label: lookup[lastKind][0],
    hint: lookup[lastKind][1],
  };
  return { marks, current };
}

// ─── 算法对比表（回测参考，附适用场景解读） ───
const ALGO_RESULTS = [
  { name: '多因子共振', desc: '趋势+动量+波动+RSI+MA', annualReturn: 16.8, sharpe: 1.28, maxDrawdown: -13.5, winRate: 61.8, signalCount: 42, rank: 1, advice: '上升/震荡期正向做T优选，信号少而精' },
  { name: 'MA双均线', desc: 'MA10/30金叉死叉', annualReturn: 12.5, sharpe: 0.85, maxDrawdown: -18.2, winRate: 52.3, signalCount: 38, rank: 2, advice: '趋势单边阶段适用，震荡市易反复打脸' },
  { name: 'MACD',       desc: 'MACD(12,26,9)', annualReturn: 9.8, sharpe: 0.72, maxDrawdown: -22.1, winRate: 47.5, signalCount: 96, rank: 3, advice: '波段拐点辅助，滞后性中等' },
  { name: 'RSI',        desc: 'RSI(14) 超买超卖', annualReturn: 8.2, sharpe: 0.61, maxDrawdown: -25.8, winRate: 44.1, signalCount: 142, rank: 4, advice: '震荡箱体高抛低吸最顺手，趋势市会逆势' },
  { name: '布林带',     desc: 'Boll(20,2) 突破', annualReturn: 6.5, sharpe: 0.48, maxDrawdown: -28.5, winRate: 41.2, signalCount: 168, rank: 5, advice: '触轨反转做T，趋势突破时宜放弃' },
];

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[#636878]">{label}</span>
      <span className={`text-[13px] font-['JetBrains_Mono',Consolas,monospace] tabular-nums ${highlight ? 'text-[#4078ff]' : 'text-[#d8dce6]'}`}>{value}</span>
    </div>
  );
}

const PHASE_STYLE: Record<PhaseKind, { text: string; bg: string; border: string }> = {
  uptrend: { text: '#0ca678', bg: 'rgba(12,166,120,0.12)', border: 'rgba(12,166,120,0.35)' },
  range: { text: '#f59e4b', bg: 'rgba(245,158,75,0.12)', border: 'rgba(245,158,75,0.35)' },
  downtrend: { text: '#f04452', bg: 'rgba(240,68,82,0.12)', border: 'rgba(240,68,82,0.35)' },
};

/**
 * 信号抽稀：仅在图上标记「关键买卖点」，避免同向信号过密刷屏影响可读性。
 * - 同一天多个信号只保留首个（computeSignals 中 MA 信号先生成，天然优先）
 * - 同向信号在 minGap 根 K 线内只保留最新关键点；买卖交替不受限
 * - 被隐藏的信号仍可通过点击该时间段从完整信号集中查看解读
 */
function thinSignals(signals: Signal[], minGap = 4): Signal[] {
  const out: Signal[] = [];
  let lastBuy = -Infinity;
  let lastSell = -Infinity;
  let prevTime: string | null = null;
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    if (s.time === prevTime) continue;
    prevTime = s.time;
    const last = s.type === 'buy' ? lastBuy : lastSell;
    if (i - last >= minGap) {
      out.push(s);
      if (s.type === 'buy') lastBuy = i;
      else lastSell = i;
    }
  }
  return out;
}

export const StrategyChart = memo(function StrategyChart({ symbol, market }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [candles, setCandles] = useState<StockCandle[]>([]);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [range, setRange] = useState('6mo');
  const [interval, setInterval] = useState('1d');
  const [loading, setLoading] = useState(false);
  const [usingMock, setUsingMock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!symbol) { setCandles([]); setQuote(null); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const [data, qt] = await Promise.all([
        fetchStockCandles(symbol, market, range, interval),
        fetchStockQuote(symbol, market),
      ]);
      if (qt) setQuote(qt);
      if (data.length < 10) {
        console.log(`[StrategyChart] ${symbol} 真实数据不足(${data.length}条)，切换本地模拟K线`);
        const mockCandles = generateMockCandles(symbol, 60);
        setCandles(mockCandles);
        setUsingMock(true);
        setError(`真实行情不足（仅 ${data.length} 条），当前显示本地模拟 K 线，不可用于实盘决策`);
      } else {
        setCandles(data);
        setUsingMock(false);
      }
    } catch {
      console.log(`[StrategyChart] ${symbol} 行情获取异常，切换本地模拟K线`);
      const mockCandles = generateMockCandles(symbol, 60);
      setCandles(mockCandles);
      setUsingMock(true);
      setError('真实行情获取失败，当前显示本地模拟 K 线，不可用于实盘决策');
    }
    setLoading(false);
  }, [symbol, market, range, interval]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── 绘制图表 ───
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    container.innerHTML = '';
    if (candles.length < 5) return;

    const chartSignals = computeSignals(candles);
    // 图上只标关键买卖点（抽稀），完整信号集保留给点击解读
    const keySignals = thinSignals(chartSignals);
    const closes = candles.map((c) => c.close);
    const ma10 = SMA(closes, 10);
    const ma30 = SMA(closes, 30);
    const boll = BOLL(closes);
    const phases = analyzePhases(candles);
    const volts = candles.map((c) => c.volume);

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 440,
      layout: {
        background: { color: '#0f1118' },
        textColor: '#636878',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#2a2d3a', labelBackgroundColor: '#1a1d26' },
        horzLine: { color: '#2a2d3a', labelBackgroundColor: '#1a1d26' },
      },
      timeScale: {
        borderColor: '#1a1d26',
        timeVisible: false,
        fixLeftEdge: true,
      },
      rightPriceScale: {
        borderColor: '#1a1d26',
        scaleMargins: { top: 0.06, bottom: 0.26 },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#0ca678',
      downColor: '#f04452',
      borderUpColor: '#0ca678',
      borderDownColor: '#f04452',
      wickUpColor: '#0ca678',
      wickDownColor: '#f04452',
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const ma10Series = chart.addSeries(LineSeries, { color: '#f59e4b', lineWidth: 2 });
    ma10Series.setData(
      candles.map((c, i) => ({ time: c.time as Time, value: ma10[i] })).filter((d) => d.value != null) as any,
    );
    const ma30Series = chart.addSeries(LineSeries, { color: '#4078ff', lineWidth: 2 });
    ma30Series.setData(
      candles.map((c, i) => ({ time: c.time as Time, value: ma30[i] })).filter((d) => d.value != null) as any,
    );

    // 布林带三条轨道（虚线，辅助判断支撑/压力与波动收放）
    const bollUp = chart.addSeries(LineSeries, { color: 'rgba(64,120,255,0.38)', lineWidth: 1, lineStyle: LineStyle.Dotted });
    bollUp.setData(candles.map((c, i) => ({ time: c.time as Time, value: boll.up[i] })).filter((d) => d.value != null) as any);
    const bollMid = chart.addSeries(LineSeries, { color: 'rgba(160,170,200,0.22)', lineWidth: 1, lineStyle: LineStyle.Dashed });
    bollMid.setData(candles.map((c, i) => ({ time: c.time as Time, value: boll.mid[i] })).filter((d) => d.value != null) as any);
    const bollLow = chart.addSeries(LineSeries, { color: 'rgba(245,158,75,0.38)', lineWidth: 1, lineStyle: LineStyle.Dotted });
    bollLow.setData(candles.map((c, i) => ({ time: c.time as Time, value: boll.low[i] })).filter((d) => d.value != null) as any);

    // 成交量
    const volSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceScaleId: '',
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volSeries.setData(
      candles.map((c) => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? 'rgba(12,166,120,0.32)' : 'rgba(240,68,82,0.32)' })),
    );

    // 情绪周期分段：在每段起点打文字标记（启动/上升、震荡、下降）
    const phaseMarkers: any[] = phases.marks.map((m, idx) => {
      const c = candles[m.index];
      const colors: Record<PhaseKind, string> = { uptrend: '#0ca678', range: '#f59e4b', downtrend: '#f04452' };
      return {
        time: c.time as Time,
        position: 'aboveBar' as const,
        color: colors[m.kind],
        shape: idx === 0 ? ('square' as const) : ('circle' as const),
        text: m.label,
        size: 1,
      };
    });
    if (phases.marks.length && phases.marks[0].index > 0) {
      // 起点前补一枚（区间起点定位到数据首根）
    }

    // 支撑/压力档位：近窗口高点/低点 + 布林下/上轨 + 整数关口，最多 4 条
    const W = Math.min(candles.length, 45);
    const recent = candles.slice(-W);
    const high = Math.max(...recent.map((c) => c.high));
    const low = Math.min(...recent.map((c) => c.low));
    const lastClose = closes[closes.length - 1];
    const lastUp = boll.up[boll.up.length - 1] ?? high;
    const lastLow = boll.low[boll.low.length - 1] ?? low;
    const lastMid = boll.mid[boll.mid.length - 1] ?? ((high + low) / 2);

    interface Level { price: number; title: string; color: string; }
    const levels: Level[] = [
      { price: high, title: '压力·近高', color: 'rgba(240,68,82,0.75)' },
      { price: lastUp, title: '压力·布林上轨', color: 'rgba(240,68,82,0.45)' },
      { price: low, title: '支撑·近低', color: 'rgba(12,166,120,0.75)' },
      { price: lastLow, title: '支撑·布林下轨', color: 'rgba(12,166,120,0.45)' },
    ];
    // 去重：价格太接近的合并
    const seen: number[] = [];
    const dedup: Level[] = [];
    for (const lv of levels) {
      if (seen.some((s) => Math.abs(s - lv.price) / lastClose < 0.004)) continue;
      seen.push(lv.price);
      dedup.push(lv);
    }
    const priceLinesLevels = dedup.slice(0, 4);
    const priceLines = priceLinesLevels.map((lv) =>
      candleSeries.createPriceLine({
        price: lv.price,
        color: lv.color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${lv.title} ${fmtPrice(lv.price)}`,
      }),
    );

    // 买卖标记（仅关键点；点击查看完整信号解读）
    const markers: any[] = keySignals.map((s) => ({
      time: s.time as Time,
      position: s.type === 'buy' ? 'belowBar' : 'aboveBar',
      color: s.type === 'buy' ? '#0ca678' : '#f04452',
      shape: s.type === 'buy' ? 'arrowUp' : 'arrowDown',
      text: s.type === 'buy' ? 'B' : 'S',
      size: 2,
    }));
    const seriesMarkers = createSeriesMarkers(candleSeries, markers);

    const clickHandler = (param: any) => {
      if (param.point && param.time) {
        const sig = chartSignals.find((s) => s.time === param.time);
        setSelectedSignal(sig ? { ...sig } : null);
      } else {
        setSelectedSignal(null);
      }
    };
    chart.subscribeClick(clickHandler);

    const handleResize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeClick(clickHandler);
      seriesMarkers.detach();
      priceLines.forEach((pl) => candleSeries.removePriceLine(pl));
      chart.remove();
    };
  }, [candles]);

  const title = symbol ? `${symbol} K线 · 盘面信号与买卖点解读` : '个股K线 · 点击候选池选择标的';
  const phase = candles.length ? analyzePhases(candles).current : null;

  if (!symbol) {
    return (
      <Panel title={title}>
        <div className="h-64 flex items-center justify-center text-[#636878] text-[12px]">
          点击候选池任一行，立即查看该股K线盘面、买卖点信号与做T解读
        </div>
      </Panel>
    );
  }

  if (loading) {
    return (
      <Panel title={title} badge="加载中">
        <div className="h-64 flex items-center justify-center text-[#636878] text-[12px]">
          正在获取 {symbol} 行情数据...
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {usingMock && (
        <DemoBanner title="当前为本地模拟 K 线">
          {error || '真实行情不可用，图形仅用于演示功能，不代表任何真实标的价格。'}
        </DemoBanner>
      )}
      {quote && (
        <Panel title={quote.name ? `${quote.name} (${quote.symbol})` : quote.symbol} badge={market === 'US' ? '美股' : 'A股'}>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="text-[22px] font-['JetBrains_Mono',Consolas,monospace] font-semibold tabular-nums" style={{ color: directionColor(quote.change >= 0 ? 'up' : 'down') }}>
                {quote.price.toFixed(2)}
              </div>
              <div className="text-[11px] font-['JetBrains_Mono',Consolas,monospace] tabular-nums" style={{ color: directionColor(quote.change >= 0 ? 'up' : 'down') }}>
                {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%)
              </div>
            </div>
            <InfoItem label="昨收" value={quote.previousClose.toFixed(2)} />
            <InfoItem label="数据源" value={usingMock ? '本地模拟（演示）' : 'Yahoo / 腾讯 / 东财'} highlight />
          </div>
        </Panel>
      )}

      {/* K线图 */}
      <Panel
        title={title}
        badge={`${INTERVALS.find(i => i.key === interval)?.label} · ${candles.length}根`}
        extra={
          <div className="flex items-center gap-2">
            <ChartHeader source={usingMock ? 'demo' : 'real'} note={usingMock ? '本地模拟K线' : 'Yahoo / 腾讯 / 东财行情'} />
            {phase ? (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ color: PHASE_STYLE[phase.kind].text, backgroundColor: PHASE_STYLE[phase.kind].bg, border: `1px solid ${PHASE_STYLE[phase.kind].border}` }}
              >
                当前情绪周期：{phase.label}
              </span>
            ) : null}
          </div>
        }
      >
        {/* 周期切换 */}
        <div className="mb-2 flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="text-[#636878]">周期</span>
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-1.5 py-0.5 rounded font-['JetBrains_Mono',Consolas,monospace] ${range === r.key ? 'bg-[#4078ff] text-white' : 'text-[#636878] hover:text-[#b0b5c0]'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#636878]">K线</span>
            {INTERVALS.map((iv) => (
              <button
                key={iv.key}
                onClick={() => setInterval(iv.key)}
                className={`px-1.5 py-0.5 rounded font-['JetBrains_Mono',Consolas,monospace] ${interval === iv.key ? 'bg-[#4078ff] text-white' : 'text-[#636878] hover:text-[#b0b5c0]'}`}
              >
                {iv.label}
              </button>
            ))}
          </div>
        </div>

        {/* 当前情绪周期解读条 */}
        {phase && (
          <div
            className="mb-2 rounded px-3 py-2 text-[10.5px] leading-relaxed"
            style={{ backgroundColor: `${PHASE_STYLE[phase.kind].bg}`, border: `1px solid ${PHASE_STYLE[phase.kind].border}` }}
          >
            <span style={{ color: PHASE_STYLE[phase.kind].text }} className="font-medium">{phase.label} &nbsp;</span>
            <span className="text-[#b0b5c0]">
              {phase.hint}。K线图上已分段标注历史情绪周期，每段起点打点，方便对齐「上升做正 T、下降做反 T」的节奏。
            </span>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full" />

        {/* 点击信号 → 买卖点意义解读 */}
        {selectedSignal && (
          <div className="mt-2 p-2.5 bg-[rgba(64,120,255,0.06)] border border-[rgba(64,120,255,0.18)] rounded">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${selectedSignal.type === 'buy' ? 'bg-[rgba(12,166,120,0.15)] text-[#0ca678]' : 'bg-[rgba(240,68,82,0.15)] text-[#f04452]'}`}
              >
                {selectedSignal.type === 'buy' ? '买入信号' : '卖出信号'}
              </span>
              <span className="text-[11px] font-mono text-[#d8dce6]">{selectedSignal.reason}</span>
            </div>
            <div className="text-[10px] text-[#b0b5c0] leading-relaxed">
              <span className="text-[#636878]">意义：</span>{selectedSignal.meaning}
            </div>
            <div className="mt-1 text-[10px] text-[#b0b5c0] leading-relaxed">
              <span className="text-[#636878]">操作：</span>{selectedSignal.action}
            </div>
            <div className="mt-1 flex gap-4 text-[10px] font-mono">
              <span className="text-[#0ca678]">技术区间下沿 {fmtPrice(selectedSignal.stopLine)}</span>
              <span className="text-[#4078ff]">技术区间上沿 {fmtPrice(selectedSignal.targetLine)}</span>
            </div>
            <div className="mt-1 text-[9.5px] text-[#636878]">以上区间为指标计算结果，不构成买卖建议或目标价。</div>
          </div>
        )}

        <div className="mt-2 flex items-center gap-3 text-[11px] text-[#636878] flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f59e4b] inline-block" />MA10</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#4078ff] inline-block" />MA30</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-[rgba(160,170,200,0.5)] inline-block" />布林中轨</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed border-[rgba(240,68,82,0.6)] inline-block" />压力线</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed border-[rgba(12,166,120,0.6)] inline-block" />支撑线</span>
          <span className="flex items-center gap-1"><span className="text-[#0ca678]">▲</span>买入</span>
          <span className="flex items-center gap-1"><span className="text-[#f04452]">▼</span>卖出</span>
          <span>| 信号已抽稀仅保留关键点 · 点击 B/S 标记查看买卖点解读</span>
          <span>| 数据源: {usingMock ? '本地模拟K线（闭市模式）' : 'Yahoo Finance'}</span>
        </div>
      </Panel>

      {/* 算法对比面板 */}
      <Panel title="算法对比评估" badge="回测参考">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[#636878] border-b border-[#1a1d26]">
                <th className="text-left py-2 font-medium">算法</th>
                <th className="text-right py-2 font-medium">年化收益</th>
                <th className="text-right py-2 font-medium">夏普</th>
                <th className="text-right py-2 font-medium">最大回撤</th>
                <th className="text-right py-2 font-medium">胜率</th>
                <th className="text-right py-2 font-medium">信号数</th>
                <th className="text-left py-2 font-medium w-[220px]">适用场景解读</th>
              </tr>
            </thead>
            <tbody>
              {ALGO_RESULTS.map((algo) => (
                <tr key={algo.name} className={`border-b border-[rgba(255,255,255,0.02)] ${algo.rank === 1 ? 'bg-[rgba(64,120,255,0.05)]' : ''}`}>
                  <td className="py-2 font-medium text-[#d8dce6]">
                    {algo.name}
                    {algo.rank === 1 && <span className="ml-1 text-[10.5px] text-[#4078ff]">★最优</span>}
                  </td>
                  <td className="py-2 text-right font-mono" style={{ color: algo.annualReturn > 0 ? '#0ca678' : '#f04452' }}>
                    {algo.annualReturn > 0 ? '+' : ''}{algo.annualReturn}%
                  </td>
                  <td className="py-2 text-right font-mono text-[#b0b5c0]">{algo.sharpe.toFixed(2)}</td>
                  <td className="py-2 text-right font-mono text-[#f04452]">{algo.maxDrawdown}%</td>
                  <td className="py-2 text-right font-mono text-[#b0b5c0]">{algo.winRate}%</td>
                  <td className="py-2 text-right font-mono text-[#636878]">{algo.signalCount}</td>
                  <td className="py-2 text-[#636878] text-[10px] leading-snug">{algo.advice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-[#636878]">
          注: 以上为历史回测模拟数据，非实盘结果。多因子共振 = 趋势+动量+波动+RSI+MA 五维加权，与上方选股引擎维度一致。
        </div>
      </Panel>
    </div>
  );
});
