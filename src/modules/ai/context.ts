/**
 * 把页面上「已经收集到的真实数据」压成一段紧凑文本，作为提问的上下文。
 *
 * 原则：
 *  - 只喂真实上游数据，缺失就写「缺」，绝不补演示值，避免模型把示例当事实；
 *  - 数值保留原始精度到 2 位，模型不改写数字；
 *  - 控制长度（指标 ≤14 条、快讯 ≤15 条），防止 prompt 过长导致费用与延迟失控。
 */
import type { RhythmSnapshot } from '../rhythm/services/rhythm';
import type { StructureSnapshot } from '../../core/data/structure';
import type { NewsItem } from '../../types/macro';
import type { Market } from '../../stores/useAppStore';
import type { ResonanceResult } from '../../core/analysis/resonance';
import { termStateLabel, type TermStructure } from '../../services/volTerm';

export interface AiDataBundle {
  market: Market;
  snapshot: RhythmSnapshot | null;
  structure: StructureSnapshot | null;
  news: NewsItem[];
  /** 四维共振结论；有则一并交给模型，避免它只看到单薄的指标表。 */
  resonance?: ResonanceResult | null;
  term?: TermStructure | null;
}

const DIM_STATE_LABEL: Record<string, string> = {
  risk: '偏风险',
  neutral: '中性',
  loose: '偏宽松',
  missing: '缺数据',
};

const MARKET_LABEL: Record<Market, string> = { US: '美股', CN: 'A股' };

const NEWS_TAG_LABEL: Record<string, string> = {
  macro: '宏观',
  earn: '财报',
  policy: '政策',
  geo: '地缘',
};

function num(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '缺';
  return Number(value).toFixed(digits);
}

function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '缺';
  return `${Number(value).toFixed(digits)}%`;
}

function signed(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '缺';
  const v = Number(value);
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
}

