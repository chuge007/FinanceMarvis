import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { SourceBadge } from '../../../shared/components/SourceBadge';

const GROUPS = [
  {
    kind: 'real' as const,
    title: '来自真实上游接口',
    items: [
      'ConvexTrade 宏观序列：VIX、10Y 美债、期限利差、HY/IG 信用利差、CPI、失业率、美元指数、联邦基金利率等',
      'alternative.me 恐惧贪婪指数（主值与历史序列）',
      '东方财富：A 股板块资金流、涨跌家数、成交额、快讯、日 K',
      '腾讯：A 股指数日 K、交易时段五档盘口；Yahoo：美股行情与 K 线（可能限流）',
    ],
  },
  {
    kind: 'model' as const,
    title: '前端模型估算（不是原始数据）',
    items: [
      'VVIX / SKEW / MOVE（仅 VIX 为真实）、恐惧贪婪指数的 7 个子因子',
      '美股资金流全景与日内曲线、30 日资金流时序（仅最后一日用真实值锚定）',
      'A 股情绪合成分、多空力量百分比、桑基图连线金额',
      '候选池评分、策略信号分、选股「上涨希望」等规则加权结果',
    ],
  },
  {
    kind: 'demo' as const,
    title: '演示 / 静态常量（不可用于决策）',
    items: [
      'NAAIM、McClellan、Put/Call、暗池、Gamma 敞口、算法情绪表等面板的固定数字',
      '机构目标位与观点、美股快讯快照、算法对比评估表',
      '逐笔大单、闭市时的盘口；回测在真实 K 线不足时会改用模拟 K 线',
      '执行规则等静态说明文本、候选池的题材与叙事描述',
    ],
  },
];

export const DataIntegrityPanel = memo(function DataIntegrityPanel() {
  return (
    <Panel title="数据可信度" hint="先看标签，再看数字">
      <div className="grid grid-cols-3 gap-3">
        {GROUPS.map((g) => (
          <div key={g.kind} className="border border-[#1a1d26] rounded-[4px] p-3">
            <div className="mb-2"><SourceBadge kind={g.kind} text={g.title} /></div>
            <ul className="space-y-1.5">
              {g.items.map((t, i) => (
                <li key={i} className="text-[10px] leading-relaxed text-[#b0b5c0] flex gap-1.5">
                  <span className="text-[#636878]">·</span><span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed mt-3 border-t border-[#1a1d26] pt-3" style={{ color: '#f7d44c' }}>
        重要：本页「今日市场状态」与「指标传导链」只使用真实接口的历史序列；上游不可用时显示「数据不可用」并降低置信度，
        绝不用模拟值补位。其它页面里标注为「模型估算 / 演示常量」的数字仅用于界面演示，不能作为实盘依据。
        所有数据均有延迟，本工具仅供研究参考，不构成投资建议。
      </p>
    </Panel>
  );
});
