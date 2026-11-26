/**
 * 叠加实验室序列目录：只定义「有哪些线、依赖什么、默认什么颜色」。
 *
 * 与 rhythm 的 CONFIG 分开：
 *  - CONFIG 是参与体制打分的 8 条指标，权重固定；
 *  - 这里是可以按需叠加的研究序列，多了也不会改变首页体制分数。
 *
 * 所有序列最终都统一到滚动 Z 轴；相关系数单独放 -1~1 的面板，避免和 Z 混轴。
 */
export type OverlayGroup = 'rates' | 'credit' | 'liquidity' | 'equity' | 'factor';
export type OverlayAxis = 'z' | 'corr';
export type OverlaySource = 'fred' | 'yahoo' | 'derived';

export interface OverlayDef {
  id: string;
  label: string;
  group: OverlayGroup;
  source: OverlaySource;
  /** FRED series id 或 Yahoo 代码 */
  ref?: string;
  /** 派生序列的依赖 */
  deps?: string[];
  color: string;
  axis: OverlayAxis;
  frequency: 'daily' | 'weekly' | 'monthly';
  note: string;
}

export const OVERLAY_DEFS: OverlayDef[] = [
  // ── 利率与通胀 ──
  { id: 'DFII10', label: '10Y 实际利率', group: 'rates', source: 'fred', ref: 'DFII10', color: '#4078ff', axis: 'z', frequency: 'daily', note: 'TIPS 定价的真实资金成本，长久期成长股估值的分母。' },
  { id: 'T10YIE', label: '10Y 盈亏平衡通胀', group: 'rates', source: 'fred', ref: 'T10YIE', color: '#f59e4b', axis: 'z', frequency: 'daily', note: '名义利率 − 实际利率；上行利好价值/能源，压制长久期。' },
  { id: 'DGS10', label: '10Y 名义利率', group: 'rates', source: 'fred', ref: 'DGS10', color: '#748ffc', axis: 'z', frequency: 'daily', note: '全球资产定价基准；拆成实际+通胀才有信息量。' },
  { id: 'T10Y2Y', label: '2s10s 期限利差', group: 'rates', source: 'fred', ref: 'T10Y2Y', color: '#38d9a9', axis: 'z', frequency: 'daily', note: '倒挂后重新陡峭化，往往才是压力显现的阶段。' },

  // ── 信用与波动 ──
  { id: 'BAMLH0A0HYM2', label: 'HY OAS', group: 'credit', source: 'fred', ref: 'BAMLH0A0HYM2', color: '#f04452', axis: 'z', frequency: 'daily', note: '高收益债信用利差；先于股票定价信用风险。' },
  { id: 'VIXCLS', label: 'VIX', group: 'credit', source: 'fred', ref: 'VIXCLS', color: '#ff922b', axis: 'z', frequency: 'daily', note: '期权市场为保护付的价格；同步指标，不预测反转时点。' },

  // ── 金融条件与流动性 ──
  { id: 'NFCI', label: 'NFCI 金融条件', group: 'liquidity', source: 'fred', ref: 'NFCI', color: '#9b6efb', axis: 'z', frequency: 'weekly', note: '芝加哥联储金融条件指数；正=收紧，负=宽松。' },
  { id: 'DTWEXBGS', label: '广义美元', group: 'liquidity', source: 'fred', ref: 'DTWEXBGS', color: '#20c4d8', axis: 'z', frequency: 'daily', note: '美元走强常对应全球美元流动性收紧；FRED 不可达时可用 DXY 旁证。' },
  { id: 'DXY', label: 'ICE 美元指数', group: 'liquidity', source: 'yahoo', ref: 'DX-Y.NYB', color: '#20c4d8', axis: 'z', frequency: 'daily', note: 'Yahoo 可取的美元指数；和广义美元口径不同，但方向通常一致。' },
  { id: 'WALCL', label: '美联储总资产', group: 'liquidity', source: 'fred', ref: 'WALCL', color: '#f7d44c', axis: 'z', frequency: 'weekly', note: '周度；扩表/缩表的方向比绝对规模更重要。' },
  { id: 'RRPONTSYD', label: '逆回购 RRP', group: 'liquidity', source: 'fred', ref: 'RRPONTSYD', color: '#e8590c', axis: 'z', frequency: 'daily', note: '日度；RRP 下降通常意味着流动性从管道回流市场。' },
  { id: 'WRESBAL', label: '准备金余额', group: 'liquidity', source: 'fred', ref: 'WRESBAL', color: '#12b886', axis: 'z', frequency: 'weekly', note: '周度；对风险资产最直接的流动性口径之一。' },
  { id: 'WTREGEN', label: '财政部现金账户', group: 'liquidity', source: 'fred', ref: 'WTREGEN', color: '#da77f2', axis: 'z', frequency: 'weekly', note: 'TGA 抽水会减少银行准备金，和 RRP 一起看。' },

  // ── 美股指数 ──
  { id: 'SPY', label: '标普500 (SPY)', group: 'equity', source: 'yahoo', ref: 'SPY', color: '#e8ebf0', axis: 'z', frequency: 'daily', note: '全市场基准，用真实成交价。' },
  { id: 'QQQ', label: '纳指100 (QQQ)', group: 'equity', source: 'yahoo', ref: 'QQQ', color: '#4078ff', axis: 'z', frequency: 'daily', note: '美股久期最长的一端，本质是对实际利率的看涨期权。' },
  { id: 'SMH', label: '半导体 (SMH)', group: 'equity', source: 'yahoo', ref: 'SMH', color: '#f7d44c', axis: 'z', frequency: 'daily', note: 'AI 资本开支周期的可交易代理。' },
  { id: 'IWM', label: '罗素2000 (IWM)', group: 'equity', source: 'yahoo', ref: 'IWM', color: '#9b6efb', axis: 'z', frequency: 'daily', note: '小盘，对信用利差和内需更敏感。' },

  // ── 派生因子 ──
  { id: 'QQQ_SPY', label: '纳指 ÷ 标普 (ln)', group: 'factor', source: 'derived', deps: ['QQQ', 'SPY'], color: '#f59e4b', axis: 'z', frequency: 'daily', note: '久期/成长风格因子；相对走强=流动性宽松的折现率行情，走弱=增长/盈利重新定价。' },
  { id: 'SMH_QQQ', label: '半导体 ÷ 纳指 (ln)', group: 'factor', source: 'derived', deps: ['SMH', 'QQQ'], color: '#f7d44c', axis: 'z', frequency: 'daily', note: 'AI 资本开支因子；走阔=分子驱动（订单/capex），走平=分母驱动（利率下行）。' },
  { id: 'NET_LIQ', label: '净流动性 (十亿美元)', group: 'liquidity', source: 'derived', deps: ['WALCL', 'RRPONTSYD', 'WTREGEN'], color: '#20c4d8', axis: 'z', frequency: 'weekly', note: 'WALCL/1000 − RRP − TGA；单位统一为十亿美元。' },

  // ── 相关性（单独面板，不进 Z 轴） ──
  { id: 'QQQ_DFII10_CORR', label: 'QQQ ↔ 实际利率', group: 'factor', source: 'derived', deps: ['QQQ', 'DFII10'], color: '#4078ff', axis: 'corr', frequency: 'daily', note: '60 日滚动相关（变化率）；转正=市场从交易折现率转向交易增长。' },
  { id: 'SPY_DFII10_CORR', label: '标普 ↔ 实际利率', group: 'factor', source: 'derived', deps: ['SPY', 'DFII10'], color: '#e8ebf0', axis: 'corr', frequency: 'daily', note: '与 QQQ 那条并排看差值；差值收窄=久期溢价消失。' },
  { id: 'QQQ_SPY_DFII10_CORR', label: '纳指/标普 ↔ 实际利率', group: 'factor', source: 'derived', deps: ['QQQ_SPY', 'DFII10'], color: '#f59e4b', axis: 'corr', frequency: 'daily', note: '风格因子与实际利率的相关；强负是常态。' },
  { id: 'SPY_T10YIE_CORR', label: '标普 ↔ 通胀预期', group: 'factor', source: 'derived', deps: ['SPY', 'T10YIE'], color: '#f59e4b', axis: 'corr', frequency: 'daily', note: '盈亏平衡通胀与股票的相关，和实际利率方向常相反。' },
  { id: 'SPY_DXY_CORR', label: '标普 ↔ 美元', group: 'factor', source: 'derived', deps: ['SPY', 'DXY'], color: '#20c4d8', axis: 'corr', frequency: 'daily', note: '美元与美股的相关会随周期翻转；转负常对应海外营收压力。' },
  { id: 'NFCI_HY_CORR', label: 'NFCI ↔ HY OAS', group: 'factor', source: 'derived', deps: ['NFCI', 'BAMLH0A0HYM2'], color: '#9b6efb', axis: 'corr', frequency: 'weekly', note: '金融条件→信用利差的传导；领先于 VIX。' },
  { id: 'HY_VIX_CORR', label: 'HY OAS ↔ VIX', group: 'factor', source: 'derived', deps: ['BAMLH0A0HYM2', 'VIXCLS'], color: '#f04452', axis: 'corr', frequency: 'daily', note: '相关从 0.85 掉到 0.6 以下，说明股票端还没定价信用风险。' },
  { id: 'NFCI_VIX_CORR', label: 'NFCI ↔ VIX', group: 'factor', source: 'derived', deps: ['NFCI', 'VIXCLS'], color: '#ff922b', axis: 'corr', frequency: 'weekly', note: '金融条件到股票波动的末端传导。' },
];

