import { memo } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { TIME_FRAMES } from '../utils/constants';
import type { TimeFrame } from '../../types/common';

export const TimeFilter = memo(function TimeFilter() {
  const { timeframe, setTimeframe } = useAppStore();

  return (
    <div className="flex gap-1">
      {TIME_FRAMES.map((tf) => (
        <button
          key={tf}
          onClick={() => setTimeframe(tf as TimeFrame)}
          className={`text-[10.5px] px-2.5 py-1 rounded font-medium transition-colors ${
            timeframe === tf
              ? 'bg-[#4078ff] text-white'
              : 'bg-[rgba(255,255,255,0.03)] text-[#636878] hover:text-[#b0b5c0]'
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
});
