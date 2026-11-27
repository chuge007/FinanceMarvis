/**
 * 策略台：6 类回测 / 交易 / 绩效框架的全部能力展示。
 * 边界：只做本地研究与公式说明，不提供下单入口，不荐股、不给目标价。
 */
import { memo, useEffect, useMemo, useState } from 'react';
import {
  CAPABILITIES_URL,
  PROJECT_META,
  type Capability,
} from '../../core/data/projectCapabilities.generated';
import { apiGet, apiPost } from '../../core/data/client';
import { reportSource } from '../../shared/utils/sourceHealth';

const ENGINES = [
  { id: 'backtrader', name: 'Backtrader', use: '事件驱动回测，指标与撮合模型贴近实盘', status: '需 Python 3.11+ 与依赖库', note: '维护停滞，作为参考引擎' },
  { id: 'vectorbt', name: 'vectorbt', use: '向量化回测，参数扫描极快', status: '需 Python 3.11+ 与依赖库', note: '适合大批量参数网格' },
  { id: 'rqalpha', name: 'RQAlpha', use: 'A 股日频 / 分钟频回测，米筐开源', status: '需 Python 3.11+ 与依赖库', note: 'A 股交易日历与费用口径齐全' },
  { id: 'freqtrade', name: 'freqtrade', use: '加密策略回测、超参优化与实盘机器人', status: '仅展示策略与回测能力', note: '不接入实盘交易' },
  { id: 'vnpy', name: 'vn.py', use: 'CTA / 套利策略框架，CTP 接口', status: '外部核对', note: '不接入 CTP，不提供下单' },
  { id: 'pyfolio', name: 'pyfolio + empyrical', use: '组合绩效与风险指标公式', status: '公式已自建', note: '对应 core/domain/factors.mjs' },
];

const METRICS = [
  { name: '年化波动率', formula: 'std(日收益) × √252', source: '自建 core/domain/factors.mjs · annualizedVol', state: '已实现' },
  { name: '最大回撤', formula: 'min(净值 / 历史峰值 − 1)', source: '自建 core/domain/factors.mjs · maxDrawdownFromReturns', state: '已实现' },
  { name: '分位数', formula: '序列经验分位，缺失点跳过不插值', source: '自建 core/domain/factors.mjs · percentileOf', state: '已实现' },
  { name: 'z-score', formula: '(x − 均值) / 标准差', source: '自建 core/domain/factors.mjs · zScore', state: '已实现' },
  { name: '年化收益', formula: '几何年化：∏(1+r)^(252/n) − 1', source: '自建 core/domain/factors.mjs · annualizedReturn', state: '已实现' },
  { name: '夏普比率', formula: '(年化收益 − 无风险利率) / 年化波动', source: '自建 factors.mjs · sharpeRatio；无风险利率需显式标注（建议 FRED DFF ÷ 252）', state: '已实现' },
  { name: '索提诺比率', formula: '(年化收益 − 目标收益) / 下行波动', source: '自建 factors.mjs · sortinoRatio；目标收益默认 0，需在界面标注', state: '已实现' },
  { name: '卡玛比率', formula: '年化收益 / |最大回撤|', source: '自建 factors.mjs · calmarRatio；回撤用净值序列', state: '已实现' },
];

type BacktestTarget = {
  id: string; label: string; source: string; unit: string; caliber: string;
  points: number; first: string | null; last: string | null;
};

type BacktestRun = {
  id: string; createdAt: string; seriesId: string; label: string; source: string;
  range: { start: string | null; end: string | null };
  engine: string; fast: number; slow: number; days: number; trades: number;
  winRate: number | null; totalReturn: number;
  metrics: {
    annualizedReturn: number | null; annualizedVol: number | null;
    maxDrawdown: number | null; sharpe: number | null; sortino: number | null; calmar: number | null;
  };
  equity: { date: string; value: number }[];
  disclaimer: string;
};

type RunSummary = Pick<BacktestRun, 'id' | 'createdAt' | 'label' | 'seriesId' | 'fast' | 'slow' | 'totalReturn' | 'metrics'>;

const METRIC_ROWS: { key: keyof BacktestRun['metrics']; label: string; pct?: boolean }[] = [
  { key: 'annualizedReturn', label: '年化收益', pct: true },
  { key: 'annualizedVol', label: '年化波动', pct: true },
  { key: 'maxDrawdown', label: '最大回撤', pct: true },
  { key: 'sharpe', label: '夏普比率' },
  { key: 'sortino', label: '索提诺比率' },
  { key: 'calmar', label: '卡玛比率' },
];

function fmtMetric(value: number | null | undefined, pct = false): string {
  if (value == null || !Number.isFinite(value)) return '缺';
  return pct ? `${(value * 100).toFixed(2)}%` : value.toFixed(3);
}

