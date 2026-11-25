import { memo } from 'react';
import type { ChainLink, ChainModel, ChainNode } from '../../../core/analysis/chain';
import { Sparkline } from '../../../shared/components/Sparkline';

const STATUS_COLOR: Record<string, string> = {
  normal: '#20c4d8',
  high: '#f59e4b',
  extreme: '#f04452',
  low: '#4078ff',
  divergence: '#9b6efb',
  missing: '#4d5364',
};

const STATUS_LABEL: Record<string, string> = {
  normal: '正常',
  high: '偏高',
  extreme: '极端',
  low: '偏低',
  divergence: '背离',
  missing: '数据不足',
};

const SOURCE_COLOR: Record<string, string> = {
  real: '#0ca678',
  model: '#4078ff',
  unavailable: '#4d5364',
};

function NodeCard({ node, onClick }: { node: ChainNode; onClick: () => void }) {
  const missing = node.status === 'missing';
  const partial = !missing && node.coverage < 0.67;
  const color = partial ? '#636878' : STATUS_COLOR[node.status] ?? '#4d5364';
  const statusLabel = partial ? '单项' : STATUS_LABEL[node.status];
  return (
    <button
      onClick={onClick}
      title={node.detail}
      className={`w-[9.875rem] shrink-0 rounded-[0.3125rem] border bg-[#11141c] p-2.5 text-left transition-colors hover:border-[#4078ff] ${
        missing ? 'border-[#1a1d26] opacity-60' : 'border-[#1f2430]'
      }`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-semibold text-[#d8dce6]">{node.title}</span>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: SOURCE_COLOR[node.source] }}
          title={node.source === 'real' ? '真实数据' : node.source === 'model' ? '模型数据' : '不可用'}
        />
      </div>
      <div className="mt-0.5 text-[0.5625rem] text-[#4d5364]">{node.subtitle}</div>

      <div className="mt-1.5 flex items-end justify-between gap-1">
        <span className="font-mono text-[0.9375rem] leading-none text-[#e8ebf0] tabular-nums">{node.valueLabel}</span>
        <span className="text-[0.5625rem] whitespace-nowrap" style={{ color }}>
          {node.directionLabel}
        </span>
      </div>

      <div className="mt-1 min-h-[1rem] text-[0.5625rem] leading-tight text-[#636878]">{node.sublabel}</div>

      <div className="mt-1 flex items-center justify-between">
        {node.spark.length > 2 ? (
          <Sparkline data={node.spark} width={70} height={18} color={color} lineWidth={1.2} />
        ) : (
          <span className="text-[0.5313rem] text-[#3a4050]">无迷你线</span>
        )}
        <span className="rounded px-1 py-0.5 text-[0.5313rem]" style={{ color, background: `${color}18` }} title={partial ? '该节点只有部分指标可用，分数仅供参考' : undefined}>
          {statusLabel}
        </span>
      </div>
    </button>
  );
}

function LinkCard({ link, onClick }: { link: ChainLink; onClick: () => void }) {
  const value = link.value;
  const color =
    link.kind === 'deviation'
      ? Math.abs(value ?? 0) > 5
        ? '#f59e4b'
        : '#636878'
      : value === null
        ? '#4d5364'
        : value >= 0.2
          ? '#f04452'
          : value <= -0.2
            ? '#4078ff'
            : '#636878';

  return (
    <button
      onClick={onClick}
      title={link.note}
      className="flex w-[5.75rem] shrink-0 flex-col items-center justify-center gap-1 self-center px-1"
    >
      <span className="text-[0.625rem] font-mono tabular-nums" style={{ color }}>
        {link.label}
      </span>
      <span className="relative flex h-[0.125rem] w-full items-center bg-[#242a38]">
        <span
          className="absolute left-0 top-0 h-[0.125rem]"
          style={{ width: value === null ? 0 : `${Math.min(100, Math.abs(value) * 100)}%`, background: color }}
        />
        <span className="absolute -right-1 top-1/2 -translate-y-1/2 text-[0.625rem]" style={{ color }}>
          ›
        </span>
      </span>
      <span className="max-w-[5.75rem] text-center text-[0.5313rem] leading-tight text-[#4d5364]">{link.note}</span>
      {link.flipped && <span className="rounded bg-[rgba(245,158,75,0.12)] px-1 text-[0.5rem] text-[#f59e4b]">关系翻转</span>}
    </button>
  );
}

interface Props {
  model: ChainModel;
  onNodeClick: (node: ChainNode) => void;
  onLinkClick: (link: ChainLink) => void;
}

export const TransmissionChain = memo(function TransmissionChain({ model, onNodeClick, onLinkClick }: Props) {
  return (
    <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">传导链</h3>
          <span className="text-[0.5625rem] text-[#4d5364]">点击节点看底层数据；箭头是历史同步性，不代表因果</span>
        </div>
        <span className="text-[0.5625rem] text-[#4d5364]">60 日滚动 · 变化率</span>
      </div>

      <div className="flex min-w-0 items-stretch gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {model.nodes.map((node) => {
          const incoming = model.links.find((l) => l.to === node.id);
          return (
            <div key={node.id} className="flex items-stretch">
              {incoming && <LinkCard link={incoming} onClick={() => onLinkClick(incoming)} />}
              <NodeCard node={node} onClick={() => onNodeClick(node)} />
            </div>
          );
        })}
      </div>

      <div className="mt-2 rounded border-l-2 border-[#4078ff] bg-[rgba(64,120,255,0.05)] px-2.5 py-1.5 text-[0.6563rem] leading-relaxed text-[#b0b5c0]">
        {model.narrative}
      </div>
    </div>
  );
});