/** 组装给模型看的数据摘要。 */
export function buildDataBrief({ market, snapshot, structure, news, resonance, term }: AiDataBundle): string {
  const lines: string[] = [];

  lines.push(`【市场视角】${MARKET_LABEL[market]}`);

  if (resonance) {
    lines.push(
      `【四维共振】风险 ${resonance.riskCount} · 宽松 ${resonance.looseCount} · 中性 ${resonance.neutralCount} · 缺 ${resonance.missingCount}`,
    );
    lines.push(`【共振结论】${resonance.verdict}`);
    for (const dim of resonance.dimensions) {
      const score = dim.score === null ? '—' : dim.score.toFixed(2);
      const evidence = dim.evidence.length
        ? `｜${dim.evidence.map((e) => `${e.label} ${e.value}`).join('，')}`
        : '';
      lines.push(`- ${dim.label}：${DIM_STATE_LABEL[dim.state] ?? dim.state}（${score}）${evidence}`);
    }
  }

  if (term && term.source === 'real' && term.latest !== null) {
    lines.push(
      `【VIX 期限结构】VIX/VIX3M = ${term.latest.toFixed(3)}（${termStateLabel(term.state)}）· 分位 ${num(term.percentile, 0)} · z ${signed(term.z)} · 5 日变化 ${signed(term.change5, 3)} · 截至 ${term.asOf ?? '缺'}`,
    );
  } else {
    lines.push('【VIX 期限结构】当前不可用（^VIX / ^VIX3M 未取到），不要推测。');
  }

  if (!snapshot) {
    lines.push('【风险体制】数据未加载：请明确说明“当前没有可用数据”，不要推测。');
  } else {
    const { regime, indicators, fetchedAt } = snapshot;
    lines.push(
      `【风险体制】${regime.tone} · 分数 ${num(regime.score, 0)}/100 · 置信度 ${num(regime.confidence, 0)}% · 数据截至 ${regime.asOf ?? '缺'}`,
    );
    if (regime.summary) lines.push(`【一句话结论】${regime.summary}`);
    if (regime.reasons?.length) {
      lines.push(`【判定依据】${regime.reasons.slice(0, 6).join('；')}`);
    }
    if (regime.action) lines.push(`【建议动作】${regime.action}`);
    if (regime.confirm) lines.push(`【确认条件】${regime.confirm}`);
    if (regime.avoid) lines.push(`【应避免】${regime.avoid}`);
    if (regime.riskBudget) lines.push(`【风险预算】${regime.riskBudget}`);

    const real = indicators
      .filter((i) => i.source === 'real' && i.value !== null)
      .sort((a, b) => b.weight - a.weight);
    const missing = indicators.length - real.length;

    lines.push(
      `【环境指标】共 ${indicators.length} 项，可用 ${real.length} 项${missing > 0 ? `，缺失 ${missing} 项` : ''}：`,
    );
    for (const i of real.slice(0, 14)) {
      lines.push(
        `- ${i.name}（${i.dimension}·${i.phase}）=${num(i.value)}${i.unit} ` +
          `分位 ${num(i.percentile, 0)} · z ${signed(i.z)} · 斜率 ${signed(i.slope, 3)} ` +
          `· ${i.frequency} · 截至 ${i.asOf ?? '缺'}${i.freshnessDays !== null ? `（滞后 ${i.freshnessDays} 天）` : ''}`,
      );
    }
    if (missing > 0) {
      const missingNames = indicators.filter((i) => i.source !== 'real' || i.value === null).map((i) => i.name);
      lines.push(`- 缺失项：${missingNames.slice(0, 10).join('、')}`);
    }
    lines.push(`【快照抓取时间】${fetchedAt}`);
  }

  if (!structure || structure.source !== 'real') {
    lines.push(`【${MARKET_LABEL[market]}结构】当前不可用（上游未返回真实数据），不要用历史印象补足。`);
  } else {
    lines.push(
      `【${MARKET_LABEL[market]}结构】截至 ${structure.asOf ?? '缺'} · 广度 ${pct(structure.breadth)} · 离散度 ${pct(structure.dispersion)}`,
    );
    if (structure.top.length) {
      lines.push(
        `- 领涨：${structure.top
          .slice(0, 5)
          .map((s) => `${s.name} 5日${signed(s.rs5)}pct / 20日${signed(s.rs20)}pct`)
          .join('；')}`,
      );
    }
    if (structure.bottom.length) {
      lines.push(
        `- 领跌：${structure.bottom
          .slice(0, 5)
          .map((s) => `${s.name} 5日${signed(s.rs5)}pct / 20日${signed(s.rs20)}pct`)
          .join('；')}`,
      );
    }
    if (structure.note) lines.push(`- 备注：${structure.note}`);
  }

  if (!news.length) {
    lines.push('【网页快讯】没有抓到快讯，请说明“快讯源当前不可用”。');
  } else {
    lines.push(`【网页快讯】共 ${news.length} 条（来源标注 realtime=实时抓取，snapshot=离线快照）：`);
    for (const n of news.slice(0, 15)) {
      const source = n.source === 'realtime' ? '实时' : '快照';
      const tag = NEWS_TAG_LABEL[n.tag] ?? n.tag;
      lines.push(`- [${n.time}]（${tag}·${source}）${n.content}${n.impact ? ` —— 影响：${n.impact}` : ''}`);
    }
  }

  return lines.join('\n');
}

export const AI_SYSTEM_PROMPT = [
  '你是这个投资研究软件内置的分析助手，服务对象是普通个人投资者。',
  '你的任务是把用户软件里已经抓到的市场数据与网页快讯，整理成可读的结论。',
  '',
  '硬性要求：',
  '1. 只能使用用户消息里给出的数据。数据里写“缺”或“不可用”的，就如实说缺，绝不编造数字、日期或事件。',
  '2. 不给买卖建议、目标价、收益预测，不推荐具体标的买入卖出；只做“现在处于什么状态、哪里在变化、哪里需要确认”。',
  '3. 数字必须原样引用，不做二次换算，不四舍五入到看不出原值。',
  '4. 区分“事实”（数据里写明的）与“解读”（你的推断），推断要标明是推断。',
  '5. 中文回答，短句，不用表格，不用 emoji。',
  '',
  '输出结构（用 Markdown 小标题）：',
  '## 一句话结论',
  '## 关键变化（3-5 条，每条带数字）',
  '## 风险与分歧',
  '## 数据缺口',
  '## 接下来盯什么（2-3 条可验证的观察点）',
].join('\n');

export const AI_FIRST_TASK = [
  '请基于下面这份软件刚抓到的数据，做一次盘面总结。',
  '如果某一类数据整体缺失，直接在「数据缺口」里说明，不要用常识补。',
  '',
  '----- 数据开始 -----',
].join('\n');
