import { create } from 'zustand';
import { dbService } from '../services/storage/indexedDB';
import type { PositionRecord, TradeRecord } from '../services/storage/indexedDB';

export interface Position {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  market: 'CN' | 'US' | 'CRYPTO';
  pnl: number;
  pnlPercent: number;
  marketValue: number;
  costBasis: number;
  weight: number;
  createdAt: number;
  updatedAt: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayPnL: number;
  dayPnLPercent: number;
  cash: number;
  totalAssets: number;
  positionCount: number;
  winRate: number;
}

interface PortfolioState {
  positions: Position[];
  summary: PortfolioSummary;
  trades: TradeRecord[];
  loading: boolean;
  
  // Actions
  loadPositions: () => Promise<void>;
  addPosition: (position: Omit<Position, 'id' | 'pnl' | 'pnlPercent' | 'marketValue' | 'costBasis' | 'weight' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updatePosition: (id: string, updates: Partial<Position>) => Promise<void>;
  removePosition: (id: string) => Promise<void>;
  updatePrice: (symbol: string, price: number) => void;
  executeTrade: (trade: Omit<TradeRecord, 'id' | 'timestamp'>) => Promise<void>;
  loadTrades: () => Promise<void>;
  calculateSummary: () => void;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  positions: [],
  summary: {
    totalValue: 0,
    totalCost: 0,
    totalPnL: 0,
    totalPnLPercent: 0,
    dayPnL: 0,
    dayPnLPercent: 0,
    cash: 100000, // 初始资金10万
    totalAssets: 100000,
    positionCount: 0,
    winRate: 0,
  },
  trades: [],
  loading: false,

  loadPositions: async () => {
    set({ loading: true });
    try {
      const records = await dbService.getAllPositions();
      const positions: Position[] = records.map(r => ({
        ...r,
        pnl: (r.currentPrice - r.avgCost) * r.quantity,
        pnlPercent: ((r.currentPrice - r.avgCost) / r.avgCost) * 100,
        marketValue: r.currentPrice * r.quantity,
        costBasis: r.avgCost * r.quantity,
        weight: 0, // 稍后计算
      }));
      
      set({ positions });
      get().calculateSummary();
    } catch (error) {
      console.error('[Portfolio] Failed to load positions:', error);
    } finally {
      set({ loading: false });
    }
  },

  addPosition: async (positionData) => {
    const now = Date.now();
    const newPosition: Position = {
      ...positionData,
      id: `pos_${now}_${Math.random().toString(36).substr(2, 9)}`,
      pnl: 0,
      pnlPercent: 0,
      marketValue: positionData.currentPrice * positionData.quantity,
      costBasis: positionData.avgCost * positionData.quantity,
      weight: 0,
      createdAt: now,
      updatedAt: now,
    };

    await dbService.savePosition(newPosition);
    set(state => ({
      positions: [...state.positions, newPosition],
    }));
    get().calculateSummary();
  },

  updatePosition: async (id, updates) => {
    const position = get().positions.find(p => p.id === id);
    if (!position) return;

    const updatedPosition: Position = {
      ...position,
      ...updates,
      updatedAt: Date.now(),
    };

    // 重新计算PnL
    updatedPosition.pnl = (updatedPosition.currentPrice - updatedPosition.avgCost) * updatedPosition.quantity;
    updatedPosition.pnlPercent = ((updatedPosition.currentPrice - updatedPosition.avgCost) / updatedPosition.avgCost) * 100;
    updatedPosition.marketValue = updatedPosition.currentPrice * updatedPosition.quantity;
    updatedPosition.costBasis = updatedPosition.avgCost * updatedPosition.quantity;

    await dbService.savePosition(updatedPosition);
    set(state => ({
      positions: state.positions.map(p => p.id === id ? updatedPosition : p),
    }));
    get().calculateSummary();
  },

  removePosition: async (id) => {
    await dbService.deletePosition(id);
    set(state => ({
      positions: state.positions.filter(p => p.id !== id),
    }));
    get().calculateSummary();
  },

  updatePrice: (symbol, price) => {
    set(state => ({
      positions: state.positions.map(p => {
        if (p.symbol === symbol) {
          const pnl = (price - p.avgCost) * p.quantity;
          const pnlPercent = ((price - p.avgCost) / p.avgCost) * 100;
          return {
            ...p,
            currentPrice: price,
            pnl,
            pnlPercent,
            marketValue: price * p.quantity,
            updatedAt: Date.now(),
          };
        }
        return p;
      }),
    }));
    get().calculateSummary();
  },

  executeTrade: async (tradeData) => {
    const trade: TradeRecord = {
      ...tradeData,
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    await dbService.saveTrade(trade);
    
    // 更新持仓
    const position = get().positions.find(p => p.symbol === trade.symbol);
    
    if (trade.type === 'buy') {
      if (position) {
        // 加仓
        const newQuantity = position.quantity + trade.quantity;
        const newAvgCost = (position.costBasis + trade.amount) / newQuantity;
        await get().updatePosition(position.id, {
          quantity: newQuantity,
          avgCost: newAvgCost,
        });
      } else {
        // 新建仓位
        await get().addPosition({
          symbol: trade.symbol,
          name: trade.symbol, // 需要从市场数据获取实际名称
          quantity: trade.quantity,
          avgCost: trade.price,
          currentPrice: trade.price,
          market: 'CN', // 需要根据symbol判断
        });
      }
      
      // 扣除现金
      set(state => ({
        summary: {
          ...state.summary,
          cash: state.summary.cash - trade.amount - trade.fee,
        },
      }));
    } else if (trade.type === 'sell') {
      if (position) {
        const newQuantity = position.quantity - trade.quantity;
        if (newQuantity <= 0) {
          await get().removePosition(position.id);
        } else {
          await get().updatePosition(position.id, {
            quantity: newQuantity,
          });
        }
      }
      
      // 增加现金
      set(state => ({
        summary: {
          ...state.summary,
          cash: state.summary.cash + trade.amount - trade.fee,
        },
      }));
    }

    set(state => ({
      trades: [trade, ...state.trades],
    }));
    
    get().calculateSummary();
  },

  loadTrades: async () => {
    try {
      const trades = await dbService.getAllTrades(100); // 最近100条
      set({ trades });
    } catch (error) {
      console.error('[Portfolio] Failed to load trades:', error);
    }
  },

  calculateSummary: () => {
    const { positions, summary } = get();
    
    const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    const totalCost = positions.reduce((sum, p) => sum + p.costBasis, 0);
    const totalPnL = totalValue - totalCost;
    const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
    
    // 计算权重
    const updatedPositions = positions.map(p => ({
      ...p,
      weight: totalValue > 0 ? (p.marketValue / totalValue) * 100 : 0,
    }));

    set({
      positions: updatedPositions,
      summary: {
        ...summary,
        totalValue,
        totalCost,
        totalPnL,
        totalPnLPercent,
        totalAssets: totalValue + summary.cash,
        positionCount: positions.length,
        // dayPnL 需要与昨日收盘价比较，暂时设为0
        dayPnL: 0,
        dayPnLPercent: 0,
        winRate: 0, // 需要根据历史交易计算
      },
    });
  },
}));