export const OVERLAY_BY_ID: Record<string, OverlayDef> = Object.fromEntries(
  OVERLAY_DEFS.map((d) => [d.id, d]),
);

/** 相关性面板的固定配对：按预设给出，最多 3 行。 */
export interface CorrPair {
  a: string;
  b: string;
  note?: string;
}

export const PRESET_CORR_PAIRS: Record<string, CorrPair[]> = {
  duration: [
    { a: 'QQQ_SPY', b: 'DFII10', note: '风格因子与实际利率：强负是折现率行情' },
    { a: 'SPY', b: 'DFII10', note: '基准敏感度' },
  ],
  qqqRate: [
    { a: 'QQQ', b: 'DFII10', note: '纳指对实际利率的敏感度' },
    { a: 'SPY', b: 'DFII10', note: '标普对实际利率的敏感度' },
  ],
  soxNdx: [
    { a: 'SMH_QQQ', b: 'DFII10', note: 'AI 资本开支因子与实际利率' },
    { a: 'SMH', b: 'QQQ', note: '半导体相对纳指' },
  ],
  realRate: [
    { a: 'SPY', b: 'DFII10', note: '实际利率与标普' },
    { a: 'SPY', b: 'T10YIE', note: '通胀预期与标普' },
  ],
  finConds: [
    { a: 'NFCI', b: 'BAMLH0A0HYM2', note: '金融条件 → 信用利差' },
    { a: 'BAMLH0A0HYM2', b: 'VIXCLS', note: '信用利差 → 股票波动' },
    { a: 'NFCI', b: 'VIXCLS', note: '金融条件 → 股票波动' },
  ],
  earnings: [{ a: 'SPY', b: 'DGS10', note: '估值对名义利率的敏感度' }],
  dollar: [{ a: 'SPY', b: 'DXY', note: '美元与标普：符号会随周期翻转' }],
  liquidity: [
    { a: 'SPY', b: 'WRESBAL', note: '准备金与标普' },
    { a: 'SPY', b: 'NET_LIQ', note: '净流动性与标普' },
  ],
  credit: [{ a: 'BAMLH0A0HYM2', b: 'VIXCLS', note: '信用利差与波动率' }],
  curve: [{ a: 'T10Y2Y', b: 'DGS10', note: '曲线与长端' }],
};

