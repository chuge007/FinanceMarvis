import React, { useState } from 'react';
import { getAllStrategies, type PortfolioStrategy } from '../../../services/portfolioRecommendation';
import { DemoBanner } from '../../../shared/components/DemoBanner';
import { useAppStore } from '../../../stores/useAppStore';
import { writeJSON } from '../../../shared/utils/localStore';

const RISK_LABEL: Record<string, string> = {
  conservative: '保守型',
  balanced: '稳健型',
  growth: '成长型',
  aggressive: '进取型',
};

const RISK_COLOR: Record<string, string> = {
  conservative: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40',
  balanced: 'text-green-600 bg-green-100 dark:bg-green-900/40',
  growth: 'text-orange-600 bg-orange-100 dark:bg-orange-900/40',
  aggressive: 'text-red-600 bg-red-100 dark:bg-red-900/40',
};

/** 只展示「资产大类与比例」的教学框架，不展示个股、目标价、评级与预期收益。 */
export const PortfolioRecommendation: React.FC = () => {
  const strategies = getAllStrategies();
  const [selected, setSelected] = useState<PortfolioStrategy>(strategies[0]);
  const [saved, setSaved] = useState(false);
  const setTab = useAppStore((s) => s.setTab);

  const applyStrategy = () => {
    writeJSON('marvis.target.allocation.v1', {
      name: selected.name,
      savedAt: new Date().toISOString(),
      allocations: selected.allocations.map((a) => ({ assetType: a.assetType, allocation: a.allocation })),
    });
    setSaved(true);
    setTab('discipline');
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-3">
      <DemoBanner title="以下六套策略是教学示例，不是给你的配置建议">
        本模块已移除个股推荐、目标价、上涨空间、评级与「预期年化收益」。
        剩下的只有资产大类与比例，用来理解「不同风险等级大致长什么样」。
        真正的配置比例请回到「投资地图」，按你的钱、期限与承受力计算。
      </DemoBanner>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {strategies.map((s) => {
          const active = selected.type === s.type;
          const top = s.allocations[0];
          return (
            <button
              key={s.type}
              onClick={() => { setSelected(s); setSaved(false); }}
              className={`rounded-[5px] border p-3 text-left transition-colors ${
                active
                  ? 'border-[#4078ff] bg-[rgba(64,120,255,0.08)]'
                  : 'border-[#1a1d26] bg-[#0f1118] hover:border-[#2a3040]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-[12.5px] font-bold text-[#d8dce6]">{s.name}</h4>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9.5px] ${RISK_COLOR[s.riskLevel]}`}>
                  {RISK_LABEL[s.riskLevel]}
                </span>
              </div>
              <div className="mt-1.5 text-[9.5px] leading-relaxed text-[#636878]">
                {top ? `最大一类：${top.assetType.replace(/（.*?）/, '')} ${top.allocation}%` : '—'}
              </div>
              <div className="text-[9.5px] text-[#4d5364]">共 {s.allocations.length} 类资产 · {s.rebalanceFrequency}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-bold text-[#d8dce6]">{selected.name}</h3>
            <p className="mt-1 max-w-[560px] text-[10.5px] leading-relaxed text-[#9aa0ae]">{selected.description}</p>
          </div>
          <button
            onClick={applyStrategy}
            className="shrink-0 rounded-[4px] bg-[#4078ff] px-3 py-2 text-[11.5px] font-bold text-white hover:bg-[#2f66e0]"
          >
            存为目标配置
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {selected.allocations.map((a, i) => (
            <div key={i}>
              <div className="mb-1 flex justify-between text-[10px]">
                <span className="text-[#b0b5c0]">{a.assetType}</span>
                <span className="tabular-nums text-[#636878]">{a.allocation}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.05)]">
                <div
                  className="h-full rounded-full bg-[#4078ff]"
                  style={{ width: `${Math.max(0, Math.min(100, a.allocation))}%` }}
                />
              </div>
              <div className="mt-0.5 text-[9.5px] leading-relaxed text-[#4d5364]">{a.description}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2 border-t border-[#1a1d26] pt-3 sm:grid-cols-2">
          <div>
            <div className="text-[9.5px] text-[#636878]">再平衡频率</div>
            <div className="text-[11px] text-[#d8dce6]">{selected.rebalanceFrequency}</div>
          </div>
          <div>
            <div className="text-[9.5px] text-[#636878]">这套框架假设的市场环境</div>
            <div className="text-[11px] leading-relaxed text-[#d8dce6]">{selected.marketCondition}</div>
          </div>
        </div>

        {saved && (
          <p className="mt-3 rounded-[4px] bg-[rgba(12,166,120,0.08)] px-2.5 py-2 text-[10px] text-[#0ca678]">
            已存为目标配置，并跳转到「纪律复盘」。在那里用再平衡检查对比你的实际仓位。
          </p>
        )}

        <p className="mt-3 border-t border-[#1a1d26] pt-3 text-[9.5px] leading-relaxed text-[#636878]">
          注意：这里的比例是静态示例，不随市场变化，也不包含税费、申赎费与跟踪误差。
          「适用市场环境」本身是主观判断，可能出错。本页不构成投资建议，不承诺任何收益。
        </p>
      </div>
    </div>
  );
};
