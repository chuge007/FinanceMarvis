import { memo, useEffect, useState } from 'react';
import { usePositioningStore } from '../../stores/usePositioningStore';
import { fetchStockFlowRank, type StockFlowRow } from '../../services/stockFlow';
import { termStateLabel } from '../../services/volTerm';

/**
 * 资金流分析：先大盘、再个股。
 *
 * 大盘层用已有的期权情绪与期限结构（T1 日频），个股层用东财主力净流入排行（T0/T1）。
 * 两层都只陈述「钱在往哪走」，不给买卖建议；缺数据就显示「缺」。
 */
function pctText(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '缺';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function wanText(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '缺';
  const abs = Math.abs(v);
  if (abs >= 10000) return `${v >= 0 ? '+' : ''}${(v / 10000).toFixed(2)}亿`;
  return `${v >= 0 ? '+' : ''}${v.toFixed(0)}万`;
}

const StockFlowTable = memo(function StockFlowTable({ rows }: { rows: StockFlowRow[] }) {
  if (!rows.length) {
    return (
      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-4 text-[0.6563rem] text-[#636878]">
        个股资金流当前不可用（东财接口未返回数据），不显示演示值。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118]">
      <table className="w-full min-w-[34rem] border-collapse text-[0.625rem]">
        <thead>
          <tr className="border-b border-[#1a1d26] text-[#636878]">
            <th className="px-2 py-1.5 text-left font-normal">代码 / 名称</th>
            <th className="px-2 py-1.5 text-right font-normal">现价</th>
            <th className="px-2 py-1.5 text-right font-normal">涨跌幅</th>
            <th className="px-2 py-1.5 text-right font-normal">主力净流入</th>
            <th className="px-2 py-1.5 text-right font-normal">主力净占比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const inflow = row.mainNetInWan ?? null;
            const color = inflow === null ? '#636878' : inflow >= 0 ? '#f04452' : '#0ca678';
            const change = row.changePct;
            const changeColor = change === null ? '#636878' : change >= 0 ? '#f04452' : '#0ca678';
            return (
              <tr key={row.code} className="border-b border-[rgba(26,29,38,0.6)] last:border-0 hover:bg-[rgba(255,255,255,0.02)]">
                <td className="px-2 py-1.5">
                  <span className="font-mono text-[#8a8f9d]">{row.code}</span>
                  <span className="ml-1.5 text-[#d8dce6]">{row.name}</span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[#b0b5c0]">
                  {row.price === null ? '缺' : row.price.toFixed(2)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums" style={{ color: changeColor }}>
                  {pctText(change)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums" style={{ color }}>
                  {wanText(inflow)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums" style={{ color }}>
                  {pctText(row.mainNetPct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export const FlowPage = memo(function FlowPage() {
  const term = usePositioningStore((s) => s.term);
  const options = usePositioningStore((s) => s.options);
  const loadPositioning = usePositioningStore((s) => s.load);

  const [rows, setRows] = useState<StockFlowRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadPositioning();
  }, [loadPositioning]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchStockFlowRank(30)
      .then((list) => {
        if (alive) setRows(list);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const totalPutCall = options?.ratios.find((r) => /TOTAL/i.test(r.officialName));
  const vix = options?.quotes['^VIX'];
  const vix3m = options?.quotes['^VIX3M'];

  const inflowCount = rows.filter((r) => (r.mainNetInWan ?? 0) > 0).length;
  const divergence = rows.filter(
    (r) => (r.mainNetInWan ?? 0) > 0 && (r.changePct ?? 0) < 0,
  ).length;

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[0.6875rem] font-semibold text-[#d8dce6]">大盘情绪带</span>
          <span className="flex items-center gap-1 text-[0.625rem] text-[#8a8f9d]">
            全市场 Put/Call
            <span className="font-mono tabular-nums text-[#d8dce6]">
              {totalPutCall?.value === null || totalPutCall?.value === undefined ? '缺' : totalPutCall.value.toFixed(2)}
            </span>
            {totalPutCall?.reading && <span className="text-[#4d5364]">{totalPutCall.reading}</span>}
          </span>
          <span className="flex items-center gap-1 text-[0.625rem] text-[#8a8f9d]">
            VIX
            <span className="font-mono tabular-nums text-[#d8dce6]">{vix ? vix.price.toFixed(2) : '缺'}</span>
            <span className="text-[#4d5364]">/ VIX3M</span>
            <span className="font-mono tabular-nums text-[#d8dce6]">{vix3m ? vix3m.price.toFixed(2) : '缺'}</span>
          </span>
          <span className="flex items-center gap-1 text-[0.625rem] text-[#8a8f9d]">
            期限结构
            <span className="text-[#d8dce6]">{term?.source === 'real' && term.latest !== null ? termStateLabel(term.state) : '缺'}</span>
            {term?.latest !== null && term?.latest !== undefined && (
              <span className="font-mono tabular-nums text-[#636878]">{term.latest.toFixed(3)}</span>
            )}
          </span>
        </div>
        <div className="mt-1 text-[0.5938rem] text-[#636878]">
          {rows.length
            ? `资金流前 ${rows.length} 只里，${inflowCount} 只主力净流入；其中 ${divergence} 只「钱进价跌」，属于需要单独看一眼的背离。`
            : '个股资金流不可用，大盘层可单独参考。'}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[0.6875rem] font-semibold text-[#d8dce6]">个股资金流排行</span>
          <span className="text-[0.5313rem] text-[#4d5364]">
            按主力净流入降序 · 红为流入、绿为流出 · 数据来自东方财富公开接口
          </span>
        </div>
        {loading ? (
          <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-4 text-[0.6563rem] text-[#636878]">
            加载中…
          </div>
        ) : (
          <StockFlowTable rows={rows} />
        )}
      </div>
    </div>
  );
});
