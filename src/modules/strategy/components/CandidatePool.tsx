import { memo, useState } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { Sparkline } from '../../../shared/components/Sparkline';
import { useCandidates, GROUP_LABEL, type Candidate } from '../hooks/useCandidates';
import { useAppStore, type Market } from '../../../stores/useAppStore';
import { directionColor } from '../../../shared/utils/colors';

interface Props {
  market: Market;
  /** 由父级 StrategyPage 统一承载的候选池数据（升格选股状态，避免重复请求行情） */
  candidates: ReturnType<typeof useCandidates>;
}

const GROUP_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  safeUptrend: { text: '#0ca678', bg: 'rgba(12,166,120,0.10)', border: 'rgba(12,166,120,0.30)' },
  oversoldRebound: { text: '#f59e4b', bg: 'rgba(245,158,75,0.10)', border: 'rgba(245,158,75,0.30)' },
  watch: { text: '#636878', bg: 'rgba(99,104,120,0.12)', border: 'rgba(99,104,120,0.30)' },
};

const VERDICT_STYLE: Record<string, string> = {
  利好: '#0ca678',
  利空: '#f04452',
  中性: '#a4a9b5',
};

function filterCandidates(list: Candidate[], query: string): Candidate[] {
  if (!query.trim()) return list;
  const q = query.toLowerCase();
  return list.filter(
    (c) => c.symbol.toLowerCase().includes(q) || c.name.includes(q) || c.thesis.includes(q)
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1 bg-[#1a1d26] rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, value))}%`, backgroundColor: color }} />
    </div>
  );
}

export const CandidatePool = memo(function CandidatePool({ market, candidates }: Props) {
  const { aShare, usShare, quotes, marketEnv, envSource, refreshing, lastUpdated, refresh } = candidates;
  const { selectedSymbol, setSelectedSymbol } = useAppStore();
  const [search, setSearch] = useState('');

  const list = market === 'US' ? usShare : aShare;
  const filtered = filterCandidates(list, search);
  const title = market === 'US' ? '美股市场' : 'A股市场';
  const safeCount = list.filter(c => c.group === 'safeUptrend').length;
  const reboundCount = list.filter(c => c.group === 'oversoldRebound').length;
  const envColor = !marketEnv ? '#636878'
    : marketEnv.temperature === 'hot' ? '#f59e4b'
    : marketEnv.temperature === 'cold' ? '#4078ff'
    : '#0ca678';
  const envLabel = !marketEnv ? '环境未接入'
    : marketEnv.temperature === 'hot' ? `情绪高涨·贪婪 ${marketEnv.fearGreed}`
    : marketEnv.temperature === 'cold' ? `避险降温·恐慌 ${marketEnv.fearGreed}`
    : `中性偏暖·${marketEnv.fearGreed}`;

  const handlePick = (symbol: string) => {
    // 选股 → 做T → 回测 闭环：点击候选即切换K线与回测标的
    setSelectedSymbol(null);
    setTimeout(() => setSelectedSymbol(symbol), 0);
  };

  return (
    <Panel
      title="候选池筛选 · 综合选股引擎"
      badge={lastUpdated ? `更新于 ${lastUpdated}` : undefined}
      extra={
        <button
          onClick={() => refresh(market)}
          disabled={refreshing}
          className="px-2 py-1 rounded text-[10px] font-['JetBrains_Mono',Consolas,monospace] bg-[rgba(64,120,255,0.12)] text-[#4078ff] border border-[rgba(64,120,255,0.25)] hover:bg-[rgba(64,120,255,0.2)] disabled:opacity-50"
        >
          {refreshing ? '选股分析中…' : '刷新重选股'}
        </button>
      }
    >
      <div className="space-y-3">
        {/* 选股环境条（动态市场环境） */}
        <div className="flex items-center gap-3 flex-wrap bg-[#0d1117] border border-[#1a1d26] rounded px-3 py-2">
          <span className="text-[10px] text-[#636878]">市场环境</span>
          <span className="text-[11px] font-medium" style={{ color: envColor }}>
            {envLabel}
          </span>
          <span className="text-[10.5px] text-[#636878]">（{envSource}）</span>
          <div className="flex-1" />
          <span className="text-[11px] text-[#0ca678]">安全上涨 {safeCount}</span>
          <span className="text-[11px] text-[#f59e4b]">超跌例外 {reboundCount}</span>
          <span className="text-[11px] text-[#636878]">共 {list.length} 只</span>
        </div>

        <input
          type="text"
          placeholder="搜索代码 / 名称 / 关键词 …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#0d1117] border border-[#1a1d26] rounded px-2.5 py-1.5 text-[10.5px] text-[#d8dce6] placeholder-[#636878] focus:outline-none focus:border-[#4078ff] font-['JetBrains_Mono',Consolas,monospace]"
        />

        <div>
          <div className="text-[10px] text-[#d8dce6] font-medium mb-2">
            {title}{' '}
            <span className="text-[#636878]">({list.length})</span>
            <span className="ml-2 text-[10.5px] text-[#636878]">点击行 → 联动下方 K线盘面 + 做实盘策略回测</span>
          </div>
          <div className="overflow-y-auto max-h-[420px] scrollbar-thin">
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="text-[#636878] border-b border-[#1a1d26] sticky top-0 bg-[#0d1117]">
                  <th className="text-left py-1.5 font-medium w-7">#</th>
                  <th className="text-left py-1.5 font-medium">代码</th>
                  <th className="text-left py-1.5 font-medium">名称</th>
                  <th className="text-right py-1.5 font-medium">现价</th>
                  <th className="text-right py-1.5 font-medium">当日</th>
                  <th className="text-center py-1.5 font-medium">安全度</th>
                  <th className="text-center py-1.5 font-medium">动能/趋势</th>
                  <th className="text-center py-1.5 font-medium" title="回撤保护 / 低风险防御得分">性价比</th>
                  <th className="text-center py-1.5 font-medium" title="趋势+题材+资金合力，上行空间得分">上涨希望</th>
                  <th className="text-center py-1.5 font-medium">入选组</th>
                  <th className="text-left py-1.5 font-medium w-[34%]">选股逻辑 · 四维解读</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const q = quotes[c.symbol];
                  const changePct = q ? q.changePercent : c.change;
                  const dir = changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat';
                  const groupStyle = GROUP_STYLE[c.group] ?? GROUP_STYLE.watch;
                  const isSelected = selectedSymbol === c.symbol;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => handlePick(c.symbol)}
                      className={`border-b border-[rgba(255,255,255,0.02)] cursor-pointer hover:bg-[rgba(255,255,255,0.03)] ${isSelected ? 'bg-[rgba(64,120,255,0.06)]' : ''}`}
                    >
                      <td className="py-2 text-[#636878]">{i + 1}</td>
                      <td className="py-2 font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6]">
                        {c.symbol}
                        {q && (
                          <span className="ml-1 text-[10px] px-0.5 rounded bg-[rgba(64,120,255,0.15)] text-[#4078ff]">
                            {q.source === 'tencent' ? '腾讯' : 'Yahoo'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-[#d8dce6]">{c.name}</td>
                      <td className="py-2 text-right font-['JetBrains_Mono',Consolas,monospace] tabular-nums text-[#b0b5c0]">
                        {q ? q.price.toFixed(2) : '—'}
                      </td>
                      <td className="py-2 text-right font-['JetBrains_Mono',Consolas,monospace] tabular-nums" style={{ color: directionColor(dir) }}>
                        {changePct > 0 ? '+' : ''}{changePct.toFixed(2)}%
                      </td>
                      <td className="py-2 w-[64px]">
                        <div className="flex items-center gap-1.5">
                          <ScoreBar value={c.safetyScore} color={c.safetyScore >= 72 ? '#0ca678' : c.safetyScore >= 55 ? '#f59e4b' : '#f04452'} />
                          <span className="text-[11px] font-mono text-[#b0b5c0] tabular-nums w-7 text-right">{c.safetyScore}</span>
                        </div>
                      </td>
                      <td className="py-2 w-[64px]">
                        <div className="flex items-center gap-1.5">
                          <ScoreBar value={c.trendScore} color={c.trendScore >= 62 ? '#4078ff' : c.trendScore < 45 ? '#f04452' : '#f59e4b'} />
                          <span className="text-[11px] font-mono text-[#b0b5c0] tabular-nums w-7 text-right">{c.trendScore}</span>
                        </div>
                      </td>
                      <td className="py-2 w-[64px]">
                        <div className="flex items-center gap-1.5">
                          <ScoreBar value={c.valueScore} color={c.valueScore >= 72 ? '#0ca678' : c.valueScore >= 55 ? '#f59e4b' : '#f04452'} />
                          <span className="text-[11px] font-mono text-[#b0b5c0] tabular-nums w-7 text-right">{c.valueScore}</span>
                        </div>
                      </td>
                      <td className="py-2 w-[64px]">
                        <div className="flex items-center gap-1.5">
                          <ScoreBar value={c.upsideScore} color={c.upsideScore >= 65 ? '#4078ff' : c.upsideScore < 48 ? '#f04452' : '#f59e4b'} />
                          <span className="text-[11px] font-mono text-[#b0b5c0] tabular-nums w-7 text-right">{c.upsideScore}</span>
                        </div>
                      </td>
                      <td className="py-2 text-center">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10.5px] font-medium whitespace-nowrap"
                          style={{ color: groupStyle.text, backgroundColor: groupStyle.bg, border: `1px solid ${groupStyle.border}` }}
                        >
                          {GROUP_LABEL[c.group]}
                        </span>
                      </td>
                      <td className="py-2 text-[#636878]">
                        <div className="text-[10px] text-[#a4a9b5] leading-snug">{c.thesis}</div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {(c.reasons ?? []).map((r, ri) => (
                            <span
                              key={ri}
                              className="text-[10px] px-1 py-px rounded"
                              style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: VERDICT_STYLE[r.verdict] }}
                              title={r.text}
                            >
                              {r.label} {r.verdict === '利好' ? '↑' : r.verdict === '利空' ? '↓' : '—'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 text-center" style={{ display: 'none' }}>
                        <Sparkline data={c.sparkline} width={55} height={18} color={changePct > 0 ? '#f04452' : '#0ca678'} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="text-[10.5px] text-[#636878] leading-relaxed">
          选股逻辑：安全度(30%) + 动能/趋势(25%) + 题材炒作(20%) + 资金流(15%) + 市场环境(10%) 加权。
          性价比 = 安全度为主的防御得分（回撤保护）；上涨希望 = 趋势+题材+资金合力（上行空间）；双高 = 最有性价比的上涨标的。
          实时涨跌来自行情（A股=腾讯 · 美股=Yahoo），恐惧贪婪指数驱动市场环境维度。
          {market === 'US' && ' 美股例外：下跌趋势 / 当日走弱的标的也会进入“超跌反弹·例外”组，供博反弹与做空观察。'}
        </div>
      </div>
    </Panel>
  );
});
