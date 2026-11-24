import { memo, useEffect } from 'react';
import { useAppStore, type Market, type ModuleTab } from './stores/useAppStore';
import { BriefPage } from './modules/brief/BriefPage';
import { InvestmentMapPage } from './modules/map/InvestmentMapPage';
import { MacroPage } from './modules/macro/MacroPage';
import { StrategyPage } from './modules/strategy/StrategyPage';
import { FundFlowPage } from './modules/fundflow/FundFlowPage';
import { SentimentPage } from './modules/sentiment/SentimentPage';
import { RhythmPage } from './modules/rhythm/RhythmPage';
import { DisciplinePage } from './modules/discipline/DisciplinePage';
import { PortfolioPage } from './modules/portfolio/PortfolioPage';
import { AlertPage } from './modules/alerts/AlertPage';
import { TechnicalAnalysisPage } from './modules/technical/TechnicalAnalysisPage';
import { SectorRotationPage } from './modules/rotation/SectorRotationPage';
import { CORE_TABS, ADVANCED_TABS } from './shared/utils/constants';
import { useMarketStore } from './stores/useMarketStore';
import { useCnbMarketStore } from './stores/useCnbMarketStore';
import { dbService } from './services/storage/indexedDB';

const PAGES: Record<ModuleTab, React.ComponentType> = {
  brief: BriefPage,
  map: InvestmentMapPage,
  rhythm: RhythmPage,
  macro: MacroPage,
  strategy: StrategyPage,
  fundflow: FundFlowPage,
  sentiment: SentimentPage,
  discipline: DisciplinePage,
  portfolio: PortfolioPage,
  alerts: AlertPage,
  technical: TechnicalAnalysisPage,
  rotation: SectorRotationPage,
};

const MARKET_LABELS: Record<Market, string> = { US: '美股', CN: 'A股' };

/** 只有这几个模块有「美股 / A股」两套数据，其余页面显示切换只会造成误解 */
const MARKET_SCOPED: ModuleTab[] = ['macro', 'sentiment', 'fundflow', 'strategy', 'technical', 'rotation'];

const tabClass = (active: boolean) =>
  `shrink-0 whitespace-nowrap rounded px-2 py-1 text-left leading-tight transition-colors ${
    active
      ? 'bg-[rgba(255,255,255,0.08)] text-[#e8ebf0]'
      : 'text-[#787e8e] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#d8dce6]'
  }`;

export const App = memo(function App() {
  const { activeTab, setTab, market, setMarket } = useAppStore();
  const fetchMarketData = useMarketStore((s) => s.fetchMarketData);
  const fetchCNData = useCnbMarketStore((s) => s.fetchCNData);

  useEffect(() => {
    dbService.init().catch(err => console.error('IndexedDB init failed:', err));

    fetchMarketData();
    fetchCNData();
    const id = setInterval(fetchMarketData, 30_000);
    const idCN = setInterval(fetchCNData, 30_000);
    return () => { clearInterval(id); clearInterval(idCN); };
  }, [fetchMarketData, fetchCNData]);

  const Page = PAGES[activeTab];

  const toggleMarket = () => setMarket(market === 'US' ? 'CN' : 'US');

  return (
    <div className="min-h-screen bg-[#090b0f] text-[#b0b5c0] font-['Inter','PingFang_SC','Microsoft_YaHei',sans-serif] text-[15px]">
      <header className="sticky top-0 z-50 border-b border-[#1a1d26] bg-[#0f1118]">
        <div className="flex min-h-[54px] items-center justify-between gap-2 px-3 py-1">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[15px] font-bold text-[#d8dce6]">Marvis</span>
            <span className="hidden rounded bg-[rgba(255,255,255,0.03)] px-1.5 py-0.5 text-[10px] text-[#636878] sm:inline">
              投资地图 v3.0
            </span>
          </div>

          <nav
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="模块导航"
          >
            {CORE_TABS.map(({ id, name, icon, desc }) => (
              <button key={id} onClick={() => setTab(id)} className={tabClass(activeTab === id)} title={desc}>
                <span className="flex items-center gap-1 text-[12px]">
                  <span className="text-[11px] opacity-70">{icon}</span>
                  {name}
                </span>
                <span className="mt-0.5 block pl-4 text-[9px] text-[#636878]">{desc}</span>
              </button>
            ))}

            <span className="mx-0.5 h-6 w-px shrink-0 bg-[#1a1d26]" aria-hidden="true" />

            {ADVANCED_TABS.map(({ id, name, icon, desc }) => (
              <button key={id} onClick={() => setTab(id)} className={tabClass(activeTab === id)} title={desc}>
                <span className="flex items-center gap-1 text-[12px]">
                  <span className="text-[11px] opacity-70">{icon}</span>
                  {name}
                </span>
                <span className="mt-0.5 block pl-4 text-[9px] text-[#636878]">{desc}</span>
              </button>
            ))}
          </nav>

          {MARKET_SCOPED.includes(activeTab) && (
            <button
              onClick={toggleMarket}
              className="shrink-0 rounded bg-[rgba(255,255,255,0.05)] px-2.5 py-1.5 text-[12px] transition-colors hover:bg-[rgba(255,255,255,0.08)]"
              title="切换数据市场"
            >
              {MARKET_LABELS[market]}
            </button>
          )}
        </div>
      </header>

      <main>
        {Page && <Page />}
      </main>

      <footer className="border-t border-[#1a1d26] px-3 py-2 text-center text-[9.5px] leading-relaxed text-[#636878]">
        不构成投资建议 · 本工具不具备证券投资咨询资质 · 数据可能延迟或为演示（页面会标注）· 投资有风险，本金可能亏损
      </footer>
    </div>
  );
});