export interface OverlayPreset {
  id: string;
  label: string;
  ids: string[];
  note: string;
}

export const OVERLAY_PRESETS: OverlayPreset[] = [
  {
    id: 'duration',
    label: '久期风格',
    ids: ['QQQ_SPY', 'DFII10', 'T10YIE'],
    note: '纳指/标普的对数比单独成线，对照实际利率与通胀预期；重点看这条比值与实际利率的相关是否由负转正。',
  },
  {
    id: 'qqqRate',
    label: '纳指×实际利率',
    ids: ['QQQ', 'DFII10', 'T10YIE', 'SPY'],
    note: '纳指与标普对实际利率的敏感度并排；差值收窄=久期溢价消失，是风格切换的先行信号。',
  },
  {
    id: 'soxNdx',
    label: '半导体×纳指',
    ids: ['SMH_QQQ', 'SMH', 'QQQ'],
    note: '半导体/纳指走阔=分子驱动（订单/capex）；走平但整体估值抬升=分母驱动。',
  },
  {
    id: 'realRate',
    label: '实际利率拆分',
    ids: ['DFII10', 'T10YIE', 'SPY'],
    note: '名义利率=实际+通胀预期；两条对美股方向相反，先看相关符号，不看水平。',
  },
  {
    id: 'finConds',
    label: '金融条件传导',
    ids: ['NFCI', 'BAMLH0A0HYM2', 'VIXCLS'],
    note: 'NFCI → HY OAS → VIX 的拐点时间差就是信息；OAS 上行而 VIX 未跟，说明股票端还没定价信用风险。',
  },
  {
    id: 'earnings',
    label: '盈利×利率',
    ids: ['DGS10', 'SPY'],
    note: '前瞻 EPS 没有免密稳定源，本预设只画利率与标普，避免用模拟 EPS 冒充；可在档案页外部数据源核对。',
  },
  {
    id: 'dollar',
    label: '美元×标普',
    ids: ['DXY', 'SPY'],
    note: '美元 Z 上行而标普不跌，说明盈利对美元不敏感；相关转负常对应海外营收压力。',
  },
  {
    id: 'liquidity',
    label: '流动性管道',
    ids: ['WALCL', 'RRPONTSYD', 'WRESBAL', 'SPY'],
    note: '周度/日度混频只做同轴 Z，不做时间插值；重点看准备金同比与标普相关的走弱。',
  },
  {
    id: 'credit',
    label: '信用-波动',
    ids: ['BAMLH0A0HYM2', 'VIXCLS'],
    note: '信用利差先走、VIX 未跟，是最常见的背离组合。',
  },
  {
    id: 'curve',
    label: '曲线-长端',
    ids: ['T10Y2Y', 'DGS10'],
    note: '倒挂后重新陡峭化，往往才是压力显现的阶段。',
  },
];

export const DEFAULT_OVERLAY_IDS = ['QQQ_SPY', 'DFII10', 'T10YIE', 'SPY'];
