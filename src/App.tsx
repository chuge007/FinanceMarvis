import { lazy, memo, Suspense, useEffect, useState } from 'react';
import { groupOf, useAppStore, type Market, type PrimaryTab } from './stores/useAppStore';
import { useMarketStore } from './stores/useMarketStore';
import { useCnbMarketStore } from './stores/useCnbMarketStore';
import { useSnapshotStore } from './core/data/snapshot';
import { dbService } from './services/storage/indexedDB';
import { MapPage } from './modules/v4/MapPage';
import { UiScaleControl } from './shared/components/UiScaleControl';
import { DataHealthBar } from './shared/components/DataHealthBar';

// 首屏只加载地图页；其余三个页面与 AI 面板按需加载，避免把 1.1MB 全塞进首屏
const ResearchPage = lazy(() => import('./modules/v4/ResearchPage').then((m) => ({ default: m.ResearchPage })));
const DecidePage = lazy(() => import('./modules/v4/DecidePage').then((m) => ({ default: m.DecidePage })));
const ArchivePage = lazy(() => import('./modules/v4/ArchivePage').then((m) => ({ default: m.ArchivePage })));
const AiPanel = lazy(() => import('./modules/ai/AiPanel').then((m) => ({ default: m.AiPanel })));

function PageFallback() {
  return (
    <div className="flex min-h-[12rem] items-center justify-center text-[0.6875rem] text-[#4d5364]">
      加载中…
    </div>
  );
}

const NAV: { id: PrimaryTab; label: string; hint: string }[] = [
  { id: 'home', label: '地图', hint: '今天怎么样、要不要动' },
  { id: 'research', label: '研究', hint: '叠加、相关性、板块结构' },
  { id: 'decide', label: '决策', hint: '配置、仓位、持仓、复盘' },
  { id: 'archive', label: '档案', hint: '数据血缘、指标字典、决策历史' },
];

const MARKET_LABEL: Record<Market, string> = { US: '美股', CN: 'A股' };

export const App = memo(function App() {
  const { activeTab, setTab, market, setMarket } = useAppStore();
  const fetchMarketData = useMarketStore((s) => s.fetchMarketData);
  const fetchCNData = useCnbMarketStore((s) => s.fetchCNData);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const loadSnapshot = useSnapshotStore((s) => s.load);
  const loading = useSnapshotStore((s) => s.loading);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    dbService.init().catch((err) => console.error('IndexedDB init failed:', err));

    // 后台标签页不轮询：本机工具长时间挂着也不该持续烧上游配额
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      fetchMarketData();
      fetchCNData();
    };

    tick();
    void loadSnapshot();

    const id = setInterval(tick, 30_000);
    const idSnap = setInterval(() => {
      if (document.visibilityState === 'visible') void loadSnapshot();
    }, 300_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      clearInterval(idSnap);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchMarketData, fetchCNData, loadSnapshot]);

  const group = groupOf(activeTab);
  const dataLabel = snapshot?.regime
    ? `数据 ${snapshot.regime.available}/${snapshot.regime.total}${snapshot.regime.asOf ? ` · ${snapshot.regime.asOf}` : ''}`
    : loading
      ? '数据加载中'
      : '数据不可用';

  return (
    <div className="flex min-h-screen flex-col bg-[#090b0f] font-['Inter','PingFang_SC','Microsoft_YaHei',sans-serif] text-[0.9375rem] text-[#b0b5c0]">
      <header className="sticky top-0 z-50 border-b border-[#1a1d26] bg-[#0f1118]">
        <div className="flex min-h-[3.125rem] items-center justify-between gap-3 px-3 py-1.5">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[0.9375rem] font-bold text-[#d8dce6]">Marvis</span>
            <span className="hidden rounded bg-[rgba(255,255,255,0.03)] px-1.5 py-0.5 text-[0.5625rem] text-[#636878] sm:inline">
              投资地图 v4
            </span>
          </div>

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="一级导航">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                title={n.hint}
                className={`shrink-0 rounded px-3 py-1.5 text-[0.75rem] transition-colors ${
                  group === n.id
                    ? 'bg-[rgba(64,120,255,0.16)] text-[#d8dce6]'
                    : 'text-[#787e8e] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#d8dce6]'
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[0.5625rem] text-[#4d5364] md:inline">{dataLabel}</span>
            <UiScaleControl />
            <button
              onClick={() => setAiOpen(true)}
              title="用 AI 总结当前页面抓到的真实数据"
              className="rounded bg-[rgba(64,120,255,0.16)] px-2.5 py-1.5 text-[0.6875rem] text-[#cfd6e4] transition-colors hover:bg-[rgba(64,120,255,0.28)]"
            >
              AI 分析
            </button>
            {group !== 'archive' && (
              <button
                onClick={() => setMarket(market === 'US' ? 'CN' : 'US')}
                className="rounded bg-[rgba(255,255,255,0.05)] px-2.5 py-1.5 text-[0.6875rem] text-[#b0b5c0] transition-colors hover:bg-[rgba(255,255,255,0.08)]"
                title="切换结构/持仓相关的市场视角"
              >
                {MARKET_LABEL[market]}
              </button>
            )}
          </div>
        </div>
      </header>

      <DataHealthBar />

      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>
          {group === 'home' && <MapPage />}
          {group === 'research' && <ResearchPage initialTab={activeTab} />}
          {group === 'decide' && <DecidePage initialTab={activeTab} />}
          {group === 'archive' && <ArchivePage />}
        </Suspense>
      </main>

      <footer className="border-t border-[#1a1d26] px-3 py-2 text-center text-[0.5625rem] leading-relaxed text-[#4d5364]">
        不构成投资建议 · 不具备证券投资咨询资质 · 数据可能延迟或为演示（页面会标注）· 投资有风险，本金可能亏损
      </footer>

      <Suspense fallback={null}>
        <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      </Suspense>
    </div>
  );
});
