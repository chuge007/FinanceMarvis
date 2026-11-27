/**
 * 跨市场雷达：回答「钱在哪些市场风险偏好最高、轮动往哪走」。
 *
 * 本地自算分数与 airoom 第三方环境分数严格分列 —— 两者口径不同，
 * 混在一张表里排序会产生最隐蔽的误判。
 */
import { memo } from 'react';
import { useRadar } from '../../core/data/hooks';
import { BAND_LABEL, bandOf } from '../../core/domain';
import type { RegimeBand } from '../../core/domain';

function ScoreBlock({ score, band }: { score: number | null; band: RegimeBand | null }) {
  const color = band ? BAND_LABEL[band].color : '#4d5364';
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[2rem] font-bold leading-none" style={{ color }}>
        {score == null ? '—' : score.toFixed(0)}
      </span>
      <span className="text-[0.8125rem] text-[#636878]">/ 100</span>
    </div>
  );
}

function BandTag({ band }: { band: RegimeBand | null }) {
  if (!band) return <span className="text-[0.8125rem] text-[#4d5364]">数据不足</span>;
  const meta = BAND_LABEL[band];
  return (
    <span
      className="rounded border px-2 py-0.5 text-[0.8125rem]"
      style={{ color: meta.color, borderColor: `${meta.color}66`, backgroundColor: `${meta.color}14` }}
    >
      {meta.zh} · {meta.action}
    </span>
  );
}

export const RadarPage = memo(function RadarPage() {
  const radar = useRadar();
  const markets = radar.data?.markets ?? [];
  const third = radar.data?.thirdParty;

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">跨市场雷达 · 钱在哪些市场风险偏好最高</h2>
        <p className="mt-1 text-[0.8125rem] text-[#636878]">
          每个市场用定价锚、信用、波动与本地动量四类真实序列加权算分；分数只描述环境，不预测涨跌。
        </p>
      </div>

      {markets.length === 0 && (
        <div className="rounded border border-[#f5a524]/40 bg-[#f5a524]/10 px-3 py-2 text-[0.8125rem] text-[#f5a524]">
          雷达数据未就绪：等待历史库回填完成。
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {markets.map((m) => (
          <section key={m.code} className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[0.9375rem] font-semibold text-[#d8dce6]">{m.label}</h3>
                <p className="text-[0.75rem] text-[#4d5364]">{m.code}</p>
              </div>
              <BandTag band={m.band} />
            </div>

            <div className="mt-3 flex items-end justify-between">
              <ScoreBlock score={m.score} band={m.band} />
              <div className="text-right">
                <div className="text-[0.75rem] text-[#4d5364]">20 日动量</div>
                <div
                  className={`font-mono text-[0.9375rem] ${
                    m.momentum20d == null ? 'text-[#4d5364]' : m.momentum20d >= 0 ? 'text-[#e5484d]' : 'text-[#30a46c]'
                  }`}
                >
                  {m.momentum20d == null ? '—' : `${m.momentum20d >= 0 ? '+' : ''}${m.momentum20d.toFixed(2)}%`}
                </div>
              </div>
            </div>

            <div className="mt-3 border-t border-[#151823] pt-2">
              <div className="mb-1 flex justify-between text-[0.75rem] text-[#4d5364]">
                <span>主要驱动</span>
                <span>覆盖 {m.coverage}</span>
              </div>
              {m.drivers.slice(0, 3).map((d) => (
                <div key={d.id} className="flex justify-between py-0.5 text-[0.8125rem]">
                  <span className="truncate text-[#b0b5c0]" title={d.label}>{d.label}</span>
                  <span className={`font-mono ${d.contribution >= 0 ? 'text-[#30a46c]' : 'text-[#e5484d]'}`}>
                    {d.note ?? (d.contribution >= 0 ? '+' : '') + d.contribution.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
          <h3 className="mb-2 text-[0.875rem] font-semibold text-[#d8dce6]">轮动排序</h3>
          <table className="w-full border-collapse text-[0.8125rem]">
            <thead>
              <tr className="border-b border-[#1a1d26] text-left text-[0.75rem] text-[#4d5364]">
                <th className="py-1.5 pr-2 font-normal">市场</th>
                <th className="py-1.5 pr-2 font-normal">分数</th>
                <th className="py-1.5 pr-2 font-normal">档位</th>
                <th className="py-1.5 pr-2 font-normal">动量</th>
                <th className="py-1.5 pr-2 font-normal">来源</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.code} className="border-b border-[#151823] last:border-0">
                  <td className="py-1.5 pr-2 text-[#d8dce6]">{m.label}</td>
                  <td className="py-1.5 pr-2 font-mono text-[#d8dce6]">{m.score == null ? '—' : m.score.toFixed(1)}</td>
                  <td className="py-1.5 pr-2" style={{ color: m.band ? BAND_LABEL[m.band].color : '#4d5364' }}>
                    {m.band ? BAND_LABEL[m.band].zh : '不可得'}
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-[#b0b5c0]">
                    {m.momentum20d == null ? '—' : `${m.momentum20d.toFixed(2)}%`}
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-[0.75rem] text-[#4d5364]">{m.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
          <h3 className="mb-2 text-[0.875rem] font-semibold text-[#d8dce6]">第三方环境分数（airoom）</h3>
          {third?.available ? (
            <p className="text-[0.8125rem] text-[#30a46c]">已导入官方 CSV，见档案页查看覆盖市场。</p>
          ) : (
            <div className="rounded border-l-2 border-[#f5a524] bg-[#f5a524]/5 px-3 py-2">
              <p className="text-[0.8125rem] text-[#f5a524]">不可得 · 官网未提供 CSV 直链</p>
              <p className="mt-1 break-all text-[0.75rem] leading-relaxed text-[#636878]">
                官方页面只有手动下载说明。把 <code className="rounded bg-black/30 px-1">APIshujubaocun.csv</code>{' '}
                放到用户数据目录的 <code className="rounded bg-black/30 px-1">airoom/</code> 下即可导入。
              </p>
              {third?.reason && <p className="mt-1 break-all text-[0.75rem] text-[#4d5364]">{third.reason}</p>}
            </div>
          )}
          <p className="mt-3 text-[0.75rem] leading-relaxed text-[#4d5364]">
            第三方分数与本地自算分数口径不同，页面分列展示、不混合排序。红涨绿跌遵循 A 股习惯。
          </p>
        </section>
      </div>
    </div>
  );
});
