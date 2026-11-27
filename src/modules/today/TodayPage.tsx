/**
 * 今日页：一屏回答「今天什么体制、要不要动、缺什么数据」。
 *
 * 只消费服务端算好的环境分数与核心因子，不在前端重算 ——
 * 这样同一屏里每个数字的口径与档案页完全一致。
 */
import { memo, useMemo } from 'react';
import { useFactors, useHealth, useRatios, useRegime } from '../../core/data/hooks';
import { asOfLabel, missingOf } from '../../core/data/client';
import type { RegimeBand } from '../../core/data/contracts';

const BAND_META: Record<RegimeBand, { label: string; tone: string; hint: string }> = {
  excellent: { label: 'Excellent · 可加仓', tone: 'text-[#30a46c] border-[#30a46c]/40 bg-[#30a46c]/10', hint: '环境分位偏高，风险预算可以打开' },
  good: { label: 'Good · 持有', tone: 'text-[#4078ff] border-[#4078ff]/40 bg-[#4078ff]/10', hint: '环境中性偏暖，维持现有仓位' },
  poor: { label: 'Poor · 减仓', tone: 'text-[#f5a524] border-[#f5a524]/40 bg-[#f5a524]/10', hint: '环境转差，先降风险再找机会' },
  severe: { label: 'Severe · 观望', tone: 'text-[#e5484d] border-[#e5484d]/40 bg-[#e5484d]/10', hint: '多项条件同时恶化，空仓等待' },
};

