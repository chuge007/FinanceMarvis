/**
 * stockPicker.ts —— 综合选股引擎
 *
 * 选股逻辑：结合「资金流热度 + 市场环境 + 题材炒作逻辑 + 技术安全度」四维打分，
 * 参照市面主流量化选股框架（多因子 + 趋势跟随 + 题材情绪），并适配本项目两个应用场景：
 *   1. A股：优选「安全 + 有上涨趋势」的个股（趋势跟随，回踩低吸做正 T）
 *   2. 美股：除上升趋势优选外，额外纳入「下跌趋势 / 超跌反弹」标的（例外组，
 *            用于博反弹 / 观察做空对象），让美股候选不再只看涨。
 *
 * 引擎为纯函数：输入实时行情 + 市场环境，输出排序分组与逐股「为何入选」维解读。
 */

export type TrendBias = 'uptrend' | 'downtrend' | 'range';
export type PickGroup = 'safeUptrend' | 'oversoldRebound' | 'watch';
export type Verdict = '利好' | '利空' | '中性';

export interface PickMeta {
  symbol: string;
  name: string;
  market: 'US' | 'CN';
  /** 题材簇：如 半导体 / AI算力 / 高端白酒 … */
  theme: string;
  /** 题材炒作热度 0-100（政策 / 产业催化 / 市场情绪强度） */
  hype: number;
  /** 基本面与估值安全度 0-100（护城河 / 估值分位 / 财务稳健） */
  safety: number;
  /** 产业/资金面标注的趋势倾向（静态，运行时会叠加实时行情修正） */
  trendBias: TrendBias;
  /** 题材标签 */
  tags: string[];
  /** 订阅因子一览（利于/利空/中性） */
  catalysts: string[];
}

export interface PickReason {
  label: string;
  verdict: Verdict;
  text: string;
}

export interface PickResult {
  symbol: string;
  name: string;
  market: 'US' | 'CN';
  group: PickGroup;
  totalScore: number;
  trendScore: number;   // 技术趋势 / 动能
  safetyScore: number;  // 安全度（静态 safety + 波动修正）
  themeScore: number;   // 题材炒作
  fundScore: number;    // 资金流（今日涨跌 + 题材热度近似）
  envScore: number;     // 市场环境加成
  valueScore: number;   // 性价比：安全边际为主的防御得分（回撤保护 / 低风险）
  upsideScore: number;  // 上涨希望：趋势+题材+资金 合力的进攻得分（上行空间）
  reasons: PickReason[];
  thesis: string;
}

export interface MarketEnv {
  /** 大盘水温：hot=情绪高涨 warm=中性 cold=避险 */
  temperature: 'hot' | 'warm' | 'cold';
  /** 恐惧贪婪指数 0-100 */
  fearGreed: number;
}

export interface PickerInput {
  list: { symbol: string; name: string; market: 'US' | 'CN' }[];
  /** 实时行情 code -> changePercent */
  quotes: Record<string, number>;
  market: 'US' | 'CN';
  env?: MarketEnv;
}

