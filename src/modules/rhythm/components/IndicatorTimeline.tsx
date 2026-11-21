import { memo } from 'react';
import type { IndicatorReading, Phase } from '../services/rhythm';
import { SourceBadge } from '../../../shared/components/SourceBadge';
import { Panel } from '../../../shared/components/Panel';

const GROUPS: { phase: Phase; title: string; note: string; color: string }[] = [
  { phase: '领先', title: '领先指标 · 看方向', note: '用于预判风险环境的变化，但时滞不确定、有假信号', color: '#20c4d8' },
  { phase: '同步', title: '同步指标 · 看当下', note: '描述当前状态，不预测反转时点', color: '#4078ff' },
  { phase: '情绪·同步', title: '情绪指标 · 看人群位置', note: '极端读数提示纪律风险，不是抄底摸顶信号', color: '#9b6efb' },
  { phase: '滞后', title: '滞后指标 · 只做确认', note: '用于解释「为什么会这样」，不要拿它择时', color: '#f59e4b' },
];

function pctColor(p: number): string {
  if (p >= 80) return '#f04452';
  if (p >= 60) return '#f59e4b';
  if (p <= 20) return '#0ca678';
  return '#4078ff';
}

function trendText(slope: number | null): string {
  if (slope === null) return '方向数据不足';
  if (slope > 0.05) return '近期上行';
  if (slope < -0.05) return '近期回落';
  return '基本走平';
}

/** 以中轴为基准的方向条，把 slope 的正负与强弱画出来 */
function TrendBar({ slope }: { slope: number | null }) {
  if (slope === null) return <span className="text-[10px] text-[#636878]">方向数据不足</span>;
  const strength = Math.max(0.08, Math.min(1, Math.abs(slope) / 0.3));
  const width = strength * 50;
  const up = slope > 0.05;
  const down = slope < -0.05;
  const color = up ? '#f04452' : down ? '#0ca678' : '#636878';
  return (
    <div className="flex items-center gap-1.5" title={`斜率 ${slope.toFixed(3)} · ${trendText(slope)}`}>
      <span className="text-[10px] w-[52px] text-right" style={{ color }}>{trendText(slope)}</span>
      <div className="relative w-[110px] h-[6px] rounded-full bg-[#1a1d26]">
        <div className="absolute left-1/2 top-[-2px] w-px h-[10px] bg-[#4d5364]" />
        {up || down ? (
          <div
            className="absolute top-0 h-full rounded-full"
            style={{
              background: color,
              opacity: 0.85,
              left: up ? '50%' : `${50 - width}%`,
              width: `${width}%`,
            }}
          />
        ) : (
          <div className="absolute top-[2px] left-1/2 -translate-x-1/2 w-[6px] h-[2px] rounded-full" style={{ background: color }} />
        )}
      </div>
    </div>
  );
}

const Row = memo(function Row({ item }: { item: IndicatorReading }) {
  const missing = item.source === 'missing';
  const pct = item.percentile;
  const val = item.value === null ? '—' : item.value.toFixed(item.unit === '%' ? 2 : 1) + item.unit;
  return (
    <div className="border border-[#1a1d26] rounded-[4px] px-3 py-2 bg-[rgba(255,255,255,0.015)]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#d8dce6]">{item.name}</span>
          <SourceBadge kind={missing ? 'missing' : 'real'} />
        </div>
        <div className="flex items-center gap-3 text-[11px] flex-wrap">
          <span className="font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6]">{val}</span>
          <TrendBar slope={item.slope} />
        </div>
      </div>

      {missing ? (
        <div className="text-[11px] text-[#636878] mt-2">
          上游未返回可用历史序列，本项不计入状态判断（不用模拟值补位）。
        </div>
      ) : (
        <>
          <div className="relative h-[6px] mt-2 rounded-full bg-[#1a1d26]">
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{ width: `${pct ?? 0}%`, background: pctColor(pct ?? 50), opacity: 0.55 }}
            />
            <div
              className="absolute top-[-3px] w-[2px] h-[12px] rounded"
              style={{ left: `${pct ?? 0}%`, background: pctColor(pct ?? 50) }}
            />
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px] text-[#636878]">
            <span>历史分位 {pct === null ? '—' : `${Math.round(pct)}%`} · Z {item.z === null ? '—' : item.z.toFixed(2)}</span>
            <span>{item.observations} 个观测 · {item.frequency} · 截至 {item.asOf ?? '—'}</span>
          </div>
        </>
      )}

      <details className="mt-2 group">
        <summary className="cursor-pointer text-[10px] text-[#4078ff] select-none">怎么读 / 常见误用</summary>
        <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
          <p><span className="text-[#636878]">是什么：</span>{item.explanation}</p>
          <p><span className="text-[#636878]">怎么用：</span>{item.howTo}</p>
          <p><span className="text-[#636878]">别这样用：</span><span className="text-[#f59e4b]">{item.pitfall}</span></p>
        </div>
      </details>
    </div>
  );
});

export const IndicatorTimeline = memo(function IndicatorTimeline({ indicators }: { indicators: IndicatorReading[] }) {
  return (
    <Panel title="指标传导链" hint="领先 → 同步 → 滞后，位置比数值重要" className="h-full">
      <div className="space-y-4">
        {GROUPS.map((g) => {
          const list = indicators.filter((i) => i.phase === g.phase);
          if (!list.length) return null;
          return (
            <div key={g.phase}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-[12px] font-bold" style={{ color: g.color }}>{g.title}</span>
                <span className="text-[10px] text-[#636878]">{g.note}</span>
              </div>
              <div className="space-y-2">
                {list.map((i) => <Row key={i.id} item={i} />)}
              </div>
            </div>
          );
        })}
        <p className="text-[10px] leading-relaxed text-[#636878] border-t border-[#1a1d26] pt-2">
          领先 / 同步 / 滞后是经验分类而非精确时钟：收益率曲线倒挂到衰退的时滞常见估计为 6~18 个月，
          口径差异大且存在假信号；情绪类指标是同步描述，不预测反转。分位区间随样本长度变化，
          月度与日度序列不可直接横向比较。
        </p>
      </div>
    </Panel>
  );
});
