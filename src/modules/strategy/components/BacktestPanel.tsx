import { memo, useRef, useEffect, useState, useCallback } from 'react';
import { createChart, LineSeries, AreaSeries, LineStyle, type Time } from 'lightweight-charts';
import { Panel } from '../../../shared/components/Panel';
import { DemoBanner } from '../../../shared/components/DemoBanner';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';
import { fetchStockCandles, type StockCandle } from '../../../services/api';
import { generateMockCandles } from '../../../shared/utils/mockCandles';
import type { BacktestStats, BacktestSignalBrief } from '../../../types/strategy';
import type { Market } from '../../../stores/useAppStore';
import { computeSignals, analyzePhases, type Signal } from './StrategyChart';

interface Props {
  symbol: string | null;
  market: Market;
}

const PHASE_STYLE: Record<string, { text: string; bg: string; label: string }> = {
  uptrend: { text: '#0ca678', bg: 'rgba(12,166,120,0.12)', label: '上升期' },
  range: { text: '#f59e4b', bg: 'rgba(245,158,75,0.12)', label: '震荡期' },
  downtrend: { text: '#f04452', bg: 'rgba(240,68,82,0.12)', label: '下降期' },
};

/**
 * 闭环回测：与 K线图共用同一套 computeSignals（MA金叉死叉 + RSI超买超卖 + 布林边际），
 * 根据个股当前情绪周期自动选择策略模式：
 *   - 上升/震荡期 → 正T（long）：买在支撑做多、卖在压力兑现
 *   - 下降期（含美股利空例外） → 反T（short）：高抛做空、回踩接回
 * 全程满仓进出、忽略滑点手续费，统计做T收益曲线与胜率特征。
 */
