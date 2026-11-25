import { memo } from 'react';
import type { StructureSnapshot } from '../../../core/data/structure';

interface Props {
  structure: StructureSnapshot | null;
  loading: boolean;
}

function RsRow({ name, value, max, flow }: { name: string; value: number | null; max: number; flow: number | null }) {
  const v = value ?? 0;
  const positive = v >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-[4rem] shrink-0 truncate text-[0.6563rem] text-[#b0b5c0]" title={name}>{name}</span>
      <div className="relative h-[0.5rem] w-[11.25rem] shrink-0 rounded bg-[#151922]">
        <div
          className="absolute top-0 h-full rounded"
          style={{
            left: positive ? '50%' : `${50 - (Math.abs(v) / max) * 48}%`,
            width: `${(Math.abs(v) / max) * 48}%`,
            background: positive ? '#f04452' : '#0ca678',
            opacity: 0.75,
          }}
        />
        <div className="absolute left-1/2 top-0 h-full w-px bg-[#2a3040]" />
      </div>
      <span className="w-[3.125rem] shrink-0 text-right font-mono text-[0.625rem] tabular-nums" style={{ color: positive ? '#f04452' : '#0ca678' }}>
        {value === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp`}
      </span>
      {flow !== null && (
        <span className="w-[3.875rem] shrink-0 text-right font-mono text-[0.5938rem] text-[#636878] tabular-nums">
          {flow >= 0 ? '流入' : '流出'} {Math.abs(flow).toFixed(0)}亿
        </span>
      )}
    </div>
  );
}

export const StructureView = memo(function StructureView({ structure, loading }: Props) {
  if (loading && !structure) {
    return <div className="flex h-40 items-center justify-center text-[0.625rem] text-[#4d5364]">正在读取真实板块数据…</div>;
  }

  if (!structure || structure.source !== 'real') {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
        <div className="text-[0.6875rem] text-[#b0b5c0]">板块结构数据不可用</div>
        <div className="max-w-[26.25rem] text-[0.5938rem] leading-relaxed text-[#636878]">
          {structure?.note ?? '东财 / 腾讯 / 新浪板块源或 ETF 日线未返回。这里不使用模拟资金流替代。'}
        </div>
      </div>
    );
  }

  const max = structure.items.reduce((m, i) => Math.max(m, Math.abs(i.rs20 ?? 0)), 1);
  const isCN = structure.market === 'CN';
  // 腾讯行业榜同时给出 5 日与 20 日，二者不同说明有真实多周期历史；东财/新浪只有当日。
  const hasRsHistory = structure.items.some(
    (i) => i.rs5 !== null && i.rs20 !== null && Math.abs(i.rs5 - i.rs20) > 0.01,
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: '板块宽度', v: structure.breadth === null ? '—' : `${Math.round(structure.breadth)}/100` },
          { k: '离散度', v: structure.dispersion === null ? '—' : `${structure.dispersion.toFixed(1)}pp` },
          { k: '覆盖板块', v: `${structure.items.length} 个` },
        ].map((s) => (
          <div key={s.k} className="rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] px-2.5 py-2">
            <div className="text-[0.5313rem] text-[#4d5364]">{s.k}</div>
            <div className="font-mono text-[0.9375rem] text-[#d8dce6] tabular-nums">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="grid max-w-[51.25rem] gap-3 lg:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[0.625rem] text-[#f04452]">相对强势 · 前 5</div>
          <div className="space-y-1.5">
            {structure.top.map((i) => (
              <RsRow key={i.id} name={i.name} value={i.rs20} max={max} flow={i.flow} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[0.625rem] text-[#0ca678]">相对弱势 · 后 5</div>
          <div className="space-y-1.5">
            {structure.bottom.map((i) => (
              <RsRow key={i.id} name={i.name} value={i.rs20} max={max} flow={i.flow} />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded border-l-2 border-[#4078ff] bg-[rgba(64,120,255,0.05)] px-2.5 py-1.5 text-[0.5938rem] leading-relaxed text-[#8a8f9d]">
        {structure.note}
        {isCN &&
          (hasRsHistory
            ? ' 5/20 日涨跌来自腾讯行业榜；更长的资金流历史仍需本地逐日累积。'
            : ' 当前只有当日快照；要做“资金流 vs 价格”的滚动相关，需要本地逐日累积历史。')}
        {!isCN && ' RS = 板块 ETF 近 20 日收益 − SPY 近 20 日收益；正值代表跑赢基准。'}
      </div>
    </div>
  );
});
