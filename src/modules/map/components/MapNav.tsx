import { memo } from 'react';
import { useAppStore, type ModuleTab } from '../../../stores/useAppStore';

const STEPS: Array<{ n: number; t: string; d: string; tab: ModuleTab; anchor?: string }> = [
  { n: 1, t: '认识自己', d: '钱、期限、风险承受力', tab: 'map', anchor: 'map-profile' },
  { n: 2, t: '安排钱', d: '四笔钱分桶', tab: 'map', anchor: 'map-plan' },
  { n: 3, t: '看市场位置', d: '风险环境与置信度', tab: 'rhythm' },
  { n: 4, t: '定执行规则', d: '仓位、清单、再平衡', tab: 'discipline' },
  { n: 5, t: '记录与复盘', d: '持仓、交易、复盘', tab: 'portfolio' },
];

const ADVANCED: Array<{ tab: ModuleTab; label: string; note: string }> = [
  { tab: 'macro', label: '宏观水温', note: '利率、信用、波动率' },
  { tab: 'sentiment', label: '情绪引擎', note: '拥挤度与极端读数' },
  { tab: 'fundflow', label: '资金流动', note: '板块与大盘资金' },
  { tab: 'strategy', label: '做T策略', note: '日内交易工具' },
  { tab: 'technical', label: '技术分析', note: '均线、MACD、RSI' },
  { tab: 'rotation', label: '板块轮动', note: '行业强弱' },
  { tab: 'papertrading', label: '模拟交易', note: '零成本练习' },
  { tab: 'alerts', label: '告警', note: '价格与指标提醒' },
];

export const MapNav = memo(function MapNav() {
  const setTab = useAppStore((s) => s.setTab);

  const go = (s: (typeof STEPS)[number]) => {
    if (s.tab === 'map' && s.anchor) {
      document.getElementById(s.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setTab(s.tab);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[12px] font-bold text-[#d8dce6]">这就是地图：按顺序走，不要跳步</h3>
        <p className="mt-0.5 text-[10px] text-[#636878]">
          前两步在这页完成；后三步进入对应模块。任何时候看不懂，回到第 1 步检查假设。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {STEPS.map((s, i) => (
          <button
            key={s.n}
            onClick={() => go(s)}
            className="group relative rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3 text-left transition-colors hover:border-[#4078ff]"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(64,120,255,0.14)] text-[10px] font-bold text-[#4078ff]">
                {s.n}
              </span>
              <span className="text-[11.5px] font-bold text-[#d8dce6]">{s.t}</span>
            </div>
            <div className="mt-1.5 text-[9.5px] leading-relaxed text-[#636878]">{s.d}</div>
            {i < STEPS.length - 1 && (
              <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-[10px] text-[#2a3040] sm:block">›</span>
            )}
          </button>
        ))}
      </div>

      <details className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118]">
        <summary className="cursor-pointer px-3 py-2 text-[11px] text-[#9aa0ae] hover:text-[#d8dce6]">
          进阶工具（不理解就先别打开）
        </summary>
        <div className="grid grid-cols-2 gap-1.5 border-t border-[#1a1d26] p-3 sm:grid-cols-4">
          {ADVANCED.map((a) => (
            <button
              key={a.tab}
              onClick={() => { setTab(a.tab); window.scrollTo({ top: 0 }); }}
              className="rounded-[4px] border border-[#1a1d26] bg-[#0b0e14] px-2 py-1.5 text-left hover:border-[#2a3040]"
            >
              <div className="text-[10.5px] text-[#b0b5c0]">{a.label}</div>
              <div className="text-[9px] text-[#4d5364]">{a.note}</div>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
});
