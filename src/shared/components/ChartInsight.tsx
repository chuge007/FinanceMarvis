import { memo } from 'react';

interface ChartInsightProps {
  summary: string;
  how?: string;
  pitfall?: string;
}

/** 每张图的三段式解读：这是什么 / 怎么看 / 不能怎么用。 */
export const ChartInsight = memo(function ChartInsight({ summary, how, pitfall }: ChartInsightProps) {
  const hasDetail = Boolean(how || pitfall);
  return (
    <div className="rounded-[0.1875rem] bg-[rgba(64,120,255,0.05)] px-2.5 py-1.5 text-[0.6563rem] leading-relaxed">
      <div className="text-[#9aa0ae]">
        <span className="mr-1 text-[#4078ff]">解读</span>
        {summary}
      </div>
      {hasDetail && (
        <details className="mt-0.5 text-[#636878]">
          <summary className="cursor-pointer text-[0.5938rem] text-[#4d5364] hover:text-[#9aa0ae]">
            怎么看 / 不能怎么用
          </summary>
          {how && <div className="mt-1">怎么看：{how}</div>}
          {pitfall && <div className="mt-0.5 text-[#f59e4b]">不能怎么用：{pitfall}</div>}
        </details>
      )}
    </div>
  );
});
