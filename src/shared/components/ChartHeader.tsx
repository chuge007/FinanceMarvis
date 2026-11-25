import { memo } from 'react';
import { SourceBadge, type SourceKind } from './SourceBadge';

interface ChartHeaderProps {
  source: SourceKind;
  sourceText?: string;
  asOf?: string | null;
  note?: string;
  className?: string;
}

/** 图表统一元信息条：来源徽章 + 数据时点 + 一句话口径说明。 */
export const ChartHeader = memo(function ChartHeader({
  source, sourceText, asOf, note, className = '',
}: ChartHeaderProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.5938rem] text-[#636878] ${className}`}>
      <SourceBadge kind={source} text={sourceText} />
      {asOf && <span>截至 {asOf}</span>}
      {note && <span className="text-[#4d5364]">{note}</span>}
    </div>
  );
});
