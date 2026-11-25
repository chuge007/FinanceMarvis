import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useDepth } from '../hooks/useDepth';
import type { DepthLevel } from '../../../types/fundflow';
import { directionColor } from '../../../shared/utils/colors';

function DepthRow({ levels, side, maxVol }: { levels: DepthLevel[]; side: 'bid' | 'ask'; maxVol: number }) {
  const color = side === 'bid' ? '#f04452' : '#0ca678';
  return (
    <div className="space-y-0.5">
      {levels.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[0.625rem] font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6] w-16 text-right tabular-nums">
            {l.price.toFixed(3)}
          </span>
          <div className="flex-1 h-[0.75rem] bg-[rgba(255,255,255,0.02)] rounded relative overflow-hidden">
            <div
              className="h-full rounded absolute right-0"
              style={{ width: `${(l.volume / maxVol) * 100}%`, backgroundColor: `${color}30`, borderLeft: `1px solid ${color}60` }}
            />
          </div>
          <span className="text-[0.625rem] font-['JetBrains_Mono',Consolas,monospace] text-[#b0b5c0] w-14 text-right tabular-nums">
            {l.volume.toLocaleString()}
          </span>
          <span className="text-[0.5938rem] font-['JetBrains_Mono',Consolas,monospace] text-[#636878] w-14 text-right tabular-nums">
            {l.cumulative.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export const DepthMap = memo(function DepthMap() {
  const { data: depth, marketStatus, source, quote } = useDepth('600519');
  const maxVol = Math.max(
    ...depth.asks.map((a) => a.volume),
    ...depth.bids.map((b) => b.volume),
    1
  );

  const bidTotal = depth.bidTotal;
  const askTotal = depth.askTotal;
  const imbalance = bidTotal + askTotal > 0 ? (bidTotal - askTotal) / (bidTotal + askTotal) : 0;

  const badgeText = `委比 ${(imbalance * 100).toFixed(1)}% · ${source === 'tencent' ? '腾讯实时' : '模拟'} · ${marketStatus}`;

  return (
    <Panel title="五档买卖盘口" badge={badgeText}>
      <div className="space-y-1">
        {quote && (
          <div className="flex items-end gap-4 mb-2 pb-2 border-b border-[rgba(255,255,255,0.04)]">
            <div className="text-[1rem] font-['JetBrains_Mono',Consolas,monospace] font-semibold tabular-nums" style={{ color: directionColor(quote.changePercent >= 0 ? 'up' : 'down') }}>
              {quote.price.toFixed(2)}
            </div>
            <div className="text-[0.6563rem] font-['JetBrains_Mono',Consolas,monospace] tabular-nums" style={{ color: directionColor(quote.changePercent >= 0 ? 'up' : 'down') }}>
              {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
            </div>
            <div className="text-[0.6563rem] text-[#636878] ml-auto">昨收 {quote.prevClose.toFixed(2)}</div>
          </div>
        )}
        <DepthRow levels={[...depth.asks].reverse()} side="ask" maxVol={maxVol} />
        <div className="h-px bg-[#1a1d26] my-1" />
        <div className="flex justify-between text-[0.625rem] text-[#636878] px-[4.5rem] mb-1">
          <span>买盘 {bidTotal.toLocaleString()}</span>
          <span>卖盘 {askTotal.toLocaleString()}</span>
        </div>
        <DepthRow levels={depth.bids} side="bid" maxVol={maxVol} />
      </div>
    </Panel>
  );
});
