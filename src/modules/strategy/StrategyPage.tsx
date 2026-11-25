import { memo, useEffect } from 'react';
import { useAppStore, type Market } from '../../stores/useAppStore';
import { ModuleRelationshipFooter } from '../../shared/components/ModuleRelationshipFooter';
import { EventLinkageFlow } from '../../shared/components/EventLinkageFlow';
import { StrategyCards } from './components/StrategyCards';
import { StrategyChart } from './components/StrategyChart';
import { GlobalFactorPanel } from './components/GlobalFactorPanel';
import { BacktestPanel } from './components/BacktestPanel';
import { CandidatePool } from './components/CandidatePool';
import { ExecutionRules } from './components/ExecutionRules';
import { useCandidates } from './hooks/useCandidates';

/** 做T策略核心：以「综合选股」为入口，不做下拉选择——
 *  进入页面即自动锁定当前市场综合选股第一名并展示其K线具体信息；
 *  在候选池列表点击任意一行，该股K线盘面与回测立即联动。 */
export const StrategyPage = memo(function StrategyPage() {
  const { market, selectedSymbol, setSelectedSymbol } = useAppStore();
  const candidates = useCandidates();
  const list = market === 'US' ? candidates.usShare : candidates.aShare;

  // 注重选股策略：默认选中「综合选股第一名」（最有性价比 × 上涨希望），保证进页面即有具体K线信息
  useEffect(() => {
    if (!list.length) return;
    if (selectedSymbol && list.some((c) => c.symbol === selectedSymbol)) return;
    setSelectedSymbol(list[0].symbol);
  }, [list, selectedSymbol, setSelectedSymbol]);

  // 切换市场时重新拉取该市场候选池
  useEffect(() => {
    candidates.refresh(market);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  const selected = list.find((c) => c.symbol === selectedSymbol) ?? null;
  const top3 = list.slice(0, 3);
  const marketLabel = market === 'US' ? '美股' : 'A股';

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-[0.8125rem] font-bold text-[#d8dce6]">做T策略</h2>
          {selected && (
            <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1a1d26] rounded px-2.5 py-1">
              <span className="text-[0.625rem] text-[#636878]">当前标的</span>
              <span className="text-[0.6875rem] font-['JetBrains_Mono',Consolas,monospace] text-[#4078ff]">{selected.symbol}</span>
              <span className="text-[0.625rem] text-[#b0b5c0]">{selected.name}</span>
              <span className="text-[0.5625rem] px-1 py-px rounded bg-[rgba(64,120,255,0.14)] text-[#4078ff]">{marketLabel}</span>
              <span className="text-[0.625rem] text-[#636878]">综合 {selected.score}</span>
              <span className="text-[0.625rem] font-['JetBrains_Mono',Consolas,monospace] tabular-nums text-[#0ca678]">性价比 {selected.valueScore}</span>
              <span className="text-[0.625rem] font-['JetBrains_Mono',Consolas,monospace] tabular-nums text-[#4078ff]">上涨希望 {selected.upsideScore}</span>
            </div>
          )}
          <span className="text-[0.625rem] text-[#636878]">点击候选池任一行 · 立即查看该股K线具体信息</span>
        </div>
        <span className="shrink-0 text-[0.625rem] text-[#636878]">分析周期：日线（当前版本固定，不支持 1D/5D 切换）</span>
      </div>

      {/* 最优选股速览（前三）：彰显「综合市场信息选最优」的选股策略入口 */}
      {top3.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[0.625rem] text-[#636878]">综合选股 TOP3</span>
          {top3.map((c, i) => {
            const active = selectedSymbol === c.symbol;
            return (
              <button
                key={c.symbol}
                onClick={() => setSelectedSymbol(c.symbol)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.6563rem] border transition-colors ${
                  active
                    ? 'bg-[rgba(64,120,255,0.14)] border-[#4078ff] text-[#d8dce6]'
                    : 'bg-[#0d1117] border-[#1a1d26] text-[#b0b5c0] hover:border-[#4078ff]'
                }`}
              >
                <span className={`font-['JetBrains_Mono',Consolas,monospace] ${i === 0 ? 'text-[#f59e4b]' : 'text-[#636878]'}`}>#{i + 1}</span>
                <span className="font-['JetBrains_Mono',Consolas,monospace]">{c.symbol}</span>
                <span className="text-[0.5938rem] text-[#636878]">{c.name}</span>
                <span className="font-['JetBrains_Mono',Consolas,monospace] tabular-nums" style={{ color: active ? '#4078ff' : '#b0b5c0' }}>{c.score}</span>
                <span
                  className="font-['JetBrains_Mono',Consolas,monospace] tabular-nums text-[0.5625rem] px-1 rounded"
                  style={{ color: '#0ca678', backgroundColor: 'rgba(12,166,120,0.10)' }}
                  title="性价比（回撤保护 / 低风险）"
                >价{c.valueScore}</span>
                <span
                  className="font-['JetBrains_Mono',Consolas,monospace] tabular-nums text-[0.5625rem] px-1 rounded"
                  style={{ color: '#4078ff', backgroundColor: 'rgba(64,120,255,0.10)' }}
                  title="上涨希望（趋势+题材+资金合力）"
                >涨{c.upsideScore}</span>
              </button>
            );
          })}
        </div>
      )}

      <StrategyCards symbol={selectedSymbol} market={market} />
      <GlobalFactorPanel symbol={selectedSymbol} market={market} />
      {/* 选股引擎列表紧邻 K 线上方：点击候选行 → 下方 K 线具体信息立即联动，无需滚动分隔 */}
      <CandidatePool market={market} candidates={candidates} />
      <StrategyChart symbol={selectedSymbol} market={market} />
      <BacktestPanel symbol={selectedSymbol} market={market} />
      <EventLinkageFlow module="strategy" />
      <ExecutionRules />
      <ModuleRelationshipFooter module="strategy" />
    </div>
  );
});
