import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { mockExecutionRules } from '../../../data/mock';

const CATEGORY_NAMES: Record<string, string> = {
  entry: '入场规则',
  risk: '风控边界',
  position: '仓位管理',
  review: '复盘机制',
};

export const ExecutionRules = memo(function ExecutionRules() {
  return (
    <Panel title="执行规则与风控边界">
      <div className="grid grid-cols-2 gap-3">
        {mockExecutionRules.map((rule) => (
          <div key={rule.id} className="bg-[rgba(255,255,255,0.02)] border border-[#1a1d26] rounded-[5px] p-3">
            <div className="text-[10.5px] text-[#4078ff] font-medium mb-2 uppercase">
              {CATEGORY_NAMES[rule.category] || rule.category}
            </div>
            <pre className="text-[10px] text-[#b0b5c0] font-['JetBrains_Mono',Consolas,monospace] whitespace-pre-wrap leading-relaxed">
              {rule.rules}
            </pre>
          </div>
        ))}
      </div>
    </Panel>
  );
});
