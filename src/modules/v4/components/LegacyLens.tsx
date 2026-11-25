import { memo, useEffect, useState } from 'react';
import { MacroPage } from '../../macro/MacroPage';
import { SentimentPage } from '../../sentiment/SentimentPage';
import { FundFlowPage } from '../../fundflow/FundFlowPage';
import { TechnicalAnalysisPage } from '../../technical/TechnicalAnalysisPage';
import { SectorRotationPage } from '../../rotation/SectorRotationPage';

type LensId = 'macro' | 'sentiment' | 'fundflow' | 'technical' | 'rotation';

const LENSES: { id: LensId; label: string; note: string }[] = [
  { id: 'macro', label: '宏观水温', note: 'FRED 真实序列 + 少量模型指标' },
  { id: 'sentiment', label: '情绪引擎', note: 'A 股优先真实；取不到就不可用' },
  { id: 'fundflow', label: '资金流动', note: 'A 股板块真实；美股部分为模型/模拟' },
  { id: 'technical', label: '技术分析', note: '真实日线 · 均线/MACD/RSI' },
  { id: 'rotation', label: '板块轮动', note: '旧版演示数据，不要当真实轮动' },
];

const WARN: Record<LensId, string> = {
  macro: '旧版透镜：保留原有宏观明细。CRPI / CNLI / CRAI 为模型指标，不要与真实序列混读。',
  sentiment: '旧版透镜：A 股情绪优先使用真实行情；任何“取不到就随机生成”的兜底都已从新版主路径移除。',
  fundflow: '旧版透镜：A 股板块资金流为东财真实快照；美股资金流为模型/模拟，仅作结构示意，不可当真实资金。',
  technical: '旧版透镜：保留真实日线与指标计算；不提供买卖信号。',
  rotation: '旧版透镜：该页为写死的演示轮动，仅用于理解概念。真实板块强弱请看「结构」或「研究 → 结构」。',
};

const COMPONENTS: Record<LensId, React.ComponentType> = {
  macro: MacroPage,
  sentiment: SentimentPage,
  fundflow: FundFlowPage,
  technical: TechnicalAnalysisPage,
  rotation: SectorRotationPage,
};

interface Props {
  initial?: string;
}

export const LegacyLens = memo(function LegacyLens({ initial }: Props) {
  const [view, setView] = useState<LensId>(
    LENSES.some((l) => l.id === initial) ? (initial as LensId) : 'macro',
  );

  useEffect(() => {
    if (initial && LENSES.some((l) => l.id === initial)) setView(initial as LensId);
  }, [initial]);

  const Page = COMPONENTS[view];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {LENSES.map((l) => (
          <button
            key={l.id}
            onClick={() => setView(l.id)}
            title={l.note}
            className={`rounded border px-2 py-1 text-[0.5938rem] ${
              view === l.id
                ? 'border-[#4078ff] bg-[rgba(64,120,255,0.12)] text-[#d8dce6]'
                : 'border-[#1a1d26] text-[#8a8f9d] hover:border-[#2a3040]'
            }`}
          >
            {l.label}
          </button>
        ))}
        <span className="ml-2 text-[0.5313rem] text-[#4d5364]">旧版功能保留，不进入新版首屏</span>
      </div>

      <div className="mb-2 rounded border-l-2 border-[#f59e4b] bg-[rgba(245,158,75,0.05)] px-2.5 py-1.5 text-[0.5938rem] leading-relaxed text-[#b0b5c0]">
        {WARN[view]}
      </div>

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#090b0f]">
        <Page />
      </div>
    </div>
  );
});
