import { create } from 'zustand';

export interface SectorData {
  name: string;
  code: string;
  change: number;          // 涨跌幅 %
  changeWeek: number;      // 周涨跌幅 %
  changeMonth: number;     // 月涨跌幅 %
  volume: number;          // 成交量
  volumeChange: number;    // 成交量变化 %
  turnover: number;        // 换手率 %
  mainInflow: number;      // 主力净流入（亿元）
  leadingStocks: string[]; // 龙头股
  hotness: number;         // 热度评分 0-100
  phase: 'leading' | 'strengthening' | 'weakening' | 'lagging'; // 轮动阶段
}

export interface SectorRotation {
  timestamp: number;
  sectors: SectorData[];
  hotSectors: string[];    // 当前热门板块
  coldSectors: string[];   // 冷门板块
  rotationSignals: Array<{
    from: string;
    to: string;
    strength: number;
  }>;
}

interface SectorRotationState {
  currentRotation: SectorRotation | null;
  history: SectorRotation[];
  loading: boolean;
  
  // Actions
  fetchRotationData: () => Promise<void>;
  analyzeSectorStrength: (sector: SectorData) => number;
  identifyRotation: () => void;
}

export const useSectorRotationStore = create<SectorRotationState>((set, get) => ({
  currentRotation: null,
  history: [],
  loading: false,

  fetchRotationData: async () => {
    set({ loading: true });
    
    try {
      // 模拟数据 - 实际应该从API获取
      const sectors: SectorData[] = [
        {
          name: '半导体',
          code: 'BK0481',
          change: 3.45,
          changeWeek: 8.2,
          changeMonth: 15.6,
          volume: 12500000000,
          volumeChange: 45.3,
          turnover: 5.2,
          mainInflow: 18.5,
          leadingStocks: ['中芯国际', '韦尔股份', '北方华创'],
          hotness: 92,
          phase: 'leading',
        },
        {
          name: '新能源汽车',
          code: 'BK0493',
          change: 2.18,
          changeWeek: 5.6,
          changeMonth: 12.3,
          volume: 18900000000,
          volumeChange: 32.1,
          turnover: 6.8,
          mainInflow: 24.3,
          leadingStocks: ['比亚迪', '宁德时代', '隆基绿能'],
          hotness: 88,
          phase: 'strengthening',
        },
        {
          name: '人工智能',
          code: 'BK0464',
          change: 4.52,
          changeWeek: 9.8,
          changeMonth: 18.9,
          volume: 22000000000,
          volumeChange: 56.7,
          turnover: 7.2,
          mainInflow: 32.1,
          leadingStocks: ['科大讯飞', '商汤科技', '寒武纪'],
          hotness: 95,
          phase: 'leading',
        },
        {
          name: '医药生物',
          code: 'BK0456',
          change: -1.23,
          changeWeek: -2.5,
          changeMonth: 3.2,
          volume: 8600000000,
          volumeChange: -12.4,
          turnover: 2.8,
          mainInflow: -8.6,
          leadingStocks: ['恒瑞医药', '药明康德', '迈瑞医疗'],
          hotness: 42,
          phase: 'weakening',
        },
        {
          name: '白酒',
          code: 'BK0458',
          change: -0.85,
          changeWeek: -1.8,
          changeMonth: 1.5,
          volume: 6200000000,
          volumeChange: -18.5,
          turnover: 1.9,
          mainInflow: -12.3,
          leadingStocks: ['贵州茅台', '五粮液', '泸州老窖'],
          hotness: 35,
          phase: 'lagging',
        },
        {
          name: '房地产',
          code: 'BK0451',
          change: -2.15,
          changeWeek: -4.3,
          changeMonth: -8.7,
          volume: 4800000000,
          volumeChange: -25.6,
          turnover: 2.1,
          mainInflow: -18.9,
          leadingStocks: ['万科A', '保利发展', '招商蛇口'],
          hotness: 25,
          phase: 'lagging',
        },
        {
          name: '军工',
          code: 'BK0473',
          change: 1.85,
          changeWeek: 4.2,
          changeMonth: 9.5,
          volume: 7800000000,
          volumeChange: 28.3,
          turnover: 4.5,
          mainInflow: 12.7,
          leadingStocks: ['中航沈飞', '航发动力', '中航电子'],
          hotness: 76,
          phase: 'strengthening',
        },
        {
          name: '银行',
          code: 'BK0449',
          change: 0.32,
          changeWeek: 0.8,
          changeMonth: 2.1,
          volume: 15000000000,
          volumeChange: -5.2,
          turnover: 0.8,
          mainInflow: -2.5,
          leadingStocks: ['招商银行', '平安银行', '兴业银行'],
          hotness: 48,
          phase: 'lagging',
        },
      ];

      // 识别热门和冷门板块
      const sortedByHotness = [...sectors].sort((a, b) => b.hotness - a.hotness);
      const hotSectors = sortedByHotness.slice(0, 3).map(s => s.name);
      const coldSectors = sortedByHotness.slice(-3).map(s => s.name);

      // 识别轮动信号
      const rotationSignals = [];
      
      // 找出正在走强的板块（从weakening/lagging转向strengthening/leading）
      const strengtheningPhases = sectors.filter(s => 
        s.phase === 'strengthening' || s.phase === 'leading'
      );
      const weakeningPhases = sectors.filter(s => 
        s.phase === 'weakening' || s.phase === 'lagging'
      );

      if (strengtheningPhases.length > 0 && weakeningPhases.length > 0) {
        rotationSignals.push({
          from: weakeningPhases[0].name,
          to: strengtheningPhases[0].name,
          strength: 0.75,
        });
      }

      const rotation: SectorRotation = {
        timestamp: Date.now(),
        sectors,
        hotSectors,
        coldSectors,
        rotationSignals,
      };

      set({ 
        currentRotation: rotation,
        history: [rotation, ...get().history.slice(0, 29)], // 保留最近30条
      });
    } catch (error) {
      console.error('[SectorRotation] Failed to fetch data:', error);
    } finally {
      set({ loading: false });
    }
  },

  analyzeSectorStrength: (sector) => {
    // 综合评分算法
    let score = 0;
    
    // 涨跌幅贡献 (40分)
    score += Math.min(sector.change * 4, 40);
    
    // 成交量变化贡献 (30分)
    score += Math.min(sector.volumeChange / 2, 30);
    
    // 主力资金贡献 (30分)
    score += Math.min(sector.mainInflow, 30);
    
    // 归一化到0-100
    return Math.max(0, Math.min(100, score));
  },

  identifyRotation: () => {
    const { currentRotation } = get();
    if (!currentRotation) return;

    // 基于历史数据识别轮动趋势
    // 这里可以添加更复杂的轮动识别算法
    console.log('[SectorRotation] Rotation analysis completed');
  },
}));