function EquityCurve({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) return <p className="text-[0.75rem] text-[#787e8e]">样本不足，无法绘制净值曲线</p>;
  const w = 640;
  const h = 180;
  const pad = 18;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values, 1);
  const hi = Math.max(...values, 1);
  const span = hi - lo || 1;
  const coords = points
    .map((p, i) => `${(pad + (i * (w - 2 * pad)) / (points.length - 1)).toFixed(1)},${(h - pad - ((p.value - lo) / span) * (h - 2 * pad)).toFixed(1)}`)
    .join(' ');
  const baseline = h - pad - ((1 - lo) / span) * (h - 2 * pad);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img" aria-label="回测净值曲线">
      <line x1={pad} y1={baseline} x2={w - pad} y2={baseline} stroke="#3a4152" strokeDasharray="4 4" strokeWidth={1} />
      <text x={pad + 2} y={baseline - 4} fill="#787e8e" fontSize={11}>净值 1.0 基准</text>
      <polyline points={coords} fill="none" stroke="#4080ff" strokeWidth={1.6} />
    </svg>
  );
}

export const StrategyLabPage = memo(function StrategyLabPage() {
  const [caps, setCaps] = useState<Capability[]>([]);
  const [query, setQuery] = useState('');

  // 回测任务状态
  const [targets, setTargets] = useState<BacktestTarget[]>([]);
  const [targetId, setTargetId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [fast, setFast] = useState(10);
  const [slow, setSlow] = useState(30);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<BacktestRun | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [notice, setNotice] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(CAPABILITIES_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { capabilities?: Capability[] } | null) => { if (alive) setCaps(j?.capabilities ?? []); })
      .catch(() => { /* 清单不可用时只显示引擎卡片 */ });
    return () => { alive = false; };
  }, []);

  // 回测标的与历史：无样本时如实显示，不预置模拟标的
  useEffect(() => {
    let alive = true;
    const oneYearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    setEnd(new Date().toISOString().slice(0, 10));
    setStart(oneYearAgo);
    apiGet<{ targets: BacktestTarget[] }>('/strategy/targets')
      .then((r) => {
        if (!alive) return;
        const usable = (r.data.targets ?? []).filter((t) => t.points >= 60);
        setTargets(usable);
        setTargetId((prev) => prev || usable[0]?.id || '');
      })
      .catch(() => { if (alive) setNotice(['无法读取回测标的清单：请确认本地服务已启动']); });
    apiGet<{ runs: RunSummary[] }>('/strategy/runs')
      .then((r) => { if (alive) setHistory(r.data.runs ?? []); })
      .catch(() => { /* 历史不可得不影响新建 */ });
    return () => { alive = false; };
  }, []);

  const selected = useMemo(() => targets.find((t) => t.id === targetId) ?? null, [targets, targetId]);

  async function handleRun() {
    if (!targetId || running) return;
    setRunning(true);
    setNotice([]);
    try {
      const r = await apiPost<{ run: BacktestRun | null }>('/strategy/backtest', {
        engine: 'ma-cross', seriesId: targetId, start, end, fast, slow, rfDaily: 0,
      });
      const nextRun = r.data.run;
      if (!nextRun) {
        setNotice(r.meta.missing?.length ? r.meta.missing : ['回测未生成，原因未知']);
        reportSource('strategy-runner', false, '样本不足或标的不可得');
        return;
      }
      setRun(nextRun);
      reportSource('strategy-runner', true, `本地回测 ${nextRun.days} 日`);
      const h = await apiGet<{ runs: RunSummary[] }>('/strategy/runs');
      setHistory(h.data.runs ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '本地回测失败';
      setNotice([msg]);
      reportSource('strategy-runner', false, msg);
    } finally {
      setRunning(false);
    }
  }

  const toolCaps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = new Set(PROJECT_META.filter((p) => p.group === '工具框架').map((p) => p.id));
    return caps.filter((c) => ids.has(c.project) && (!q || c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)));
  }, [caps, query]);

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">策略台 · 工具框架的全部能力</h2>
        <p className="mt-1 text-[0.8125rem] text-[#636878]">
          只做本地研究与公式展示：不接实盘下单、不荐股、不给目标价。绩效指标只对主源数据计算。
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {ENGINES.map((e) => (
          <section key={e.id} className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[0.9375rem] font-semibold text-[#d8dce6]">{e.name}</h3>
              <span className="rounded bg-[rgba(245,158,75,0.12)] px-1.5 py-0.5 text-[0.75rem] text-[#f5b45a]">{e.status}</span>
            </div>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#b0b5c0]">{e.use}</p>
            <p className="mt-1 text-[0.75rem] text-[#636878]">{e.note}</p>
          </section>
        ))}
      </div>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[0.9375rem] font-semibold text-[#d8dce6]">回测任务 · 本地执行</h3>
            <p className="mt-0.5 text-[0.75rem] text-[#636878]">
              内置 MA 交叉引擎（Node 本地计算）；Backtrader / vectorbt / RQAlpha 列为可选引擎，需 Python 依赖，当前仅展示能力。
            </p>
          </div>
          <span className="rounded bg-[rgba(64,128,255,0.12)] px-1.5 py-0.5 text-[0.75rem] text-[#6ea0ff]">不接实盘 · 不荐股</span>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-[0.75rem] text-[#8b91a1]">
            标的（主源已落库日线）
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 w-full rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none"
            >
              {targets.length === 0 && <option value="">缺：本地无可回测日线序列</option>}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.label}（{t.points} 点）</option>
              ))}
            </select>
          </label>
          <label className="text-[0.75rem] text-[#8b91a1]">
            起始日期
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none" />
          </label>
          <label className="text-[0.75rem] text-[#8b91a1]">
            结束日期
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none" />
          </label>
          <div className="flex items-end gap-2">
            <label className="w-20 text-[0.75rem] text-[#8b91a1]">
              快线
              <input type="number" min={2} max={120} value={fast} onChange={(e) => setFast(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none" />
            </label>
            <label className="w-20 text-[0.75rem] text-[#8b91a1]">
              慢线
              <input type="number" min={3} max={250} value={slow} onChange={(e) => setSlow(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none" />
            </label>
            <button
              type="button"
              onClick={handleRun}
              disabled={running || !targetId}
              className="ml-auto rounded bg-[#4080ff] px-3 py-1.5 text-[0.8125rem] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? '回测中…' : '本地回测'}
            </button>
          </div>
        </div>

        {selected && (
          <p className="mt-2 text-[0.75rem] text-[#636878]">
            口径：{selected.caliber || '主源日线'}；覆盖 {selected.first ?? '缺'} ~ {selected.last ?? '缺'}。信号 T 日收盘生成、T+1 日收盘成交；忽略滑点与手续费。
          </p>
        )}
        {notice.length > 0 && (
          <div className="mt-2 rounded border border-[rgba(240,68,82,0.35)] bg-[rgba(240,68,82,0.08)] px-2 py-1.5 text-[0.75rem] text-[#f04452]">
            缺：{notice.join('；')}
          </div>
        )}

        {run && (
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <div>
              <div className="grid grid-cols-3 gap-2">
                {METRIC_ROWS.map((m) => (
                  <div key={m.key} className="rounded border border-[#1f2230] bg-[#0a0c11] px-2 py-1.5">
                    <div className="text-[0.75rem] text-[#787e8e]">{m.label}</div>
                    <div className="text-[0.9375rem] font-semibold text-[#d8dce6]">{fmtMetric(run.metrics[m.key], m.pct)}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[0.75rem] text-[#8b91a1]">
                {run.label} · MA{run.fast}/{run.slow} · {run.range.start ?? '缺'} ~ {run.range.end ?? '缺'} · 共 {run.days} 日
                、{run.trades} 笔、胜率 {fmtMetric(run.winRate, false)} · 无风险利率口径 rfDaily=0
              </p>
              <p className="mt-1 text-[0.75rem] text-[#636878]">{run.disclaimer}</p>
            </div>
            <div className="rounded border border-[#1f2230] bg-[#0a0c11] p-2">
              <EquityCurve points={run.equity} />
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-3">
            <h4 className="text-[0.8125rem] font-semibold text-[#b0b5c0]">历史回测（本地落库，最近 {history.length} 次）</h4>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    apiGet<{ run: BacktestRun }>(`/strategy/runs/${h.id}`)
                      .then((r) => { if (r.data.run) setRun(r.data.run); })
                      .catch(() => setNotice(['该回测记录读取失败']));
                  }}
                  className="rounded border border-[#232734] px-2 py-1 text-left text-[0.75rem] text-[#8b91a1] hover:border-[#4080ff]"
                >
                  {h.label} · MA{h.fast}/{h.slow} · 累计 {fmtMetric(h.totalReturn, true)} · 夏普 {fmtMetric(h.metrics.sharpe)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
        <h3 className="text-[0.9375rem] font-semibold text-[#d8dce6]">绩效指标 · 公式与口径</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="border-b border-[#1a1d26] text-left text-[#787e8e]">
                <th className="px-2 py-2">指标</th><th className="px-2 py-2">公式</th><th className="px-2 py-2">来源 / 口径</th><th className="px-2 py-2">状态</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.name} className="border-b border-[#151821] last:border-b-0">
                  <td className="px-2 py-1.5 text-[#d8dce6]">{m.name}</td>
                  <td className="px-2 py-1.5 text-[#b0b5c0]">{m.formula}</td>
                  <td className="px-2 py-1.5 text-[#8b91a1]">{m.source}</td>
                  <td className="px-2 py-1.5 text-[#8b91a1]">{m.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.9375rem] font-semibold text-[#d8dce6]">工具框架公开能力（{toolCaps.length.toLocaleString()} 条）</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索函数名"
            className="rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none placeholder:text-[#4d5364]"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {toolCaps.slice(0, 200).map((c) => (
            <span key={c.id} className="rounded border border-[#232734] px-1.5 py-0.5 text-[0.75rem] text-[#8b91a1]" title={c.sourcePath}>
              {c.projectLabel}:{c.symbol}
            </span>
          ))}
          {toolCaps.length > 200 && <span className="text-[0.75rem] text-[#636878]">…另有 {(toolCaps.length - 200).toLocaleString()} 条，可在「全景 → 能力目录」按项目筛选查看</span>}
        </div>
      </section>
    </div>
  );
});
