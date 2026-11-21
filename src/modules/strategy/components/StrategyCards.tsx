import { memo, useState, useEffect, useCallback } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { Badge } from '../../../shared/components/Badge';
import { useStrategyMatch } from '../hooks/useStrategyMatch';
import { useStrategyFactors } from '../hooks/useStrategyFactors';
import { fetchStockCandles, type StockCandle } from '../../../services/api';
import type { Market } from '../../../stores/useAppStore';

interface Props {
  symbol: string | null;
  market: Market;
}

interface EnrichedScore {
  signal: { overall: number; sentiment: number; volatility: number; momentum: number; trend: number; industry: number };
  action: 'buy' | 'sell' | 'hold';
  heat: 'hot' | 'warm' | 'neutral' | 'cool' | 'cold';
  summary: string;
  conclusion: string;
  suggestions: string[];
}

function computeStockScore(
  candles: StockCandle[],
  macroScore: number,
  extra?: { sentiment?: number; industry?: number } | null,
): EnrichedScore | null {
  if (candles.length < 30) return null;

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const n = closes.length;

  const sentimentScore = extra?.sentiment ?? 50;
  const industryScore = extra?.industry ?? Math.round(macroScore * 0.5 + 25);

  const recent20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const prev20 = closes.slice(-40, -20).reduce((a, b) => a + b, 0) / 20;
  const trendChange = ((recent20 - prev20) / prev20) * 100;
  const trendScore = Math.max(0, Math.min(100, 50 + trendChange * 8));

  const recent5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const momentumChange = ((recent5 - recent20) / recent20) * 100;
  const momentumScore = Math.max(0, Math.min(100, 50 + momentumChange * 10));

  const avg = closes.reduce((a, b) => a + b, 0) / n;
  const variance = closes.reduce((s, c) => s + (c - avg) ** 2, 0) / n;
  const cv = Math.sqrt(variance) / avg;
  const volScore = Math.max(0, Math.min(100, 100 - cv * 300));

  let gains = 0, losses = 0;
  for (let i = n - 14; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rsi = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  const rsiScore = rsi > 70 ? 40 : rsi < 30 ? 80 : 50;

  const ma10 = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const ma30 = closes.slice(-30).reduce((a, b) => a + b, 0) / 30;
  const maScore = ma10 > ma30 ? 60 : 40;

  const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const prevVol = volumes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20;
  const volRatio = recentVol / (prevVol || 1);
  const volumeScore = Math.max(0, Math.min(100, 50 + (volRatio - 1) * 50));

  const high60 = Math.max(...closes.slice(-60));
  const low60 = Math.min(...closes.slice(-60));
  const pricePosition = high60 === low60 ? 50 : ((recent5 - low60) / (high60 - low60)) * 100;
  const posScore = pricePosition > 90 ? 40 : pricePosition < 10 ? 70 : 50;

  const overall = Math.round(
    trendScore * 0.20 + momentumScore * 0.13 + volScore * 0.11 +
    rsiScore * 0.10 + maScore * 0.10 + volumeScore * 0.08 + posScore * 0.08 +
    macroScore * 0.05 + sentimentScore * 0.07 + industryScore * 0.08,
  );

  let action: 'buy' | 'sell' | 'hold';
  let heat: 'hot' | 'warm' | 'neutral' | 'cool' | 'cold';
  if (overall >= 75) { action = 'buy'; heat = 'hot'; }
  else if (overall >= 60) { action = 'buy'; heat = 'warm'; }
  else if (overall >= 45) { action = 'hold'; heat = 'neutral'; }
  else if (overall >= 30) { action = 'sell'; heat = 'cool'; }
  else { action = 'sell'; heat = 'cold'; }

  const rsiLabel = rsi > 70 ? '超买' : rsi < 30 ? '超卖' : '中性';
  const trendLabel = trendChange > 2 ? '上升' : trendChange < -2 ? '下降' : '横盘';
  const volLabel = volRatio > 1.2 ? '放量' : volRatio < 0.8 ? '缩量' : '持平';

  const summary = [
    `趋势${trendLabel}(${trendChange.toFixed(1)}%)`,
    `RSI ${rsi.toFixed(0)}(${rsiLabel})`,
    ma10 > ma30 ? 'MA10>MA30(多头)' : 'MA10<MA30(空头)',
    `量能${volLabel}`,
    `产业${industryScore}`,
  ].join(' · ');

  const conclusions: Record<string, string> = {
    hot_buy: `综合 ${overall} 分（强多信号）。技术面全面向好——趋势${trendLabel}、RSI ${rsi.toFixed(0)}（${rsiLabel}）、均线多头排列，量能${volLabel}配合上涨。叠加宏观${macroScore}、情绪${sentimentScore}、产业${industryScore}三因子共振向上，短线动能充足，适合顺势做多，但止损不可忘。`,
    warm_buy: `综合 ${overall} 分（偏多信号）。多数指标向好，趋势${trendLabel}、RSI ${rsi.toFixed(0)}。但个别维度未完全共振（${volLabel}、价位在60日区间${pricePosition.toFixed(0)}%位置）。宏观${macroScore}/情绪${sentimentScore}/产业${industryScore}三因子整体偏暖，建议分批建仓，仓位控制在 30% 以内。`,
    neutral_hold: `综合 ${overall} 分（中性信号）。多空交织：趋势${trendLabel}、RSI ${rsi.toFixed(0)}（${rsiLabel}）、均线纠缠。量能${volLabel}，宏观${macroScore}、情绪${sentimentScore}、产业${industryScore}分化，方向不明朗。建议观望，等待 MA10 与 MA30 金叉/死叉确认后再行动。`,
    cool_sell: `综合 ${overall} 分（偏空信号）。技术面走弱——趋势${trendLabel}、RSI ${rsi.toFixed(0)}，均线有死叉风险，情绪${sentimentScore}/产业${industryScore}偏弱。已持仓建议减至 10% 以下或设紧止损，空仓等待企稳信号。`,
    cold_sell: `综合 ${overall} 分（强空信号）。技术面全面恶化——趋势${trendLabel}、RSI ${rsi.toFixed(0)}（${rsiLabel}）、均线空头排列、量能${volLabel}。宏观${macroScore}/情绪${sentimentScore}/产业${industryScore}三因子同步走弱，建议清仓避险，保存本金最重要。等 RSI 超卖反弹 + 放量企稳再回头。`,
  };
  const key = `${heat}_${action}`;
  const conclusion = conclusions[key] ?? conclusions.neutral_hold;

  const suggestions: string[] =
    action === 'buy'
      ? [
          `现价可开多，仓位不超过总资金 30%`,
          `止损线: 最近 5 日最低价下方 2%，跌破即刻离场`,
          `加仓点: MA10 回踩不破时追加 20% 仓位`,
          `止盈目标: 前高附近减半仓，剩余让利润奔跑`,
        ]
      : action === 'sell'
        ? [
            `建议清仓或减至 10% 以下观察仓`,
            `已持仓: 反抽 MA10 不过即离场`,
            `空仓: 等待 RSI 回到 30 以下 + MA10 走平再考虑试多`,
            `下一个支撑位关注近期成交量密集区`,
          ]
        : [
            `持仓不动，总仓位控制在 50% 以内`,
            `做T机会: 盘中急跌 2%+ 且放量时轻仓低吸，反弹 1.5% 即出`,
            `做T机会: 盘中急拉 3%+ 且缩量时减仓，回落接回`,
            `警戒线: MA10 下穿 MA30 时无条件减半仓`,
          ];

  return {
    signal: { overall, sentiment: Math.round(rsiScore), volatility: Math.round(volScore), momentum: Math.round(momentumScore), trend: Math.round(trendScore), industry: Math.round(industryScore) },
    action, heat, summary, conclusion, suggestions,
  };
}

export const StrategyCards = memo(function StrategyCards({ symbol, market }: Props) {
  const { decision: macroDecision, loading: macroLoading } = useStrategyMatch();
  const { factors } = useStrategyFactors(market, symbol);
  const [stockScore, setStockScore] = useState<EnrichedScore | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);

  const loadStockData = useCallback(async () => {
    if (!symbol) { setStockScore(null); return; }
    setLoadingStock(true);
    try {
      const candles = await fetchStockCandles(symbol, market, '3mo');
      const macroVal = macroDecision?.signal?.overall ?? 50;
      setStockScore(
        computeStockScore(candles, macroVal, {
          sentiment: factors?.sentiment?.score,
          industry: factors?.industry?.score,
        }),
      );
    } catch {
      setStockScore(null);
    }
    setLoadingStock(false);
  }, [symbol, market, macroDecision, factors]);

  useEffect(() => { loadStockData(); }, [loadStockData]);

  const decision = symbol ? stockScore : macroDecision;
  const loading = symbol ? loadingStock : macroLoading;
  const title = symbol ? `个股技术信号 · ${symbol}` : '大盘策略信号';

  if (loading || !decision) {
    return (
      <Panel title={title}>
        <div className="h-16 flex items-center justify-center text-[#636878] text-[12px]">信号计算中...</div>
      </Panel>
    );
  }

  const heatColors: Record<string, string> = { hot: '#f04452', warm: '#f59e4b', neutral: '#636878', cool: '#20c4d8', cold: '#4078ff' };
  const heatLabels: Record<string, string> = { hot: '强多', warm: '偏多', neutral: '中性', cool: '偏空', cold: '强空' };
  const actionLabels: Record<string, string> = { buy: '买入', sell: '卖出', hold: '持有' };

  const color = heatColors[(decision as any).heat ?? 'neutral'] || '#636878';
  const signal = decision.signal as any;
  const isStock = !!(symbol && stockScore);

  return (
    <div className="space-y-2">
      <div className="bg-[#0f1118] border border-[#1a1d26] rounded-[5px] p-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ border: `3px solid ${color}` }}>
            <span className="text-[18px] font-bold font-['JetBrains_Mono',Consolas,monospace]" style={{ color }}>{signal.overall}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[#d8dce6] font-medium">{title}</span>
              <Badge label={actionLabels[(decision as any).action]} type={(decision as any).action === 'buy' ? 'ok' : (decision as any).action === 'sell' ? 'warn' : 'info'} />
              <span className="text-[11px]" style={{ color }}>{heatLabels[(decision as any).heat]}</span>
            </div>
            <div className="text-[10.5px] text-[#b0b5c0] mt-1">{isStock ? stockScore?.summary : macroDecision?.summary ?? ''}</div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 mt-3">
          {[
            ...(isStock ? [
              { label: '趋势', val: signal.trend },
              { label: '动量', val: signal.momentum },
              { label: '波动', val: signal.volatility },
              { label: 'RSI', val: signal.sentiment },
              { label: '产业', val: signal.industry },
            ] : [
              { label: '情绪', val: signal.sentiment ?? 50 },
              { label: '波动', val: signal.volatility ?? 50 },
              { label: '利率', val: signal.rateEnvironment ?? 50 },
              { label: '信用', val: signal.creditMarket ?? 50 },
              { label: '宏观', val: signal.macroCycle ?? 50 },
            ]),
          ].map((d) => (
            <div key={d.label} className="text-center">
              <div className="w-full h-2 bg-[#1a1d26] rounded-full mb-1 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${d.val}%`, backgroundColor: d.val >= 60 ? '#0ca678' : d.val >= 45 ? '#f59e4b' : '#f04452' }} />
              </div>
              <div className="text-[10.5px] text-[#636878]">{d.label}</div>
              <div className="text-[11px] font-mono text-[#b0b5c0]">{d.val}</div>
            </div>
          ))}
        </div>
      </div>

      {isStock && stockScore && (
        <Panel title="综合解读（普通人视角）">
          <div className="text-[12px] text-[#d8dce6] leading-relaxed">{stockScore.conclusion}</div>
        </Panel>
      )}

      <Panel title="操作建议">
        <ul className="space-y-1.5">
          {((decision as any).suggestions as string[]).map((s: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-[11px] text-[#b0b5c0]">
              <span className="text-[#4078ff] mt-0.5">•</span>
              {s}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
});
