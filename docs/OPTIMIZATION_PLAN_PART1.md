# StrategyLab 专业投资信息系统优化方案 (Part 1/3)

**项目名称**: CompleteInvestmentInformationMarvis (StrategyLab)  
**制定日期**: 2026-11-17  
**目标用户**: 专业投资者、操盘手、量化交易员  
**当前版本**: v2.2 节奏版

---

## 一、现状分析

### 1.1 现有功能模块

| 模块 | 功能 | 数据源 | 更新频率 | 状态 |
|------|------|--------|----------|------|
| Rhythm（节奏） | 市场状态识别、指标时间线 | ConvexTrade | 5分钟 | ✅ 核心模块 |
| Macro（宏观） | 宏观经济数据 | ConvexTrade | 30秒 | ⚠️ 部分模拟 |
| Strategy（策略） | 投资策略分析 | 混合 | 30秒 | ⚠️ 部分模拟 |
| FundFlow（资金流） | 资金流向、板块流动 | 腾讯、东财 | 30秒 | ✅ A股真实 |
| Sentiment（情绪） | 市场情绪指标 | Alternative.me | 30秒 | ✅ 真实数据 |
| Discipline（纪律） | 仓位管理、交易日志 | 本地存储 | 实时 | ✅ 本地工具 |

### 1.2 技术架构

```
前端: React 19 + TypeScript 6.0 + Zustand
图表: Chart.js + D3 + Lightweight Charts
数据: Axios + Fetch (轮询)
部署: Electron-style 桌面应用
```

### 1.3 核心痛点（按优先级排序）

#### P0 - 严重影响使用
1. ❌ **实时性不足**: 30秒轮询对日内交易完全不够用
2. ❌ **数据可信度问题**: 页面明确提示"部分为模型估算或演示常量"
3. ❌ **无持仓跟踪**: 专业操盘手最需要的功能缺失

#### P1 - 重要功能缺失
4. ❌ **预警系统缺失**: 无主动推送、无声音/桌面通知
5. ❌ **技术分析薄弱**: 缺少形态识别、量价分析
6. ❌ **板块轮动单薄**: 无深度行业比较和资金流向

#### P2 - 体验改善
7. ⚠️ **信息密度不足**: 操盘手需要更多数据在单屏
8. ⚠️ **多屏支持弱**: 无法充分利用多显示器
9. ❌ **历史数据受限**: 无完整的分钟级历史存储

---

## 二、优化总体目标

### 2.1 核心目标

**将系统从"市场监控工具"升级为"专业交易决策平台"**

### 2.2 关键指标

| 指标 | 当前值 | 目标值(6月) | 目标值(12月) |
|------|--------|------------|-------------|
| 数据延迟 | 30秒 | <500ms | <200ms |
| 功能模块 | 6个 | 12个 | 15+个 |
| 数据真实性 | ~60% | 95%+ | 100% |
| 用户留存时长 | 偶尔查看 | 30分钟/天 | 2小时/天 |

### 2.3 优化路线图

```
Phase 1 (1-2个月) - 数据实时化 + 核心功能补全
├─ WebSocket实时行情 ⭐⭐⭐⭐⭐
├─ 持仓跟踪模块 ⭐⭐⭐⭐⭐
├─ 预警通知系统 ⭐⭐⭐⭐
└─ 数据质量提升 ⭐⭐⭐⭐⭐

Phase 2 (2-3个月) - 专业分析工具
├─ 深度技术分析 ⭐⭐⭐⭐
├─ 板块轮动分析 ⭐⭐⭐⭐
├─ 相关性分析 ⭐⭐⭐
└─ 量化回测框架 ⭐⭐⭐

Phase 3 (3-4个月) - 交易执行 + 智能化
├─ 交易接口集成 ⭐⭐⭐
├─ AI辅助决策 ⭐⭐⭐
├─ 策略自动化 ⭐⭐
└─ 风险管理增强 ⭐⭐⭐⭐
```

---

## 三、Phase 1 详细方案

