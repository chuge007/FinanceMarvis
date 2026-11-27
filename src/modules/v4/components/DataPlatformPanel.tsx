/**
 * 档案页 · 数据平台区块。
 *
 * 回答「这些数字现在到底能不能用」：每个源最近一次抓取是否成功、
 * 历史覆盖到哪一天、库里有几个点、哪些能力还没启用。
 *
 * 与旧版「数据血缘」的区别：旧版只看当前快照（内存），这一版看本地历史库，
 * 重启不丢，所以能回答「这条序列我到底有多少历史」。
 */
import { memo } from 'react';
import { useCatalog, useHealth } from '../../../core/data/hooks';

export const DataPlatformPanel = memo(function DataPlatformPanel() {
  const health = useHealth();
  const catalog = useCatalog();
  const sources = health.data?.sources ?? [];
  const db = health.data?.db;

  return (
    <div className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[0.875rem] font-bold text-[#d8dce6]">数据平台 · 本地历史库与源健康</h3>
        <span className="text-[0.75rem] text-[#4d5364]">
          {db ? `${db.driver} · ${db.seriesCount} 条序列 · ${db.pointCount.toLocaleString()} 点` : '不可得'}
        </span>
      </div>

      {sources.length === 0 ? (
        <div className="flex h-20 items-center justify-center text-[0.8125rem] text-[#4d5364]">
          数据服务未启动，无法读取源健康度
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="border-b border-[#1a1d26] text-left text-[0.75rem] text-[#4d5364]">
                <th className="py-1.5 pr-2 font-normal">源</th>
                <th className="py-1.5 pr-2 font-normal">状态</th>
                <th className="py-1.5 pr-2 font-normal">耗时</th>
                <th className="py-1.5 pr-2 font-normal">历史覆盖</th>
                <th className="py-1.5 pr-2 font-normal">说明</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b border-[#151823] last:border-0">
                  <td className="py-1.5 pr-2 font-mono text-[0.75rem] text-[#b0b5c0]">
                    {s.id}
                    <span className="ml-1.5 text-[0.6875rem] text-[#4d5364]">{s.seriesCount ?? 0} 条</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className={s.ok ? 'text-[#30a46c]' : 'text-[#e5484d]'}>{s.ok ? '正常' : '异常'}</span>
                    {(s.consecutiveFailures ?? 0) >= 2 && (
                      <span className="ml-1.5 rounded bg-[#e5484d]/15 px-1 text-[0.75rem] text-[#e5484d]">
                        连续 {s.consecutiveFailures} 轮
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-[0.75rem] text-[#636878]">
                    {s.latencyMs == null ? '—' : `${s.latencyMs}ms`}
                  </td>
                  <td className="py-1.5 pr-2 text-[0.75rem] text-[#636878]">
                    {s.coverage && s.coverage.points > 0
                      ? `${s.coverage.first} → ${s.coverage.last}（${s.coverage.points}）`
                      : '无历史'}
                  </td>
                  <td className="py-1.5 pr-2 text-[0.75rem] text-[#4d5364]">{s.error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#151823] pt-2 text-[0.75rem] text-[#4d5364]">
        <span>形态 {(catalog.data?.profile ?? '—')}</span>
        <span>运行 {health.data?.uptimeSec ?? 0}s</span>
        <span>能力 {(health.data?.capabilities ?? []).filter((c) => c.available).length}/{health.data?.capabilities?.length ?? 0} 已启用</span>
      </div>
    </div>
  );
});
