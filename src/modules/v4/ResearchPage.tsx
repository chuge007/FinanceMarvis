import { memo, useEffect, useState } from 'react';
import { useSnapshotStore } from '../../core/data/snapshot';
import { fetchStructure, type StructureSnapshot } from '../../core/data/structure';
import { recordStructure } from '../../core/data/vault';
import { useAppStore, type ModuleTab } from '../../stores/useAppStore';
import { OverlayLab } from './components/OverlayLab';
import { CorrelationLab } from './components/CorrelationLab';
import { StructureView } from './components/StructureView';
import { LegacyLens } from './components/LegacyLens';
import { IndustryPage } from '../industry/IndustryPage';

type SubTab = 'industry' | 'overlay' | 'corr' | 'structure' | 'legacy';

const LEGACY_TABS: ModuleTab[] = ['macro', 'sentiment', 'fundflow', 'technical', 'rotation'];

const SUBS: { id: SubTab; label: string; hint: string }[] = [
  { id: 'industry', label: '产业链', hint: '上下游关系与供需景气' },
  { id: 'overlay', label: '叠加实验室', hint: '同轴看趋势与背离' },
  { id: 'corr', label: '相关性', hint: '矩阵 / 滚动 / 领先滞后' },
  { id: 'structure', label: '结构', hint: '板块相对强弱' },
  { id: 'legacy', label: '旧版透镜', hint: '保留原有明细页' },
];

interface Props {
  initialTab: ModuleTab;
}

export const ResearchPage = memo(function ResearchPage({ initialTab }: Props) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const loading = useSnapshotStore((s) => s.loading);
  const loadSnapshot = useSnapshotStore((s) => s.load);
  const market = useAppStore((s) => s.market);

  const isLegacy = LEGACY_TABS.includes(initialTab);
  const [tab, setTab] = useState<SubTab>(isLegacy ? 'legacy' : 'industry');
  const [structure, setStructure] = useState<StructureSnapshot | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);

  useEffect(() => {
    setTab(LEGACY_TABS.includes(initialTab) ? 'legacy' : 'industry');
  }, [initialTab]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    let alive = true;
    setStructureLoading(true);
    fetchStructure(market)
      .then((s) => {
        if (!alive) return;
        setStructure(s);
        void recordStructure(s);
      })
      .catch(() => { if (alive) setStructure(null); })
      .finally(() => { if (alive) setStructureLoading(false); });
    return () => { alive = false; };
  }, [market]);

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[0.875rem] font-bold text-[#d8dce6]">研究 · 产业景气与上下游</h2>
          <p className="mt-0.5 text-[0.625rem] text-[#636878]">
            先看产业链哪一环在动，再用叠加实验室验证；所有叠加统一到同一把尺子，缺数据就显示“缺”。
          </p>
        </div>
        <div className="text-[0.5625rem] text-[#4d5364]">
          {loading ? '快照刷新中…' : snapshot ? `快照 ${snapshot.fetchedAt.slice(0, 16).replace('T', ' ')}` : '快照不可用'}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-[#1a1d26] pb-2">
        {SUBS.map((s) => (
          <button
            key={s.id}
            onClick={() => setTab(s.id)}
            title={s.hint}
            className={`rounded px-2.5 py-1 text-[0.6563rem] transition-colors ${
              tab === s.id ? 'bg-[#4078ff] text-white' : 'text-[#8a8f9d] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-2 text-[0.5313rem] text-[#4d5364]">{SUBS.find((s) => s.id === tab)?.hint}</span>
      </div>

      {tab === 'industry' && <IndustryPage />}

      {tab === 'overlay' && <OverlayLab />}
      {tab === 'corr' && <CorrelationLab snapshot={snapshot} />}
      {tab === 'structure' && (
        <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
          <StructureView structure={structure} loading={structureLoading} />
        </div>
      )}
      {tab === 'legacy' && <LegacyLens initial={isLegacy ? initialTab : undefined} />}
    </div>
  );
});
