import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useOptionsSentiment } from '../hooks/index';
import type { OptionQuote } from '../../../types/sentiment';

const TERM_ORDER = ['^VIX9D', '^VIX', '^VIX3M', '^VIX6M', '^VIX1Y'];
const EXTRA_ORDER = ['^VVIX', '^SKEW', '^GSPC', '^NDX'];

const SHAPE_COLOR: Record<string, string> = {
  contango: '#0ca678',
  backwardation: '#f04452',
  flat: '#636878',
};

function QuoteTile({ quote }: { quote?: OptionQuote }) {
  const change = quote?.changePct;
  return (
    <div className="bg-[rgba(255,255,255,0.02)] rounded p-2 text-center">
      <div className="text-[0.5938rem] text-[#636878] mb-0.5">{quote?.label ?? '—'}</div>
      <div className="text-[0.6875rem] font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6] tabular-nums">
        {quote ? quote.price.toFixed(2) : '—'}
      </div>
      <div
        className="text-[0.5625rem] mt-0.5"
        style={{ color: change === null || change === undefined ? '#636878' : change >= 0 ? '#0ca678' : '#f04452' }}
      >
        {change === null || change === undefined ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
      </div>
    </div>
  );
}

export const OptionsSentimentPanel = memo(function OptionsSentimentPanel() {
  const options = useOptionsSentiment();

  if (!options) {
    return (
      <Panel title="美股期权情绪" hint="CBOE + Yahoo" badge="加载中">
        <div className="h-16 flex items-center justify-center text-[0.625rem] text-[#636878]">期权数据加载中...</div>
      </Panel>
    );
  }

  const term = options.termStructure;

  return (
    <Panel title="美股期权情绪" hint="CBOE + Yahoo" badge={options.available ? '真实数据' : '上游不可用'}>
      <div
        className="rounded-[0.1875rem] px-3 py-2 text-[0.6875rem] leading-relaxed"
        style={{ background: 'rgba(247,212,76,0.06)', color: '#f7d44c', border: '1px solid rgba(247,212,76,0.18)' }}
      >
        {options.verdict}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.6563rem] text-[#636878]">VIX 期限结构</span>
          <span
            className="text-[0.625rem] px-1.5 py-0.5 rounded"
            style={{
              background: `${SHAPE_COLOR[term.shape ?? 'flat'] ?? '#636878'}20`,
              color: SHAPE_COLOR[term.shape ?? 'flat'] ?? '#636878',
            }}
            title={term.ratio !== null ? `VIX / VIX3M = ${term.ratio}` : undefined}
          >
            {term.label}{term.ratio !== null ? ` · ${term.ratio}` : ''}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {TERM_ORDER.map((symbol) => (
            <QuoteTile key={symbol} quote={options.quotes[symbol]} />
          ))}
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-[#1a1d26] grid grid-cols-4 gap-2">
        {EXTRA_ORDER.map((symbol) => (
          <QuoteTile key={symbol} quote={options.quotes[symbol]} />
        ))}
      </div>

      <div className="mt-2 text-[0.5625rem] text-[#636878] leading-relaxed">
        更新 {new Date(options.generatedAt).toLocaleString('zh-CN', { hour12: false })} · 来源：CBOE 官方日度统计 / Yahoo Finance · 缓存 60 秒
        {options.errors.length > 0 ? ` · 异常：${options.errors.join('、')}` : ''}
      </div>
    </Panel>
  );
});
