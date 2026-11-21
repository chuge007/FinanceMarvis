import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { BarWithLabel } from '../../../shared/components/BarWithLabel';
import { useFearGreed } from '../hooks/useFearGreed';
import { useAppStore } from '../../../stores/useAppStore';
import { FG_COLORS } from '../../../shared/utils/colors';

const STATE_MAP: Record<string, string> = {
  'Extreme Fear': '极度恐惧',
  'Fear': '恐惧',
  'Neutral': '中性',
  'Greed': '贪婪',
  'Extreme Greed': '极度贪婪',
};

/** 按value比例填充的环形仪表，替代仅靠边框着色的静态圆环 */
function ValueDial({ value, color }: { value: number; color: string }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0" aria-label={`恐惧贪婪指数 ${value}`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="#1a1d26" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="41" textAnchor="middle" fontSize="18" fontWeight="bold" fill={color}
        fontFamily="JetBrains_Mono, Consolas, monospace">{value}</text>
    </svg>
  );
}

export const FearGreedIndexPanel = memo(function FearGreedIndexPanel() {
  const { data, loading } = useFearGreed();
  const market = useAppStore((s) => s.market);
  const isCN = market === 'CN';

  if (loading || !data) {
    return (
      <Panel title={isCN ? 'A股情绪温度计' : 'CNN Fear & Greed'} badge="加载中">
        <div className="h-24 flex items-center justify-center text-[#636878] text-[10px]">数据加载中...</div>
      </Panel>
    );
  }

  const stateLabel = STATE_MAP[data.classification] || data.classification;
  const color = data.value >= 75 ? FG_COLORS['Extreme Greed'] :
                data.value >= 55 ? FG_COLORS['Greed'] :
                data.value >= 45 ? '#636878' :
                data.value >= 25 ? FG_COLORS['Fear'] :
                FG_COLORS['Extreme Fear'];

  const title = isCN ? 'A股情绪温度计' : 'CNN Fear & Greed (alternative.me)';
  const sourceLine = isCN
    ? '数据源: 东方财富A股指数日K + 沪深两市涨跌家数（实时）· 每 5 分钟更新'
    : '数据源: alternative.me / ConvexTrade · 每 5 分钟更新';

  return (
    <Panel title={title} badge={stateLabel}>
      <div className="flex items-center gap-4 mb-3">
        <ValueDial value={data.value} color={color} />
        <div className="flex-1">
          <div className="text-[10.5px] text-[#636878] mb-2">{data.subIndices.length}因子分解 · {new Date(data.timestamp).toLocaleDateString('zh-CN')}</div>
          {data.subIndices.map((f) => (
            <BarWithLabel
              key={f.key}
              label={f.name}
              pct={f.value}
              color={
                f.value >= 75 ? FG_COLORS['Extreme Greed'] :
                f.value >= 55 ? FG_COLORS['Greed'] :
                f.value >= 45 ? '#636878' :
                f.value >= 25 ? FG_COLORS['Fear'] :
                FG_COLORS['Extreme Fear']
              }
              maxPct={100}
            />
          ))}
        </div>
      </div>

      {/* Trend sparkline */}
      {data.trend.length > 0 && (
        <div className="mt-2">
          <div className="text-[10.5px] text-[#636878] mb-1">近 {data.trend.length} 日趋势</div>
          <div className="flex items-end gap-[1px] h-8">
            {data.trend.map((p, i) => {
              const h = Math.max(4, (p.value / 100) * 32);
              const c = p.value >= 75 ? '#f04452' : p.value >= 55 ? '#f59e4b' :
                        p.value >= 45 ? '#636878' : p.value >= 25 ? '#20c4d8' : '#0ca678';
              return (
                <div
                  key={i}
                  className="flex-1 rounded-[1px]"
                  style={{ height: h, backgroundColor: c, opacity: 0.8 }}
                  title={`${p.date}: ${p.value}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* VIX + data source note */}
      <div className="mt-2 p-2 bg-[rgba(64,120,255,0.05)] rounded-[3px]">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-[#636878]">{isCN ? 'A股情绪解读' : 'VIX 即时值'}</span>
          <span className="text-[#b0b5c0] font-mono">{isCN ? stateLabel : (data.vix?.toFixed(1) ?? 'N/A')}</span>
        </div>
        <div className="text-[10px] text-[#636878] mt-1">{sourceLine}</div>
      </div>
    </Panel>
  );
});
