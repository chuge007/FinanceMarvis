import { create } from 'zustand';
import { dbService } from '../services/storage/indexedDB';
import type { TradeRecord } from '../services/storage/indexedDB';

export interface PaperAccount {
  id: string;
  name: string;
  initialCapital: number;
  currentCapital: number;
  cash: number;
  marketValue: number;
  totalAssets: number;
  totalPnL: number;
  totalPnLPercent: number;
  createdAt: number;
  updatedAt: number;
}

export interface PaperPosition {
  id: string;
  accountId: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  openedAt: number;
}

export interface PaperOrder {
  id: string;
  accountId: string;
  symbol: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  amount: number;
  fee: number;
  status: 'pending' | 'filled' | 'cancelled';
  createdAt: number;
  filledAt?: number;
}

export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
}

interface PaperTradingState {
  accounts: PaperAccount[];
  currentAccount: PaperAccount | null;
  positions: PaperPosition[];
  orders: PaperOrder[];
  trades: TradeRecord[];
  performance: PerformanceMetrics | null;
  loading: boolean;

  // Actions
  createAccount: (name: string, initialCapital: number) => void;
  selectAccount: (accountId: string) => void;
  placeOrder: (order: Omit<PaperOrder, 'id' | 'status' | 'createdAt' | 'filledAt'>) => Promise<void>;
  updatePositionPrice: (symbol: string, price: number) => void;
  calculatePerformance: () => void;
  loadAccountData: (accountId: string) => Promise<void>;
}