/** 各标的静态元数据（题材 / 炒作 / 安全度 / 趋势倾向 / 依据） */
export const PICKER_META: Record<string, PickMeta> = {
  // ─── A股 ───
  '600519': { symbol: '600519', name: '贵州茅台', market: 'CN', theme: '高端白酒', hype: 62, safety: 90, trendBias: 'range', tags: ['消费', '机构重仓', '高股息'], catalysts: ['批价企稳回升（利好）', '外资回流核心资产（利好）', '估值处历史中枢（中性）'] },
  '000858': { symbol: '000858', name: '五粮液', market: 'CN', theme: '高端白酒', hype: 60, safety: 85, trendBias: 'range', tags: ['消费', '机构重仓'], catalysts: ['消费复苏预期（利好）', '动销改善（利好）', '库存分化（中性）'] },
  '000568': { symbol: '000568', name: '泸州老窖', market: 'CN', theme: '高端白酒', hype: 58, safety: 82, trendBias: 'range', tags: ['消费'], catalysts: ['省外渠道扩张（利好）', '费用投放加大（中性）'] },
  '600809': { symbol: '600809', name: '山西汾酒', market: 'CN', theme: '高端白酒', hype: 61, safety: 80, trendBias: 'uptrend', tags: ['消费', '成长'], catalysts: ['清香全国化（利好）', '全国化扩张（利好）'] },
  '300750': { symbol: '300750', name: '宁德时代', market: 'CN', theme: '动力电池/储能', hype: 76, safety: 84, trendBias: 'uptrend', tags: ['新能源', '储能', '出海'], catalysts: ['储能第二曲线（利好）', '产能利用率回升（利好）', '海外订单放量（利好）'] },
  '002594': { symbol: '002594', name: '比亚迪', market: 'CN', theme: '新能源车', hype: 74, safety: 83, trendBias: 'uptrend', tags: ['新能源车', '出海', '智驾'], catalysts: ['DM-i 换代放量（利好）', '海外出口高增（利好）', '智驾平权（利好）'] },
  '300014': { symbol: '300014', name: '亿纬锂能', market: 'CN', theme: '动力电池', hype: 68, safety: 70, trendBias: 'range', tags: ['新能源'], catalysts: ['大圆柱量产（利好）', '海外定点（利好）', '行业价格战（利空）'] },
  '688981': { symbol: '688981', name: '中芯国际', market: 'CN', theme: '半导体制造', hype: 82, safety: 72, trendBias: 'uptrend', tags: ['半导体', '国产替代', '信创'], catalysts: ['国产替代加速（利好）', '扩产周期（利好）', '设备禁令风险（利空）'] },
  '688041': { symbol: '688041', name: '海光信息', market: 'CN', theme: 'CPU/DCU', hype: 84, safety: 70, trendBias: 'uptrend', tags: ['信创', 'AI算力', '国产替代'], catalysts: ['国产CPU份额提升（利好）', 'DCU大模型适配（利好）', '估值偏高（中性）'] },
  '603501': { symbol: '603501', name: '韦尔股份', market: 'CN', theme: 'CIS芯片', hype: 72, safety: 74, trendBias: 'uptrend', tags: ['半导体', '消费电子'], catalysts: ['CIS需求回暖（利好）', '汽车摄像头渗透（利好）', '库存去化（中性）'] },
  '603259': { symbol: '603259', name: '药明康德', market: 'CN', theme: 'CRO/CXO', hype: 66, safety: 78, trendBias: 'range', tags: ['医药', '出海'], catalysts: ['GLP-1产能（利好）', '地缘扰动（利空）', '订单恢复（利好）'] },
  '600276': { symbol: '600276', name: '恒瑞医药', market: 'CN', theme: '创新药', hype: 70, safety: 80, trendBias: 'uptrend', tags: ['医药', '创新药'], catalysts: ['PD-1海外授权（利好）', '创新管线兑现（利好）'] },
  '300760': { symbol: '300760', name: '迈瑞医疗', market: 'CN', theme: '医疗器械', hype: 63, safety: 84, trendBias: 'range', tags: ['医药', '出海'], catalysts: ['海外份额提升（利好）', '集采影响（中性）'] },
  '600036': { symbol: '600036', name: '招商银行', market: 'CN', theme: '银行', hype: 55, safety: 92, trendBias: 'uptrend', tags: ['金融', '高股息'], catalysts: ['资产质量改善（利好）', '高股息防御（利好）', '息差承压（中性）'] },
  '601318': { symbol: '601318', name: '中国平安', market: 'CN', theme: '保险', hype: 57, safety: 85, trendBias: 'uptrend', tags: ['金融', '高股息'], catalysts: ['负债端改善（利好）', '投资收益修复（利好）'] },
  '300059': { symbol: '300059', name: '东方财富', market: 'CN', theme: '券商', hype: 72, safety: 76, trendBias: 'uptrend', tags: ['券商', '互联金融'], catalysts: ['成交额放大（利好）', '基金代销回暖（利好）', '行情高弹性（中性）'] },
  '601012': { symbol: '601012', name: '隆基绿能', market: 'CN', theme: '光伏', hype: 64, safety: 62, trendBias: 'downtrend', tags: ['光伏', '出清'], catalysts: ['BC量产（利好）', '行业产能过剩（利空）', '价格见底预期（中性）'] },
  '300274': { symbol: '300274', name: '阳光电源', market: 'CN', theme: '光伏/储能', hype: 69, safety: 78, trendBias: 'uptrend', tags: ['光伏', '储能', '出海'], catalysts: ['海外储能出货（利好）', '逆变器全球第一（利好）'] },
  '300124': { symbol: '300124', name: '汇川技术', market: 'CN', theme: '工控', hype: 62, safety: 80, trendBias: 'uptrend', tags: ['高端制造', '机器人'], catalysts: ['工控进口替代（利好）', '新能源电驱（利好）'] },
  '000333': { symbol: '000333', name: '美的集团', market: 'CN', theme: '家电', hype: 58, safety: 88, trendBias: 'uptrend', tags: ['家电', '出海', '高股息'], catalysts: ['出海+机器人（利好）', '高分红（利好）'] },
  '000651': { symbol: '000651', name: '格力电器', market: 'CN', theme: '家电', hype: 55, safety: 86, trendBias: 'range', tags: ['家电', '高股息'], catalysts: ['高分红（利好）', '空调格局稳固（利好）'] },
  '600887': { symbol: '600887', name: '伊利股份', market: 'CN', theme: '乳制品', hype: 52, safety: 84, trendBias: 'range', tags: ['消费'], catalysts: ['份额集中（利好）', '动销平淡（中性）'] },
  '601899': { symbol: '601899', name: '紫金矿业', market: 'CN', theme: '有色/黄金', hype: 73, safety: 82, trendBias: 'uptrend', tags: ['资源', '周期'], catalysts: ['金铜高位（利好）', '并购扩张（利好）'] },
  '600030': { symbol: '600030', name: '中信证券', market: 'CN', theme: '券商', hype: 68, safety: 84, trendBias: 'uptrend', tags: ['券商', '航母券商'], catalysts: ['投行+资管（利好）', '监管打造券商航母（利好）'] },
  // ─── 美股 ───
  'NVDA': { symbol: 'NVDA', name: '英伟达', market: 'US', theme: 'AI算力', hype: 95, safety: 82, trendBias: 'uptrend', tags: ['AI算力', '半导体', 'MegaCap'], catalysts: ['Blackwell放量（利好）', 'AI资本开支周期（利好）', '高估值波动（中性）'] },
  'AMD':  { symbol: 'AMD', name: 'AMD', market: 'US', theme: 'AI算力', hype: 83, safety: 72, trendBias: 'uptrend', tags: ['AI算力', '半导体'], catalysts: ['MI系列放量（利好）', '份额竞争（中性）'] },
  'AVGO': { symbol: 'AVGO', name: '博通', market: 'US', theme: 'ASIC/网络', hype: 84, safety: 80, trendBias: 'uptrend', tags: ['AI算力', 'ASIC'], catalysts: ['ASIC定制订单（利好）', 'VMware协同（利好）'] },
  'QCOM': { symbol: 'QCOM', name: '高通', market: 'US', theme: '端侧AI', hype: 72, safety: 76, trendBias: 'uptrend', tags: ['半导体', '端侧AI'], catalysts: ['AI PC生态（利好）', '手机复苏（利好）'] },
  'MU':   { symbol: 'MU', name: '美光', market: 'US', theme: '存储/HBM', hype: 80, safety: 72, trendBias: 'uptrend', tags: ['半导体', 'HBM'], catalysts: ['HBM满载（利好）', '存储涨价周期（利好）'] },
  'AAPL': { symbol: 'AAPL', name: '苹果', market: 'US', theme: '消费电子', hype: 66, safety: 88, trendBias: 'range', tags: ['消费电子', 'AI端侧'], catalysts: ['换机周期（中性）', 'AI端侧落地（利好）'] },
  'MSFT': { symbol: 'MSFT', name: '微软', market: 'US', theme: '云计算/AI', hype: 78, safety: 88, trendBias: 'uptrend', tags: ['AI', '云', 'MegaCap'], catalysts: ['Copilot商业化（利好）', 'Azure增长（利好）'] },
  'GOOGL': { symbol: 'GOOGL', name: '谷歌', market: 'US', theme: '搜索/云/AI', hype: 74, safety: 84, trendBias: 'uptrend', tags: ['AI', '云', 'MegaCap'], catalysts: ['Gemini全线接入（利好）', '搜索广告稳健（利好）'] },
  'AMZN': { symbol: 'AMZN', name: '亚马逊', market: 'US', theme: '电商/云', hype: 72, safety: 82, trendBias: 'uptrend', tags: ['云', '电商', 'MegaCap'], catalysts: ['AWS重启（利好）', '零售利润率改善（利好）'] },
  'META': { symbol: 'META', name: 'Meta', market: 'US', theme: 'AI/广告', hype: 79, safety: 82, trendBias: 'uptrend', tags: ['AI', '广告', 'MegaCap'], catalysts: ['广告AI提效（利好）', 'Llama生态（利好）'] },
  'TSLA': { symbol: 'TSLA', name: '特斯拉', market: 'US', theme: '新能源车/机器人', hype: 77, safety: 66, trendBias: 'downtrend', tags: ['新能源车', '机器人', '高波动'], catalysts: ['FSD/Optimus预期（利好）', '销量增长放缓（利空）', '估值高波动（利空）'] },
  'LLY':  { symbol: 'LLY', name: '礼来', market: 'US', theme: '减肥药/GLP-1', hype: 81, safety: 78, trendBias: 'uptrend', tags: ['医药', '减肥药'], catalysts: ['Zepbound放量（利好）', 'GLP-1王座（利好）', '估值高位（中性）'] },
  'JNJ':  { symbol: 'JNJ', name: '强生', market: 'US', theme: '医疗保健', hype: 52, safety: 88, trendBias: 'range', tags: ['医药', '防御'], catalysts: ['设备+创新药（利好）', '诉讼支出（中性）'] },
  'MRK':  { symbol: 'MRK', name: '默沙东', market: 'US', theme: '创新药', hype: 60, safety: 82, trendBias: 'range', tags: ['医药'], catalysts: ['K药峰值未至（利好）', 'ADC接力（利好）', '专利悬崖（利空）'] },
  'JPM':  { symbol: 'JPM', name: '摩根大通', market: 'US', theme: '银行', hype: 62, safety: 86, trendBias: 'uptrend', tags: ['金融', '防御'], catalysts: ['净息差受益（利好）', '投行回暖（利好）'] },
  'BAC':  { symbol: 'BAC', name: '美国银行', market: 'US', theme: '银行', hype: 58, safety: 80, trendBias: 'range', tags: ['金融'], catalysts: ['利率敏感性（利好）', '费率竞争（中性）'] },
  'V':    { symbol: 'V', name: 'Visa', market: 'US', theme: '支付', hype: 63, safety: 88, trendBias: 'uptrend', tags: ['金融科技', '防御'], catalysts: ['全球网络垄断（利好）', '跨境复苏（利好）'] },
  'MA':   { symbol: 'MA', name: '万事达', market: 'US', theme: '支付', hype: 62, safety: 87, trendBias: 'uptrend', tags: ['金融科技'], catalysts: ['数字支付龙头（利好）', '增值服务（利好）'] },
  'BRK.B': { symbol: 'BRK.B', name: '伯克希尔B', market: 'US', theme: '多元化投资', hype: 55, safety: 90, trendBias: 'range', tags: ['保险', '价值股'], catalysts: ['现金储备高位（中性）', '保险承保稳健（利好）'] },
  'NFLX': { symbol: 'NFLX', name: '奈飞', market: 'US', theme: '流媒体', hype: 70, safety: 82, trendBias: 'uptrend', tags: ['流媒体', '成长'], catalysts: ['广告分层（利好）', 'ARPU抬升（利好）'] },
  'DIS':  { symbol: 'DIS', name: '迪士尼', market: 'US', theme: '娱乐', hype: 58, safety: 74, trendBias: 'downtrend', tags: ['流媒体', '乐园'], catalysts: ['乐园利润新高（利好）', '流媒体扭亏（利好）', '转型阵痛（中性）'] },
  'CRM':  { symbol: 'CRM', name: 'Salesforce', market: 'US', theme: '企业软件/AI', hype: 68, safety: 78, trendBias: 'uptrend', tags: ['SaaS', 'AI Agent'], catalysts: ['Agentforce订单（利好）', '企业AI投入（利好）'] },
};

