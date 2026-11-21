/**
 * 个人投资地图引擎（纯函数 · 无网络请求 · 不产生任何收益承诺）
 *
 * 设计原则：
 *  1. 先安排钱，再谈投资：应急金 → 高息负债 → 短期要用的钱 → 长期不用的钱。
 *  2. 顺序不可颠倒。应急金不足或高息负债未清时，不输出任何权益配置比例。
 *  3. 比例来自「期限 + 风险承受能力（问卷）+ 风险承受意愿（可接受浮亏）」三者取小，
 *     而不是来自对涨跌的预测。
 *  4. 市场状态只做「下调风险预算」的不对称调整，绝不因为状态好而上调仓位。
 *  5. 只给资产大类与工具类型，不给个股、不给目标价、不给预期收益。
 */

export type RiskLevel = 'conservative' | 'balanced' | 'growth' | 'aggressive';
export type Goal = 'preserve' | 'income' | 'growth' | 'aggressive';

export interface Profile {
  /** 可投资金融资产合计（元，含现金与已持有基金股票，不含自住房） */
  investableAssets: number;
  monthlyIncome: number;
  monthlyExpense: number;
  /** 现有应急金可覆盖几个月支出 */
  emergencyMonths: number;
  /** 高息负债余额（信用卡 / 消费贷等，利率明显高于存款） */
  highInterestDebt: number;
  hasInsurance: boolean;
  age: number;
  /** 这笔长期资金预计多少年不用 */
  horizonYears: number;
  goal: Goal;
  /** 风险问卷得分 0-100 */
  riskScore: number;
  /** 能接受的最大浮亏（%）—— 硬约束，优先于问卷得分 */
  maxLossPct: number;
}

export interface RiskAnswers {
  experience: 0 | 1 | 2 | 3;
  maxLossPct: 5 | 10 | 20 | 30;
  incomeStability: 0 | 1 | 2;
  reaction: 0 | 1 | 2 | 3;
  goal: Goal;
}

export interface Precondition {
  id: string;
  ok: boolean;
  level: 'blocker' | 'warn' | 'info';
  title: string;
  detail: string;
}

export interface Bucket {
  key: 'emergency' | 'debt' | 'short' | 'long';
  name: string;
  amount: number;
  pct: number;
  purpose: string;
  tools: string[];
  note: string;
}

export interface Sleeve {
  name: string;
  pct: number;
  amount: number;
  tools: string;
  note: string;
}

export interface Plan {
  level: RiskLevel;
  levelLabel: string;
  totalAssets: number;
  emergencyTarget: number;
  emergencyGap: number;
  annualPremiumBudget: { low: number; high: number };
  buckets: Bucket[];
  longTermAmount: number;
  equityPct: number;
  bondPct: number;
  cashPct: number;
  equityAmount: number;
  bondAmount: number;
  cashAmount: number;
  sleeves: Sleeve[];
  monthlyInvest: number;
  buildMonths: number;
  monthlySurplus: number;
  rebalance: string;
  preconditions: Precondition[];
  actions: string[];
  avoid: string[];
  warnings: string[];
  blocked: boolean;
  regime: { applied: boolean; delta: number; reason: string };
}

export interface RegimeInput {
  tone: '进攻' | '均衡' | '防守' | '观望';
  confidence: number;
  asOf: string | null;
}

const LEVEL_LABEL: Record<RiskLevel, string> = {
  conservative: '保守型',
  balanced: '稳健型',
  growth: '成长型',
  aggressive: '进取型',
};

/** 问卷得分 → 风险等级（仅代表「意愿」，还要被期限与可接受浮亏压制） */
export function scoreToLevel(score: number): RiskLevel {
  if (score < 30) return 'conservative';
  if (score < 55) return 'balanced';
  if (score < 78) return 'growth';
  return 'aggressive';
}

