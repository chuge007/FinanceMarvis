import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSnapshotStore } from '../../core/data/snapshot';
import { recordPortfolio } from '../../core/data/vault';
import { buildChain, type ChainLink, type ChainNode } from '../../core/analysis/chain';
import { buildActions, type ActionItem } from '../../core/analysis/actions';
import { buildPlan } from '../../services/investmentPlan';
import { useAppStore } from '../../stores/useAppStore';
import { usePortfolioStore } from '../../stores/usePortfolioStore';
import { useProfileStore } from '../../stores/useProfileStore';
import type { LayerId } from '../../core/metrics/registry';
import { readJSON, todayKey, writeJSON } from '../../shared/utils/localStore';
import type { LastRegimeState } from '../rhythm/components/RegimeCard';
import { RiskDisclosure } from '../map/components/RiskDisclosure';
import { TransmissionChain } from './components/TransmissionChain';
import { GlobalTerrain } from './components/GlobalTerrain';
import { LayerPanel } from './components/LayerPanel';
import { ReadingRail } from './components/ReadingRail';
import { ActionList } from './components/ActionList';
import { QuickRecord } from './components/QuickRecord';
import { ResonanceBar } from './components/ResonanceBar';
import { buildResonance, type ResonanceDimensionId } from '../../core/analysis/resonance';
import { buildCalendarEvents, type CalendarEvent } from '../../core/analysis/calendar';
import { fetchFomcDates, fomcToEvents } from '../../services/econCalendar';
import { EventCalendar } from './components/EventCalendar';
import { evaluateTrack, loadTrack, recordToday, type TrackStats } from '../../core/analysis/trackRecord';
import { fetchBenchmarkPoints } from '../../services/benchmark';
import { usePositioningStore } from '../../stores/usePositioningStore';
import { useStructureStore } from '../../stores/useStructureStore';

const TONE_COLOR: Record<string, string> = {
  进攻: '#f04452',
  均衡: '#20c4d8',
  防守: '#f59e4b',
  观望: '#9b6efb',
};

const MARKET_LABEL = { US: '美股', CN: 'A股' } as const;
const REGIME_KEY = 'marvis.regime.last.v1';

interface RecordDraft {
  title: string;
  thesis: string;
  plan: string;
}