/** 各标的默认「为何入选」一句话逻辑（引擎会叠加实时维度修正） */
const THESIS: Record<string, string> = {
  '600519': '白酒龙头 + 高股息防御，市场避险时资金避险首选',
  '000858': '消费复苏 + 低估值修复，机构底仓配置',
  '600809': '清香全国化提速，量价齐升逻辑清晰',
  '300750': '储能第二曲线 + 海外订单，新能源成长核心',
  '002594': '出海 + 智驾双引擎，销量持续超预期',
  '688981': '国产替代核心资产，扩产周期景气',
  '688041': '信创 + AI算力国产化，景气与题材双击',
  '603501': 'CIS 回暖 + 汽车电子渗透，景气拐点',
  '603259': 'CXO 龙头，多肽产能扩张迎行业反转',
  '600276': '创新药出海授权，管线进入收获期',
  '600036': '零售银行龙头，资产质量 + 高股息',
  '601318': '保险负债端复苏，低估值高弹性',
  '300059': '行情回暖 Beta 之王，成交额放大直接受益',
  '300274': '储能出海龙头，海外高毛利订单充足',
  '300124': '工控替代 + 机器人概念，高端制造主线',
  '000333': '家电出海 + KUKA 机器人，稳健成长',
  '601899': '金铜齐涨，资源品景气上行',
  '600030': '航母券商 + 投行修复，牛市旗手',
  '601012': '光伏出清尾部，等待价格见底信号（博反转）',
  '300014': '电池二线出海，弹性大波动高',
  '000568': '高端白酒梯队，省外扩张待验证',
  '000651': '高分红防御，股息率具备吸引力',
  '600887': '乳业份额集中，稳健防御',
  '300760': '器械出海，全球化份额提升',
  'NVDA': 'AI 算力总龙头，资本开支周期核心受益',
  'AMD': 'MI 系列上量，AI 推理第二选',
  'AVGO': 'ASIC 定制芯片之王，AI 基础设施卖水人',
  'QCOM': '端侧 AI + AI PC，卡位手机复苏',
  'MU': 'HBM 满载 + 存储涨价周期，强周期成长',
  'AAPL': 'AI 端侧落地预期，估值处于安全区间',
  'MSFT': 'Copilot 商业化加速，云 + AI 双轮',
  'GOOGL': 'Gemini 全线嵌入，搜索护城河稳固',
  'AMZN': 'AWS 重启 + 零售盈利改善',
  'META': 'AI 广告推荐提效，利润弹性大',
  'TSLA': '机器人 + FSD 叙事，高波动博弈（例外观测）',
  'LLY': 'GLP-1 王者，Zepbound 放量超预期',
  'JNJ': '医疗防御核心，稳定分红',
  'MRK': 'K 药资产优质，ADC 接力',
  'JPM': '高利率受益 + 投行回暖，金融压舱石',
  'BAC': '利率敏感 + 消费金融修复',
  'V': '支付网络垄断，全球消费需求',
  'MA': '数字支付龙头，增值服务增量',
  'BRK.B': '价值投资基准，现金储备充足',
  'NFLX': '广告 + 密码治理，ARPU 抬升',
  'DIS': '乐园利润新高，流媒体扭亏（趋势观察）',
  'CRM': 'Agentforce 订单暴增，企业 AI 代理龙头',
};