### 3.1 WebSocket实时行情系统

#### 3.1.1 架构设计

```typescript
// src/services/websocket/MarketDataWebSocket.ts
interface WebSocketMessage {
  type: 'quote' | 'trade' | 'depth' | 'kline';
  market: 'US' | 'CN' | 'CRYPTO' | 'FUTURES';
  symbol: string;
  data: any;
  timestamp: number;
}

class MarketDataWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Set<(data: any) => void>>();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  
  connect(url: string) {
    this.ws = new WebSocket(url);
    this.setupHandlers();
  }
  
  subscribe(channel: string, callback: (data: any) => void) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      this.sendSubscribe(channel);
    }
    this.subscriptions.get(channel)!.add(callback);
  }
  
  private setupHandlers() {
    this.ws!.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.resubscribe();
    };
    
    this.ws!.onmessage = (event) => {
      const msg: WebSocketMessage = JSON.parse(event.data);
      this.dispatch(msg);
    };
    
    this.ws!.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
    
    this.ws!.onclose = () => {
      console.log('[WS] Disconnected');
      this.scheduleReconnect();
    };
  }
  
  private scheduleReconnect() {
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;
    setTimeout(() => this.connect(this.url), delay);
  }
}

export const marketWS = new MarketDataWebSocket();
```

#### 3.1.2 数据源选择

**A股实时数据**:

| 数据源 | 延迟 | 数据类型 | 成本 | 推荐度 |
|-------|------|---------|------|--------|
| 新浪财经WS | <100ms | L1+五档 | 免费 | ⭐⭐⭐⭐⭐ |
| 东方财富WS | <150ms | L1+资金流 | 免费 | ⭐⭐⭐⭐ |
| 腾讯行情(轮询) | ~5s | L1+五档 | 免费 | ⚠️ 降级备用 |

推荐方案: **新浪财经WebSocket(主) + 东方财富(备)**

**美股实时数据**:

| 数据源 | 延迟 | 数据类型 | 成本/月 | 推荐度 |
|-------|------|---------|--------|--------|
| Polygon.io | <200ms | L1+L2+历史 | $29-199 | ⭐⭐⭐⭐⭐ |
| Finnhub.io | <300ms | L1+新闻 | $0-99 | ⭐⭐⭐⭐ |
| Alpha Vantage | ~15s | L1+指标 | $0-49 | ⭐⭐⭐ |

推荐方案: **Polygon.io(付费) 或 Finnhub.io(免费层)**

#### 3.1.3 实施步骤

1. **第1-3天**: 搭建WebSocket基础框架
   - 创建 `MarketDataWebSocket` 类
   - 实现订阅/取消订阅机制
   - 实现心跳保活和断线重连

2. **第4-7天**: 接入A股新浪财经WebSocket
   - 解析新浪行情协议
   - 实现A股实时报价推送
   - 实现五档深度推送

3. **第8-10天**: 接入美股数据源
   - 集成Polygon.io或Finnhub
   - 实现美股实时报价
   - 统一A股/美股数据格式

4. **第11-14天**: 前端集成测试
   - 更新所有使用行情的组件
   - 性能测试(1000+订阅)
   - 错误处理和降级策略

### 3.2 持仓跟踪模块

#### 3.2.1 数据模型

```typescript
// src/modules/portfolio/types.ts
export interface Position {
  id: number;
  portfolio_id: number;
  symbol: string;
  market: 'US' | 'CN' | 'HK';
  direction: 'long' | 'short';
  quantity: number;           
  avg_cost: number;          
  current_price: number;     
  market_value: number;      
  unrealized_pnl: number;    
  unrealized_pnl_pct: number;
  weight: number;            
  stop_loss: number | null;  
  take_profit: number | null;
  last_update: string;
}

export interface Portfolio {
  id: number;
  name: string;
  initial_capital: number;   
  current_capital: number;   
  cash: number;              
  market_value: number;      
  total_value: number;       
  total_pnl: number;         
  total_pnl_pct: number;     
  positions: Position[];
  created_at: string;
  updated_at: string;
}
```

