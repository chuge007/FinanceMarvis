import { memo, useEffect, useMemo, useState } from 'react';
import { useSnapshotStore } from '../../../core/data/snapshot';
import { useCrossAssetStore } from '../../../stores/useCrossAssetStore';
import { usePositioningStore } from '../../../stores/usePositioningStore';
import { buildTerrain } from '../../../core/analysis/terrain';
import { TerrainCell } from './TerrainCell';
import { TerrainCompass } from './TerrainCompass';
import { TerrainDetail } from './TerrainDetail';

const SOURCE_NOTE: Record<string, string> = {
  yahoo: 'Yahoo Chart',
  fred: 'FRED',
  snapshot: '统一快照',
  cboe: 'CBOE 官方',
  tencent: '腾讯现货兜底',
  treasury: '美国财政部曲线',
  derived: '由真实序列派生',
};

export const GlobalTerrain = memo(function GlobalTerrain() {
  const rhythm = useSnapshotStore((s) => s.snapshot);
  const cross = useCrossAssetStore((s) => s.snapshot);
  const loading = useCrossAssetStore((s) => s.loading);
  const error = useCrossAssetStore((s) => s.error);
  const load = useCrossAssetStore((s) => s.load);
  const recompute = useCrossAssetStore((s) => s.recompute);
  const options = usePositioningStore((s) => s.options);
  const loadPositioning = usePositioningStore((s) => s.load);

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // 跨资产与统一快照并行：FRED 有 5 分钟 inflight 去重，Convex 有熔断，
    // 不再为了避让而把首屏串行拖到 20 秒。
    void loadPositioning();
    void load();
  }, [load, loadPositioning]);

  useEffect(() => {
    // 快照/期权晚到时用同一份原始缓存重新合成（不发网络），P/C、FG、VIX 会随后补齐。
    if (rhythm || options) recompute();
  }, [rhythm?.fetchedAt, options?.generatedAt, recompute]);

  const model = useMemo(() => buildTerrain(cross), [cross]);
  const selectedCell = selected ? cross?.readings[selected] ?? null : null;
  const selectedPoints = selected ? cross?.series[selected] ?? [] : [];

  if (!cross) {
    return (
      <section className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.875rem] font-bold text-[#d8dce6]">全球地形</h3>
          <span className={`text-[0.75rem] ${error ? 'text-[#f04452]' : 'text-[#4d5364]'}`}>
            {error ?? '加载跨资产真实序列…'}
          </span>
        </div>
        <div className="mt-2 space-y-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center gap-1.5">
              <div className="h-9 w-[4.75rem] shrink-0 rounded bg-[#151922]" />
              {[0, 1, 2, 3, 4].map((cell) => (
                <div key={cell} className="h-9 w-[7rem] shrink-0 rounded bg-[#11141c]" />
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[0.75rem] leading-relaxed text-[#4d5364]">
          六组数据分别来自 Yahoo 行情、FRED、CBOE 与统一快照；取不到就留空，不用示例值替代。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-[0.875rem] font-bold text-[#d8dce6]">全球地形</h3>
            <span className="text-[0.75rem] text-[#636878]">跨资产 · 真实序列 · 六组同看</span>
          </div>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-[#636878]">
            宏观看钱的价格，微观看钱有没有真的在买；同向才可信，背离就只留意。
          </p>
        </div>
        <div className="flex items-center gap-2 text-[0.75rem] text-[#4d5364]">
          <span>截至 {model.asOf ?? '—'}</span>
          <span>
            覆盖 {model.available}/{model.total}
            {model.coverage < 0.6 && <span className="ml-1 text-[#f59e4b]">· 置信度低</span>}
          </span>
          <button
            onClick={() => void load(true)}
            className="rounded border border-[#1a1d26] px-2 py-1 text-[0.75rem] text-[#8a8f9d] hover:border-[#2a3040] hover:text-[#d8dce6]"
          >
            {loading ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          title="50 + 10 × 风险类格子的平均极性 Z（股指、信用、波动、商品、加密）；样本不足一半时不给分"
          className="rounded border border-[#1f2430] bg-[rgba(255,255,255,0.02)] px-2 py-1 text-[0.75rem] text-[#b0b5c0]"
        >
          风险偏好
          <b className="ml-1 font-mono text-[0.8125rem] text-[#e8ebf0] tabular-nums">{model.riskScore ?? '—'}</b>
          <span className="text-[#4d5364]">/100</span>
          {model.riskCoverage < 0.5 && (
            <span className="ml-1.5 text-[#f59e4b]">· 样本 {Math.round(model.riskCoverage * 100)}%</span>
          )}
        </span>
        <span
          title="50 + 10 × 流动性类格子的平均极性 Z（美元、收益率、实际利率、通胀预期、汇率）；收益率上行算收紧"
          className="rounded border border-[#1f2430] bg-[rgba(255,255,255,0.02)] px-2 py-1 text-[0.75rem] text-[#b0b5c0]"
        >
          流动性
          <b className="ml-1 font-mono text-[0.8125rem] text-[#e8ebf0] tabular-nums">{model.liquidityScore ?? '—'}</b>
          <span className="text-[#4d5364]">/100</span>
          {model.liquidityCoverage < 0.5 && (
            <span className="ml-1.5 text-[#f59e4b]">· 样本 {Math.round(model.liquidityCoverage * 100)}%</span>
          )}
        </span>
        <span className="rounded border border-[#1f2430] bg-[rgba(255,255,255,0.02)] px-2 py-1 text-[0.75rem] text-[#b0b5c0]">
          {model.quadrantLabel ?? '象限未定'}
        </span>
        {error && <span className="text-[0.75rem] text-[#f59e4b]">{error}</span>}
      </div>

      <div className="mt-1.5 rounded border-l-2 border-[#4078ff] bg-[rgba(64,120,255,0.05)] px-2.5 py-1.5 text-[0.75rem] leading-relaxed text-[#b0b5c0]">
        {model.narrative}
      </div>

      <div className="mt-2 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="space-y-1.5">
          {model.groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-1 sm:flex-row sm:items-start">
              <div className="w-[4.75rem] shrink-0 pt-1">
                <div className="text-[0.75rem] font-medium text-[#8a8f9d]">{group.label}</div>
                <div className="text-[0.6875rem] text-[#4d5364]">
                  {Math.round(group.coverage * 100)}%
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {group.cells.map((cell) => (
                  <TerrainCell
                    key={cell.id}
                    cell={cell}
                    selected={selected === cell.id}
                    onClick={() => setSelected((prev) => (prev === cell.id ? null : cell.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <TerrainCompass model={model} />
          <div className="rounded border border-[#1a1d26] px-2 py-1.5 text-[0.6875rem] leading-relaxed text-[#4d5364]">
            分位来自各自近一年的相对位置，不是涨跌概率。颜色只标相对位置（蓝低 → 橙高），涨跌另看正负号。
          </div>
        </div>
      </div>

      {selectedCell ? (
        <TerrainDetail cell={selectedCell} points={selectedPoints} />
      ) : (
        <div className="mt-2 text-[0.75rem] leading-relaxed text-[#4d5364]">
          点任一格子看近 90 日走势、为什么看与常见误读。
          {model.missing.length > 0 && (
            <span title={model.missing.join('、')}> · 当前缺 {model.missing.length} 项，逐格标注「缺」，不用演示值填补。</span>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-[#4d5364]">
        {Object.entries(SOURCE_NOTE).map(([key, label]) => (
          <span key={key}>· {label}</span>
        ))}
        <span>· 历史同步性不代表因果；ETF 净流入与 CFTC 持仓需外部查看</span>
      </div>
    </section>
  );
});