function runClosedLoopBacktest(
  candles: StockCandle[],
  symbol: string,
): BacktestStats | null {
  const n = candles.length;
  if (n < 40) return null;
  const signals = computeSignals(candles);
  const ph = analyzePhases(candles).current;
  const mode: 'long' | 'short' = ph.kind === 'downtrend' ? 'short' : 'long';

  // 时间 → 当日信号（保持顺序）
  const byTime = new Map<string, Signal[]>();
  for (const s of signals) {
    const arr = byTime.get(s.time) ?? [];
    arr.push(s);
    byTime.set(s.time, arr);
  }

  const closes = candles.map((c) => c.close);
  const trades: { ret: number; hold: number; buyDate: string; sellDate: string }[] = [];
  const equityCurve: { date: string; value: number }[] = [];
  let signalCount = signals.length;

  if (mode === 'long') {
    let cash = 1, shares = 0, inPos = false, buyPrice = 0, buyIdx = 0;
    for (let i = 0; i < n; i++) {
      const t = candles[i].time;
      const daySignals = byTime.get(t) ?? [];
      for (const s of daySignals) {
        const px = closes[i];
        if (s.type === 'buy' && !inPos) {
          inPos = true; buyPrice = px; buyIdx = i;
          shares = cash / px; cash = 0;
        } else if (s.type === 'sell' && inPos) {
          cash = shares * px; shares = 0; inPos = false;
          trades.push({ ret: (px - buyPrice) / buyPrice, hold: i - buyIdx, buyDate: candles[buyIdx].time, sellDate: t });
        }
      }
      // 日末平掉当天信号后的持仓信号
      const tail = byTime.get(t) ?? [];
      let px = closes[i];
      // 若当日开仓后没有再平仓，按收盘持有
      if (tail.some((s) => s.type === 'buy') && !tail.some((s) => s.type === 'sell') && inPos) {
        // 保持持仓
      }
      px = closes[i];
      const nav = cash + shares * px;
      equityCurve.push({ date: t, value: +nav.toFixed(4) });
    }
    if (inPos) {
      const px = closes[n - 1];
      const ret = (px - buyPrice) / buyPrice;
      trades.push({ ret, hold: n - 1 - buyIdx, buyDate: candles[buyIdx].time, sellDate: candles[n - 1].time });
    }
  } else {
    // short 反T：sell 触发高抛开空，buy 触发回补
    let stake = 1, inShort = false, shortPrice = 0, shortIdx = 0;
    for (let i = 0; i < n; i++) {
      const t = candles[i].time;
      const daySignals = byTime.get(t) ?? [];
      for (const s of daySignals) {
        const px = closes[i];
        if (s.type === 'sell' && !inShort) {
          inShort = true; shortPrice = px; shortIdx = i;
        } else if (s.type === 'buy' && inShort) {
          const ret = (shortPrice - px) / shortPrice;
          stake = stake * (1 + ret);
          inShort = false;
          trades.push({ ret, hold: i - shortIdx, buyDate: candles[shortIdx].time, sellDate: t });
        }
      }
      const px = closes[i];
      const nav = inShort ? stake * (2 * shortPrice - px) / shortPrice : stake;
      equityCurve.push({ date: t, value: +nav.toFixed(4) });
    }
    if (inShort) {
      const px = closes[n - 1];
      const ret = (shortPrice - px) / shortPrice;
      stake = stake * (1 + ret);
      trades.push({ ret, hold: n - 1 - shortIdx, buyDate: candles[shortIdx].time, sellDate: candles[n - 1].time });
    }
  }

  const returns = trades.map((t) => t.ret * 100);
  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const finalNav = equityCurve.length ? equityCurve[equityCurve.length - 1].value : 1;
  const totalReturn = (finalNav - 1) * 100;

  let peak = -Infinity;
  const drawdownCurve = equityCurve.map((p) => {
    peak = Math.max(peak, p.value);
    const dd = ((p.value - peak) / peak) * 100;
    return { date: p.date, value: +dd.toFixed(4) };
  });
  const maxDrawdown = drawdownCurve.reduce((worst, p) => Math.max(worst, -p.value), 0);

  const modeVerdict =
    mode === 'long'
      ? totalReturn >= 0
        ? `正收益 · 当前个股处${ph.label}，正T（顺势低吸高抛）回测为正，趋势与做T方向一致`
        : `负收益 · ${ph.label}阶段正T回测为负，需结合回撤曲线判断稳定性`
      : totalReturn >= 0
        ? `正收益 · 个股处${ph.label}，反T（高抛低接）回测为正`
        : `负收益 · ${ph.label}阶段反T回测为负，需结合回撤曲线判断稳定性`;

  const signalsBrief: BacktestSignalBrief[] = signals.slice(-6).map((s) => ({
    time: s.time, type: s.type, reason: s.reason, price: s.price, meaning: s.meaning,
  }));

  return {
    symbol,
    period: `${candles[0].time} ~ ${candles[n - 1].time}`,
    signalCount,
    tradeCount: trades.length,
    winRate: trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : 0,
    profitFactor: grossLoss === 0 ? 99 : +(grossWin / grossLoss).toFixed(2),
    totalReturn: +totalReturn.toFixed(2),
    maxDrawdown: +maxDrawdown.toFixed(2),
    avgHoldDays: trades.length ? +(trades.reduce((a, t) => a + t.hold, 0) / trades.length).toFixed(1) : 0,
    avgWin: wins.length ? +(wins.reduce((a, b) => a + b, 0) / wins.length).toFixed(2) : 0,
    avgLoss: losses.length ? +(losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(2) : 0,
    equityCurve,
    drawdownCurve,
    mode,
    modeVerdict,
    phase: { kind: ph.kind, label: ph.label, hint: ph.hint },
    signalsBrief,
  };
}

function KpiItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[#636878]">{label}</span>
      <span
        className="text-[13.5px] font-['JetBrains_Mono',Consolas,monospace] font-semibold tabular-nums"
        style={{ color: color ?? '#d8dce6' }}
      >
        {value}
      </span>
    </div>
  );
}