export const usePaperTradingStore = create<PaperTradingState>((set, get) => ({
  accounts: [],
  currentAccount: null,
  positions: [],
  orders: [],
  trades: [],
  performance: null,
  loading: false,

  createAccount: (name, initialCapital) => {
    const newAccount: PaperAccount = {
      id: `paper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      initialCapital,
      currentCapital: initialCapital,
      cash: initialCapital,
      marketValue: 0,
      totalAssets: initialCapital,
      totalPnL: 0,
      totalPnLPercent: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set(state => ({
      accounts: [...state.accounts, newAccount],
      currentAccount: newAccount,
    }));

    // 保存到localStorage
    localStorage.setItem('paperAccounts', JSON.stringify([...get().accounts, newAccount]));
  },

  selectAccount: (accountId) => {
    const account = get().accounts.find(a => a.id === accountId);
    if (account) {
      set({ currentAccount: account });
      get().loadAccountData(accountId);
    }
  },

  placeOrder: async (orderData) => {
    const { currentAccount, positions } = get();
    if (!currentAccount) {
      alert('请先创建或选择账户');
      return;
    }

    const order: PaperOrder = {
      ...orderData,
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      createdAt: Date.now(),
    };

    // 检查资金是否充足（买入）
    if (order.type === 'buy') {
      const requiredAmount = order.amount + order.fee;
      if (currentAccount.cash < requiredAmount) {
        alert('资金不足');
        return;
      }
    }

    // 检查持仓是否充足（卖出）
    if (order.type === 'sell') {
      const position = positions.find(p => p.symbol === order.symbol);
      if (!position || position.quantity < order.quantity) {
        alert('持仓不足');
        return;
      }
    }

    // 立即成交（实际场景可以加入撮合逻辑）
    order.status = 'filled';
    order.filledAt = Date.now();

    // 创建交易记录
    const trade: TradeRecord = {
      id: order.id,
      symbol: order.symbol,
      type: order.type,
      quantity: order.quantity,
      price: order.price,
      amount: order.amount,
      fee: order.fee,
      timestamp: order.filledAt,
      note: `模拟交易 - ${order.type === 'buy' ? '买入' : '卖出'}`,
    };

    await dbService.saveTrade(trade);

    // 更新持仓
    if (order.type === 'buy') {
      const existingPos = positions.find(p => p.symbol === order.symbol && p.accountId === currentAccount.id);
      
      if (existingPos) {
        // 加仓
        const newQuantity = existingPos.quantity + order.quantity;
        const newAvgCost = (existingPos.avgCost * existingPos.quantity + order.amount) / newQuantity;
        
        const updatedPos: PaperPosition = {
          ...existingPos,
          quantity: newQuantity,
          avgCost: newAvgCost,
          marketValue: newQuantity * existingPos.currentPrice,
          pnl: (existingPos.currentPrice - newAvgCost) * newQuantity,
          pnlPercent: ((existingPos.currentPrice - newAvgCost) / newAvgCost) * 100,
        };

        set(state => ({
          positions: state.positions.map(p => p.id === existingPos.id ? updatedPos : p),
        }));
      } else {
        // 新建持仓
        const newPos: PaperPosition = {
          id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          accountId: currentAccount.id,
          symbol: order.symbol,
          name: order.symbol, // 应该从市场数据获取
          quantity: order.quantity,
          avgCost: order.price,
          currentPrice: order.price,
          marketValue: order.amount,
          pnl: 0,
          pnlPercent: 0,
          openedAt: Date.now(),
        };

        set(state => ({
          positions: [...state.positions, newPos],
        }));
      }

      // 扣除现金
      set(state => ({
        currentAccount: state.currentAccount ? {
          ...state.currentAccount,
          cash: state.currentAccount.cash - order.amount - order.fee,
          updatedAt: Date.now(),
        } : null,
      }));
    } else if (order.type === 'sell') {
      const position = positions.find(p => p.symbol === order.symbol && p.accountId === currentAccount.id);
      if (position) {
        const newQuantity = position.quantity - order.quantity;
        
        if (newQuantity <= 0) {
          // 清仓
          set(state => ({
            positions: state.positions.filter(p => p.id !== position.id),
          }));
        } else {
          // 减仓
          const updatedPos: PaperPosition = {
            ...position,
            quantity: newQuantity,
            marketValue: newQuantity * position.currentPrice,
            pnl: (position.currentPrice - position.avgCost) * newQuantity,
            pnlPercent: ((position.currentPrice - position.avgCost) / position.avgCost) * 100,
          };

          set(state => ({
            positions: state.positions.map(p => p.id === position.id ? updatedPos : p),
          }));
        }
      }

      // 增加现金
      set(state => ({
        currentAccount: state.currentAccount ? {
          ...state.currentAccount,
          cash: state.currentAccount.cash + order.amount - order.fee,
          updatedAt: Date.now(),
        } : null,
      }));
    }

    set(state => ({
      orders: [order, ...state.orders],
      trades: [trade, ...state.trades],
    }));

    // 重新计算账户资产
    const { positions: updatedPositions, currentAccount: updatedAccount } = get();
    if (updatedAccount) {
      const marketValue = updatedPositions
        .filter(p => p.accountId === updatedAccount.id)
        .reduce((sum, p) => sum + p.marketValue, 0);
      
      const totalAssets = updatedAccount.cash + marketValue;
      const totalPnL = totalAssets - updatedAccount.initialCapital;
      const totalPnLPercent = (totalPnL / updatedAccount.initialCapital) * 100;

      set({
        currentAccount: {
          ...updatedAccount,
          marketValue,
          totalAssets,
          totalPnL,
          totalPnLPercent,
          updatedAt: Date.now(),
        },
      });
    }

    get().calculatePerformance();
  },

  updatePositionPrice: (symbol, price) => {
    set(state => ({
      positions: state.positions.map(p => {
        if (p.symbol === symbol) {
          const marketValue = p.quantity * price;
          const pnl = (price - p.avgCost) * p.quantity;
          const pnlPercent = ((price - p.avgCost) / p.avgCost) * 100;
          
          return {
            ...p,
            currentPrice: price,
            marketValue,
            pnl,
            pnlPercent,
          };
        }
        return p;
      }),
    }));

    // 更新账户市值
    const { positions, currentAccount } = get();
    if (currentAccount) {
      const marketValue = positions
        .filter(p => p.accountId === currentAccount.id)
        .reduce((sum, p) => sum + p.marketValue, 0);
      
      const totalAssets = currentAccount.cash + marketValue;
      const totalPnL = totalAssets - currentAccount.initialCapital;
      const totalPnLPercent = (totalPnL / currentAccount.initialCapital) * 100;

      set({
        currentAccount: {
          ...currentAccount,
          marketValue,
          totalAssets,
          totalPnL,
          totalPnLPercent,
          updatedAt: Date.now(),
        },
      });
    }
  },

  calculatePerformance: () => {
    const { trades, currentAccount } = get();
    
    if (!currentAccount || trades.length === 0) {
      set({ performance: null });
      return;
    }

    // 计算胜率和盈亏
    const closedTrades = trades.filter(t => t.type === 'sell');
    const wins = closedTrades.filter(t => {
      const buyTrade = trades.find(bt => bt.symbol === t.symbol && bt.type === 'buy' && bt.timestamp < t.timestamp);
      if (buyTrade) {
        return t.price > buyTrade.price;
      }
      return false;
    });

    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
    
    // 计算收益率
    const totalReturn = currentAccount.totalAssets - currentAccount.initialCapital;
    const totalReturnPercent = currentAccount.totalPnLPercent;
    
    // 年化收益率（简化计算）
    const daysSinceStart = (Date.now() - currentAccount.createdAt) / (24 * 60 * 60 * 1000);
    const annualizedReturn = daysSinceStart > 0 
      ? (totalReturnPercent / daysSinceStart) * 365 
      : 0;

    const performance: PerformanceMetrics = {
      totalReturn,
      totalReturnPercent,
      annualizedReturn,
      maxDrawdown: 0, // 需要历史净值曲线计算
      maxDrawdownPercent: 0,
      sharpeRatio: 0, // 需要日收益率序列计算
      winRate,
      profitFactor: 0, // 需要详细盈亏数据
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: closedTrades.length - wins.length,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
    };

    set({ performance });
  },

  loadAccountData: async (accountId) => {
    set({ loading: true });
    try {
      // 加载交易记录
      const trades = await dbService.getAllTrades();
      const accountTrades = trades.filter(t => 
        // 这里需要更好的账户关联逻辑
        true
      );
      
      set({ trades: accountTrades });
      get().calculatePerformance();
    } catch (error) {
      console.error('[PaperTrading] Failed to load account data:', error);
    } finally {
      set({ loading: false });
    }
  },
}));
