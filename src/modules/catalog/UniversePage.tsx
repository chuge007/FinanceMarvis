/**
 * 全景：26 个开源项目的全部功能与数据落点。
 *
 * 两个视角共用同一份能力清单：
 * - 操盘手：按决策任务看「现在能用什么、缺什么」
 * - 产品经理：按项目/能力看「谁供数、谁被合并、为什么」
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { apiPost } from '../../core/data/client';
import {
  CAPABILITIES_GENERATED_AT,
  CAPABILITIES_TOTAL,
  CAPABILITIES_URL,
  PROJECT_META,
  type Capability,
  type CapabilityStatus,
} from '../../core/data/projectCapabilities.generated';

type ViewMode = 'trader' | 'pm';
type Tab = 'projects' | 'capabilities' | 'arbiter' | 'gaps';

const STATUS_LABEL: Record<CapabilityStatus, string> = {
  live: '已接入',
  backup: '备源',
  'key-required': '需 Key',
  'python-required': '需 Python',
  'catalog-only': '仅目录',
  'external-only': '外部核对',
};

const STATUS_CLASS: Record<CapabilityStatus, string> = {
  live: 'bg-[rgba(12,166,120,0.14)] text-[#3bc9a1]',
  backup: 'bg-[rgba(64,120,255,0.14)] text-[#8fb0ff]',
  'key-required': 'bg-[rgba(245,158,75,0.14)] text-[#f5b45a]',
  'python-required': 'bg-[rgba(245,158,75,0.14)] text-[#f5b45a]',
  'catalog-only': 'bg-[rgba(255,255,255,0.06)] text-[#8b91a1]',
  'external-only': 'bg-[rgba(255,255,255,0.06)] text-[#8b91a1]',
};

const ARBITER: { domain: string; primary: string; backup: string; merged: string; reason: string }[] = [
  { domain: 'A股实时快照 / 指数', primary: '腾讯直连', backup: '东财 /eastmoney-quote', merged: 'AkShare、ADATA、efinance', reason: '腾讯免密且结构稳定；东财 push2 当前网络被重置，爬虫库只补字段' },
  { domain: 'A股日 / 周 / 月 K 线', primary: '腾讯 tencent-web（前复权）', backup: 'baostock / pytdx / mootdx', merged: 'AkShare、efinance', reason: 'baostock 需与腾讯逐日偏差 ≤0.1% 才允许换主；通达信系列依赖本机服务' },
  { domain: 'A股财务三表 / 指标', primary: 'Tushare Pro（ann_date）', backup: '无（缺失即「缺」）', merged: 'AkShare、ADATA、efinance', reason: '爬虫源无公告日锚点、无 PIT、无 SLA，禁止做财务主源' },
  { domain: 'A股两融 / 龙虎榜', primary: 'Tushare Pro', backup: 'AkShare stock_lhb', merged: 'efinance', reason: '席位口径分列，不把营业部与机构专用合并统计' },
  { domain: 'A股板块 / 资金流', primary: '腾讯行业榜（31 行业）', backup: '新浪板块（仅当日价格）', merged: 'ADATA、efinance', reason: '统一换算为亿元；腾讯行业分类不与申万分类混算' },
  { domain: '港股指数 / 个股', primary: '腾讯 hk<code>', backup: 'AkShare 港股', merged: 'yfinance', reason: '按港交所日历对齐；同源多库只走一条通道' },
  { domain: '美股 EOD', primary: 'FMP（高价值）/ Yahoo（其余）', backup: '互为备源', merged: 'yfinance、yahooquery', reason: 'FMP 402/429 立即回落 Yahoo 不重试；同源库合并进 Yahoo 直连' },
  { domain: '美股财报 / 13F', primary: 'SEC EDGAR 官方', backup: '无', merged: 'yfinance 财务字段', reason: '官方一手；EDGAR 给的是已提交文件，不是预约日期' },
  { domain: '美股期权情绪', primary: 'CBOE 每日统计', backup: '无', merged: 'yfinance 期权链', reason: '只有当日值、无历史，不参与分位与合成指标' },
  { domain: '美国宏观', primary: 'FRED 官方 CSV / API', backup: '/fred-proxy', merged: 'fredapi、pandas-datareader', reason: '同源库合并直连；缺失值跳过不插值' },
  { domain: '美债曲线 / SOFR', primary: '美财政部 CSV / NY Fed', backup: 'FRED DGS* / SOFR', merged: '—', reason: '官方日度收盘；2s10s 必须同源两点相减' },
  { domain: '中国宏观', primary: '人民银行 / 国家统计局', backup: 'AkShare（仅趋势）', merged: '—', reason: 'FRED 中国 M2 镜像滞后约 1 个月，只作趋势' },
  { domain: '全球政策利率 / 年度宏观', primary: 'BIS / 世界银行', backup: 'Nasdaq Data Link（Key）', merged: 'OpenBB', reason: '年度序列不与季度序列混轴；聚合层不作为数据源' },
  { domain: '期货商品 / 外汇', primary: 'Yahoo 连续合约 / DX-Y.NYB', backup: 'AkShare 期货 / 外汇', merged: 'vn.py（工具层）', reason: '连续合约换月口径必须标注' },
  { domain: '基金净值', primary: 'AkShare fund_nav（侧车）', backup: 'efinance 基金接口', merged: '—', reason: '按库 importable 显示可用性，缺库显示「缺」' },
  { domain: '加密现货 / K 线', primary: 'ccxt 直连 Binance', backup: 'Yahoo BTC-USD', merged: 'freqtrade（策略层）', reason: '单一交易所口径，不跨所平均；USDT 不等同 USD' },
  { domain: '稳定币 / DeFi', primary: 'DefiLlama', backup: '无', merged: 'OpenBB', reason: '只统计已发链上流通量' },
  { domain: '情绪', primary: 'alternative.me + 自建 A股情绪', backup: '无', merged: '—', reason: '两套口径分列展示，禁止合成单一情绪分' },
  { domain: '事件日历', primary: '美联储官网 + WSCN', backup: '无', merged: '—', reason: '预约事件与实际发布值不得混称' },
  { domain: '研报', primary: 'Wind Alice（本机客户端）', backup: '无', merged: 'OpenBB', reason: '未就绪时显示「缺」，不用模拟结论' },
  { domain: '绩效指标', primary: '自建 core/domain/factors.mjs', backup: '无', merged: 'pyfolio、empyrical（公式参考）', reason: '只对主源数据计算；年化固定 √252，无风险利率用 FRED DFF' },
];

const TRADER_TASKS: { task: string; when: string; domains: string[] }[] = [
  { task: '盘前定调', when: '开盘前', domains: ['美债曲线 / SOFR', '美国宏观', '期货商品 / 外汇', '事件日历'] },
  { task: '盘中强弱', when: '交易时段', domains: ['A股实时快照 / 指数', 'A股板块 / 资金流', '加密现货 / K 线', '情绪'] },
  { task: '个股下钻', when: '随时', domains: ['A股财务三表 / 指标', 'A股两融 / 龙虎榜', '美股财报 / 13F', '港股指数 / 个股'] },
  { task: '盘后复盘', when: '收盘后', domains: ['美股 EOD', 'A股日 / 周 / 月 K 线', '绩效指标', '基金净值'] },
];

function StatusPill({ status }: { status: CapabilityStatus }) {
  return <span className={`rounded px-1.5 py-0.5 text-[0.75rem] ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export const UniversePage = memo(function UniversePage() {
  const [view, setView] = useState<ViewMode>('pm');
  const [tab, setTab] = useState<Tab>('projects');
  const [caps, setCaps] = useState<Capability[]>([]);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'all' | CapabilityStatus>('all');
  const [limit, setLimit] = useState(60);
  // 能力试取：只对可通用调用的库显示按钮，结果如实展示，失败显示「缺」。
  const [trial, setTrial] = useState<Capability | null>(null);
  const [trialArgs, setTrialArgs] = useState('{}');
  const [trialResult, setTrialResult] = useState<string>('');
  const [trialMissing, setTrialMissing] = useState<string[]>([]);
  const [trialBusy, setTrialBusy] = useState(false);

  const CALLABLE_PROJECTS = new Set(['akshare', 'efinance', 'yahooquery', 'adata']);

  async function runTrial() {
    if (!trial || trialBusy) return;
    let kwargs: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(trialArgs || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) kwargs = parsed;
      else throw new Error('参数必须是 JSON 对象');
    } catch (err) {
      setTrialMissing([err instanceof Error ? err.message : '参数解析失败']);
      return;
    }
    setTrialBusy(true);
    setTrialResult('');
    setTrialMissing([]);
    try {
      const r = await apiPost<{ result: { rows?: unknown[]; value?: unknown } }>('/capability/call', {
        id: trial.id, args: [], kwargs,
      }, 130_000);
      const value = r.data.result;
      const rows = value?.rows ?? [];
      setTrialMissing(r.meta.missing ?? []);
      setTrialResult(rows.length
        ? JSON.stringify(rows.slice(0, 20), null, 2)
        : value?.value != null ? JSON.stringify(value.value, null, 2) : '函数已执行，未返回表格数据');
    } catch (err) {
      setTrialMissing([err instanceof Error ? err.message : '调用失败']);
    } finally {
      setTrialBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    fetch(CAPABILITIES_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { capabilities?: Capability[] }) => {
        if (alive) setCaps(j.capabilities ?? []);
      })
      .catch((e: Error) => { if (alive) setLoadError(e.message); });
    return () => { alive = false; };
  }, []);

  const categories = useMemo(
    () => [...new Set(caps.map((c) => c.category))].sort(),
    [caps],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return caps.filter((c) =>
      (!q || c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) &&
      (!project || c.project === project) &&
      (!category || c.category === category) &&
      (status === 'all' || c.status === status),
    );
  }, [caps, query, project, category, status]);

  const statusCounts = useMemo(() => {
    const m = new Map<CapabilityStatus, number>();
    for (const c of caps) m.set(c.status, (m.get(c.status) ?? 0) + 1);
    return m;
  }, [caps]);

  const gaps = useMemo(() => [
    { label: '需 Key 才能取数', count: statusCounts.get('key-required') ?? 0, hint: '在「设置」填入 Tushare / FMP 等 Key 后自动注册对应链路' },
    { label: '需 Python 3.11+ 与依赖库', count: statusCounts.get('python-required') ?? 0, hint: 'py -3.11 -m pip install -r sidecar\\requirements-data.txt，或设 MARVIS_PYTHON' },
    { label: '依赖本机行情 / 交易服务', count: statusCounts.get('external-only') ?? 0, hint: '通达信 / CTP 服务不在程序内，按档案页外部手册核对' },
    { label: '仅目录（同一上游已合并或聚合层不供数）', count: statusCounts.get('catalog-only') ?? 0, hint: '能力可见但不单独供数；同类数据由最稳定主源统一提供' },
  ], [statusCounts]);

  const openProject = (id: string) => {
    setProject(id);
    setTab('capabilities');
    setLimit(60);
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">全景 · 26 个开源项目的全部功能与数据</h2>
          <p className="mt-1 text-[0.8125rem] text-[#636878]">
            能力 {CAPABILITIES_TOTAL.toLocaleString()} 条 · 项目 {PROJECT_META.length} 个 · 已克隆 {PROJECT_META.filter((p) => p.cloned).length} 个 · 清单生成于 {CAPABILITIES_GENERATED_AT.slice(0, 16).replace('T', ' ')}
          </p>
        </div>
        <div className="flex rounded border border-[#1a1d26] bg-[#0f1118] p-0.5">
          {(['pm', 'trader'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-2.5 py-1 text-[0.8125rem] ${view === v ? 'bg-[rgba(64,120,255,0.18)] text-[#d8dce6]' : 'text-[#787e8e]'}`}
            >
              {v === 'pm' ? '产品经理视角' : '操盘手视角'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[#1a1d26]">
        {([['projects', '项目矩阵'], ['capabilities', '能力目录'], ['arbiter', '去重裁决'], ['gaps', '缺口看板']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-[0.8125rem] ${tab === id ? 'border-b-2 border-[#4080ff] text-[#d8dce6]' : 'text-[#787e8e] hover:text-[#b0b5c0]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="rounded-[5px] border border-[rgba(229,72,77,0.35)] bg-[rgba(229,72,77,0.08)] p-2 text-[0.8125rem] text-[#e5484d]">
          能力清单加载失败：{loadError}。请先执行 <code>node scripts/gen-project-capabilities.mjs</code>。
        </div>
      )}

      {view === 'trader' && tab === 'projects' ? (
        <div className="grid gap-2 md:grid-cols-2">
          {TRADER_TASKS.map((t) => (
            <section key={t.task} className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[0.9375rem] font-semibold text-[#d8dce6]">{t.task}</h3>
                <span className="text-[0.75rem] text-[#636878]">{t.when}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {t.domains.map((d) => {
                  const row = ARBITER.find((a) => a.domain === d);
                  return (
                    <li key={d} className="text-[0.8125rem] leading-relaxed text-[#b0b5c0]">
                      <span className="text-[#d8dce6]">{d}</span>
                      <span className="mx-1.5 text-[#4d5364]">→</span>
                      {row?.primary ?? '—'}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {view === 'pm' && tab === 'projects' && (
        <div className="overflow-x-auto rounded-[5px] border border-[#1a1d26] bg-[#0f1118]">
          <table className="w-full min-w-[64rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="border-b border-[#1a1d26] text-left text-[#787e8e]">
                <th className="px-2 py-2">项目</th><th className="px-2 py-2">分组</th><th className="px-2 py-2">稳定性</th>
                <th className="px-2 py-2">状态</th><th className="px-2 py-2">能力数</th><th className="px-2 py-2">主源数据集</th>
                <th className="px-2 py-2">备源数据集</th><th className="px-2 py-2">上游仓库</th><th className="px-2 py-2">本地路径</th>
              </tr>
            </thead>
            <tbody>
              {PROJECT_META.map((p) => (
                <tr key={p.id} className="border-b border-[#151821] last:border-b-0 hover:bg-[rgba(255,255,255,0.02)]">
                  <td className="px-2 py-2"><button className="text-[#8fb0ff] hover:underline" onClick={() => openProject(p.id)}>{p.label}</button></td>
                  <td className="px-2 py-2 text-[#8b91a1]">{p.group}</td>
                  <td className="px-2 py-2 text-[#8b91a1]">{p.stability}</td>
                  <td className="px-2 py-2"><StatusPill status={p.status} /></td>
                  <td className="px-2 py-2 text-[#d8dce6]">{p.capabilityCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-[#8b91a1]">{p.primaryFor.join('、') || '—'}</td>
                  <td className="px-2 py-2 text-[#8b91a1]">{p.fallbackFor.join('、') || '—'}</td>
                  <td className="px-2 py-2 text-[#636878]">{p.repo}</td>
                  <td className="px-2 py-2 text-[#636878]">{p.dir}{p.cloned ? '' : '（未克隆）'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'capabilities' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-2">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLimit(60); }}
              placeholder="搜索函数名 / 中文名 / 能力 ID"
              className="min-w-[14rem] flex-1 rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#d8dce6] outline-none placeholder:text-[#4d5364]"
            />
            <select value={project} onChange={(e) => { setProject(e.target.value); setLimit(60); }} className="rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#b0b5c0]">
              <option value="">全部项目</option>
              {PROJECT_META.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setLimit(60); }} className="rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#b0b5c0]">
              <option value="">全部类别</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value as 'all' | CapabilityStatus); setLimit(60); }} className="rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 text-[0.8125rem] text-[#b0b5c0]">
              <option value="all">全部状态</option>
              {(Object.keys(STATUS_LABEL) as CapabilityStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <span className="text-[0.8125rem] text-[#636878]">命中 {filtered.length.toLocaleString()} / {caps.length.toLocaleString()}</span>
            {project && <button className="text-[0.8125rem] text-[#8fb0ff] hover:underline" onClick={() => setProject('')}>清除项目筛选</button>}
          </div>

          <div className="overflow-x-auto rounded-[5px] border border-[#1a1d26] bg-[#0f1118]">
            <table className="w-full min-w-[56rem] border-collapse text-[0.8125rem]">
              <thead>
                <tr className="border-b border-[#1a1d26] text-left text-[#787e8e]">
                  <th className="px-2 py-2">能力</th><th className="px-2 py-2">项目</th><th className="px-2 py-2">类别</th>
                  <th className="px-2 py-2">状态</th><th className="px-2 py-2">稳定性</th><th className="px-2 py-2">市场</th>
                  <th className="px-2 py-2">主源 / 备源</th><th className="px-2 py-2">源码路径</th><th className="px-2 py-2">试取</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((c) => (
                  <tr key={c.id} className="border-b border-[#151821] last:border-b-0 hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="px-2 py-1.5"><span className="text-[#d8dce6]">{c.name}</span><span className="ml-1.5 text-[#636878]">{c.symbol}</span></td>
                    <td className="px-2 py-1.5 text-[#8b91a1]">{c.projectLabel}</td>
                    <td className="px-2 py-1.5 text-[#8b91a1]">{c.category}</td>
                    <td className="px-2 py-1.5"><StatusPill status={c.status} /></td>
                    <td className="px-2 py-1.5 text-[#8b91a1]">{c.stability}</td>
                    <td className="px-2 py-1.5 text-[#636878]">{c.markets.join('/')}</td>
                    <td className="px-2 py-1.5 text-[#636878]">{c.primaryFor.join('、') || c.fallbackFor.join('、') || '—'}</td>
                    <td className="px-2 py-1.5 text-[#636878]">{c.sourcePath}</td>
                    <td className="px-2 py-1.5">
                      {CALLABLE_PROJECTS.has(c.project)
                        ? <button
                            onClick={() => { setTrial(c); setTrialArgs('{}'); setTrialResult(''); setTrialMissing([]); }}
                            className="rounded border border-[#4078ff] px-2 py-1 text-[0.75rem] text-[#8fb0ff] hover:bg-[rgba(64,120,255,0.12)]"
                          >试取</button>
                        : <span className="text-[0.75rem] text-[#4d5364]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {limit < filtered.length && (
            <button onClick={() => setLimit((v) => v + 120)} className="rounded border border-[#232734] px-3 py-1.5 text-[0.8125rem] text-[#b0b5c0] hover:bg-[rgba(255,255,255,0.04)]">
              再加载 120 条（当前 {limit} / {filtered.length}）
            </button>
          )}

          {trial && (
            <div className="rounded-[5px] border border-[#232734] bg-[#0b0e14] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">试取 · {trial.projectLabel}:{trial.symbol}</h3>
                <button onClick={() => setTrial(null)} className="text-[0.8125rem] text-[#787e8e] hover:text-[#d8dce6]">关闭</button>
              </div>
              <p className="mt-1 text-[0.75rem] text-[#636878]">
                仅传 JSON 对象参数（对应函数的关键字参数）。缺库/源站不可达时显示「缺」，不生成模拟值。
              </p>
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <textarea value={trialArgs} onChange={(e) => setTrialArgs(e.target.value)} rows={3}
                  className="min-w-[18rem] flex-1 rounded border border-[#232734] bg-[#0a0c11] px-2 py-1.5 font-mono text-[0.8125rem] text-[#d8dce6] outline-none" />
                <button onClick={runTrial} disabled={trialBusy}
                  className="rounded bg-[#4080ff] px-3 py-2 text-[0.8125rem] text-white disabled:opacity-50">
                  {trialBusy ? '取数中…' : '执行'}
                </button>
              </div>
              {trialMissing.length > 0 && (
                <div className="mt-2 rounded border border-[rgba(240,68,82,0.35)] bg-[rgba(240,68,82,0.07)] px-2 py-1.5 text-[0.8125rem] text-[#f04452]">
                  缺：{trialMissing.join('；')}
                </div>
              )}
              {trialResult && <pre className="mt-2 max-h-64 overflow-auto rounded border border-[#1a1d26] bg-[#0a0c11] p-2 text-[0.75rem] leading-relaxed text-[#b0b5c0]">{trialResult}</pre>}
            </div>
          )}
        </div>
      )}

      {tab === 'arbiter' && (
        <div className="overflow-x-auto rounded-[5px] border border-[#1a1d26] bg-[#0f1118]">
          <table className="w-full min-w-[66rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="border-b border-[#1a1d26] text-left text-[#787e8e]">
                <th className="px-2 py-2">数据域</th><th className="px-2 py-2">唯一主源</th><th className="px-2 py-2">备源</th>
                <th className="px-2 py-2">被合并 / 降级</th><th className="px-2 py-2">裁决理由</th>
              </tr>
            </thead>
            <tbody>
              {ARBITER.map((a) => (
                <tr key={a.domain} className="border-b border-[#151821] last:border-b-0">
                  <td className="whitespace-nowrap px-2 py-2 text-[#d8dce6]">{a.domain}</td>
                  <td className="px-2 py-2 text-[#3bc9a1]">{a.primary}</td>
                  <td className="px-2 py-2 text-[#8fb0ff]">{a.backup}</td>
                  <td className="px-2 py-2 text-[#8b91a1]">{a.merged}</td>
                  <td className="px-2 py-2 text-[#8b91a1]">{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'gaps' && (
        <div className="grid gap-2 md:grid-cols-2">
          {gaps.map((g) => (
            <section key={g.label} className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">{g.label}</h3>
                <span className="rounded bg-[rgba(245,158,75,0.12)] px-1.5 py-0.5 text-[0.75rem] text-[#f5b45a]">{g.count.toLocaleString()} 条</span>
              </div>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#8b91a1]">{g.hint}</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
});
