/**
 * 投资组合推荐引擎
 * 支持多种投资策略：杠铃策略、平衡策略、成长策略、价值策略等
 */

export type RiskLevel = 'conservative' | 'balanced' | 'growth' | 'aggressive';
export type StrategyType = 'barbell' | 'balanced' | 'growth' | 'value' | 'core-satellite' | 'momentum';

export interface StockRecommendation {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  targetPrice: number;
  upside: number; // 上涨空间 %
  pe: number; // 市盈率
  pb: number; // 市净率
  roe: number; // 净资产收益率 %
  growth: number; // 增长率 %
  momentum: number; // 动量评分 0-100
  volatility: number; // 波动率 %
  rating: 'strong_buy' | 'buy' | 'hold' | 'sell';
  reason: string; // 推荐理由
}

export interface AssetAllocation {
  assetType: string;
  allocation: number; // 百分比
  description: string;
  stocks: StockRecommendation[];
}

export interface PortfolioStrategy {
  name: string;
  type: StrategyType;
  description: string;
  riskLevel: RiskLevel;
  expectedReturn: number; // 预期年化收益 %
  maxDrawdown: number; // 最大回撤 %
  allocations: AssetAllocation[];
  rebalanceFrequency: string;
  marketCondition: string; // 适合的市场环境
}

/**
 * 杠铃策略 (Barbell Strategy)
 * 核心：90%低风险 + 10%极高风险，避免中等风险
 */
export function generateBarbellStrategy(): PortfolioStrategy {
  return {
    name: '杠铃策略',
    type: 'barbell',
    description: '90% 配置极低风险资产，10% 配置高波动成长方向。前者保流动性，后者承担波动；这不是提高收益的捷径。',
    riskLevel: 'conservative',
    expectedReturn: 8.5,
    maxDrawdown: 8,
    allocations: [
      {
        assetType: '低风险资产（90%）',
        allocation: 90,
        description: '货币基金、国债、银行理财，保护本金',
        stocks: [
          {
            symbol: '511880',
            name: '银华日利ETF',
            sector: '货币基金',
            price: 100.00,
            targetPrice: 100.00,
            upside: 2.5,
            pe: 0,
            pb: 0,
            roe: 2.5,
            growth: 0,
            momentum: 50,
            volatility: 0.1,
            rating: 'hold',
            reason: '年化2.5%，T+0赎回，流动性好'
          },
          {
            symbol: '511010',
            name: '国泰上证5年期国债ETF',
            sector: '国债基金',
            price: 105.20,
            targetPrice: 106.00,
            upside: 3.2,
            pe: 0,
            pb: 0,
            roe: 3.2,
            growth: 0,
            momentum: 50,
            volatility: 0.5,
            rating: 'hold',
            reason: '年化3.2%，国家信用背书，极低风险'
          }
        ]
      },
      {
        assetType: '高风险成长股（10%）',
        allocation: 10,
        description: '科技龙头、AI 概念的成长方向示例（波动极大，仅作教学展示）',
        stocks: [
          {
            symbol: '688981',
            name: '中芯国际',
            sector: '半导体',
            price: 52.80,
            targetPrice: 80.00,
            upside: 51.5,
            pe: 45,
            pb: 3.2,
            roe: 8.5,
            growth: 35,
            momentum: 85,
            volatility: 28,
            rating: 'strong_buy',
            reason: '国产芯片龙头，政策扶持，技术突破在即'
          },
          {
            symbol: '300750',
            name: '宁德时代',
            sector: '新能源',
            price: 198.50,
            targetPrice: 280.00,
            upside: 41.1,
            pe: 38,
            pb: 5.8,
            roe: 18.2,
            growth: 42,
            momentum: 88,
            volatility: 32,
            rating: 'strong_buy',
            reason: '动力电池全球第一，新能源汽车爆发增长'
          },
          {
            symbol: '688126',
            name: '寒武纪',
            sector: 'AI芯片',
            price: 85.20,
            targetPrice: 150.00,
            upside: 76.1,
            pe: -100, // 亏损
            pb: 8.5,
            roe: -15,
            growth: 120,
            momentum: 92,
            volatility: 45,
            rating: 'buy',
            reason: 'AI芯片稀缺标的，ChatGPT浪潮受益，高风险高回报'
          }
        ]
      }
    ],
    rebalanceFrequency: '每季度',
    marketCondition: '适合震荡市和牛市初期，熊市末期开始布局'
  };
}

/**
 * 平衡策略 (Balanced Strategy)
 * 核心：60%股票 + 40%债券，经典配置
 */