export const BacktestPanel = memo(function BacktestPanel({ symbol, market }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const drawdownRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<BacktestStats | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const load = useCallback(async () => {
    if (!symbol) { setStats(null); return; }
    try {
      const data = await fetchStockCandles(symbol, market, '1y', '1d');
      if (data.length >= 40) {
        setStats(runClosedLoopBacktest(data, symbol));
        setUsingMock(false);
        return;
      }
      setStats(runClosedLoopBacktest(generateMockCandles(symbol, 260), symbol));
      setUsingMock(true);
    } catch {
      setStats(runClosedLoopBacktest(generateMockCandles(symbol, 260), symbol));
      setUsingMock(true);
    }
  }, [symbol, market]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const container = chartRef.current;
    const ddContainer = drawdownRef.current;
    if (!container || !stats) return;
    container.innerHTML = '';
    if (ddContainer) ddContainer.innerHTML = '';

    const common = {
      layout: { background: { color: '#0d1117' }, textColor: '#8a8f9c' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
      timeScale: { borderColor: '#1a1d26', timeVisible: false },
      crosshair: { mode: 0 as const, vertLine: { color: '#2a2d3a', labelBackgroundColor: '#1a1d26' }, horzLine: { color: '#2a2d3a', labelBackgroundColor: '#1a1d26' } },
    };

    const chart = createChart(container, {
      ...common,
      width: container.clientWidth,
      height: 170,
      rightPriceScale: { borderColor: '#1a1d26' },
    });
    const navSeries = chart.addSeries(LineSeries, {
      color: stats.mode === 'short' ? '#f04452' : '#4078ff',
      lineWidth: 2,
    });
    navSeries.setData(stats.equityCurve.map((p) => ({ time: p.date as Time, value: p.value })));
    // 显式画出 1.0 基准线，防止净值从起点自动缩放把微小波动填满画布。
    const baseSeries = chart.addSeries(LineSeries, {
      color: '#4d5364', lineWidth: 1, lineStyle: LineStyle.Dotted,
      priceLineVisible: false, lastValueVisible: false,
    });
    baseSeries.setData(stats.equityCurve.map((p) => ({ time: p.date as Time, value: 1 })));

    let ddChart: ReturnType<typeof createChart> | null = null;
    if (ddContainer) {
      ddChart = createChart(ddContainer, {
        ...common,
        width: ddContainer.clientWidth,
        height: 110,
        rightPriceScale: { borderColor: '#1a1d26' },
      });
      const ddSeries = ddChart.addSeries(AreaSeries, {
        lineColor: '#f04452',
        topColor: 'rgba(240,68,82,0.30)',
        bottomColor: 'rgba(240,68,82,0.02)',
        priceLineVisible: false,
      });
      ddSeries.setData(stats.drawdownCurve.map((p) => ({ time: p.date as Time, value: p.value })));
    }

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
      ddChart?.applyOptions({ width: ddContainer?.clientWidth ?? container.clientWidth });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      ddChart?.remove();
    };
  }, [stats]);

  if (!symbol) {
    return (
      <Panel title="选股 → 做T → 回测收益">
        <div className="h-16 flex items-center justify-center text-[#8a8f9c] text-[12px]">
          请先选定标的：在候选池点击一行，系统将用同一套K线信号做实盘回测
        </div>
      </Panel>
    );
  }

  if (!stats) {
    return (
      <Panel title="选股 → 做T → 回测收益" badge="回测中">
        <div className="h-16 flex items-center justify-center text-[#8a8f9c] text-[12px]">
          正在基于 {symbol} 历史K线执行做T策略回测...
        </div>
      </Panel>
    );
  }

  const retCol = stats.totalReturn >= 0 ? '#0ca678' : '#f04452';
  const winCol = stats.winRate >= 50 ? '#0ca678' : '#f59e4b';
  const phStyle = PHASE_STYLE[stats.phase.kind] ?? PHASE_STYLE.range;
  const verdictCol = stats.modeVerdict.startsWith('正收益') ? '#0ca678' : '#f04452';

  return (
    <Panel
      title="选股 → 做T → 回测收益"
      badge={`${stats.symbol} · ${stats.period}`}
      extra={<ChartHeader source={usingMock ? 'demo' : 'real'} note="净值 1.0 基准 + 回撤同框；忽略滑点手续费" />}
    >
      {usingMock && (
        <DemoBanner title="当前回测基于本地模拟 K 线">
          收益与回撤均为演示结果，不代表真实标的的历史表现。
        </DemoBanner>
      )}
      {/* 周期 + 策略模式 */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: phStyle.text, backgroundColor: phStyle.bg }}>
          当前阶段 · {stats.phase.label}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stats.mode === 'long' ? 'text-[#4078ff] bg-[rgba(64,120,255,0.12)]' : 'text-[#f04452] bg-[rgba(240,68,82,0.12)]'}`}>
          {stats.mode === 'long' ? '正T策略（低吸高抛）' : '反T策略（高抛避险/做空）'}
        </span>
        <span className="text-[10px] text-[#8a8f9c]">{stats.phase.hint}</span>
        <span className="ml-auto text-[10px] text-[#636878]">信号规则与上方K线标注完全一致</span>
      </div>

      {/* 结论解读（利好/利空） */}
      <div
        className="rounded px-3 py-2 mb-2 text-[11px] leading-relaxed"
        style={{ backgroundColor: stats.mode === 'short' ? 'rgba(240,68,82,0.07)' : 'rgba(64,120,255,0.07)', border: `1px solid rgba(${stats.mode === 'short' ? '240,68,82' : '64,120,255'},0.18)` }}
      >
        <span className="font-medium" style={{ color: verdictCol }}>{stats.modeVerdict}</span>
      </div>

      <div className="grid grid-cols-4 gap-x-6 gap-y-2">
        <KpiItem label="累计收益" value={`${stats.totalReturn > 0 ? '+' : ''}${stats.totalReturn}%`} color={retCol} />
        <KpiItem label="做T笔数" value={String(stats.tradeCount)} />
        <KpiItem label="信号次数" value={String(stats.signalCount)} />
        <KpiItem label="胜率" value={`${stats.winRate}%`} color={winCol} />
        <KpiItem label="盈亏比" value={stats.profitFactor > 50 ? '∞' : String(stats.profitFactor)} />
        <KpiItem label="最大回撤" value={`-${stats.maxDrawdown}%`} color="#f04452" />
        <KpiItem
          label="收益/回撤比"
          value={stats.maxDrawdown > 0 ? (stats.totalReturn / stats.maxDrawdown).toFixed(2) : '—'}
        />
        <KpiItem label="平均持仓" value={`${stats.avgHoldDays}天`} />
        <KpiItem label="平均盈/亏" value={`+${stats.avgWin}% / -${stats.avgLoss}%`} />
      </div>

      <div ref={chartRef} className="w-full mt-2" />
      <div ref={drawdownRef} className="w-full" />
      <div className="mt-1 flex items-center gap-3 text-[11px] text-[#636878] flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{ backgroundColor: stats.mode === 'short' ? '#f04452' : '#4078ff' }} />策略净值（虚线=1.0 基准）</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block bg-[#f04452]" />回撤（%）</span>
        <span>数据源: {usingMock ? '本地模拟K线' : `${market === 'CN' ? '腾讯行情日线' : 'Yahoo Finance'} 1y`}</span>
      </div>
      <div className="mt-2">
        <ChartInsight
          summary="上图画净值相对 1.0 的变化，下图画从历史高点回落的幅度；两张图必须一起看。"
          how="收益接近时优先选回撤更浅、收益/回撤比更高的策略。"
          pitfall="回测忽略滑点与手续费且满仓进出，历史结果不代表未来收益，也不构成投资建议。"
        />
      </div>

      {/* 买卖点信号明细（与K线图同源） */}
      {stats.signalsBrief.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] text-[#d8dce6] font-medium mb-1.5">近期买卖点信号（点击K线图上的标记可看完整解读）</div>
          <div className="space-y-1">
            {stats.signalsBrief.map((s, i) => (
              <div key={i} className="flex items-start gap-2 rounded bg-[#14161d] px-2 py-1" title={s.meaning}>
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${s.type === 'buy' ? 'bg-[#f04452]' : 'bg-[#0ca678]'}`} />
                <span className="text-[10px] font-mono text-[#b0b5c0] shrink-0">{s.time}</span>
                <span className={`text-[10px] font-medium shrink-0 ${s.type === 'buy' ? 'text-[#f04452]' : 'text-[#0ca678]'}`}>
                  {s.type === 'buy' ? '买' : '卖'}
                </span>
                <span className="text-[10px] text-[#a4a9b5] truncate">{s.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1.5 text-[11px] text-[#636878] leading-relaxed">
        {stats.mode === 'long'
          ? `回测规则：与K线图同一套信号（MA10/30 金叉死叉 + RSI(14)超买超卖 + 布林边际），上升/震荡期买入做多、卖出兑现，满仓进出。`
          : `回测规则：个股当前处${stats.phase.label}（美股支持选入下跌趋势个股），系统切为反T模式——卖出信号触发高抛/做空、买入信号触发回补接回。`}
        忽略滑点与手续费，仅作策略能力度量，不构成投资建议。
      </div>
    </Panel>
  );
});
