import { memo, useEffect, useState } from 'react';
import type { RhythmSnapshot } from '../services/rhythm';
import { SourceBadge } from '../../../shared/components/SourceBadge';
import { Panel } from '../../../shared/components/Panel';
import { readJSON, writeJSON, todayKey } from '../../../shared/utils/localStore';
import { BarWithLabel } from '../../../shared/components/BarWithLabel';

const TONE_COLOR: Record<string, string> = {
  进攻: '#f04452', 均衡: '#20c4d8', 防守: '#f59e4b', 观望: '#9b6efb',
};

export interface LastRegimeState {
  tone: string;
  date: string;
  score: number | null;
  confidence: number;
  readings: { id: string; name: string; percentile: number | null; z: number | null }[];
}
type LastState = LastRegimeState;
const KEY = 'marvis.regime.last.v1';

function ScoreGauge({ score, color }: { score: number | null; color: string }) {
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const r = 40;
  const arc = Math.PI * r;
  const filled = (pct / 100) * arc;
  return (
    <svg width="104" height="58" viewBox="0 0 104 58" aria-label={`综合评分 ${score ?? '—'}`}>
      <path d="M 12 52 A 40 40 0 0 1 92 52" fill="none" stroke="#1a1d26" strokeWidth="8" strokeLinecap="round" />
      <path d="M 12 52 A 40 40 0 0 1 92 52" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${filled} ${arc}`} />
      <text x="52" y="46" textAnchor="middle" fontSize="19" fontWeight="bold" fill={color}>
        {score === null ? '—' : score}
      </text>
    </svg>
  );
}

interface Props {
  snapshot: RhythmSnapshot | null;
  loading: boolean;
  onRefresh: () => void;
}

export const RegimeCard = memo(function RegimeCard({ snapshot, loading, onRefresh }: Props) {
  // 只在首次渲染读取上次状态，避免 React StrictMode 双调用把「状态变化」抹掉
  const [previous] = useState<LastState | null>(() => readJSON<LastState | null>(KEY, null));
  const regime = snapshot?.regime ?? null;

  useEffect(() => {
    if (!regime || regime.confidence === 0) return;
    writeJSON<LastState>(KEY, {
      tone: regime.tone,
      date: todayKey(),
      score: regime.score,
      confidence: regime.confidence,
      readings: (snapshot?.indicators ?? []).map((i) => ({ id: i.id, name: i.name, percentile: i.percentile, z: i.z })),
    });
  }, [regime, snapshot]);

  const color = TONE_COLOR[regime?.tone ?? '观望'] ?? '#636878';
  const changed = previous && regime && previous.tone !== regime.tone && regime.confidence > 0;

  return (
    <Panel
      title="今日市场状态"
      hint="结论先行 · 由真实历史序列合成，不是买卖建议"
      extra={
        <button
          onClick={onRefresh}
          className="text-[11px] px-2 py-1 rounded border border-[#1a1d26] text-[#b0b5c0] hover:bg-[rgba(255,255,255,0.04)]"
        >
          {loading ? '计算中…' : '刷新'}
        </button>
      }
    >
      {loading && !snapshot ? (
        <div className="py-8 text-center text-[12px] text-[#636878]">
          正在读取 8 组真实历史序列并计算历史分位…
        </div>
      ) : !regime ? (
        <div className="py-6 text-center text-[12px] text-[#f59e4b]">状态计算失败，请点击刷新重试。</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-5">
            <div className="min-w-[190px]">
              <div className="text-[11px] text-[#636878] mb-1">风险偏好状态</div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[30px] leading-none font-bold" style={{ color }}>{regime.tone}</div>
                <ScoreGauge score={regime.score} color={color} />
              </div>
              <div className="mt-2">
                <BarWithLabel label="数据置信度" pct={regime.confidence} color={color} maxPct={100} />
              </div>
              <div className="text-[10px] text-[#636878] mt-1">
                真实数据 {regime.available}/{regime.total} 项 · 最新观测 {regime.asOf ?? '—'}
              </div>
            </div>
            <div className="flex-1 min-w-[280px]">
              <p className="text-[13px] leading-relaxed text-[#d8dce6]">{regime.summary}</p>
              {changed && (
                <p className="text-[11px] mt-2" style={{ color: '#f7d44c' }}>
                  状态切换：{previous?.date ?? '上次'} 的「{previous?.tone}」→ 今日「{regime.tone}」。
                  状态切换不等于必须立刻调仓，先按下面的确认条件核对。
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <SourceBadge kind="real" text="仅用真实序列" />
                <SourceBadge kind={regime.confidence >= 70 ? 'real' : 'rule'} text={`数据覆盖 ${regime.confidence}%`} />
                <span className="text-[10px] text-[#636878]">计算于 {new Date(snapshot!.fetchedAt).toLocaleTimeString('zh-CN')}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] text-[#636878] mb-2">判断依据（按指标在历史序列中的相对位置）</div>
            <ul className="space-y-1.5">
              {regime.reasons.map((r, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-[#b0b5c0] flex gap-2">
                  <span style={{ color }}>·</span><span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[10px] leading-relaxed text-[#636878] border-t border-[#1a1d26] pt-3">
            说明：状态由历史分位与方向的加权合成，属于「描述当前风险环境」，不预测涨跌、不保证收益；
            分位数受样本区间影响，月度指标与日度指标口径不同。数据有延迟，且上游可能临时不可用。
            本工具不构成投资建议。
          </p>
        </div>
      )}
    </Panel>
  );
});