export function generateBalancedStrategy(): PortfolioStrategy {
  return {
    name: '平衡策略',
    type: 'balanced',
    description: '60%股票+40%债券，风险收益平衡，适合大多数投资者的长期配置。',
    riskLevel: 'balanced',
    expectedReturn: 10.5,
    maxDrawdown: 15,
    allocations: [
      {
        assetType: '核心股票（40%）',
        allocation: 40,
        description: '大盘蓝筹、行业龙头',
        stocks: [
          {
            symbol: '600519',
            name: '贵州茅台',
            sector: '白酒',
            price: 1850.00,
            targetPrice: 2100.00,
            upside: 13.5,
            pe: 32,
            pb: 12.5,
            roe: 30.5,
            growth: 15,
            momentum: 72,
            volatility: 18,
            rating: 'buy',
            reason: '消费龙头，品牌护城河深厚，现金流稳定'
          },
          {
            symbol: '601318',
            name: '中国平安',
            sector: '保险',
            price: 48.50,
            targetPrice: 60.00,
            upside: 23.7,
            pe: 9.5,
            pb: 1.2,
            roe: 12.8,
            growth: 8,
            momentum: 65,
            volatility: 20,
            rating: 'buy',
            reason: '金融龙头，估值低位，分红稳定'
          },
          {
            symbol: '600036',
            name: '招商银行',
            sector: '银行',
            price: 38.20,
            targetPrice: 45.00,
            upside: 17.8,
            pe: 6.8,
            pb: 1.1,
            roe: 16.5,
            growth: 10,
            momentum: 68,
            volatility: 15,
            rating: 'buy',
            reason: '零售银行之王，资产质量优秀，ROE持续领先'
          }
        ]
      },
      {
        assetType: '成长股票（20%）',
        allocation: 20,
        description: '科技、新能源等高成长板块',
        stocks: [
          {
            symbol: '300750',
            name: '宁德时代',
            sector: '新能源',
            price: 198.50,
            targetPrice: 280.00,
            upside: 41.1,
            pe: 38,
            pb: 5.8,
            roe: 18.2,
            growth: 42,
            momentum: 88,
            volatility: 32,
            rating: 'strong_buy',
            reason: '动力电池龙头，行业高速增长'
          },
          {
            symbol: '002475',
            name: '立讯精密',
            sector: '电子',
            price: 32.80,
            targetPrice: 42.00,
            upside: 28.0,
            pe: 28,
            pb: 4.2,
            roe: 15.6,
            growth: 25,
            momentum: 78,
            volatility: 25,
            rating: 'buy',
            reason: '苹果产业链核心，业绩持续增长'
          }
        ]
      },
      {
        assetType: '债券基金（40%）',
        allocation: 40,
        description: '中短债、可转债，稳定收益',
        stocks: [
          {
            symbol: '511260',
            name: '上证10年期国债ETF',
            sector: '债券基金',
            price: 103.50,
            targetPrice: 105.00,
            upside: 3.8,
            pe: 0,
            pb: 0,
            roe: 3.8,
            growth: 0,
            momentum: 50,
            volatility: 2,
            rating: 'hold',
            reason: '年化3.8%，防守配置'
          },
          {
            symbol: '511220',
            name: '可转债ETF',
            sector: '可转债',
            price: 1.120,
            targetPrice: 1.180,
            upside: 5.4,
            pe: 0,
            pb: 0,
            roe: 5.4,
            growth: 0,
            momentum: 62,
            volatility: 8,
            rating: 'buy',
            reason: '下有保底、上不封顶，攻守兼备'
          }
        ]
      }
    ],
    rebalanceFrequency: '每半年',
    marketCondition: '适合所有市场环境，牛市跑赢债券，熊市跑赢股票'
  };
}

/**
 * 激进成长策略 (Aggressive Growth Strategy)
 * 核心：80%高成长股 + 20%指数增强
 */
