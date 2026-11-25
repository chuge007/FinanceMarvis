import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useInstitutionViews } from '../hooks/useMacroRisk';
import type { Market } from '../../../stores/useAppStore';

interface Props { market: Market; }

export const InstitutionViews = memo(function InstitutionViews({ market }: Props) {
  const { data: views, loading } = useInstitutionViews();

  const title = market === 'CN' ? '机构观点聚合 · A股' : '机构观点聚合';

  return (
    <Panel title={title} badge={loading ? '加载中' : `${views.length}家`}>
      <div className="grid grid-cols-2 gap-3">
        {views.map((view) => (
          <div
            key={view.id}
            className="bg-[rgba(255,255,255,0.02)] border border-[#1a1d26] rounded-[0.3125rem] p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 rounded flex items-center justify-center text-[0.625rem] font-bold text-white"
                style={{ backgroundColor: view.color }}
              >
                {view.logo}
              </div>
              <div>
                <div className="text-[0.625rem] text-[#d8dce6] font-medium">{view.institution}</div>
                <div className="text-[0.625rem] text-[#636878]">{view.date}</div>
              </div>
              <div className="ml-auto">
                <span
                  className="text-[0.625rem] px-2 py-0.5 rounded font-medium"
                  style={{ backgroundColor: `${view.color}18`, color: view.color }}
                >
                  {view.rating}
                </span>
              </div>
            </div>
            <div className="text-[0.6563rem] text-[#d8dce6] font-['JetBrains_Mono',Consolas,monospace] mb-1">
              目标: {view.target}
            </div>
            <div className="text-[0.625rem] text-[#b0b5c0] leading-relaxed">{view.thesis}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
});
