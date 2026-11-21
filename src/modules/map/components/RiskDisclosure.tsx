import { memo } from 'react';
import { useProfileStore } from '../../../stores/useProfileStore';

const POINTS = [
  '本工具是「决策流程与风险预算」工具，不是荐股软件，不提供具体买卖指令、目标价或收益承诺。',
  '工具不具备证券投资咨询资质。所有配置比例都是通用框架，最终决策与后果由你自己承担。',
  '页面中的市场数据可能延迟、缺失，部分面板为演示数据（会明确标注）。不要用演示数字做真实决策。',
  '投资有风险，本金可能亏损。任何声称「保本高收益」的产品或人，都应默认视为骗局。',
];

export const RiskDisclosure = memo(function RiskDisclosure() {
  const acknowledged = useProfileStore((s) => s.acknowledged);
  const acknowledge = useProfileStore((s) => s.acknowledge);

  if (acknowledged) {
    return (
      <div className="flex items-center gap-2 rounded-[5px] border border-[#1a1d26] bg-[rgba(12,166,120,0.06)] px-3 py-2">
        <span className="text-[11px] text-[#0ca678]">已确认风险揭示</span>
        <span className="text-[10px] text-[#636878]">本工具不构成投资建议，不承诺收益。</span>
      </div>
    );
  }

  return (
    <div className="rounded-[5px] border border-[rgba(245,158,75,0.35)] bg-[rgba(245,158,75,0.06)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[13px] font-bold text-[#f59e4b]">开始之前，请先看清四件事</h3>
          <ul className="mt-2 space-y-1.5">
            {POINTS.map((t, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-[#b0b5c0]">
                <span className="text-[#f59e4b]">{i + 1}.</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={acknowledge}
          className="shrink-0 rounded-[4px] bg-[#f59e4b] px-3 py-2 text-[12px] font-bold text-[#1a1206] hover:bg-[#ffae63]"
        >
          我已了解
        </button>
      </div>
    </div>
  );
});
