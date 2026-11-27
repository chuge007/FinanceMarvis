/**
 * 数据总览：把本地历史库里的每一条序列、每一个快照都列出来。
 *
 * 这是「全部数据都提供上来」的落点：能取到的都在这里，取不到的也标出来。
 * 每条都带来源、频率、口径与历史覆盖，点击可筛选。
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { useCatalog, useHealth } from '../../core/data/hooks';
import { GENERATED_SOURCES } from '../../core/data/registry.generated';
import { DOMAIN_LABEL as ASSET_DOMAIN_LABEL, ROLE_LABEL } from '../../core/data/sourceCatalog';
import type { DataDomain, SourceRole } from '../../core/data/contracts';

const DOMAIN_LABEL: Record<string, string> = {
  'us:rates': '美国利率',
  'us:real-rate': '实际利率',
  'us:inflation': '通胀',
  'us:employment': '就业',
  'us:growth': '增长',
  'us:consumption': '消费',
  'us:liquidity': '美元流动性',
  'us:financial-conditions': '金融条件',
  'us:credit-spread': '信用利差',
  'us:volatility': '波动率',
  'us:repo': '回购市场',
  'us:yield-curve': '美债曲线',
  'us:index-kline': '美股指数',
  'us:etf': '美股 ETF',
  'cn:index-kline': 'A 股 / 港股指数',
  'cn:index': 'A 股指数（增强）',
  'global:index': '全球指数',
  'global:macro-annual': '全球宏观面板',
  'global:policy-rate': '全球政策利率',
  'global:market': '全球市场',
  'commodity:metal': '贵金属',
  'commodity:energy': '能源',
  'fx:official': '外汇',
  'fx:dxy': '美元指数',
  'crypto:major': '加密资产',
  'sentiment:fear-greed': '情绪',
  'macro:mirror': '宏观镜像',
  'jp:yield-curve': '日本利率',
  'sector:rank': '行业板块',
};

interface SidecarStatus {
  available: boolean;
  python: string;
  libs: Record<string, boolean>;
  importErrors: Record<string, string>;
  lastError?: string;
  hint?: string;
}

function SidecarStatusPanel() {
  const [status, setStatus] = useState<SidecarStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/data-sidecar/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((env) => {
        if (alive && env?.data) setStatus(env.data as SidecarStatus);
      })
      .catch(() => { /* 数据服务不可用时静默 */ });
    return () => { alive = false; };
  }, []);

  const libs = status?.libs ?? {};
  const names: Record<string, string> = {
    akshare: 'AkShare', edgartools: 'SEC EDGAR', ccxt: 'ccxt',
    baostock: 'baostock', efinance: 'efinance',
  };
  return (
    <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">Python 数据侧车 · 可选能力</h3>
        <span className={`rounded px-1.5 py-0.5 text-[0.75rem] ${status?.available ? 'bg-[rgba(12,166,120,0.12)] text-[#0ca678]' : 'bg-[rgba(245,158,75,0.12)] text-[#f59e4b]'}`}>
          {!status ? '探测中' : status.available ? '就绪' : '未就绪'}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-[#b0b5c0]">
        {Object.entries(names).map(([key, label]) => (
          <span key={key}>
            <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${libs[key] ? 'bg-[#30a46c]' : 'bg-[#e5484d]'}`} />
            {label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[0.75rem] leading-relaxed text-[#636878]">
        {status?.hint ?? '未装 Python 或依赖时，龙虎榜 / SEC 财报 / 加密行情显示「缺」，不用演示值替代。'}
      </p>
    </section>
  );
}

export const DataCatalogPage = memo(function DataCatalogPage() {
  const catalog = useCatalog();
  const health = useHealth();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [domain, setDomain] = useState<DataDomain | 'all'>('all');
  const [role, setRole] = useState<SourceRole | 'all'>('all');

  const sources = catalog.data?.sources ?? [];
  const snapshotsCatalog = catalog.data?.snapshots ?? [];
  const coverage = health.data?.sources ?? [];

  /** 用注册表生成的清单给每个上游序列附上 domain/role 标签。 */
  const metaBySource = useMemo(() => {
    const map = new Map<string, { domain: DataDomain; role: SourceRole; quality: string; stability: string }>();
    for (const s of GENERATED_SOURCES) map.set(s.id, { domain: s.domain, role: s.role, quality: s.quality, stability: s.stability ?? 'S4' });
    return map;
  }, []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = sources.filter((s) => {
      const meta = metaBySource.get(s.source);
      return (
        (!q || s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.dataset.toLowerCase().includes(q)) &&
        (!source || s.source === source) &&
        (domain === 'all' || meta?.domain === domain) &&
        (role === 'all' || meta?.role === role)
      );
    });
    const map = new Map<string, typeof filtered>();
    for (const s of filtered) {
      const key = metaBySource.get(s.source)?.domain ?? 'market';
      (map.get(key) ?? map.set(key, []).get(key)!).push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sources, query, source, domain, role, metaBySource]);

  const sourceOptions = useMemo(
    () => [...new Set(sources.map((s) => s.source))].sort(),
    [sources],
  );

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">数据总览 · 本地历史库里的全部数据</h2>
        <p className="mt-1 text-[0.8125rem] text-[#636878]">
          共 {sources.length} 条序列 / {snapshotsCatalog.length} 组快照。每条都标来源、频率与口径；不可得的域不会伪造数值。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
        <label htmlFor="catalog-query" className="text-[0.8125rem] text-[#636878]">筛选</label>
        <input
          id="catalog-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入指标名 / 序列 id / 数据域"
          className="min-w-[16rem] flex-1 rounded border border-[#1a1d26] bg-[#0b0d13] px-2.5 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
        />
        <label htmlFor="catalog-source" className="text-[0.8125rem] text-[#636878]">来源</label>
        <select
          id="catalog-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded border border-[#1a1d26] bg-[#0b0d13] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
        >
          <option value="">全部</option>
          {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label htmlFor="catalog-domain" className="text-[0.8125rem] text-[#636878]">域</label>
        <select
          id="catalog-domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value as DataDomain | 'all')}
          className="rounded border border-[#1a1d26] bg-[#0b0d13] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
        >
          <option value="all">全部域</option>
          {Object.entries(ASSET_DOMAIN_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <label htmlFor="catalog-role" className="text-[0.8125rem] text-[#636878]">角色</label>
        <select
          id="catalog-role"
          value={role}
          onChange={(e) => setRole(e.target.value as SourceRole | 'all')}
          className="rounded border border-[#1a1d26] bg-[#0b0d13] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
        >
          <option value="all">全部角色</option>
          <option value="primary">主源</option>
          <option value="backup">备源</option>
          <option value="fallback">兜底</option>
          <option value="deprecated">已失效</option>
        </select>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          {groups.map(([dataset, rows]) => (
            <section key={dataset} className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">
                  {ASSET_DOMAIN_LABEL[dataset as DataDomain] ?? DOMAIN_LABEL[dataset] ?? dataset}
                </h3>
                <span className="text-[0.75rem] text-[#4d5364]">{rows.length} 条</span>
              </div>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {rows.map((s) => {
                  const cov = coverage.find((c) => c.id === s.source)?.coverage;
                  return (
                    <div key={s.id} className="flex items-start justify-between gap-2 border-b border-[#151823] py-1.5 last:border-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[0.8125rem] text-[#b0b5c0]" title={s.id}>{s.label}</span>
                          {metaBySource.get(s.source)?.role && (
                            <span className="shrink-0 rounded bg-[rgba(64,120,255,0.12)] px-1 py-0.5 text-[0.75rem] text-[#7ea6ff]">
                              {ROLE_LABEL[metaBySource.get(s.source)!.role]}
                            </span>
                          )}
                          {metaBySource.get(s.source)?.stability && (
                            <span
                              className="shrink-0 rounded bg-[rgba(255,255,255,0.06)] px-1 py-0.5 text-[0.75rem] text-[#8b91a1]"
                              title="稳定性 S1 官方 > S2 Key > S3 免密稳定 > S4 爬虫 > S5 聚合 > S6 失效；侧车方法级见「全景 → 去重裁决」"
                            >
                              {metaBySource.get(s.source)!.stability}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[0.75rem] text-[#636878]">
                          {s.id} · {s.freq}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[0.75rem] text-[#636878]">
                        <div>{s.source}</div>
                        <div>{cov?.points ? `${cov.points} 点` : '—'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {groups.length === 0 && (
            <div className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-6 text-center text-[0.8125rem] text-[#4d5364]">
              没有匹配的序列
            </div>
          )}
        </div>

        <div className="space-y-3">
          <SidecarStatusPanel />
          <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
            <h3 className="mb-2 text-[0.875rem] font-semibold text-[#d8dce6]">快照数据</h3>
            {snapshotsCatalog.map((s) => (
              <div key={s.id} className="flex justify-between border-b border-[#151823] py-1.5 last:border-0">
                <span className="text-[0.8125rem] text-[#b0b5c0]">{s.label}</span>
                <span className="font-mono text-[0.75rem] text-[#4d5364]">{s.source}</span>
              </div>
            ))}
          </section>

          <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
            <h3 className="mb-2 text-[0.875rem] font-semibold text-[#d8dce6]">源健康与覆盖</h3>
            {coverage.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border-b border-[#151823] py-1.5 last:border-0">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.ok ? 'bg-[#30a46c]' : 'bg-[#e5484d]'}`} />
                <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-[#b0b5c0]">{c.id}</span>
                <span className="text-[0.6875rem] text-[#4d5364]">
                  {c.coverage?.points ? `${c.coverage.points} 点 · ${c.coverage.last}` : '无历史'}
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
});
