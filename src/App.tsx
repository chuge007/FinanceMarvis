import { lazy, memo, Suspense, useEffect, useState } from 'react';
import { groupOf, useAppStore, type Market, type PrimaryTab } from './stores/useAppStore';
import { useMarketStore } from './stores/useMarketStore';
import { useCnbMarketStore } from './stores/useCnbMarketStore';
import { useSnapshotStore } from './core/data/snapshot';
import { dbService } from './services/storage/indexedDB';
import { MapPage } from './modules/v4/MapPage';
import { TodayPage } from './modules/today/TodayPage';
import { UiScaleControl } from './shared/components/UiScaleControl';
import { DataHealthBar } from './shared/components/DataHealthBar';

// 首屏只加载今日页；其余页面与 AI 面板按需加载，避免把全部代码塞进首屏
const RadarPage = lazy(() => import('./modules/radar/RadarPage').then((m) => ({ default: m.RadarPage })));
const TerminalPage = lazy(() => import('./modules/terminal/TerminalPage').then((m) => ({ default: m.TerminalPage })));
const ResearchLabPage = lazy(() => import('./modules/research/ResearchPage').then((m) => ({ default: m.ResearchPage })));
const CalendarPage = lazy(() => import('./modules/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const PortfolioPage = lazy(() => import('./modules/portfolio/PortfolioPage').then((m) => ({ default: m.PortfolioPage })));
const DataCatalogPage = lazy(() => import('./modules/catalog/DataCatalogPage').then((m) => ({ default: m.DataCatalogPage })));
const UniversePage = lazy(() => import('./modules/catalog/UniversePage').then((m) => ({ default: m.UniversePage })));
const StrategyLabPage = lazy(() => import('./modules/strategy/StrategyLabPage').then((m) => ({ default: m.StrategyLabPage })));
const ResearchPage = lazy(() => import('./modules/v4/ResearchPage').then((m) => ({ default: m.ResearchPage })));
const DecidePage = lazy(() => import('./modules/v4/DecidePage').then((m) => ({ default: m.DecidePage })));
const ArchivePage = lazy(() => import('./modules/v4/ArchivePage').then((m) => ({ default: m.ArchivePage })));
const SettingsPage = lazy(() => import('./modules/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AiPanel = lazy(() => import('./modules/ai/AiPanel').then((m) => ({ default: m.AiPanel })));

function PageFallback() {
  return (
    <div className="flex min-h-[12rem] items-center justify-center text-[0.8125rem] text-[#4d5364]">
      加载中…
    </div>
  );
}

/** 五个入口，每屏只回答一个问题。 */
const NAV: { id: PrimaryTab; label: string; hint: string }[] = [
  { id: 'today', label: '今日', hint: '今天什么体制、要不要动、缺什么数据' },
  { id: 'radar', label: '雷达', hint: '跨市场轮动排序与环境分数' },
  { id: 'terminal', label: '盘口', hint: '逐笔、买卖盘、资金流与期权链' },
  { id: 'home', label: '地形', hint: '钱的价格与风险的价格在什么位置' },
  { id: 'research', label: '研究', hint: '叠加走势、相关性、板块结构、产业链' },
  { id: 'research-lab', label: '研报', hint: '异步研究与结构化结论' },
  { id: 'calendar', label: '日历', hint: '全球宏观事件与财报日历' },
  { id: 'decide', label: '决策', hint: '观察、资金流、工具箱、持仓与复盘' },
  { id: 'portfolio', label: '组合', hint: '持仓、收益归因与风险限额' },
  { id: 'catalog', label: '数据', hint: '本地历史库全部序列与快照' },
  { id: 'universe', label: '全景', hint: '26 个开源项目的全部功能、数据与去重裁决' },
  { id: 'strategy-lab', label: '策略台', hint: '回测与绩效框架的完整能力，只做本地研究' },
  { id: 'archive', label: '档案', hint: '数据血缘、指标字典、抓取日志' },
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    dbService.init().catch((err) => console.error('IndexedDB init failed:', err));

    // 旧链路的轮询只服务于「地形/研究」等仍在用快照的页面；
    // 今日页消费 /api/v1，不依赖这里，所以间隔从 30s 放宽到 60s。
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      fetchMarketData();
      fetchCNData();
    };

    tick();
    void loadSnapshot();

    const id = setInterval(tick, 60_000);
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
            <span className="text-[1rem] font-bold text-[#d8dce6]">Marvis</span>
            <span className="hidden rounded bg-[rgba(255,255,255,0.03)] px-1.5 py-0.5 text-[0.75rem] text-[#636878] sm:inline">
              投资地图 v4
            </span>
          </div>

          <nav
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="一级导航"
          >
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setSettingsOpen(false);
                  setTab(n.id);
                }}
                title={n.hint}
                className={`shrink-0 rounded px-3 py-1.5 text-[0.8125rem] transition-colors ${
                  !settingsOpen && group === n.id
                    ? 'bg-[rgba(64,120,255,0.16)] text-[#d8dce6]'
                    : 'text-[#787e8e] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#d8dce6]'
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[0.75rem] text-[#4d5364] md:inline">{dataLabel}</span>
            <UiScaleControl />
            <button
              onClick={() => setAiOpen(true)}
              title="用 AI 总结当前页面抓到的真实数据"
              className="rounded bg-[rgba(64,120,255,0.16)] px-2.5 py-1.5 text-[0.8125rem] text-[#cfd6e4] transition-colors hover:bg-[rgba(64,120,255,0.28)]"
            >
              AI 分析
            </button>
            {group !== 'archive' && (
              <button
                onClick={() => setMarket(market === 'US' ? 'CN' : 'US')}
                className="rounded bg-[rgba(255,255,255,0.05)] px-2.5 py-1.5 text-[0.8125rem] text-[#b0b5c0] transition-colors hover:bg-[rgba(255,255,255,0.08)]"
                title="切换结构/持仓相关的市场视角"
              >
                {MARKET_LABEL[market]}
              </button>
            )}
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              title="数据源、能力与存储状态"
              className={`rounded px-2.5 py-1.5 text-[0.8125rem] transition-colors ${
                settingsOpen
                  ? 'bg-[rgba(64,120,255,0.16)] text-[#d8dce6]'
                  : 'bg-[rgba(255,255,255,0.05)] text-[#b0b5c0] hover:bg-[rgba(255,255,255,0.08)]'
              }`}
            >
              设置
            </button>
          </div>
        </div>
      </header>

      <DataHealthBar />

      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>
          {settingsOpen ? (
            <SettingsPage />
          ) : (
            <>
              {group === 'today' && <TodayPage />}
              {group === 'radar' && <RadarPage />}
              {group === 'terminal' && <TerminalPage />}
              {group === 'home' && <MapPage />}
              {group === 'research-lab' && <ResearchLabPage />}
              {group === 'calendar' && <CalendarPage />}
              {group === 'research' && <ResearchPage initialTab={activeTab} />}
              {group === 'decide' && <DecidePage initialTab={activeTab} />}
              {group === 'portfolio' && <PortfolioPage />}
              {group === 'catalog' && <DataCatalogPage />}
              {group === 'universe' && <UniversePage />}
              {group === 'strategy-lab' && <StrategyLabPage />}
              {group === 'archive' && <ArchivePage />}
            </>
          )}
        </Suspense>
      </main>

      <footer className="border-t border-[#1a1d26] px-3 py-2 text-center text-[0.75rem] leading-relaxed text-[#4d5364]">
        不构成投资建议 · 不具备证券投资咨询资质 · 数据可能延迟（页面会标注来源与数据日期）· 投资有风险，本金可能亏损
      </footer>

      <Suspense fallback={null}>
        <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      </Suspense>
    </div>
  );
});