const VERDICT_COLOR = { 利好: 1, 利空: -1, 中性: 0 };

/** 实时涨跌近似的资金热度分（0-100）：涨跌幅 +4 封顶映射 */
function fundScoreOf(changePct: number | undefined, baseHype: number): number {
  if (changePct == null || !Number.isFinite(changePct)) return baseHype;
  return Math.max(20, Math.min(98, Math.round(baseHype + changePct * 3)));
}

/** 市场环境加成（-8 ~ +8） */
function envBonus(env: MarketEnv | undefined): number {
  if (!env) return 0;
  const fg = env.fearGreed;
  if (env.temperature === 'hot') return fg > 75 ? 6 : 4;
  if (env.temperature === 'warm') return 2;
  return -4;
}

/** 趋势倾向修正（-6 ~ +6）：上升趋势在安全环境下多给分，避险环境偏好高安全低估 */
function trendBiasScore(bias: TrendBias, env: MarketEnv | undefined): number {
  if (!env || env.temperature === 'cold') {
    return bias === 'uptrend' ? 2 : bias === 'downtrend' ? -3 : 0;
  }
  return bias === 'uptrend' ? 5 : bias === 'downtrend' ? -3 : 1;
}

/**
 * 综合选股主函数
 * @returns 每组按总分降序
 */
