/**
 * 开源项目数据线：一条线 = 一个 Python 侧车方法。
 *
 * 纪律：成功才显示 rows；失败/未装库显示「缺」+ 侧车给出的具体原因，
 * 不用演示值顶替。每条线都标注项目名、稳定性与主源归属，便于在业务页
 * 直接确认「这条数据是哪个开源项目供的」。
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { apiPost } from '../../core/data/client';

type Row = Record<string, unknown>;

export interface SidecarFeedProps {
  /** 项目显示名，例如 AkShare / baostock / ccxt / EDGAR */
  project: string;
  /** 稳定性等级，S1 / S3 / S4 / TOOL 等 */
  stability: string;
  /** 数据线标题 */
  title: string;
  /** 口径说明：单位、时间、复权等 */
  caliber: string;
  /** 侧车白名单方法 */
  method: string;
  /** 方法参数 */
  params: Record<string, string | number>;
  /** 参数变化时用于重新取数；不传则由 params 决定 */
  refreshKey?: string | number;
  /** 最多展示行数，默认 30 */
  maxRows?: number;
}

function cellText(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const SidecarFeed = memo(function SidecarFeed({
  project,
  stability,
  title,
  caliber,
  method,
  params,
  refreshKey,
  maxRows = 30,
}: SidecarFeedProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [extra, setExtra] = useState<string>('');

  const paramKey = useMemo(() => JSON.stringify(params), [params]);
  const key = `${method}|${paramKey}|${refreshKey ?? ''}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMissing([]);
    setRows([]);
    setExtra('');
    apiPost<Record<string, unknown>>('/data-sidecar/call', { method, params }, 50_000)
      .then((env) => {
        if (!alive) return;
        const data = env.data ?? {};
        const got = Array.isArray(data.rows) ? (data.rows as Row[]) : [];
        setRows(got);
        setMissing(env.meta.missing ?? []);
        const bits: string[] = [];
        if (data.date) bits.push(`日期 ${String(data.date)}`);
        if (data.symbol) bits.push(`标的 ${String(data.symbol)}`);
        if (data.code) bits.push(`代码 ${String(data.code)}`);
        if (data.ticker) bits.push(`ticker ${String(data.ticker)}`);
        if (data.last != null) bits.push(`最新价 ${String(data.last)}`);
        if (data.quoteVolume != null) bits.push(`成交额 ${String(data.quoteVolume)}`);
        if (data.caliber) bits.push(String(data.caliber));
        setExtra(bits.join(' · '));
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setMissing([err instanceof Error ? err.message : '侧车请求失败']);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo(() => {
    const seen: string[] = [];
    for (const row of rows.slice(0, 5)) {
      for (const k of Object.keys(row)) if (!seen.includes(k)) seen.push(k);
    }
    return seen.slice(0, 12);
  }, [rows]);

  return (
    <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">{title}</h3>
          <span className="rounded bg-[rgba(64,120,255,0.14)] px-1.5 py-0.5 text-[0.75rem] text-[#8fb0ff]">{project}</span>
          <span className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[0.75rem] text-[#8b91a1]">{stability}</span>
        </div>
        <span className="text-[0.75rem] text-[#636878]">方法 {method}</span>
      </div>
      <p className="mt-1 text-[0.75rem] leading-relaxed text-[#636878]">{caliber}</p>

      {loading && <p className="mt-2 text-[0.8125rem] text-[#8b91a1]">读取中…（首次调用需启动 Python 侧车）</p>}
      {!loading && missing.length > 0 && (
        <div className="mt-2 rounded border border-[rgba(240,68,82,0.35)] bg-[rgba(240,68,82,0.07)] px-2 py-1.5 text-[0.8125rem] leading-relaxed text-[#f04452]">
          缺：{missing.join('；')}
        </div>
      )}
      {!loading && missing.length === 0 && extra && (
        <p className="mt-1 text-[0.75rem] text-[#8b91a1]">{extra}</p>
      )}
      {!loading && missing.length === 0 && rows.length === 0 && (
        <p className="mt-2 text-[0.8125rem] text-[#f5a524]">缺：侧车返回空数据，未生成模拟值</p>
      )}

      {rows.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="border-b border-[#1a1d26] text-left text-[#787e8e]">
                {columns.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1.5">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, maxRows).map((row, i) => (
                <tr key={i} className="border-b border-[#151821] last:border-b-0">
                  {columns.map((c) => (
                    <td key={c} className="whitespace-nowrap px-2 py-1.5 text-[#b0b5c0]" title={cellText(row[c])}>
                      {cellText(row[c]).slice(0, 40)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > maxRows && (
            <p className="mt-1 text-[0.75rem] text-[#636878]">仅显示前 {maxRows} 行，共 {rows.length} 行</p>
          )}
        </div>
      )}
    </section>
  );
});