export function generateGrowthStrategy(): PortfolioStrategy {
  return {
    name: '激进成长策略',
    type: 'growth',
    description: '80%高成长股+20%指数增强，追求超额收益，适合风险承受能力强的年轻投资者。',
    riskLevel: 'aggressive',
    expectedReturn: 25,
    maxDrawdown: 35,
    allocations: [
      {
        assetType: 'AI与科技（35%）',
        allocation: 35,
        description: '人工智能、半导体、云计算',
        stocks: [
          {
            symbol: '688126',
            name: '寒武纪',
            sector: 'AI芯片',
            price: 85.20,
            targetPrice: 150.00,
            upside: 76.1,
            pe: -100,
            pb: 8.5,
            roe: -15,
            growth: 120,
            momentum: 92,
            volatility: 45,
            rating: 'buy',
            reason: 'AI浪潮核心受益，算力需求爆发'
          },
          {
            symbol: '688981',
            name: '中芯国际',
            sector: '半导体',
            price: 52.80,
            targetPrice: 80.00,
            upside: 51.5,
            pe: 45,
            pb: 3.2,
            roe: 8.5,
            growth: 35,
            momentum: 85,
            volatility: 28,
            rating: 'strong_buy',
            reason: '国产替代加速，先进制程突破'
          },
          {
            symbol: '002230',
            name: '科大讯飞',
            sector: 'AI应用',
            price: 52.60,
            targetPrice: 75.00,
            upside: 42.6,
            pe: 55,
            pb: 6.8,
            roe: 10.2,
            growth: 45,
            momentum: 88,
            volatility: 35,
            rating: 'buy',
            reason: '大模型领先，AI应用落地加速'
          }
        ]
      },
      {
        assetType: '新能源产业链（30%）',
        allocation: 30,
        description: '电池、光伏、储能',
        stocks: [
          {
            symbol: '300750',
            name: '宁德时代',
            sector: '动力电池',
            price: 198.50,
            targetPrice: 280.00,
            upside: 41.1,
            pe: 38,
            pb: 5.8,
            roe: 18.2,
            growth: 42,
            momentum: 88,
            volatility: 32,
            rating: 'strong_buy',
            reason: '全球动力电池王者，市占率持续提升'
          },
          {
            symbol: '601012',
            name: '隆基绿能',
            sector: '光伏',
            price: 28.50,
            targetPrice: 38.00,
            upside: 33.3,
            pe: 18,
            pb: 2.8,
            roe: 15.6,
            growth: 38,
            momentum: 82,
            volatility: 30,
            rating: 'buy',
            reason: '光伏龙头，技术领先，成本优势明显'
          }
        ]
      },
      {
        assetType: '医疗创新（15%）',
        allocation: 15,
        description: '创新药、医疗器械',
        stocks: [
          {
            symbol: '300760',
            name: '迈瑞医疗',
            sector: '医疗器械',
            price: 320.00,
            targetPrice: 400.00,
            upside: 25.0,
            pe: 45,
            pb: 8.2,
            roe: 28.5,
            growth: 20,
            momentum: 75,
            volatility: 22,
            rating: 'buy',
            reason: '医疗器械龙头，国际化加速'
          }
        ]
      },
      {
        assetType: '指数增强（20%）',
        allocation: 20,
        description: '沪深300 ETF、创业板ETF',
        stocks: [
          {
            symbol: '510300',
            name: '沪深300ETF',
            sector: '指数基金',
            price: 4.580,
            targetPrice: 5.200,
            upside: 13.5,
            pe: 13.5,
            pb: 1.6,
            roe: 11.8,
            growth: 12,
            momentum: 70,
            volatility: 20,
            rating: 'buy',
            reason: '大盘底仓配置，分散风险'
          },
          {
            symbol: '159915',
            name: '创业板ETF',
            sector: '指数基金',
            price: 2.850,
            targetPrice: 3.400,
            upside: 19.3,
            pe: 35,
            pb: 4.2,
            roe: 12.0,
            growth: 25,
            momentum: 80,
            volatility: 28,
            rating: 'buy',
            reason: '成长股集中地，弹性大'
          }
        ]
      }
    ],
    rebalanceFrequency: '每月',
    marketCondition: '适合牛市和成长股行情，熊市需降低仓位'
  };
}

/**
 * 价值策略 (Value Strategy)
 * 核心：低估值、高股息、稳健盈利
 */