#### 3.2.2 UI布局

```
┌─────────────────────────────────────────────────────────────┐
│ 持仓总览                                                     │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ 总资产    │ 持仓市值  │ 可用现金  │ 总盈亏    │ 收益率          │
│ ¥1.2M    │ ¥800K    │ ¥400K    │ +¥200K   │ +20.0% ↑        │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 持仓明细（实时更新）                                          │
├─────┬──────┬────┬─────┬──────┬──────┬────────┬──────┬──────┤
│代码  │名称   │方向│数量 │成本  │现价  │浮动盈亏│占比  │操作  │
├─────┼──────┼────┼─────┼──────┼──────┼────────┼──────┼──────┤
│600519│贵州茅台│多 │500  │1680  │1750  │+35,000 │35%   │详情  │
│AAPL │苹果   │多 │1000 │175   │182   │+7,000  │22.8% │详情  │
└─────┴──────┴────┴─────┴──────┴──────┴────────┴──────┴──────┘
```

#### 3.2.3 实时更新逻辑

```typescript
// src/modules/portfolio/hooks/usePortfolioRealtime.ts
export function usePortfolioRealtime(portfolioId: number) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  
  useEffect(() => {
    const symbols = portfolio?.positions.map(p => 
      `${p.market}:${p.symbol}`
    ) ?? [];
    
    symbols.forEach(symbol => {
      marketWS.subscribe(`quote:${symbol}`, (quote) => {
        setPortfolio(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            positions: prev.positions.map(pos => {
              if (`${pos.market}:${pos.symbol}` === symbol) {
                const current_price = quote.price;
                const direction = pos.direction === 'long' ? 1 : -1;
                const unrealized_pnl = direction * 
                  (current_price - pos.avg_cost) * pos.quantity;
                const unrealized_pnl_pct = 
                  (unrealized_pnl / (pos.avg_cost * pos.quantity)) * 100;
                const market_value = current_price * pos.quantity;
                
                return {
                  ...pos,
                  current_price,
                  unrealized_pnl,
                  unrealized_pnl_pct,
                  market_value,
                  last_update: new Date().toISOString(),
                };
              }
              return pos;
            }),
          };
        });
      });
    });
    
    return () => {
      symbols.forEach(symbol => 
        marketWS.unsubscribe(`quote:${symbol}`)
      );
    };
  }, [portfolio?.positions]);
  
  return { portfolio };
}
```

### 3.3 预警通知系统

#### 3.3.1 预警类型

```typescript
// src/modules/alerts/types.ts
export type AlertType = 
  | 'price_breakout'      // 价格突破
  | 'price_threshold'     // 价格阈值
  | 'volume_spike'        // 成交量异动
  | 'volatility_surge'    // 波动率激增
  | 'sentiment_extreme'   // 情绪极值
  | 'technical_signal'    // 技术信号
  | 'news_event'          // 重大新闻
  | 'position_risk'       // 持仓风险
  | 'stop_loss_hit'       // 触及止损
  | 'take_profit_hit';    // 触及止盈

export interface AlertRule {
  id: number;
  name: string;
  type: AlertType;
  symbol?: string;
  market?: 'US' | 'CN';
  condition: AlertCondition;
  notification: {
    sound: boolean;
    desktop: boolean;
    email: boolean;
  };
  enabled: boolean;
  triggered_count: number;
  last_triggered: string | null;
}
```

#### 3.3.2 通知实现

