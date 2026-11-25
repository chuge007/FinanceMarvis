import { memo, useEffect, useState } from 'react';
import { INDUSTRY_CHAIN, SEGMENT_LABEL, TW_CODES, type ChainNode } from '../../data/industryChain';
import { fetchTwseRevenue, type TwseRevenue } from '../../services/twse';

/**
 * 产业链视图：纵向按「芯片 → 代工 → 封测 → 整机 → 云」排列，
 * 每个节点给出「这一环在看什么」，台股标的挂真实月营收同比（TWSE 官方，T2 月频）。
 *
 * 只陈述事实：营收同比、环节位置、上下游关系；不写目标价、不给买卖建议。
 */
function yoyText(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '缺';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

const NodeCard = memo(function NodeCard({
  node,
  revenue,
}: {
  node: ChainNode;
  revenue: Record<string, TwseRevenue>;
}) {
  return (
    <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded bg-[rgba(64,120,255,0.14)] px-1.5 py-0.5 text-[0.5313rem] text-[#8aa8ff]">
          {SEGMENT_LABEL[node.segment]}
        </span>
        <span className="text-[0.7188rem] font-semibold text-[#d8dce6]">{node.name}</span>
        <span className="text-[0.5625rem] text-[#636878]">{node.focus}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {node.symbols.map((symbol) => {
          const tw = symbol.market === 'TW' ? revenue[symbol.code] : undefined;
          const yoy = tw?.yoy ?? null;
          const color = yoy === null ? '#636878' : yoy >= 0 ? '#0ca678' : '#f04452';
          return (
            <span
              key={`${symbol.market}-${symbol.code}`}
              className="flex items-center gap-1.5 rounded border border-[#1a1d26] px-1.5 py-0.5 text-[0.5625rem]"
              title={tw ? `${tw.name} ${tw.month} 月营收同比` : symbol.market === 'TW' ? '台股月营收暂缺' : '暂未接入个股行情'}
            >
              <span className="text-[#4d5364]">{symbol.market}</span>
              <span className="text-[#b0b5c0]">{symbol.name}</span>
              <span className="font-mono text-[0.5313rem] text-[#4d5364]">{symbol.code}</span>
              {symbol.market === 'TW' && (
                <span className="font-mono tabular-nums" style={{ color }}>
                  {yoyText(yoy)}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
});

export const IndustryPage = memo(function IndustryPage() {
  const [revenue, setRevenue] = useState<Record<string, TwseRevenue>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchTwseRevenue(TW_CODES)
      .then((data) => {
        if (alive) setRevenue(data);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const latestMonth = Object.values(revenue)[0]?.month ?? '';
  const up = Object.values(revenue).filter((r) => (r.yoy ?? 0) > 0).length;
  const total = Object.values(revenue).length;

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[0.6875rem] font-semibold text-[#d8dce6]">AI 产业链景气</span>
          <span className="text-[0.5625rem] text-[#636878]">
            台股月营收同比来自证交所开放数据{latestMonth ? ` · ${latestMonth}` : ''}
          </span>
          {loading ? (
            <span className="text-[0.5625rem] text-[#4078ff]">加载中…</span>
          ) : total > 0 ? (
            <span className="text-[0.5625rem] text-[#8a8f9d]">
              {total} 家已披露，{up} 家同比为正
            </span>
          ) : (
            <span className="text-[0.5625rem] text-[#f59e4b]">台股月营收当前不可用，同比显示「缺」</span>
          )}
        </div>
        <div className="mt-1 text-[0.5625rem] leading-relaxed text-[#4d5364]">
          顺序即资金传导顺序：算力芯片订单先动 → 代工月营收跟上 → 封测/整机滞后兑现 → 云厂资本开支确认需求。
          看背离比看绝对值有用：上游营收在涨、下游资本开支没跟，说明库存还在往前提。
        </div>
      </div>

      <div className="space-y-2">
        {INDUSTRY_CHAIN.map((node, index) => (
          <div key={node.id}>
            <NodeCard node={node} revenue={revenue} />
            {index < INDUSTRY_CHAIN.length - 1 && (
              <div className="flex justify-center py-0.5 text-[0.625rem] leading-none text-[#2a3040]">↓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