export function runStockPicker(input: PickerInput): { safeUptrend: PickResult[]; oversoldRebound: PickResult[]; watch: PickResult[]; all: PickResult[] } {
  const { list, quotes, market, env } = input;

  const results: PickResult[] = list.map((item) => {
    const meta = PICKER_META[item.symbol];
    const changePct = quotes[item.symbol];

    const themeScore = meta ? meta.hype : 55;
    const fundScoreRaw = fundScoreOf(changePct, meta ? meta.hype : 55);
    // 资金方向判定：当日显著下跌视为资金流出
    const netOut = changePct != null && Number.isFinite(changePct) && changePct < -2;

    // 技术趋势分：实时涨跌动能 + 静态趋势倾向
    let trendBase = meta ? (meta.trendBias === 'uptrend' ? 68 : meta.trendBias === 'downtrend' ? 40 : 52) : 55;
    if (changePct != null && Number.isFinite(changePct)) {
      trendBase += Math.max(-14, Math.min(14, changePct * 2.2));
    }
    const trendScore = Math.max(15, Math.min(98, Math.round(trendBase)));

    // 安全度：静态 safety + 下跌修正（跌得急的票安全度下调，A股尤甚）
    let safetyRaw = meta ? meta.safety : 65;
    if (netOut) safetyRaw -= market === 'CN' ? 8 : 5;
    const safetyScore = Math.max(20, Math.min(98, Math.round(safetyRaw)));

    const envSc = envBonus(env);
    const envScore = 50 + envSc;

    // 综合分：权重随「市场环境」自适应，综合更多维度找「最有性价比 + 上涨希望」——
    //  hot（情绪高涨）→ 进攻：重趋势/题材/资金，放大上涨希望
    //  cold（避险降温）→ 防守：重安全/高股息，放大安全边际与性价比
    //  warm（中性）   → 均衡权重
    const weights =
      env?.temperature === 'hot'
        ? { safety: 0.24, trend: 0.28, theme: 0.22, fund: 0.18, env: 0.08 }
        : env?.temperature === 'cold'
          ? { safety: 0.38, trend: 0.20, theme: 0.16, fund: 0.14, env: 0.12 }
          : { safety: 0.30, trend: 0.25, theme: 0.20, fund: 0.15, env: 0.10 };

    let totalScore = Math.round(
      safetyScore * weights.safety +
        trendScore * weights.trend +
        themeScore * weights.theme +
        fundScoreRaw * weights.fund +
        envScore * weights.env,
    );

    // 性价比修正：安全 + 上涨「双高」= 最有性价比，加分；
    // 涨得过急但安全度低（纯追高、性价比差）减分，避免被单一题材拉爆排名。
    if (safetyScore >= 68 && trendScore >= 60) totalScore += 2;
    if (safetyScore < 55 && trendScore >= 72) totalScore -= 3;
    totalScore = Math.max(0, Math.min(100, totalScore));

    // ─── 双目标显性化：「性价比」与「上涨希望」 ───
    // 性价比 = 防御视角：安全边际为主（回撤保护），环境越热越给上行弹性让位
    const valueScore = Math.max(20, Math.min(98, Math.round(safetyScore * 0.85 + envScore * 0.15)));
    // 上涨希望 = 进攻视角：趋势动能 + 题材热度 + 资金承接 合力
    const upsideScore = Math.max(20, Math.min(98, Math.round(trendScore * 0.45 + themeScore * 0.30 + fundScoreRaw * 0.25)));

    // 分组：
    //  - safeUptrend：安全度高 + 趋势向上（A股主推；美股常规）
    //  - oversoldRebound：美股例外 —— 当天显著下跌 / 静态趋势偏空（下跌趋势也纳入）
    //  - watch：其余观察
    let group: PickGroup = 'watch';
    const isDownDay = changePct != null && Number.isFinite(changePct) && changePct < 0;
    const biasDown = meta?.trendBias === 'downtrend';
    if (market === 'US') {
      if (biasDown || isDownDay) group = 'oversoldRebound';
      else if (safetyScore >= 70 && trendScore >= 60) group = 'safeUptrend';
    } else {
      if (safetyScore >= 72 && trendScore >= 62) group = 'safeUptrend';
      else if (trendScore < 50 && safetyScore >= 70) group = 'watch';
    }

    const reasons: PickReason[] = [
      {
        label: '题材/炒作',
        verdict: meta && meta.hype >= 72 ? '利好' : meta && meta.hype <= 55 ? '中性' : '利好',
        text: meta
          ? `${meta.theme} · 炒作热度 ${meta.hype}，${meta.catalysts[0] ?? '产业催化正常'}`
          : '题材热度适中',
      },
      {
        label: '资金流',
        verdict: netOut ? '利空' : changePct != null && changePct > 1.5 ? '利好' : fundScoreRaw >= 70 ? '利好' : '中性',
        text: netOut
          ? `当日 ${changePct?.toFixed(2)}%，资金净流出（离场信号）`
          : changePct != null && Number.isFinite(changePct)
            ? `当日 ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%，${changePct >= 1.5 ? '主力承接积极' : '资金中性'}` 
            : '资金面平稳',
      },
      {
        label: '市场环境',
        verdict: env ? (env.temperature === 'cold' ? (meta && meta.safety >= 80 ? '利好' : '利空') : '利好') : '中性',
        text: env
          ? `大盘${env.temperature === 'hot' ? '情绪高涨' : env.temperature === 'warm' ? '中性偏暖' : '避险降温'}，恐惧贪婪 ${env.fearGreed}`
          : '外部环境未接入，按温和假设',
      },
      {
        label: '技术安全',
        verdict: trendScore >= 65 && safetyScore >= 75 ? '利好' : trendScore < 45 ? '利空' : '中性',
        text: `趋势${trendScore >= 65 ? '向上可顺势做T' : trendScore < 45 ? '偏弱谨慎' : '震荡'} · 安全度 ${safetyScore}` +
          (group === 'oversoldRebound' ? '（下跌趋势·例外观测组）' : ''),
      },
    ];

    return {
      symbol: item.symbol,
      name: item.name,
      market: item.market,
      group,
      totalScore,
      trendScore,
      safetyScore,
      themeScore,
      fundScore: fundScoreRaw,
      envScore,
      valueScore,
      upsideScore,
      reasons,
      thesis: THESIS[item.symbol] ?? '综合筛选标的',
    };
  });

  const byScore = (a: PickResult, b: PickResult) => b.totalScore - a.totalScore;
  const safeUptrend = results.filter((r) => r.group === 'safeUptrend').sort(byScore);
  const oversoldRebound = results.filter((r) => r.group === 'oversoldRebound').sort(byScore);
  const watch = results.filter((r) => r.group === 'watch').sort(byScore);
  return { safeUptrend, oversoldRebound, watch, all: results.slice().sort(byScore) };
}

/** 便捷：将实时行情 map 转 changePercent map（兼容 useCandidates 的 LiveQuote） */
export function toChangeMap(
  quotes: Record<string, { changePercent: number } | undefined>,
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const k of Object.keys(quotes)) {
    const q = quotes[k];
    if (q && Number.isFinite(q.changePercent)) m[k] = q.changePercent;
  }
  return m;
}

export const VERDICT_TONE = VERDICT_COLOR;

export default runStockPicker;