export function assessRisk(a: RiskAnswers): { score: number; level: RiskLevel; cap: number } {
  const exp = [0, 8, 16, 24][a.experience];
  const loss = { 5: 0, 10: 8, 20: 16, 30: 24 }[a.maxLossPct];
  const stability = [0, 6, 12][a.incomeStability];
  const reaction = [0, 6, 12, 18][a.reaction];
  const goal = { preserve: 0, income: 6, growth: 14, aggressive: 20 }[a.goal];
  const raw = exp + loss + stability + reaction + goal; // 0~98
  const score = Math.round((raw / 98) * 100);
  const level = scoreToLevel(score);
  // 可接受浮亏是硬上限：问卷再激进，也不能超过自己说的承受力
  const cap = { 5: 30, 10: 55, 20: 75, 30: 90 }[a.maxLossPct];
  return { score, level, cap };
}

/** 由可接受浮亏反推等级上限，避免「问卷说激进、跌 10% 就睡不着」 */
function capLevel(level: RiskLevel, cap: number): RiskLevel {
  const order: RiskLevel[] = ['conservative', 'balanced', 'growth', 'aggressive'];
  const maxByCap: Record<number, RiskLevel> = { 30: 'conservative', 55: 'balanced', 75: 'growth', 90: 'aggressive' };
  const allowed = maxByCap[cap] ?? 'aggressive';
  return order.indexOf(level) <= order.indexOf(allowed) ? level : allowed;
}

function horizonBase(years: number): number {
  if (years <= 3) return 10;
  if (years <= 5) return 30;
  if (years <= 10) return 50;
  return 65;
}

