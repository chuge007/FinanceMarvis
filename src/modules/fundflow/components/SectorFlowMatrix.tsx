import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useSectorFlow } from '../hooks/useSectorFlow';
import { useAppStore } from '../../../stores/useAppStore';

export const SectorFlowMatrix = memo(function SectorFlowMatrix() {
  const { data: sectors, loading } = useSectorFlow();
  const market = useAppStore((s) => s.market);
  const isCN = market === 'CN';

  if (!sectors.length) {
    return (
      <Panel title="板块资金流向" badge={loading ? '加载中' : '不可用'}>
        <div className="py-6 text-center text-[0.625rem] text-[#636878]">
          {loading ? '加载数据...' : '东财 / 腾讯 / 新浪板块源均不可用，暂不展示'}
        </div>
      </Panel>
    );
  }

  // 新浪只有价格口径（flowAvailable=false），此时按涨跌幅画条，不假装有净流入。
  const priceOnly = sectors.every((s) => s.flowAvailable === false);
  const source = sectors[0]?.source;
  const sourceLabel =
    source === 'tencent'
      ? '数据源: 腾讯行业榜 · 主力净流入(亿) + 5/20/60 日涨跌'
      : source === 'sina'
        ? '数据源: 新浪板块 · 仅当日涨跌（主力净流入不可用）'
        : source === 'eastmoney'
          ? '数据源: 东方财富 板块资金流 · 主力净流入(亿) · 每2分钟更新'
          : '数据源: 模型估算 · 美股无北向';

  const maxFlow = Math.max(...sectors.map((s) => Math.abs(s.netFlow)), 1);
  const maxPct = Math.max(...sectors.map((s) => Math.abs(s.pctChg)), 1);

  return (
    <Panel
      title="板块资金流向"
      badge={loading ? '加载中' : `${sectors.length}个板块 · ${priceOnly ? '按当日涨跌排序' : '按主力净流入排序'}`}
    >
      <div className="text-[0.6875rem] text-[#636878] mb-1.5">
        {isCN ? (priceOnly ? '红色=上涨 · 绿色=下跌' : '红色=净流入(主力做多) · 绿色=净流出') : 'Inflow vs Outflow'}
      </div>
      <div className="space-y-1.5">
        {sectors.map((s) => {
          const value = priceOnly ? s.pctChg : s.netFlow;
          const max = priceOnly ? maxPct : maxFlow;
          const widthPct = Math.min(100, (Math.abs(value) / max) * 100);
          const inColor = '#f04452';
          const outColor = '#0ca678';
          const color = value >= 0 ? inColor : outColor;
          const label = priceOnly
            ? `${s.pctChg >= 0 ? '+' : ''}${s.pctChg.toFixed(2)}%`
            : `${s.netFlow >= 0 ? '+' : '-'}${Math.abs(s.netFlow).toFixed(1)}${isCN ? '亿' : 'M'}`;
          return (
            <div key={s.id}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[0.625rem] text-[#d8dce6] w-14 shrink-0 truncate" title={s.name}>{s.name}</span>
                <div className="flex-1 h-[0.5625rem] relative bg-[#1a1d26] rounded-full overflow-hidden">
                  {/* 中性基线在中间 */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#2a2d3a]" />
                  {value >= 0 ? (
                    <div className="absolute left-1/2 top-0 bottom-0 rounded-r-full"
                      style={{ width: `${widthPct / 2}%`, backgroundColor: inColor, opacity: 0.9 }} />
                  ) : (
                    <div className="absolute right-1/2 top-0 bottom-0 rounded-l-full"
                      style={{ width: `${widthPct / 2}%`, backgroundColor: outColor, opacity: 0.9 }} />
                  )}
                </div>
                <span className="text-[0.6875rem] font-mono w-14 text-right shrink-0 whitespace-nowrap" style={{ color }}>
                  {label}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-[3.75rem]">
                <span className={`text-[0.6875rem] font-mono shrink-0 ${s.pctChg >= 0 ? 'text-[#f04452]' : 'text-[#0ca678]'}`}>
                  {s.pctChg >= 0 ? '+' : ''}{s.pctChg.toFixed(2)}%
                </span>
                {isCN && s.source === 'eastmoney' && typeof s.mainRatio === 'number' && (
                  <span className="text-[0.6875rem] text-[#4078ff] font-mono whitespace-nowrap shrink-0">主力占比 {s.mainRatio.toFixed(1)}%</span>
                )}
                {isCN && s.source === 'tencent' && s.rs20 !== undefined && (
                  <span className="text-[0.6875rem] text-[#8a8f9d] font-mono whitespace-nowrap shrink-0">
                    20日 {s.rs20 >= 0 ? '+' : ''}{s.rs20.toFixed(1)}%
                  </span>
                )}
                <span className="text-[0.6875rem] text-[#636878] truncate">{s.reading}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[0.6875rem] text-[#636878] mt-2">{sourceLabel}</div>
    </Panel>
  );
});
