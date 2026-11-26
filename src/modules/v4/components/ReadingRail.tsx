import { memo } from 'react';
import type { ChainNode } from '../../../core/analysis/chain';

const STATUS_COLOR: Record<string, string> = {
  normal: '#20c4d8',
  high: '#f59e4b',
  extreme: '#f04452',
  low: '#4078ff',
  divergence: '#9b6efb',
  missing: '#4d5364',
};

interface Props {
  nodes: ChainNode[];
  onSelect: (node: ChainNode) => void;
}

export const ReadingRail = memo(function ReadingRail({ nodes, onSelect }: Props) {
  return (
    <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">读数</h3>
        <span className="text-[0.5625rem] text-[#4d5364]">分位 0~100 · 近一年</span>
      </div>

      <div className="space-y-1.5">
        {nodes.map((node) => {
          const partial = node.coverage < 0.66 && node.status !== 'missing';
          const color = partial ? '#636878' : STATUS_COLOR[node.status] ?? '#4d5364';
          const score = node.score;
          return (
            <button
              key={node.id}
              onClick={() => onSelect(node)}
              title={node.detail}
              className="w-full rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] px-2 py-1.5 text-left transition-colors hover:border-[#2a3040]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.6563rem] text-[#b0b5c0]">{node.title}</span>
                <span className="font-mono text-[0.6563rem] tabular-nums" style={{ color }}>
                  {node.valueLabel}
                </span>
              </div>
              <div className="mt-1 h-[0.1875rem] w-full overflow-hidden rounded bg-[#1a1d26]">
                <div
                  className="h-full rounded"
                  style={{ width: `${score === null ? 0 : Math.max(0, Math.min(100, score))}%`, background: color }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="truncate text-[0.5625rem] text-[#4d5364]">{node.sublabel}</span>
                <span className="shrink-0 text-[0.5625rem] text-[#636878]">
                  {node.coverage < 0.66 && node.status !== 'missing' ? '单项 · ' : ''}
                  {node.directionLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 text-[0.5313rem] leading-relaxed text-[#3a4050]">
        分位是相对位置，不是涨跌概率。缺失数据不参与打分。
      </div>
    </div>
  );
});
