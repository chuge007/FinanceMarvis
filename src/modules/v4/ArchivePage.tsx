import { memo, useEffect, useMemo, useState } from 'react';
import { useSnapshotStore } from '../../core/data/snapshot';
import { vaultStats, type VaultStats } from '../../core/data/vault';
import { METRICS } from '../../core/metrics/registry';
import { readJSON } from '../../shared/utils/localStore';
import { SourcePlaybook } from './components/SourcePlaybook';
import { DataPlatformPanel } from './components/DataPlatformPanel';
import type { JournalEntry } from './components/QuickRecord';

const KEY = 'marvis.journal.v1';

export const ArchivePage = memo(function ArchivePage() {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const entries = useMemo(() => readJSON<JournalEntry[]>(KEY, []), []);
  const [vault, setVault] = useState<{ breadth: VaultStats | null; equity: VaultStats | null }>({
    breadth: null,
    equity: null,
  });

  useEffect(() => {
    let alive = true;
    Promise.all([vaultStats('structure.breadth'), vaultStats('portfolio.equity_pct')])
      .then(([breadth, equity]) => { if (alive) setVault({ breadth, equity }); })
      .catch(() => { /* 仓库不可用不影响档案其他部分 */ });
    return () => { alive = false; };
  }, []);

  const total = entries.length;
  const followed = entries.filter((e) => e.followed).length;
  const defensive = entries.filter((e) => e.regime && ['防守', '观望'].includes(e.regime.tone)).length;
  const followedPct = total ? Math.round((followed / total) * 100) : 0;

  const seriesRows = Object.values(snapshot?.series ?? {});

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[0.875rem] font-bold text-[#d8dce6]">档案 · 这些数字从哪来，我以前怎么做的</h2>
        <p className="mt-0.5 text-[0.8125rem] text-[#636878]">
          数据血缘、指标字典、决策历史。任何数字都应该能回答“来源、时间、样本长度、口径”。
        </p>
      </div>

      <DataPlatformPanel />

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">数据血缘 · 当前快照</h3>
          <span className="text-[0.5625rem] text-[#4d5364]">
            {snapshot ? `抓取 ${snapshot.fetchedAt.slice(0, 16).replace('T', ' ')}` : '快照不可用'}
          </span>
        </div>

        {seriesRows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-[0.625rem] text-[#4d5364]">还没有成功快照。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[45rem] border-collapse text-[0.625rem]">
              <thead>
                <tr className="border-b border-[#1a1d26] text-left text-[0.5625rem] text-[#4d5364]">
                  <th className="py-1.5 pr-2 font-normal">序列</th>
                  <th className="py-1.5 pr-2 font-normal">相位</th>
                  <th className="py-1.5 pr-2 font-normal">频率</th>
                  <th className="py-1.5 pr-2 text-right font-normal">样本</th>
                  <th className="py-1.5 pr-2 text-right font-normal">最新日期</th>
                  <th className="py-1.5 pr-2 text-right font-normal">最新值</th>
                  <th className="py-1.5 pr-2 text-right font-normal">Z</th>
                  <th className="py-1.5 text-right font-normal">来源</th>
                </tr>
              </thead>
              <tbody>
                {seriesRows.map((s) => {
                  const last = s.points[s.points.length - 1];
                  return (
                    <tr key={s.id} className="border-b border-[#131620]">
                      <td className="py-1.5 pr-2 text-[#d8dce6]">{s.name}</td>
                      <td className="py-1.5 pr-2 text-[#8a8f9d]">{s.phase}</td>
                      <td className="py-1.5 pr-2 text-[#8a8f9d]">{s.frequency}</td>
                      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{s.points.length}</td>
                      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{last?.date ?? '—'}</td>
                      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{last ? last.value.toFixed(2) : '—'}</td>
                      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{last?.z === null || last?.z === undefined ? '—' : last.z.toFixed(2)}</td>
                      <td className="py-1.5 text-right">
                        <span className="rounded bg-[rgba(12,166,120,0.12)] px-1.5 py-0.5 text-[0.5313rem] text-[#0ca678]">
                          {s.points.length ? '真实' : '缺失'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-2 text-[0.5625rem] leading-relaxed text-[#4d5364]">
          主路径已移除的模拟数据：美股板块资金流、盘口/逐笔、写死板块轮动、A 股情绪随机兜底。
          旧版透镜仍可打开，但会在页面顶部标注数据性质。
        </div>
      </div>

      <SourcePlaybook />

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">本地序列仓库</h3>
          <span className="text-[0.5625rem] text-[#4d5364]">从第一次打开开始逐日累积，不做虚假回填</span>
        </div>
        <p className="mb-2 text-[0.5938rem] leading-relaxed text-[#636878]">
          宽度、板块资金流、组合权益比例只有当日快照。攒满 20 个交易日可算滚动相关，60 个交易日可算组合 Beta 与回撤。
        </p>
        <div className="grid gap-2 lg:grid-cols-2">
          {[
            { key: '板块宽度', stat: vault.breadth },
            { key: '组合权益比例', stat: vault.equity },
          ].map(({ key, stat }) => (
            <div key={key} className="rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[0.6563rem] text-[#b0b5c0]">{key}</span>
                <span className="font-mono text-[0.6875rem] text-[#d8dce6] tabular-nums">{stat?.count ?? 0} 天</span>
              </div>
              <div className="mt-1 h-[0.1875rem] w-full overflow-hidden rounded bg-[#1a1d26]">
                <div
                  className="h-full rounded bg-[#4078ff]"
                  style={{ width: `${Math.min(100, ((stat?.count ?? 0) / 20) * 100)}%` }}
                />
              </div>
              <div className="mt-1 text-[0.5313rem] text-[#4d5364]">
                {stat?.first ? `${stat.first} → ${stat.last}` : '尚未开始积累'}
                {(stat?.count ?? 0) < 20 ? ' · 满 20 天可算相关' : ' · 已可算滚动相关'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">指标字典</h3>
          <span className="text-[0.5625rem] text-[#4d5364]">全站唯一口径 · 页面不得自行写阈值</span>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {METRICS.map((m) => (
            <div key={m.id} className="rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[0.6563rem] font-medium text-[#d8dce6]">{m.name}</span>
                <span className="rounded bg-[rgba(255,255,255,0.04)] px-1 py-0.5 text-[0.5313rem] text-[#8a8f9d]">{m.phase}</span>
                <span className="text-[0.5313rem] text-[#4d5364]">{m.dimension} · {m.frequency} · 权重 {m.weight}</span>
              </div>
              <div className="mt-1 text-[0.5938rem] leading-relaxed text-[#8a8f9d]">{m.explanation}</div>
              <div className="mt-1 text-[0.5625rem] leading-relaxed text-[#f59e4b]">误读：{m.pitfall}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
          <h3 className="mb-2 text-[0.75rem] font-bold text-[#d8dce6]">我的决策复盘</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: '记录次数', v: String(total) },
              { k: '按规则执行', v: `${followedPct}%` },
              { k: '防守/观望态记录', v: String(defensive) },
            ].map((s) => (
              <div key={s.k} className="rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] px-2 py-1.5">
                <div className="text-[0.5313rem] text-[#4d5364]">{s.k}</div>
                <div className="font-mono text-[0.9375rem] text-[#d8dce6] tabular-nums">{s.v}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 space-y-1">
            {entries.slice(0, 4).map((e) => (
              <div key={e.id} className="rounded border border-[#1a1d26] px-2 py-1.5">
                <div className="flex items-center justify-between text-[0.5625rem]">
                  <span className="text-[#8a8f9d]">{e.date} · {e.tone}</span>
                  <span className={e.followed ? 'text-[#0ca678]' : 'text-[#f59e4b]'}>
                    {e.followed ? '按规则' : '临时起意'}
                  </span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-[0.5938rem] text-[#b0b5c0]">{e.thesis || e.plan}</div>
              </div>
            ))}
            {!entries.length && (
              <div className="flex h-20 items-center justify-center text-[0.5938rem] text-[#4d5364]">
                还没有记录。回到地图点「记录决定」即可自动带上当时的体制快照。
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
          <h3 className="mb-2 text-[0.75rem] font-bold text-[#d8dce6]">方法与边界</h3>
          <ul className="space-y-1.5 text-[0.5938rem] leading-relaxed text-[#8a8f9d]">
            <li>· 叠加统一到滚动 Z-score；不使用双 Y 轴。</li>
            <li>· 相关性用收益率/一阶差分计算；水平值相关会被趋势主导。</li>
            <li>· 月度指标不进入日度相关矩阵；对齐用日期交集，不做前向填充。</li>
            <li>· 相关性只描述历史同步性，不代表因果，也会随体制漂移。</li>
            <li>· 缺失数据不插值、不随机填充；取不到就显示“缺”。</li>
            <li>· 所有结论只描述环境与位置，不预测涨跌，不构成投资建议。</li>
          </ul>
        </div>
      </div>
    </div>
  );
});