function ScoreRing({ score }: { score: number | null }) {
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const color = pct >= 70 ? '#30a46c' : pct >= 55 ? '#4078ff' : pct >= 40 ? '#f5a524' : '#e5484d';
  return (
    <div className="relative flex h-[6.5rem] w-[6.5rem] shrink-0 items-center justify-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#1a1d26" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 326.7} 326.7`}
          style={{ transition: 'stroke-dasharray .45s ease' }}
        />
      </svg>
      <div className="text-center">
        <div className="font-mono text-[1.75rem] font-bold leading-none text-[#d8dce6]">
          {score == null ? '—' : score.toFixed(0)}
        </div>
        <div className="mt-1 text-[0.6875rem] text-[#636878]">环境分数</div>
      </div>
    </div>
  );
}

function DriverRow({ label, value, contribution, health }: { label: string; value: number | null; contribution: number; health?: number }) {
  const positive = contribution >= 0;
  const width = Math.min(100, Math.abs(contribution) * 3.2);
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-[8.5rem] shrink-0 truncate text-[0.8125rem] text-[#b0b5c0]" title={label}>
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#151823]">
        <div
          className={`absolute top-0 h-full rounded-full ${positive ? 'left-1/2 bg-[#30a46c]' : 'right-1/2 bg-[#e5484d]'}`}
          style={{ width: `${width / 2}%`, transition: 'width .4s ease' }}
        />
      </div>
      <span className="w-[4.5rem] shrink-0 text-right font-mono text-[0.8125rem] text-[#d8dce6]">
        {value == null ? '不可得' : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </span>
      <span className={`w-[3.5rem] shrink-0 text-right font-mono text-[0.75rem] ${positive ? 'text-[#30a46c]' : 'text-[#e5484d]'}`}>
        {health == null ? '—' : `${health}`}
      </span>
    </div>
  );
}

/** 一屏能看到的关键指标：按操盘手提问顺序分组，不按数据源分组。 */
const FACTOR_IDS = [
  'fred:DGS10', 'fred:DGS2', 'fred:T10YIE', 'bis:US',
  'fred:BAMLH0A0HYM2', 'fred:NFCI', 'fred:VIXCLS', 'yahoo:^VIX',
  'fred:UNRATE', 'fred:PAYEMS', 'fred:WEI', 'fred:CPIAUCSL',
  'fred:RRPONTSYD', 'fred:WALCL', 'alt:fear-greed', 'cn:index:sh000300',
];

const FACTOR_GROUPS = [
  { title: '钱的价格 · 定价锚', ids: FACTOR_IDS.slice(0, 4) },
  { title: '风险的价格 · 信用与波动', ids: FACTOR_IDS.slice(4, 8) },
  { title: '增长与通胀 · 分母的源头', ids: FACTOR_IDS.slice(8, 12) },
  { title: '流动性与情绪 · 钱有没有真的在动', ids: FACTOR_IDS.slice(12, 16) },
];

export const TodayPage = memo(function TodayPage() {
  const regime = useRegime('cn');
  const ratios = useRatios();
  const health = useHealth();
  const factors = useFactors(FACTOR_IDS);

  const band = regime.data?.band ?? null;
  const meta = regime.data?.meta;
  const gaps = useMemo(() => {
    const list = [...missingOf(meta), ...missingOf(ratios.data?.meta), ...missingOf(health.data?.meta)];
    return Array.from(new Set(list));
  }, [meta, ratios.data?.meta, health.data?.meta]);

  const unavailable = regime.isError && !regime.data;

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">今日 · 现在这个环境，值不值得承担风险</h2>
        <p className="mt-1 text-[0.8125rem] text-[#636878]">
          分数由信用利差、金融条件、波动率、通胀预期与沪深 300 动量加权得出；只描述体制，不预测涨跌。
        </p>
      </div>

      {unavailable && (
        <div className="rounded border border-[#f5a524]/40 bg-[#f5a524]/10 px-3 py-2 text-[0.8125rem] text-[#f5a524]">
          数据服务未就绪：请先启动本地服务（<code className="mx-1 rounded bg-black/30 px-1">npm run serve</code>），
          或等待首次回填完成。当前页面不会用估算值顶替。
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
          <div className="flex items-start gap-4">
            <ScoreRing score={regime.data?.score ?? null} />
            <div className="min-w-0 flex-1">
              {band ? (
                <span className={`inline-block rounded border px-2 py-0.5 text-[0.8125rem] ${BAND_META[band].tone}`}>
                  {BAND_META[band].label}
                </span>
              ) : (
                <span className="inline-block rounded border border-[#1a1d26] px-2 py-0.5 text-[0.8125rem] text-[#636878]">
                  待回填
                </span>
              )}
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#b0b5c0]">
                {band ? BAND_META[band].hint : '历史样本不足，分数暂不给出。先补齐日线即可恢复。'}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-[#636878]">
                <span>数据日期 {asOfLabel(meta)}</span>
                <span>覆盖 {regime.data?.coverage ?? '—'}</span>
                <span>{regime.isFetching ? '刷新中…' : '已同步'}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-[#1a1d26] pt-3">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">核心驱动</h3>
              <span className="text-[0.75rem] text-[#4d5364]">贡献度 =（健康度 − 50）× 权重</span>
            </div>
            <div className="mb-1 flex items-center gap-2 text-[0.75rem] text-[#4d5364]">
              <span className="w-[8.5rem] shrink-0">因子</span>
              <span className="flex-1">拖累 / 支撑</span>
              <span className="w-[4.5rem] shrink-0 text-right">当前值</span>
              <span className="w-[3.5rem] shrink-0 text-right">健康度</span>
            </div>
            {(regime.data?.drivers ?? []).length === 0 ? (
              <div className="py-4 text-center text-[0.8125rem] text-[#4d5364]">尚无驱动因子（历史库为空）</div>
            ) : (
              (regime.data?.drivers ?? []).map((d) => (
                <DriverRow key={d.id} label={d.label} value={d.value} contribution={d.contribution} health={d.health} />
              ))
            )}
          </div>
        </section>

        <div className="space-y-3">
          <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
            <h3 className="mb-2 text-[0.875rem] font-semibold text-[#d8dce6]">商品比价</h3>
            {(ratios.data?.ratios ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-[#151823] py-1.5 last:border-0">
                <div className="min-w-0">
                  <div className="truncate text-[0.8125rem] text-[#b0b5c0]">{r.label}</div>
                  <div className="truncate text-[0.6875rem] text-[#4d5364]" title={r.caliber}>
                    {r.asOf ?? '不可得'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[0.9375rem] text-[#d8dce6]">
                    {r.value == null ? '—' : r.value.toFixed(2)}
                  </div>
                  <div className="text-[0.6875rem] text-[#636878]">
                    {r.percentile == null ? '分位 —' : `分位 ${r.percentile}%`}
                  </div>
                </div>
              </div>
            ))}
            {(ratios.data?.ratios ?? []).length === 0 && (
              <div className="py-3 text-center text-[0.8125rem] text-[#4d5364]">等待黄金 / 白银 / 原油日线回填</div>
            )}
          </section>

          <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
            <h3 className="mb-2 text-[0.875rem] font-semibold text-[#d8dce6]">数据缺口</h3>
            {gaps.length === 0 ? (
              <p className="text-[0.8125rem] text-[#30a46c]">本轮无缺口</p>
            ) : (
              <ul className="space-y-1">
                {gaps.slice(0, 8).map((g) => (
                  <li key={g} className="flex items-start gap-2 text-[0.8125rem] text-[#f5a524]">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#f5a524]" />
                    <span className="break-all">{g}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 border-t border-[#151823] pt-2 text-[0.75rem] text-[#4d5364]">
              历史库 {health.data?.db.driver ?? '—'} · {health.data?.db.seriesCount ?? 0} 条序列 ·{' '}
              {health.data?.db.pointCount ?? 0} 个数据点
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">关键指标全景 · 来自本地历史库</h3>
          <span className="text-[0.75rem] text-[#4d5364]">
            分位按该指标全历史计算 · 样本不足显示「—」· 数据日期随每个指标标注
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FACTOR_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-1.5 border-b border-[#1a1d26] pb-1 text-[0.75rem] text-[#4078ff]">{group.title}</div>
              {group.ids.map((id) => {
                const f = factors.data?.factors.find((x) => x.id === id);
                return (
                  <div key={id} className="flex items-center justify-between gap-2 border-b border-[#151823] py-1 last:border-0">
                    <div className="min-w-0">
                      <div className="truncate text-[0.8125rem] text-[#b0b5c0]" title={id}>{f?.label ?? id}</div>
                      <div className="text-[0.6875rem] text-[#4d5364]">
                        {f?.asOf ?? '不可得'} · {f?.source ?? '—'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-[0.875rem] text-[#d8dce6]">
                        {f?.value == null ? '—' : f.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[0.6875rem] text-[#636878]">
                        {f?.percentile == null ? '分位 —' : `分位 ${f.percentile}%`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
