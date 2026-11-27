import { memo, useMemo, useState } from 'react';
import {
  ACCESS_LABEL,
  CADENCE_HINT,
  CADENCE_LABEL,
  CHAIN_LABEL,
  KIND_LABEL,
  STATUS_LABEL,
  SOURCE_ENTRIES,
  PROJECT_REGISTRY,
  ROLE_LABEL,
  type SourceCadence,
  type SourceStatus,
} from '../../../core/data/sourceCatalog';

const CADENCES: SourceCadence[] = ['intraday', 'daily', 'weekly', 'monthly', 'quarterly', 'event'];

export const SourcePlaybook = memo(function SourcePlaybook() {
  const [cadence, setCadence] = useState<SourceCadence | 'all'>('all');
  const [status, setStatus] = useState<SourceStatus | 'all'>('all');

  const rows = useMemo(
    () =>
      SOURCE_ENTRIES.filter((entry) => cadence === 'all' || entry.cadence === cadence).filter(
        (entry) => status === 'all' || entry.status === status,
      ),
    [cadence, status],
  );

  const integrated = SOURCE_ENTRIES.filter((entry) => entry.status === 'integrated').length;

  return (
    <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[0.875rem] font-bold text-[#d8dce6]">外部数据源手册</h3>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-[#636878]">
            宏观回答「钱贵不贵」，微观回答「钱有没有真的在买」。这张表说明去哪看、多久看一次、对应地图哪一环。
          </p>
        </div>
        <div className="text-right text-[0.75rem] text-[#4d5364]">
          <div>
            已接入真实 {integrated} / {SOURCE_ENTRIES.length} 条
          </div>
          <div>其余为外部核对入口，不做估算伪造</div>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(['daily', 'weekly', 'monthly', 'quarterly'] as const).map((key) => {
          const hint = CADENCE_HINT[key];
          return (
            <div key={key} className="rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] px-2.5 py-2">
              <div className="flex items-center justify-between text-[0.75rem]">
                <span className="font-medium text-[#b0b5c0]">{hint.title}</span>
                <span className="text-[#4078ff]">{hint.time}</span>
              </div>
              <div className="mt-1 text-[0.75rem] leading-relaxed text-[#636878]">{hint.items}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button
          onClick={() => setCadence('all')}
          className={`rounded px-2 py-1 text-[0.75rem] ${
            cadence === 'all' ? 'bg-[#4078ff] text-white' : 'text-[#8a8f9d] hover:bg-[rgba(255,255,255,0.04)]'
          }`}
        >
          全部频率
        </button>
        {CADENCES.map((item) => (
          <button
            key={item}
            onClick={() => setCadence(item)}
            className={`rounded px-2 py-1 text-[0.75rem] ${
              cadence === item ? 'bg-[#4078ff] text-white' : 'text-[#8a8f9d] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            {CADENCE_LABEL[item]}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-[#1f2430]" />
        {(['all', 'integrated', 'external', 'planned', 'deprecated'] as const).map((item) => (
          <button
            key={item}
            onClick={() => setStatus(item)}
            className={`rounded px-2 py-1 text-[0.75rem] ${
              status === item ? 'bg-[rgba(64,120,255,0.18)] text-[#d8dce6]' : 'text-[#8a8f9d] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            {item === 'all' ? '全部状态' : STATUS_LABEL[item]}
          </button>
        ))}
        <span className="ml-auto text-[0.75rem] text-[#4d5364]">{rows.length} 条</span>
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[58rem] border-collapse text-[0.75rem]">
          <thead>
            <tr className="border-b border-[#1a1d26] text-left text-[0.6875rem] text-[#4d5364]">
              <th className="py-1.5 pr-2 font-normal">数据 / 网站</th>
              <th className="py-1.5 pr-2 font-normal">频率</th>
              <th className="py-1.5 pr-2 font-normal">看什么</th>
              <th className="py-1.5 pr-2 font-normal">链节点</th>
              <th className="py-1.5 pr-2 font-normal">状态</th>
              <th className="py-1.5 pr-2 font-normal">访问</th>
              <th className="py-1.5 font-normal">类别</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id} className="border-b border-[#131620] align-top hover:bg-[rgba(255,255,255,0.015)]">
                <td className="py-1.5 pr-2">
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#cfd6e4] underline decoration-[#2a3040] decoration-dotted underline-offset-2 hover:text-white"
                    title={`${entry.name} · ${entry.publisher}`}
                  >
                    {entry.name}
                  </a>
                  <div className="mt-0.5 text-[0.6875rem] text-[#4d5364]">{entry.publisher}</div>
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap text-[#8a8f9d]">{CADENCE_LABEL[entry.cadence]}</td>
                <td className="max-w-[22rem] py-1.5 pr-2 leading-relaxed text-[#636878]">{entry.watch}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap text-[#8a8f9d]">{CHAIN_LABEL[entry.chain]}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[0.6875rem] ${
                      entry.status === 'integrated'
                        ? 'bg-[rgba(12,166,120,0.12)] text-[#0ca678]'
                        : 'bg-[rgba(255,255,255,0.04)] text-[#8a8f9d]'
                    }`}
                  >
                    {STATUS_LABEL[entry.status]}
                  </span>
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <span className={entry.access === 'manual' ? 'text-[#f59e4b]' : entry.access === 'proxy' ? 'text-[#9b6efb]' : 'text-[#636878]'}>
                    {ACCESS_LABEL[entry.access]}
                  </span>
                </td>
                <td className="py-1.5 text-[#636878]">{KIND_LABEL[entry.kind]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[0.75rem] leading-relaxed text-[#4d5364]">
        ETF 净流入与 CFTC 持仓没有免密、稳定的机器接口，本应用只给外部入口，不用成交量或价格估算冒充净流入。
        事件类（FOMC、期权到期）按需插入，不计入四档节奏。
      </div>

      {/* 全部开源项目登记：每个库都有唯一去向，重复数据按类别合并并写明原因 */}
      <div className="mt-4 border-t border-[#1a1d26] pt-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[0.875rem] font-bold text-[#d8dce6]">全部开源项目登记 · 22 项去向</h4>
          <span className="text-[0.75rem] text-[#4d5364]">
            库 ≠ 数据源；同一类数据只留一个主源 + 备源，其余说明合并原因
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] border-collapse text-[0.75rem]">
            <thead>
              <tr className="border-b border-[#1a1d26] text-left text-[0.6875rem] text-[#4d5364]">
                <th className="py-1.5 pr-2 font-normal">项目</th>
                <th className="py-1.5 pr-2 font-normal">类别</th>
                <th className="py-1.5 pr-2 font-normal">角色</th>
                <th className="py-1.5 pr-2 font-normal">去向</th>
                <th className="py-1.5 font-normal">原因</th>
              </tr>
            </thead>
            <tbody>
              {PROJECT_REGISTRY.map((p) => (
                <tr key={p.name} className="border-b border-[#131620] align-top hover:bg-[rgba(255,255,255,0.015)]">
                  <td className="py-1.5 pr-2 whitespace-nowrap text-[#cfd6e4]">{p.name}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap text-[#8a8f9d]">{p.category}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[0.75rem] ${
                        p.role === 'primary'
                          ? 'bg-[rgba(12,166,120,0.12)] text-[#0ca678]'
                          : p.role === 'tool' || p.role === 'external-only'
                            ? 'bg-[rgba(255,255,255,0.04)] text-[#8a8f9d]'
                            : 'bg-[rgba(245,158,75,0.12)] text-[#f59e4b]'
                      }`}
                    >
                      {ROLE_LABEL[p.role]}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-[#b0b5c0]">{p.destination}</td>
                  <td className="py-1.5 leading-relaxed text-[#636878]">{p.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
