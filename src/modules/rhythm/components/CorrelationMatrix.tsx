import { memo, useMemo, useState } from 'react';
import type { RhythmSnapshot } from '../services/rhythm';
import { rollingCorrelation } from '../../../shared/utils/seriesStats';
import { Panel } from '../../../shared/components/Panel';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';

const WINDOWS = [20, 60, 120] as const;

interface Props { snapshot: RhythmSnapshot | null; }

function cellColor(v: number | null) {
  if (v === null) return 'rgba(99,104,120,0.08)';
  const a = Math.min(0.55, Math.abs(v) * 0.55 + 0.06);
  return v >= 0 ? `rgba(240,68,82,${a})` : `rgba(64,120,255,${a})`;
}

export const CorrelationMatrix = memo(function CorrelationMatrix({ snapshot }: Props) {
  const [windowSize, setWindowSize] = useState<(typeof WINDOWS)[number]>(60);
  const [method, setMethod] = useState<'pearson' | 'spearman'>('pearson');

  const model = useMemo(() => {
    const daily = Object.values(snapshot?.series ?? {}).filter((s) => s.frequency === '日度' && s.points.length >= windowSize + 20);
    if (daily.length < 2) return null;

    const maps = daily.map((s) => new Map(s.points.map((p) => [p.date, p.value])));
    const dateSet = new Set(maps[0].keys());
    maps.slice(1).forEach((m) => { for (const d of [...dateSet]) if (!m.has(d)) dateSet.delete(d); });
    const dates = [...dateSet].sort().slice(-Math.max(180, windowSize * 2));
    if (dates.length < windowSize + 20) return null;

    const cols = daily.map((s) => ({ id: s.id, name: s.name.replace(/\s*\(.*\)/, ''), values: dates.map((d) => maps[daily.findIndex((x) => x.id === s.id)]!.get(d) as number) }));
    const current = cols.map((a) => cols.map((b) => a.id === b.id ? 1 : rollingCorrelation(a.values, b.values, windowSize, method)));
    const back = 60;
    const previous = cols.map((a) => cols.map((b) => {
      if (a.id === b.id) return 1;
      const av = a.values.slice(0, -back), bv = b.values.slice(0, -back);
      return rollingCorrelation(av, bv, windowSize, method);
    }));

    let biggest = { label: '', from: 0, to: 0, delta: 0 };
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        const c = current[i][j], p = previous[i][j];
        if (c === null || p === null) continue;
        const delta = c - p;
        if (Math.abs(delta) > Math.abs(biggest.delta)) biggest = { label: `${cols[i].name} ↔ ${cols[j].name}`, from: p, to: c, delta };
      }
    }
    return { cols, current, previous, biggest };
  }, [snapshot, windowSize, method]);

  return (
    <Panel
      title="滚动相关性矩阵"
      hint="分散化是否还有效"
      extra={<ChartHeader source={model ? 'real' : 'missing'} note={`${windowSize}日滚动 · ${method === 'pearson' ? 'Pearson' : 'Spearman'}`} />}
    >
      <div className="mb-2 flex items-center gap-2 text-[10px]">
        <span className="text-[#636878]">窗口</span>
        {WINDOWS.map((w) => (
          <button key={w} onClick={() => setWindowSize(w)} className={`px-1.5 py-0.5 rounded ${windowSize === w ? 'bg-[#4078ff] text-white' : 'text-[#636878] hover:text-[#b0b5c0]'}`}>{w}日</button>
        ))}
        <span className="ml-2 text-[#636878]">方法</span>
        <button onClick={() => setMethod('pearson')} className={`px-1.5 py-0.5 rounded ${method === 'pearson' ? 'bg-[#4078ff] text-white' : 'text-[#636878]'}`}>Pearson</button>
        <button onClick={() => setMethod('spearman')} className={`px-1.5 py-0.5 rounded ${method === 'spearman' ? 'bg-[#4078ff] text-white' : 'text-[#636878]'}`}>Spearman</button>
      </div>

      {!model ? (
        <div className="h-24 flex items-center justify-center text-[10.5px] text-[#636878]">真实日度序列不足，无法计算相关性。</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[9.5px] font-['JetBrains_Mono',Consolas,monospace] tabular-nums">
              <thead>
                <tr className="text-[#636878]">
                  <th className="text-left py-1 font-normal" />
                  {model.cols.map((c) => <th key={c.id} className="py-1 font-normal">{c.name.slice(0, 4)}</th>)}
                </tr>
              </thead>
              <tbody>
                {model.cols.map((a, i) => (
                  <tr key={a.id}>
                    <td className="py-1 pr-1 text-[#636878] whitespace-nowrap">{a.name.slice(0, 6)}</td>
                    {model.cols.map((b, j) => {
                      const v = model.current[i][j];
                      const prev = model.previous[i][j];
                      const jumped = v !== null && prev !== null && Math.abs(v - prev) > 0.35;
                      return (
                        <td key={b.id} className="p-0.5 text-center" style={{ background: cellColor(v) }}
                          title={`${a.name} ↔ ${b.name}: 当前 ${v?.toFixed(2) ?? '—'} / 60日前 ${prev?.toFixed(2) ?? '—'}`}>
                          <span className={jumped ? 'text-[#f7d44c] font-bold' : 'text-[#d8dce6]'}>
                            {v === null ? '—' : v.toFixed(2)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 rounded px-2 py-1.5 text-[10px] text-[#b0b5c0]" style={{ background: 'rgba(255,255,255,0.02)' }}>
            {model.biggest.label
              ? `相关性变化最大：${model.biggest.label} 由 ${model.biggest.from.toFixed(2)} → ${model.biggest.to.toFixed(2)}（60日）${Math.abs(model.biggest.delta) > 0.35 ? '，已高亮' : ''}。`
              : '相关性变化样本不足。'}
          </div>
          <div className="mt-2">
            <ChartInsight
              summary="红色=正相关，蓝色=负相关，越深越强；每格都带数值，不只靠颜色。"
              how="重点看非对角线相对 60 日前的变化：由负转正意味着分散化正在减弱。"
              pitfall="相关性是历史统计，不是因果；月度序列不参与矩阵，避免日频与月频混算。"
            />
          </div>
        </>
      )}
    </Panel>
  );
});
