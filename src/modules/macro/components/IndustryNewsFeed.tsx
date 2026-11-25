import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useNewsFeed } from '../hooks/useMacroRisk';
import type { Market } from '../../../stores/useAppStore';

interface Props { market: Market; }

const TAG_COLORS: Record<string, string> = {
  macro: '#4078ff',
  earn: '#f59e4b',
  policy: '#9b6efb',
  geo: '#f04452',
};

const TAG_NAMES: Record<string, string> = {
  macro: '宏观',
  earn: '财报',
  policy: '政策',
  geo: '地缘',
};

export const IndustryNewsFeed = memo(function IndustryNewsFeed({ market }: Props) {
  const { data: items, loading } = useNewsFeed(market);
  const isRealtime = items.some((i) => i.source === 'realtime');

  const title = '产业催化 · 实时研报';

  return (
    <Panel title={title} badge={isRealtime ? 'LIVE' : '快照'}>
      <div className="space-y-0">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 py-1.5 border-b border-[rgba(255,255,255,0.02)] last:border-0">
            <span className="text-[0.625rem] font-['JetBrains_Mono',Consolas,monospace] text-[#636878] w-9 shrink-0 tabular-nums pt-0.5">
              {item.time}
            </span>
            <span
              className="text-[0.6563rem] px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5"
              style={{ backgroundColor: `${TAG_COLORS[item.tag]}20`, color: TAG_COLORS[item.tag] }}
            >
              {TAG_NAMES[item.tag] || item.tag}
            </span>
            <span className="text-[0.6875rem] text-[#b0b5c0] leading-relaxed flex-1">{item.content}</span>
            <span className="text-[0.6563rem] text-[#636878] px-1 py-0.5 bg-[#1a1d26] rounded shrink-0 mt-0.5">{item.impact}</span>
          </div>
        ))}
      </div>
      <div className="text-[0.6875rem] text-[#636878] mt-2">
        数据源: {isRealtime ? '东方财富快讯 · 实时抓取' : '本地实时研报快照'} · 每 30 秒更新 · 末列=影响层面 · {market === 'CN' ? 'A股视角' : '美股视角'}
      </div>
    </Panel>
  );
});
