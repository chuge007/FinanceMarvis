import { memo } from 'react';
import { useMarketStore } from '../../stores/useMarketStore';
import { useFearGreed } from '../../modules/sentiment/hooks/useFearGreed';

type ModuleId = 'macro' | 'sentiment' | 'fundflow' | 'strategy';

interface RelationNode {
  from: string;
  to: string;
  arrow: string;
  desc: string;
}

const RELATIONS: Record<ModuleId, RelationNode[]> = {
  macro: [
    { from: '宏观水温', to: '情绪引擎', arrow: '→', desc: 'VIX 飙升、利差走阔触发恐慌情绪；SPX 新高推动贪婪' },
    { from: '宏观水温', to: '资金流', arrow: '→', desc: '利率预期变化驱动板块轮动；信用利差收窄吸引资金流入风险资产' },
    { from: '宏观水温', to: '做T策略', arrow: '→', desc: '宏观风险等级决定仓位上限；VIX 区间约束操作频率与止盈空间' },
  ],
  sentiment: [
    { from: '情绪引擎', to: '宏观水温', arrow: '←', desc: '极度恐惧往往预判 VIX 冲顶；极度贪婪预警回调风险' },
    { from: '情绪引擎', to: '资金流', arrow: '→', desc: '情绪转恐惧 → 资金从高 β 板块撤退；情绪转贪婪 → 杠杆资金加速流入' },
    { from: '情绪引擎', to: '做T策略', arrow: '→', desc: '恐慌期降低 T 仓频率、优先防守；贪婪期可加大 T 仓比例' },
  ],
  fundflow: [
    { from: '资金流', to: '宏观水温', arrow: '←', desc: '北向/机构持续流出预警宏观风险累计；行业净流入集中度反推市场风格' },
    { from: '资金流', to: '情绪引擎', arrow: '←', desc: '融资余额攀升驱动贪婪指数；暗池卖压先行于情绪转冷' },
    { from: '资金流', to: '做T策略', arrow: '→', desc: '板块资金净流入方向即 T 仓选股方向；流出板块回避' },
  ],
  strategy: [
    { from: '做T策略', to: '宏观水温', arrow: '←', desc: '策略胜率反馈宏观环境有效性；宏观不利时策略自动降频' },
    { from: '做T策略', to: '情绪引擎', arrow: '←', desc: 'GEX 位置决定网格间距；Put/Call 偏度影响期权对冲成本' },
    { from: '做T策略', to: '资金流', arrow: '←', desc: '实盘成交跟随资金主力方向；避免逆板块资金流做 T' },
  ],
};

const MODULE_NAMES: Record<ModuleId, string> = {
  macro: '宏观水温',
  sentiment: '情绪引擎',
  fundflow: '资金流动',
  strategy: '做T策略',
};

export const ModuleRelationshipFooter = memo(function ModuleRelationshipFooter({
  module,
}: {
  module: ModuleId;
}) {
  const relations = RELATIONS[module];
  const { vix, spx, lastUpdate } = useMarketStore();
  const { data: fg } = useFearGreed();
  const fgValue = fg?.value ?? null;
  const fgLabel = fg?.classification ?? null;

  // 动态描述：根据当前 VIX / F&G 生成一句话联动摘要
  let dynamicSummary = '';
  if (module === 'sentiment' && fgValue !== null) {
    if (fgValue >= 75) dynamicSummary = '当前情绪极度贪婪，注意资金流向是否同步出现高 β 板块集中流入，若背离则是短期风险信号。';
    else if (fgValue >= 55) dynamicSummary = '情绪偏乐观，关注宏观面的 VIX 是否同步走低，若 VIX 不降反升则警惕情绪与波动率背离。';
    else if (fgValue >= 25) dynamicSummary = '市场恐惧中，追踪资金流是否出现防御板块（公用事业/必需消费）集中流入信号。';
    else dynamicSummary = '极端恐惧往往是中长期布局窗口，等待宏观利差收窄和资金回流确认。';
  } else if (module === 'macro' && vix) {
    if (vix > 30) dynamicSummary = `VIX ${vix.toFixed(1)} 处于高波动区间，预计情绪引擎将显示恐惧，资金流向防御板块倾斜。`;
    else if (vix > 20) dynamicSummary = `VIX ${vix.toFixed(1)} 温和偏高，关注情绪是否同步转谨慎及机构资金是否减仓。`;
    else dynamicSummary = `VIX ${vix.toFixed(1)} 低波动环境，做 T 策略可适度提升频率，情绪通常偏中性或乐观。`;
  } else if (module === 'fundflow') {
    dynamicSummary = '关联合并解读：板块资金净流入方向 + 行业轮动强度 = 当前市场主线。将该方向与宏观风险等级交叉验证，判断行情可持续性。';
  } else if (module === 'strategy') {
    dynamicSummary = '策略执行前交叉校验：宏观风险等级是否允许当前仓位？情绪极端值是否触发减仓规则？资金流向是否支持所选方向？';
  }

  return (
    <div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.06)]">
      <div className="text-[0.6563rem] text-[#636878] mb-2">
        {MODULE_NAMES[module]} ↔ 模块联动关系
      </div>

      {dynamicSummary && (
        <div className="mb-2 p-2 bg-[rgba(64,120,255,0.06)] rounded-[0.1875rem] border-l-2 border-[#4078ff]">
          <div className="text-[0.625rem] text-[#b0b5c0] leading-relaxed">{dynamicSummary}</div>
          {lastUpdate && (
            <div className="text-[0.5938rem] text-[#636878] mt-1">基于 {lastUpdate} 数据联动分析</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {relations.map((r) => (
          <div
            key={`${r.from}-${r.to}`}
            className="bg-[rgba(255,255,255,0.02)] rounded-[0.1875rem] p-2 border border-[rgba(255,255,255,0.04)]"
          >
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[0.625rem] text-[#4078ff] font-medium">{r.from}</span>
              <span className="text-[0.5938rem] text-[#636878]">{r.arrow}</span>
              <span className="text-[0.625rem] text-[#f59e4b] font-medium">{r.to}</span>
            </div>
            <div className="text-[0.625rem] text-[#8a8f9d] leading-relaxed">{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
});
