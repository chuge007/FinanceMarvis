import { memo } from 'react';

/** 用于明确区分「演示 / 估算数据」与真实数据。
 *  原则：只要本页结论不能用于真实决策，就必须在首屏可见处说明。 */
export const DemoBanner = memo(function DemoBanner({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[5px] border border-[rgba(155,110,251,0.4)] bg-[rgba(155,110,251,0.07)] p-3">
      <div className="flex gap-2.5">
        <span className="mt-0.5 shrink-0 rounded bg-[rgba(155,110,251,0.18)] px-1.5 py-0.5 text-[9.5px] font-bold text-[#b79bff]">
          演示数据
        </span>
        <div>
          <div className="text-[11.5px] font-bold text-[#c9b3ff]">{title}</div>
          <div className="mt-1 text-[10px] leading-relaxed text-[#b0b5c0]">{children}</div>
        </div>
      </div>
    </div>
  );
});
