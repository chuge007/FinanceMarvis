import { create } from 'zustand';
import { dbService } from '../services/storage/indexedDB';
import type { AlertRecord } from '../services/storage/indexedDB';

export type AlertCondition = 
  | 'price_above'      // 价格突破
  | 'price_below'      // 价格跌破
  | 'change_above'     // 涨幅超过
  | 'change_below'     // 跌幅超过
  | 'volume_spike'     // 成交量异常
  | 'ma_cross'         // 均线交叉
  | 'rsi_overbought'   // RSI超买
  | 'rsi_oversold';    // RSI超卖

export interface Alert {
  id: string;
  symbol: string;
  name: string;
  condition: AlertCondition;
  targetValue: number;
  currentValue?: number;
  message: string;
  triggered: boolean;
  triggeredAt?: number;
  createdAt: number;
  enabled: boolean;
  notifySound: boolean;
  notifyDesktop: boolean;
}

interface AlertState {
  alerts: Alert[];
  loading: boolean;
  
  // Actions
  loadAlerts: () => Promise<void>;
  addAlert: (alert: Omit<Alert, 'id' | 'triggered' | 'createdAt' | 'triggeredAt'>) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;
  toggleAlert: (id: string) => Promise<void>;
  checkAlert: (symbol: string, price: number, change: number, volume: number) => void;
  dismissAlert: (id: string) => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  loading: false,

  loadAlerts: async () => {
    set({ loading: true });
    try {
      const records = await dbService.getAllAlerts();
      const alerts: Alert[] = records.map(r => ({
        id: r.id,
        symbol: r.symbol,
        name: r.symbol, // 需要从市场数据获取
        condition: r.condition as AlertCondition,
        targetValue: r.targetValue,
        message: generateAlertMessage(r.condition as AlertCondition, r.symbol, r.targetValue),
        triggered: r.triggered,
        triggeredAt: r.triggeredAt,
        createdAt: r.createdAt,
        enabled: !r.triggered, // 已触发的自动禁用
        notifySound: true,
        notifyDesktop: true,
      }));
      set({ alerts });
    } catch (error) {
      console.error('[Alert] Failed to load alerts:', error);
    } finally {
      set({ loading: false });
    }
  },

  addAlert: async (alertData) => {
    const now = Date.now();
    const newAlert: Alert = {
      ...alertData,
      id: `alert_${now}_${Math.random().toString(36).substr(2, 9)}`,
      triggered: false,
      createdAt: now,
    };

    const record: AlertRecord = {
      id: newAlert.id,
      symbol: newAlert.symbol,
      condition: newAlert.condition,
      targetValue: newAlert.targetValue,
      triggered: false,
      createdAt: now,
    };

    await dbService.saveAlert(record);
    set(state => ({
      alerts: [...state.alerts, newAlert],
    }));
  },

  removeAlert: async (id) => {
    await dbService.deleteAlert(id);
    set(state => ({
      alerts: state.alerts.filter(a => a.id !== id),
    }));
  },

  toggleAlert: async (id) => {
    const alert = get().alerts.find(a => a.id === id);
    if (!alert) return;

    const updatedAlert = { ...alert, enabled: !alert.enabled };
    set(state => ({
      alerts: state.alerts.map(a => a.id === id ? updatedAlert : a),
    }));
  },

  checkAlert: (symbol, price, change, volume) => {
    const { alerts } = get();
    
    alerts.forEach(async alert => {
      if (!alert.enabled || alert.triggered || alert.symbol !== symbol) return;

      let shouldTrigger = false;
      let currentValue = 0;

      switch (alert.condition) {
        case 'price_above':
          currentValue = price;
          shouldTrigger = price >= alert.targetValue;
          break;
        case 'price_below':
          currentValue = price;
          shouldTrigger = price <= alert.targetValue;
          break;
        case 'change_above':
          currentValue = change;
          shouldTrigger = change >= alert.targetValue;
          break;
        case 'change_below':
          currentValue = change;
          shouldTrigger = change <= -alert.targetValue;
          break;
        case 'volume_spike':
          currentValue = volume;
          shouldTrigger = volume >= alert.targetValue;
          break;
      }

      if (shouldTrigger) {
        const triggeredAt = Date.now();
        
        // 更新状态
        set(state => ({
          alerts: state.alerts.map(a => 
            a.id === alert.id 
              ? { ...a, triggered: true, triggeredAt, currentValue, enabled: false }
              : a
          ),
        }));

        // 保存到数据库
        await dbService.saveAlert({
          id: alert.id,
          symbol: alert.symbol,
          condition: alert.condition,
          targetValue: alert.targetValue,
          triggered: true,
          triggeredAt,
          createdAt: alert.createdAt,
        });

        // 发送通知
        if (alert.notifyDesktop && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('交易告警', {
            body: `${alert.symbol}: ${alert.message}`,
            icon: '/icon.png',
          });
        }

        if (alert.notifySound) {
          playAlertSound();
        }

        console.log('[Alert] Triggered:', alert.symbol, alert.message);
      }
    });
  },

  dismissAlert: (id) => {
    set(state => ({
      alerts: state.alerts.filter(a => a.id !== id),
    }));
  },
}));

function generateAlertMessage(condition: AlertCondition, symbol: string, value: number): string {
  switch (condition) {
    case 'price_above':
      return `价格突破 ¥${value.toFixed(2)}`;
    case 'price_below':
      return `价格跌破 ¥${value.toFixed(2)}`;
    case 'change_above':
      return `涨幅超过 ${value.toFixed(1)}%`;
    case 'change_below':
      return `跌幅超过 ${value.toFixed(1)}%`;
    case 'volume_spike':
      return `成交量突破 ${(value / 10000).toFixed(0)}万`;
    case 'ma_cross':
      return `均线金叉`;
    case 'rsi_overbought':
      return `RSI超买 (>${value})`;
    case 'rsi_oversold':
      return `RSI超卖 (<${value})`;
    default:
      return '条件满足';
  }
}

function playAlertSound() {
  try {
    const audio = new Audio('/alert.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.error('[Alert] Sound play failed:', err));
  } catch (error) {
    console.error('[Alert] Failed to play sound:', error);
  }
}

// 请求桌面通知权限
export const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    console.log('[Alert] Notification permission:', permission);
  }
};