```typescript
// src/services/notification.ts
class NotificationService {
  async notify(alert: AlertRule, message: string) {
    // 桌面通知
    if (alert.notification.desktop && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(alert.name, {
          body: message,
          icon: '/logo.png',
          tag: `alert-${alert.id}`,
          requireInteraction: true,
        });
      }
    }
    
    // 声音通知
    if (alert.notification.sound) {
      const audio = new Audio(this.getSoundPath(alert.type));
      audio.volume = 0.5;
      await audio.play();
    }
    
    // 邮件通知（需后端）
    if (alert.notification.email) {
      await fetch('/api/notifications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alert.id, message }),
      });
    }
  }
  
  private getSoundPath(type: AlertType): string {
    const soundMap: Record<AlertType, string> = {
      stop_loss_hit: '/sounds/alert-critical.mp3',
      price_breakout: '/sounds/alert-high.mp3',
      volume_spike: '/sounds/alert-medium.mp3',
      // ...
    };
    return soundMap[type] || '/sounds/default.mp3';
  }
}

export const notificationService = new NotificationService();
```

### 3.4 历史数据存储

#### 3.4.1 IndexedDB方案

```typescript
// src/services/localDB.ts
import { openDB, DBSchema } from 'idb';

interface MarketDB extends DBSchema {
  'candles-1m': {
    key: string;
    value: CandleData;
    indexes: { 'by-symbol': string; 'by-time': number };
  };
  'candles-1d': {
    key: string;
    value: CandleData;
    indexes: { 'by-symbol': string; 'by-time': number };
  };
  'portfolios': {
    key: number;
    value: Portfolio;
  };
  'trades': {
    key: number;
    value: Trade;
    indexes: { 'by-portfolio': number; 'by-time': number };
  };
}

class MarketDataDB {
  private db: IDBPDatabase<MarketDB> | null = null;
  
  async init() {
    this.db = await openDB<MarketDB>('marvis-market-data', 1, {
      upgrade(db) {
        const candles1m = db.createObjectStore('candles-1m');
        candles1m.createIndex('by-symbol', 'symbol');
        candles1m.createIndex('by-time', 'timestamp');
        
        const candles1d = db.createObjectStore('candles-1d');
        candles1d.createIndex('by-symbol', 'symbol');
        candles1d.createIndex('by-time', 'timestamp');
        
        db.createObjectStore('portfolios', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        
        const trades = db.createObjectStore('trades', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        trades.createIndex('by-portfolio', 'portfolio_id');
        trades.createIndex('by-time', 'timestamp');
      },
    });
  }
  
  async saveCandles(
    market: string, 
    symbol: string, 
    interval: string, 
    candles: CandleData[]
  ) {
    const store = interval === '1m' ? 'candles-1m' : 'candles-1d';
    const tx = this.db!.transaction(store, 'readwrite');
    await Promise.all(
      candles.map(c => 
        tx.store.put(c, `${market}:${symbol}:${c.timestamp}`)
      )
    );
    await tx.done;
  }
}

export const marketDB = new MarketDataDB();
```

#### 3.4.2 数据清理策略

- **分钟级数据**: 保留最近30天，自动清理
- **日线数据**: 保留5年
- **持仓记录**: 永久保留
- **交易记录**: 永久保留
- **定期压缩**: 每周运行一次

---

## 四、Phase 1 实施计划

### 4.1 时间表

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1 | WebSocket框架 + A股接入 | 实时A股行情推送 |
| W2 | 美股数据接入 + 测试 | 实时美股行情推送 |
| W3 | 持仓跟踪UI + 实时更新 | 持仓页面v1.0 |
| W4 | 预警规则引擎 | 预警系统v1.0 |
| W5 | IndexedDB存储 | 历史数据库 |
| W6 | 数据质量审计 + 修复 | 100%真实数据 |
| W7-8 | 集成测试 + Bug修复 | Phase 1完成 |

### 4.2 人员分工

**2人团队配置**:
- **前端开发**: WebSocket集成、持仓UI、预警UI
- **全栈开发**: 数据源接入、IndexedDB、预警引擎

### 4.3 成功标准

- [x] A股实时延迟 < 500ms
- [x] 美股实时延迟 < 1s
- [x] 持仓实时更新正常
- [x] 预警触发准确率 > 98%
- [x] 无模拟数据残留
- [x] 连续运行24小时无崩溃

---

**文档版本**: v1.0  
**最后更新**: 2026-11-17  
**下一部分**: Part 2 - Phase 2 & 3详细方案