export function generateValueStrategy(): PortfolioStrategy {
  return {
    name: '价值策略',
    type: 'value',
    description: '聚焦低估值、高股息的优质股票，追求安全边际和稳定回报。',
    riskLevel: 'conservative',
    expectedReturn: 12,
    maxDrawdown: 12,
    allocations: [
      {
        assetType: '低估值蓝筹（60%）',
        allocation: 60,
        description: '银行、保险、地产',
        stocks: [
          {
            symbol: '600036',
            name: '招商银行',
            sector: '银行',
            price: 38.20,
            targetPrice: 45.00,
            upside: 17.8,
            pe: 6.8,
            pb: 1.1,
            roe: 16.5,
            growth: 10,
            momentum: 68,
            volatility: 15,
            rating: 'buy',
            reason: 'PB仅1.1倍，股息率4.2%，严重低估'
          },
          {
            symbol: '601318',
            name: '中国平安',
            sector: '保险',
            price: 48.50,
            targetPrice: 60.00,
            upside: 23.7,
            pe: 9.5,
            pb: 1.2,
            roe: 12.8,
            growth: 8,
            momentum: 65,
            volatility: 20,
            rating: 'buy',
            reason: 'PE不到10倍，综合金融平台价值被低估'
          },
          {
            symbol: '600000',
            name: '浦发银行',
            sector: '银行',
            price: 8.50,
            targetPrice: 10.50,
            upside: 23.5,
            pe: 4.2,
            pb: 0.5,
            roe: 11.2,
            growth: 5,
            momentum: 58,
            volatility: 18,
            rating: 'strong_buy',
            reason: 'PB仅0.5倍，破净严重，修复空间大'
          }
        ]
      },
      {
        assetType: '高股息资产（30%）',
        allocation: 30,
        description: '公用事业、REITs',
        stocks: [
          {
            symbol: '600900',
            name: '长江电力',
            sector: '电力',
            price: 24.80,
            targetPrice: 27.00,
            upside: 8.9,
            pe: 15.5,
            pb: 2.2,
            roe: 14.2,
            growth: 5,
            momentum: 60,
            volatility: 10,
            rating: 'hold',
            reason: '股息率5.2%，现金流稳定如债券'
          },
          {
            symbol: '508099',
            name: '中金基础设施REITs',
            sector: 'REITs',
            price: 3.850,
            targetPrice: 4.100,
            upside: 6.5,
            pe: 0,
            pb: 0,
            roe: 6.5,
            growth: 2,
            momentum: 55,
            volatility: 5,
            rating: 'hold',
            reason: '年化分红6.5%，类债券资产'
          }
        ]
      },
      {
        assetType: '周期底部（10%）',
        allocation: 10,
        description: '煤炭、有色等周期股底部配置',
        stocks: [
          {
            symbol: '601088',
            name: '中国神华',
            sector: '煤炭',
            price: 32.50,
            targetPrice: 40.00,
            upside: 23.1,
            pe: 7.5,
            pb: 1.3,
            roe: 18.5,
            growth: 0,
            momentum: 62,
            volatility: 22,
            rating: 'buy',
            reason: '煤炭龙头，估值低，股息高达8%'
          }
        ]
      }
    ],
    rebalanceFrequency: '每年',
    marketCondition: '适合熊市末期和震荡市，价值股往往率先见底'
  };
}

/**
 * 核心-卫星策略 (Core-Satellite Strategy)
 * 核心：70%指数基金 + 30%主动选股
 */
export function generateCoreSatelliteStrategy(): PortfolioStrategy {
  return {
    name: '核心-卫星策略',
    type: 'core-satellite',
    description: '70%指数基金做核心底仓，30%精选个股做卫星增强，既能获得市场平均收益，又有超额收益空间。',
    riskLevel: 'balanced',
    expectedReturn: 15,
    maxDrawdown: 20,
    allocations: [
      {
        assetType: '核心配置（70%）',
        allocation: 70,
        description: '宽基指数ETF，跟踪市场',
        stocks: [
          {
            symbol: '510300',
            name: '沪深300ETF',
            sector: '指数基金',
            price: 4.580,
            targetPrice: 5.200,
            upside: 13.5,
            pe: 13.5,
            pb: 1.6,
            roe: 11.8,
            growth: 12,
            momentum: 70,
            volatility: 20,
            rating: 'buy',
            reason: '大盘核心资产，长期向上'
          },
          {
            symbol: '510500',
            name: '中证500ETF',
            sector: '指数基金',
            price: 6.850,
            targetPrice: 7.800,
            upside: 13.9,
            pe: 22,
            pb: 2.1,
            roe: 9.5,
            growth: 15,
            momentum: 72,
            volatility: 24,
            rating: 'buy',
            reason: '中盘成长股，弹性更大'
          },
          {
            symbol: '159915',
            name: '创业板ETF',
            sector: '指数基金',
            price: 2.850,
            targetPrice: 3.400,
            upside: 19.3,
            pe: 35,
            pb: 4.2,
            roe: 12.0,
            growth: 25,
            momentum: 80,
            volatility: 28,
            rating: 'buy',
            reason: '科技成长主战场'
          }
        ]
      },
      {
        assetType: '卫星配置（30%）',
        allocation: 30,
        description: '高确定性龙头股，力争超额收益',
        stocks: [
          {
            symbol: '600519',
            name: '贵州茅台',
            sector: '白酒',
            price: 1850.00,
            targetPrice: 2100.00,
            upside: 13.5,
            pe: 32,
            pb: 12.5,
            roe: 30.5,
            growth: 15,
            momentum: 72,
            volatility: 18,
            rating: 'buy',
            reason: '消费茅，永不过时'
          },
          {
            symbol: '300750',
            name: '宁德时代',
            sector: '新能源',
            price: 198.50,
            targetPrice: 280.00,
            upside: 41.1,
            pe: 38,
            pb: 5.8,
            roe: 18.2,
            growth: 42,
            momentum: 88,
            volatility: 32,
            rating: 'strong_buy',
            reason: '新能源龙头，成长确定'
          },
          {
            symbol: '600036',
            name: '招商银行',
            sector: '银行',
            price: 38.20,
            targetPrice: 45.00,
            upside: 17.8,
            pe: 6.8,
            pb: 1.1,
            roe: 16.5,
            growth: 10,
            momentum: 68,
            volatility: 15,
            rating: 'buy',
            reason: '低估值价值股，防守配置'
          }
        ]
      }
    ],
    rebalanceFrequency: '每季度',
    marketCondition: '适合所有市场环境，攻守兼备'
  };
}

