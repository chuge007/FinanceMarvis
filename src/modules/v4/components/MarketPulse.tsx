/**
 * 市场脉搏：把已经抓到的快照数据直接铺在决策页，
 * 不再让默认页空着等用户先手工添加观察标的。
 *
 * 数据来自 cn:sector-flow、cn:breadth、us:options-sentiment、global:stablecoins、
 * global:calendar；每个数字都带来源与数据日期，取不到就写不可得。
 */
import { memo } from 'react';
import { useSnapshot } from '../../../core/data/hooks';

type Sector = { name?: string; changePct?: number; mainNetInflow?: number; mainNetRatio?: number };
type Quote = { name?: string; symbol?: string; price?: number; changePct?: number };
type Coin = { symbol?: string; name?: string; marketCap?: number };
type Event = { publicDate?: string; title?: string; country?: string; importance?: number; actual?: string | null; forecast?: string | null };

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">{title}</h3>
        {hint && <span className="text-[0.6875rem] text-[#4d5364]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Na({ reason }: { reason?: string }) {
  return <div className="py-4 text-center text-[0.8125rem] text-[#f5a524]">{reason ?? '不可得'}</div>;
}

export const MarketPulse = memo(function MarketPulse() {
  const snap = useSnapshot<Record<string, any>>();
  const s = snap.data?.snapshots ?? {};

  const sector = s['cn:sector-flow'];
  const breadth = s['cn:breadth'];
  const options = s['us:options-sentiment'];
  const stable = s['global:stablecoins'];
  const calendar = s['global:calendar'];
  const quotes = s['cn:quote-batch'];

  const events: Event[] = calendar?.events ?? [];
  const soon = events.filter((e) => e.actual === '' || e.actual == null).slice(0, 8);
  const sectors: Sector[] = sector?.rows ?? [];
  const flowRows = [...sectors].sort((a, b) => Number(b.mainNetInflow ?? 0) - Number(a.mainNetInflow ?? 0)).slice(0, 8);
  const up = Number(breadth?.up ?? 0);
  const down = Number(breadth?.down ?? 0);
  const breadthTotal = up + down;
  const upPct = breadthTotal ? (up / breadthTotal) * 100 : null;
  const bigCoins: Coin[] = stable?.coins ?? [];

  return (
    <div className="space-y-3 p-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border border-[#151823] bg-[#0b0d13] p-2.5">
          <div className="text-[0.75rem] text-[#636878]">行业板块宽度</div>
          <div className="mt-1 font-mono text-[1.125rem] text-[#d8dce6]">
            {breadthTotal ? `${upPct?.toFixed(0)}% 上涨` : '—'}
          </div>
          <div className="mt-0.5 text-[0.6875rem] text-[#4d5364]">上涨 {up} / 下跌 {down} / 共 {breadth?.total ?? 0} 个行业</div>
        </div>
        <div className="rounded border border-[#151823] bg-[#0b0d13] p-2.5">
          <div className="text-[0.75rem] text-[#636878]">CBOE 期权 PCR</div>
          <div className="mt-1 font-mono text-[1.125rem] text-[#d8dce6]">
            {options?.ratios?.['Equity P/C'] != null ? options.ratios['Equity P/C'].toFixed(3) : '—'}
          </div>
          <div className="mt-0.5 text-[0.6875rem] text-[#4d5364]">
            {options?.asOf ?? '不可得'} · {options?.available ? 'CBOE 官方' : '接口不可得'}
          </div>
        </div>
        <div className="rounded border border-[#151823] bg-[#0b0d13] p-2.5">
          <div className="text-[0.75rem] text-[#636878]">稳定币总市值</div>
          <div className="mt-1 font-mono text-[1.125rem] text-[#d8dce6]">
            {stable?.total != null ? `$${(stable.total / 1e9).toFixed(0)}B` : '—'}
          </div>
          <div className="mt-0.5 text-[0.6875rem] text-[#4d5364]">DefiLlama · {stable?.asOf ?? '不可得'}</div>
        </div>
        <div className="rounded border border-[#151823] bg-[#0b0d13] p-2.5">
          <div className="text-[0.75rem] text-[#636878]">A 股指数快照</div>
          <div className="mt-1 font-mono text-[1.125rem] text-[#d8dce6]">
            {(quotes?.quotes ?? []).length || '—'}
          </div>
          <div className="mt-0.5 text-[0.6875rem] text-[#4d5364]">腾讯实时 · {quotes?.quotes?.[0]?.asOf ?? '—'}</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="板块主力净流入 Top 8" hint={sector?.available ? '腾讯行业榜 · 亿元' : '不可得'}>
          {flowRows.length === 0 ? (
            <Na reason={sector?.reason ?? '板块资金流暂不可得'} />
          ) : (
            flowRows.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b border-[#151823] py-1 last:border-0">
                <span className="truncate text-[0.8125rem] text-[#b0b5c0]">{r.name}</span>
                <span className="font-mono text-[0.8125rem] text-[#b0b5c0]">{Number(r.changePct).toFixed(2)}%</span>
                <span className={`font-mono text-[0.8125rem] ${Number(r.mainNetInflow) >= 0 ? 'text-[#e5484d]' : 'text-[#30a46c]'}`}>
                  {Number(r.mainNetInflow).toFixed(2)} 亿
                </span>
              </div>
            ))
          )}
        </Panel>

        <Panel title="待发布的重要事件" hint="WSCN · 未来 14 天">
          {soon.length === 0 ? (
            <Na reason={calendar?.reason ?? '暂无待发布事件'} />
          ) : (
            soon.map((e, i) => (
              <div key={i} className="flex items-start gap-2 border-b border-[#151823] py-1 last:border-0">
                <span className="w-[4.5rem] shrink-0 font-mono text-[0.75rem] text-[#636878]">{e.publicDate}</span>
                <span className="w-[3rem] shrink-0 text-[0.75rem] text-[#636878]">{e.country}</span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-[#b0b5c0]" title={e.title}>{e.title}</span>
                <span className="text-[0.75rem] text-[#f5a524]">预期 {e.forecast ?? '—'}</span>
              </div>
            ))
          )}
        </Panel>
      </div>

      {bigCoins.length > 0 && (
        <Panel title="稳定币结构" hint="DefiLlama">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {bigCoins.slice(0, 8).map((c, i) => (
              <div key={i} className="flex justify-between rounded border border-[#151823] bg-[#0b0d13] px-2 py-1.5">
                <span className="text-[0.8125rem] text-[#b0b5c0]">{c.symbol}</span>
                <span className="font-mono text-[0.8125rem] text-[#d8dce6]">${(Number(c.marketCap) / 1e9).toFixed(1)}B</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
});