function horizonCap(years: number): number {
  if (years <= 3) return 20;
  if (years <= 5) return 40;
  if (years <= 10) return 65;
  return 85;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round5 = (v: number) => Math.round(v / 5) * 5;

export function emptyProfile(): Profile {
  return {
    investableAssets: 100000,
    monthlyIncome: 15000,
    monthlyExpense: 9000,
    emergencyMonths: 2,
    highInterestDebt: 0,
    hasInsurance: false,
    age: 32,
    horizonYears: 8,
    goal: 'growth',
    riskScore: 52,
    maxLossPct: 20,
  };
}

export function buildPlan(profile: Profile, regime?: RegimeInput | null): Plan {
  const p = profile;
  const totalAssets = Math.max(0, p.investableAssets);
  const expense = Math.max(0, p.monthlyExpense);
  const income = Math.max(0, p.monthlyIncome);
  const surplus = income - expense;

  const emergencyTarget = expense * 6;
  const currentEmergency = expense * Math.max(0, p.emergencyMonths);
  const emergencyGap = Math.max(0, emergencyTarget - currentEmergency);

  const level = capLevel(scoreToLevel(p.riskScore), p.maxLossPct);
  const base = horizonBase(p.horizonYears);
  const riskAdj = (p.riskScore - 50) * 0.4;
  const levelCap = { conservative: 30, balanced: 55, growth: 75, aggressive: 90 }[level];

  let equityPct = round5(clamp(Math.min(base + riskAdj, levelCap, horizonCap(p.horizonYears), 85), 0, 85));

  const warnings: string[] = [];
  let regimeInfo: Plan['regime'] = { applied: false, delta: 0, reason: '未接入市场状态，按基础配置执行。' };
  if (regime && regime.confidence >= 50) {
    if (regime.tone === '防守' || regime.tone === '观望') {
      const before = equityPct;
      equityPct = round5(clamp(equityPct - 10, 0, 85));
      regimeInfo = {
        applied: equityPct !== before,
        delta: equityPct - before,
        reason: `当前风险环境为「${regime.tone}」（数据覆盖 ${regime.confidence}%），把权益比例下调 10 个百分点。这是降低波动，不是预测下跌；状态恢复后按规则调回。`,
      };
    } else {
      regimeInfo = {
        applied: false,
        delta: 0,
        reason: `当前风险环境为「${regime.tone}」（数据覆盖 ${regime.confidence}%）。环境好不上调仓位——只在恶化时降风险，是刻意的单向规则。`,
      };
    }
  } else if (regime) {
    regimeInfo = {
      applied: false,
      delta: 0,
      reason: `市场状态置信度仅 ${regime.confidence}%，数据不足，不纳入调整。`,
    };
  }

  const blocked = emergencyGap > 0 || p.highInterestDebt > 0 || p.horizonYears <= 3 || totalAssets <= 0;

  // 若先决条件不满足，权益比例归零：不输出"边还债边炒股"的方案
  if (blocked) equityPct = 0;

  const cashBufferPct = 5;
  const bondPct = equityPct === 0 ? Math.max(0, 100 - cashBufferPct) : Math.max(0, 100 - equityPct - cashBufferPct);
  const cashPct = equityPct === 0 ? cashBufferPct : cashBufferPct;

  const afterEmergency = Math.max(0, totalAssets - emergencyGap);
  const afterDebt = Math.max(0, afterEmergency - p.highInterestDebt);
  const longTermAmount = p.horizonYears <= 3 ? 0 : afterDebt;
  const shortTermAmount = p.horizonYears <= 3 ? afterDebt : 0;

  const equityAmount = Math.round((longTermAmount * equityPct) / 100);
  const bondAmount = Math.round((longTermAmount * bondPct) / 100);
  const cashAmount = Math.max(0, longTermAmount - equityAmount - bondAmount);

  const buckets: Bucket[] = [
    {
      key: 'emergency',
      name: '① 要花的钱 · 应急金',
      amount: Math.min(totalAssets, emergencyGap),
      pct: totalAssets > 0 ? (Math.min(totalAssets, emergencyGap) / totalAssets) * 100 : 0,
      purpose: '失业、生病、突发支出时不被迫卖出投资',
      tools: ['货币基金（T+0/T+1）', '银行活期+', '短债基金（净值会小幅波动）'],
      note: `目标 ${Math.round(emergencyTarget).toLocaleString('zh-CN')} 元（6 个月支出）。收入越不稳定，越应接近 6~12 个月。`,
    },
    {
      key: 'debt',
      name: '② 保命的钱 · 先还高息负债',
      amount: Math.min(afterEmergency, p.highInterestDebt),
      pct: totalAssets > 0 ? (Math.min(afterEmergency, p.highInterestDebt) / totalAssets) * 100 : 0,
      purpose: '还掉利率明显高于理财收益的负债，等于锁定一笔无风险收益',
      tools: ['信用卡分期/消费贷提前还款', '优先偿还利率最高的一笔'],
      note: '房贷等低利率长期负债不在此列，按原计划还即可。',
    },
    {
      key: 'short',
      name: '③ 短期要用的钱（3 年内）',
      amount: shortTermAmount,
      pct: totalAssets > 0 ? (shortTermAmount / totalAssets) * 100 : 0,
      purpose: '买房首付、婚礼、教育等有明确时间点的支出',
      tools: ['定期存款', '国债 / 国债逆回购', '短债基金', '同业存单指数基金'],
      note: p.horizonYears <= 3
        ? '期限不足 3 年，本引擎不配置权益：短期波动可能恰好落在用钱的那一天。'
        : '这部分按时间点倒排，到期日要早于用钱日。',
    },
    {
      key: 'long',
      name: '④ 长期不用的钱',
      amount: longTermAmount,
      pct: totalAssets > 0 ? (longTermAmount / totalAssets) * 100 : 0,
      purpose: '10 年以上的养老、子女教育、财富积累',
      tools: ['宽基指数基金', '债券基金', '黄金 ETF', '（可选）个股，不超过 10%'],
      note: '只有这部分才适合承担股市波动。其余三桶的钱不进股市。',
    },
  ];

  const sleeveDefs: Array<{ name: string; pct: number; tools: string; note: string }> = [
    { name: '宽基指数（核心）', pct: 70, tools: '沪深300 / 中证A500 / 标普500 / 全球宽基 ETF', note: '费率低、分散度好，是普通人的默认选项' },
    { name: '行业与主题（卫星）', pct: 15, tools: '行业 ETF / 主题基金', note: '波动与回撤显著大于宽基，不要超过权益部分的 20%' },
    { name: '黄金（对冲）', pct: 10, tools: '黄金 ETF / 积存金', note: '不产生现金流，作用是降低组合相关性，不是进攻工具' },
    { name: '个股（可选）', pct: 5, tools: '自己真正看得懂的公司', note: '不是必选项；若没有研究能力，把这 5% 并入宽基' },
  ];
  const sleeves: Sleeve[] = equityPct === 0
    ? []
    : sleeveDefs.map((s) => ({
        ...s,
        amount: Math.round((equityAmount * s.pct) / 100),
      }));

  const baseBuildMonths = { conservative: 24, balanced: 18, growth: 12, aggressive: 12 }[level];
  let buildMonths = baseBuildMonths;
  let monthlyInvest = buildMonths > 0 ? Math.round(equityAmount / buildMonths) : 0;
  if (surplus > 0 && monthlyInvest > surplus * 0.5) {
    buildMonths = Math.min(36, Math.max(baseBuildMonths, Math.ceil(equityAmount / (surplus * 0.5))));
    monthlyInvest = Math.round(equityAmount / buildMonths);
    warnings.push(`按 ${baseBuildMonths} 个月建仓需要每月 ${Math.round(equityAmount / baseBuildMonths).toLocaleString('zh-CN')} 元，超过月结余的一半。已延长到 ${buildMonths} 个月，避免挤压生活现金流。`);
  }
  if (surplus <= 0) {
    warnings.push('月支出不低于月收入，当前没有新增结余。先修复现金流，再谈定投；不要用借来的钱投资。');
  }

  const preconditions: Precondition[] = [
    {
      id: 'emergency',
      ok: emergencyGap === 0,
      level: emergencyGap === 0 ? 'info' : 'blocker',
      title: emergencyGap === 0 ? '应急金已达标' : '应急金不足',
      detail: emergencyGap === 0
        ? `已有约 ${p.emergencyMonths} 个月支出的现金缓冲。`
        : `还差 ${Math.round(emergencyGap).toLocaleString('zh-CN')} 元才够 6 个月支出。先补足，再投资。`,
    },
    {
      id: 'debt',
      ok: p.highInterestDebt === 0,
      level: p.highInterestDebt === 0 ? 'info' : 'blocker',
      title: p.highInterestDebt === 0 ? '无高息负债' : '存在高息负债',
      detail: p.highInterestDebt === 0
        ? '没有需要优先偿还的高息借款。'
        : `尚有 ${Math.round(p.highInterestDebt).toLocaleString('zh-CN')} 元高息负债。还它的确定性收益高于任何理财。`,
    },
    {
      id: 'horizon',
      ok: p.horizonYears > 3,
      level: p.horizonYears > 3 ? 'info' : 'blocker',
      title: p.horizonYears > 3 ? '期限足够长' : '期限不足 3 年',
      detail: p.horizonYears > 3
        ? `这笔钱 ${p.horizonYears} 年内不用，可以承受中途波动。`
        : '3 年内要用的钱不配置权益，放存款/国债/货基。',
    },
    {
      id: 'insurance',
      ok: p.hasInsurance,
      level: p.hasInsurance ? 'info' : 'warn',
      title: p.hasInsurance ? '已有基础保障' : '建议先补基础保障',
      detail: p.hasInsurance
        ? '医疗/重疾/意外已有覆盖，投资不必承担"出事就卖资产"的压力。'
        : `年保费预算建议控制在年收入 5%~10%（约 ${Math.round(income * 12 * 0.05).toLocaleString('zh-CN')}~${Math.round(income * 12 * 0.1).toLocaleString('zh-CN')} 元），优先医疗、重疾、意外、定期寿险。`,
    },
    {
      id: 'surplus',
      ok: surplus > 0,
      level: surplus > 0 ? 'info' : 'warn',
      title: surplus > 0 ? '现金流为正' : '现金流为负',
      detail: surplus > 0
        ? `每月结余约 ${Math.round(surplus).toLocaleString('zh-CN')} 元，可用于定投。`
        : '先削减支出或增加收入。用负债投资是普通人最常见的爆仓路径。',
    },
  ];

  const actions = [
    emergencyGap > 0
      ? `先把应急金补到 ${Math.round(emergencyTarget).toLocaleString('zh-CN')} 元，放在货币基金或活期+，不要买有封闭期的产品。`
      : '确认应急金放在 T+0/T+1 能取出的地方，不要把应急金买成三年定期。',
    p.highInterestDebt > 0
      ? '列出所有负债的利率，从最高的一笔开始提前还。'
      : '查一次征信与保单，确认没有遗漏的高息负债和断缴。',
    p.hasInsurance
      ? '每年复核一次保额是否覆盖 3~5 年家庭支出。'
      : '先配百万医疗 + 意外险，预算够再加定期重疾/寿险；不买"理财型保险"。',
    p.horizonYears > 3
      ? `长期资金按 ${equityPct}% 权益 / ${bondPct}% 债券 / ${cashPct}% 现金起步，用 ${buildMonths} 个月分批建仓，每月约 ${monthlyInvest.toLocaleString('zh-CN')} 元。`
      : '把 3 年内要用的钱按用钱日期倒排到存款/国债，先不碰权益。',
    '把"再平衡日"写进日历：每年一次，或任一类资产偏离目标 5 个百分点时，用新增资金补低配，而不是追涨。',
    '记录每一笔买卖的理由。三个月后回看，区分"决策错了"和"结果不好"。',
  ];

  const avoid = [
    '不用应急金、不用借来的钱、不用下个月要还的钱投资。',
    '不因为"最近涨得好"就提高权益比例；本引擎只在环境恶化时降风险，不反向加码。',
    '不买看不懂的产品；不理解收益从哪来，就不要买。',
    '不追"稳赚不赔""保本高息""内部消息"，这些几乎都是骗局。',
    '不频繁交易。换手越多，费用与犯错概率越高。',
    '不在亏损时用杠杆"摊薄成本"。',
  ];

  if (p.age >= 55 && equityPct > 50) {
    warnings.push('年龄已接近或进入退休期，权益比例偏高。若这笔钱用于养老支出，建议下调到 50% 以下，并提高现金与短债比例。');
  }
  if (p.maxLossPct <= 10 && p.riskScore >= 70) {
    warnings.push('问卷显示风险偏好较高，但你能接受的最大浮亏不超过 10%。已按较低的比例配置——能睡着觉比跑赢指数重要。');
  }
  if (totalAssets < p.highInterestDebt) {
    warnings.push('高息负债已超过可投资资产，当前应优先还债，不进入投资环节。');
  }

  return {
    level,
    levelLabel: LEVEL_LABEL[level],
    totalAssets,
    emergencyTarget,
    emergencyGap,
    annualPremiumBudget: { low: Math.round(income * 12 * 0.05), high: Math.round(income * 12 * 0.1) },
    buckets,
    longTermAmount,
    equityPct,
    bondPct,
    cashPct,
    equityAmount,
    bondAmount,
    cashAmount,
    sleeves,
    monthlyInvest,
    buildMonths,
    monthlySurplus: Math.round(surplus),
    rebalance: '每年一次；或任一类资产偏离目标 5 个百分点时触发。优先用新增资金补低配，避免为再平衡而卖出产生税费与摩擦成本。',
    preconditions,
    actions,
    avoid,
    warnings,
    blocked,
    regime: regimeInfo,
  };
}

/** 资产大类的长期特征（教育用途，历史统计的粗略量级，不代表未来） */
export const ASSET_CLASS_FACTS: Array<{
  name: string;
  role: string;
  horizon: string;
  drawdown: string;
  liquidity: string;
  note: string;
}> = [
  { name: '现金 / 货币基金', role: '应急与日常', horizon: '随时', drawdown: '几乎无', liquidity: 'T+0~T+1', note: '长期跑不赢通胀，只适合放要用的钱' },
  { name: '国债 / 存款 / 短债', role: '压舱石', horizon: '1~3 年', drawdown: '通常个位数', liquidity: '到期或 T+1', note: '收益有限但确定，是短期目标资金的容器' },
  { name: '宽基指数基金', role: '长期增值主力', horizon: '10 年以上', drawdown: '历史可达 -40%~-70%', liquidity: 'T+1', note: '分散、低费率；必须用长期不用的钱' },
  { name: '行业 / 主题基金', role: '卫星仓位', horizon: '5 年以上', drawdown: '可能超过 -60%', liquidity: 'T+1', note: '波动远大于宽基，不适合做核心仓' },
  { name: '黄金', role: '对冲与分散', horizon: '10 年以上', drawdown: '历史可达 -40%', liquidity: 'T+0~T+1', note: '不产生现金流，不能替代生息资产' },
  { name: '个股', role: '可选，非必需', horizon: '视公司而定', drawdown: '可能永久性损失', liquidity: 'T+1', note: '需要研究能力与仓位纪律，普通人可以完全不配' },
];