/**
 * 动量轮动策略 (Momentum Rotation Strategy)
 * 核心：追踪板块强弱，持续买入强势板块
 */
export function generateMomentumStrategy(): PortfolioStrategy {
  return {
    name: '动量轮动策略',
    type: 'momentum',
    description: '根据板块和个股动量评分，持续买入强势资产，及时止损弱势资产，顺势而为。',
    riskLevel: 'aggressive',
    expectedReturn: 28,
    maxDrawdown: 30,
    allocations: [
      {
        assetType: '当前强势板块（100%）',
        allocation: 100,
        description: '根据动量评分动态调整',
        stocks: [
          {
            symbol: '688126',
            name: '寒武纪',
            sector: 'AI芯片',
            price: 85.20,
            targetPrice: 150.00,
            upside: 76.1,
            pe: -100,
            pb: 8.5,
            roe: -15,
            growth: 120,
            momentum: 92,
            volatility: 45,
            rating: 'buy',
            reason: '动量评分92分，强势龙头'
          },
          {
            symbol: '300750',
            name: '宁德时代',
            sector: '新能源',
            price: 198.50,
            targetPrice: 280.00,
            upside: 41.1,
            pe: 38,
            pb: 5.8,
            roe: 18.2,
            growth: 42,
            momentum: 88,
            volatility: 32,
            rating: 'strong_buy',
            reason: '动量评分88分，趋势向上'
          },
          {
            symbol: '688981',
            name: '中芯国际',
            sector: '半导体',
            price: 52.80,
            targetPrice: 80.00,
            upside: 51.5,
            pe: 45,
            pb: 3.2,
            roe: 8.5,
            growth: 35,
            momentum: 85,
            volatility: 28,
            rating: 'strong_buy',
            reason: '动量评分85分，资金持续流入'
          },
          {
            symbol: '002230',
            name: '科大讯飞',
            sector: 'AI应用',
            price: 52.60,
            targetPrice: 75.00,
            upside: 42.6,
            pe: 55,
            pb: 6.8,
            roe: 10.2,
            growth: 45,
            momentum: 88,
            volatility: 35,
            rating: 'buy',
            reason: '动量评分88分，AI热点持续'
          }
        ]
      }
    ],
    rebalanceFrequency: '每周',
    marketCondition: '适合单边趋势行情，震荡市需谨慎'
  };
}

/**
 * 根据市场环境和风险偏好推荐最佳策略
 */
export function recommendStrategy(
  marketCondition: 'bull' | 'bear' | 'sideways',
  riskTolerance: RiskLevel
): PortfolioStrategy {
  // 牛市
  if (marketCondition === 'bull') {
    if (riskTolerance === 'aggressive') return generateMomentumStrategy();
    if (riskTolerance === 'growth') return generateGrowthStrategy();
    return generateCoreSatelliteStrategy();
  }
  
  // 熊市
  if (marketCondition === 'bear') {
    if (riskTolerance === 'conservative') return generateBarbellStrategy();
    return generateValueStrategy();
  }
  
  // 震荡市
  if (riskTolerance === 'conservative') return generateBarbellStrategy();
  if (riskTolerance === 'aggressive') return generateGrowthStrategy();
  return generateBalancedStrategy();
}

/**
 * 获取所有策略
 */
export function getAllStrategies(): PortfolioStrategy[] {
  return [
    generateBarbellStrategy(),
    generateBalancedStrategy(),
    generateGrowthStrategy(),
    generateValueStrategy(),
    generateCoreSatelliteStrategy(),
    generateMomentumStrategy(),
  ];
}