export const MapPage = memo(function MapPage() {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const loading = useSnapshotStore((s) => s.loading);
  const error = useSnapshotStore((s) => s.error);
  const loadSnapshot = useSnapshotStore((s) => s.load);

  const market = useAppStore((s) => s.market);
  const setTab = useAppStore((s) => s.setTab);
  const profile = useProfileStore((s) => s.profile);
  const acknowledged = useProfileStore((s) => s.acknowledged);

  const { positions, summary, loadPositions } = usePortfolioStore();

  const term = usePositioningStore((s) => s.term);
  const options = usePositioningStore((s) => s.options);
  const loadPositioning = usePositioningStore((s) => s.load);

  const structure = useStructureStore((s) => s.byMarket[market] ?? null);
  const loadStructure = useStructureStore((s) => s.load);
  const [layer, setLayer] = useState<LayerId>('environment');
  const [record, setRecord] = useState<RecordDraft | null>(null);
  const [saved, setSaved] = useState(false);
  // 只读一次“上次打开时的体制”，用于判断今天是否发生体制切换。
  const [lastRegime] = useState<LastRegimeState | null>(() => readJSON<LastRegimeState | null>(REGIME_KEY, null));

  useEffect(() => {
    // snapshot 的定时刷新由 App 统一负责，这里只做首次补拉，避免两条定时器并存
    void loadSnapshot();
    void loadPositions();
  }, [loadSnapshot, loadPositions]);

  // 期限结构 + 期权情绪：走 store 单例，5 分钟 TTL，重复进入地图页不会重复请求
  useEffect(() => {
    void loadPositioning();
  }, [loadPositioning]);

  useEffect(() => {
    void loadStructure(market);
  }, [market, loadStructure]);

  useEffect(() => {
    if (summary.totalAssets > 0) void recordPortfolio(todayKey(), summary);
  }, [summary]);

  const plan = useMemo(
    () =>
      buildPlan(
        profile,
        snapshot
          ? { tone: snapshot.regime.tone, confidence: snapshot.regime.confidence, asOf: snapshot.regime.asOf }
          : null,
      ),
    [profile, snapshot],
  );

  const chain = useMemo(
    () =>
      buildChain({
        snapshot,
        structure,
        positions,
        summary,
        targetEquityPct: plan.equityPct,
      }),
    [snapshot, structure, positions, summary, plan.equityPct],
  );

  const resonance = useMemo(
    () => buildResonance({ snapshot, term, options, structure }),
    [snapshot, term, options, structure],
  );

  const [trackStats, setTrackStats] = useState<TrackStats | null>(null);

  // 记录当天结论（同日覆盖），为后续命中率回看积累样本
  useEffect(() => {
    if (!snapshot || !resonance.available) return;
    recordToday({
      tone: snapshot.regime.tone,
      risk: resonance.riskCount,
      loose: resonance.looseCount,
      verdict: resonance.verdict,
    });
  }, [snapshot, resonance]);

  // 有 ≥2 条历史结论才回看：新装用户不必为一行统计多拉一次行情
  useEffect(() => {
    const entries = loadTrack();
    if (entries.length < 2) return;
    let alive = true;
    fetchBenchmarkPoints(market)
      .then((points) => {
        if (!alive || !points.length) return;
        setTrackStats(evaluateTrack(entries, points));
      })
      .catch(() => {
        if (alive) setTrackStats(null);
      });
    return () => {
      alive = false;
    };
  }, [market]);

  // FOMC 决议日来自美联储官网，按需加载；拿不到就不显示，不用记忆里的日期凑
  const [fomcEvents, setFomcEvents] = useState<CalendarEvent[]>([]);
  useEffect(() => {
    let alive = true;
    fetchFomcDates()
      .then((dates) => {
        if (alive && dates.length) setFomcEvents(fomcToEvents(dates, new Date(), 45));
      })
      .catch(() => {
        /* 失败由健康条统一提示，这里不打扰 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const events = useMemo(
    () => [...fomcEvents, ...buildCalendarEvents(market, new Date(), 21)].sort((a, b) => a.daysAway - b.daysAway),
    [fomcEvents, market],
  );

  const actions = useMemo(
    () =>
      buildActions({
        snapshot,
        positions,
        summary,
        plan,
        marketLabel: MARKET_LABEL[market],
        lastRegime,
        resonance,
        calendar: events,
      }),
    [snapshot, positions, summary, plan, market, lastRegime, resonance, events],
  );

  const regime = snapshot?.regime ?? null;
  const tone = regime?.tone ?? '—';
  const reliable = (regime?.confidence ?? 0) >= 40;
  const toneColor = reliable ? TONE_COLOR[tone] ?? '#636878' : '#636878';
  const asOf = regime?.asOf ?? null;
  const conclusion = actions[0]?.kind === 'record'
    ? '今日无需交易'
    : actions.some((a) => a.kind === 'check')
      ? `有 ${actions.filter((a) => a.kind === 'check').length} 项需要检查`
      : '留意，不动作';

  const regimeSnapshot: LastRegimeState | null = useMemo(
    () =>
      snapshot
        ? {
            tone: snapshot.regime.tone,
            date: todayKey(),
            score: snapshot.regime.score,
            confidence: snapshot.regime.confidence,
            readings: snapshot.indicators.map((i) => ({
              id: i.id,
              name: i.name,
              percentile: i.percentile,
              z: i.z,
            })),
          }
        : null,
    [snapshot],
  );

  useEffect(() => {
    if (!snapshot || !regimeSnapshot || snapshot.regime.confidence === 0) return;
    writeJSON(REGIME_KEY, regimeSnapshot);
  }, [snapshot, regimeSnapshot]);

  const scrollToLayer = useCallback((next: LayerId) => {
    setLayer(next);
    window.setTimeout(() => {
      document.getElementById('map-layer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }, []);

  /** 共振维度 → 明细：结构类留在本页，其余带去研究页对应的两条线。 */
  const openResonanceDetail = useCallback(
    (id: ResonanceDimensionId) => {
      if (id === 'structure') {
        scrollToLayer('structure');
        return;
      }
      const pairs: Record<string, string[]> = {
        funding: ['DTWEXBGS', 'DGS10'],
        risk: ['VIXCLS', 'VIX_TERM'],
        crowd: ['FG', 'VIXCLS'],
      };
      const ids = pairs[id];
      if (!ids) return;
      window.localStorage.setItem('marvis.research.pair', JSON.stringify(ids));
      setTab('research');
    },
    [scrollToLayer, setTab],
  );

  const handleNode = useCallback(
    (node: ChainNode) => scrollToLayer(node.layer),
    [scrollToLayer],
  );

  const handleLink = useCallback(
    (link: ChainLink) => {
      if (link.from === 'A') {
        window.localStorage.setItem('marvis.research.pair', JSON.stringify(['DTWEXBGS', 'BAMLH0A0HYM2']));
        setTab('research');
        return;
      }
      if (link.from === 'B') {
        window.localStorage.setItem('marvis.research.pair', JSON.stringify(['VIXCLS', 'FG']));
        setTab('research');
        return;
      }
      if (link.from === 'C') {
        scrollToLayer('structure');
        return;
      }
      scrollToLayer('position');
    },
    [scrollToLayer, setTab],
  );

  const openRecord = useCallback((action: ActionItem) => {
    if (action.kind === 'record') {
      setRecord({
        title: action.title,
        thesis: '今天没有操作：没有触发检查阈值。',
        plan: '维持既定框架，不因为无聊或焦虑临时加仓。',
      });
      return;
    }
    setRecord({
      title: action.title,
      thesis: action.title,
      plan:
        action.kind === 'watch'
          ? '只留意，不动作；若背离持续或扩大到新的阈值，再检查仓位。'
          : '按规则完成检查后再决定，不临场改变风险预算。',
    });
  }, []);

  const handleSaved = useCallback(() => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2600);
  }, []);

  return (
    <div className="space-y-3 p-3">
      {!acknowledged && (
        <div className="space-y-2">
          <RiskDisclosure />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2">
            <div className="text-[0.6563rem] text-[#8a8f9d]">
              还没填写投资地图。先决定“多少钱能进股市”，再看这张地图会更准；不填也能先看环境。
            </div>
            <button
              onClick={() => setTab('map')}
              className="rounded bg-[#4078ff] px-2.5 py-1 text-[0.625rem] font-medium text-white"
            >
              去配置
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[0.625rem] text-[#636878]">今天</span>
            <span
              className="rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold"
              style={{ color: toneColor, background: `${toneColor}18` }}
            >
              {tone}
            </span>
            <span className="font-mono text-[1.1875rem] leading-none text-[#e8ebf0] tabular-nums">
              {regime?.score ?? '—'}
              <span className="ml-0.5 text-[0.625rem] text-[#636878]">/100</span>
            </span>
            <span className="text-[0.625rem] text-[#636878]">风险温度</span>
            {regime && (
              <span className="text-[0.5938rem] text-[#4d5364]">
                置信度 {regime.confidence}%{!reliable && <span className="ml-1 text-[#f59e4b]">仅供参考</span>}
              </span>
            )}
            <span className="text-[0.6875rem] font-medium" style={{ color: actions[0]?.kind === 'check' ? '#f59e4b' : '#b0b5c0' }}>
              · {conclusion}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.5625rem] text-[#4d5364]">
            <span>数据截至 {asOf ?? '—'} 收盘</span>
            <span>· 环境=全球 · 结构={MARKET_LABEL[market]} · 仓位=本机</span>
            {loading && <span className="text-[#4078ff]">刷新中…</span>}
            {error && <span className="text-[#f04452]">上游异常：{error}</span>}
            {saved && <span className="text-[#0ca678]">已写入复盘</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void loadSnapshot(true)}
            className="rounded border border-[#1a1d26] px-2 py-1 text-[0.5938rem] text-[#8a8f9d] hover:border-[#2a3040] hover:text-[#d8dce6]"
          >
            刷新
          </button>
          <button
            onClick={() => scrollToLayer('position')}
            className="rounded border border-[#1a1d26] px-2 py-1 text-[0.5938rem] text-[#8a8f9d] hover:border-[#2a3040] hover:text-[#d8dce6]"
          >
            看我的位置
          </button>
        </div>
      </div>

      {!regime && !loading && (
        <div className="rounded-[0.3125rem] border border-[#f04452] bg-[rgba(240,68,82,0.06)] px-3 py-2 text-[0.6875rem] text-[#f04452]">
          真实数据当前不可用，今日不给判断。链与图会显示“缺”，不使用示例值替代。
        </div>
      )}

      <ResonanceBar result={resonance} track={trackStats} onDimensionClick={openResonanceDetail} />

      <EventCalendar events={events} />

      <TransmissionChain model={chain} onNodeClick={handleNode} onLinkClick={handleLink} />

      <GlobalTerrain />

      <div id="map-layer" className="grid scroll-mt-16 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_16.375rem]">
        <LayerPanel
          snapshot={snapshot}
          structure={structure}
          positions={positions}
          summary={summary}
          targetEquityPct={plan.equityPct}
          layer={layer}
          onLayerChange={setLayer}
        />
        <ReadingRail nodes={chain.nodes} onSelect={handleNode} />
      </div>

      <ActionList actions={actions} onLocate={(a) => scrollToLayer(a.layer)} onRecord={openRecord} />

      <details className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2 text-[0.5938rem] leading-relaxed text-[#636878]">
        <summary className="cursor-pointer text-[0.625rem] text-[#8a8f9d] hover:text-[#d8dce6]">怎么读这张地图 / 边界</summary>
        <div className="mt-2 space-y-1.5">
          <p>节点分数是近一年相对位置（0~100），不是涨跌概率；箭头是 60 日滚动相关（用变化率算），只说明历史同步性，不代表因果。</p>
          <p>一次只看一层：环境（钱与风险的价格）→ 结构（钱往哪走）→ 我方（我的仓位与目标带的偏离）。三层共用一条主线，不共用双轴。</p>
          <p>动作只有“检查 / 留意 / 记录”，没有买卖点、目标价或收益预测。数据不足时显示“缺”，不用演示值替代。</p>
        </div>
      </details>

      <QuickRecord
        open={Boolean(record)}
        title={record?.title ?? ''}
        thesis={record?.thesis ?? ''}
        plan={record?.plan ?? ''}
        tone={tone}
        regime={regimeSnapshot}
        onClose={() => setRecord(null)}
        onSaved={handleSaved}
      />
    </div>
  );
});
