/**
 * WebSocket市场数据推送服务
 * 支持多数据源、自动重连、心跳保活
 */

export type Market = 'US' | 'CN' | 'CRYPTO' | 'FUTURES';
export type DataType = 'quote' | 'trade' | 'depth' | 'kline';

export interface WebSocketMessage {
  type: DataType;
  market: Market;
  symbol: string;
  data: any;
  timestamp: number;
}

export interface WebSocketConfig {
  url: string;
  reconnectDelay?: number;      // 初始重连延迟(ms)，默认1000
  maxReconnectDelay?: number;   // 最大重连延迟(ms)，默认30000
  heartbeatInterval?: number;   // 心跳间隔(ms)，默认30000
  connectionTimeout?: number;   // 连接超时(ms)，默认10000
  maxReconnectAttempts?: number; // 最大重连次数，0表示无限
}

type SubscriptionCallback = (data: any) => void;

export class MarketDataWebSocket {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private subscriptions = new Map<string, Set<SubscriptionCallback>>();
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private connectionTimer: number | null = null;
  private isIntentionalClose = false;
  private url: string;

  constructor(config: WebSocketConfig) {
    this.url = config.url;
    this.config = {
      url: config.url,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      connectionTimeout: config.connectionTimeout ?? 10000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 0,
    };
  }

  /**
   * 连接WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      console.log('[WS] Connecting to', this.url);
      this.isIntentionalClose = false;

      try {
        this.ws = new WebSocket(this.url);
        this.setupHandlers(resolve, reject);
        this.startConnectionTimeout();
      } catch (error) {
        console.error('[WS] Connection failed:', error);
        reject(error);
      }
    });
  }

  /**
   * 设置事件处理器
   */
  private setupHandlers(
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('[WS] Connected successfully');
      this.clearConnectionTimeout();
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.resubscribeAll();
      resolve();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.dispatch(message);
      } catch (error) {
        console.error('[WS] Failed to parse message:', error);
      }
    };

    this.ws.onerror = (error: Event) => {
      console.error('[WS] WebSocket error:', error);
      this.clearConnectionTimeout();
      reject(new Error('WebSocket connection error'));
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log('[WS] Connection closed:', event.code, event.reason);
      this.stopHeartbeat();
      
      if (!this.isIntentionalClose) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * 订阅市场数据
   * @param channel 频道标识，格式: "market:type:symbol" 例如 "CN:quote:600519"
   * @param callback 数据回调函数
   */
  subscribe(channel: string, callback: SubscriptionCallback): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      
      // 如果已连接，立即发送订阅请求
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendSubscribe(channel);
      }
    }
    
    this.subscriptions.get(channel)!.add(callback);
    console.log('[WS] Subscribed to', channel, '- Total subscribers:', this.subscriptions.get(channel)!.size);
  }

  /**
   * 取消订阅
   */
  unsubscribe(channel: string, callback?: SubscriptionCallback): void {
    const callbacks = this.subscriptions.get(channel);
    if (!callbacks) return;

    if (callback) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscriptions.delete(channel);
        this.sendUnsubscribe(channel);
      }
    } else {
      this.subscriptions.delete(channel);
      this.sendUnsubscribe(channel);
    }
    
    console.log('[WS] Unsubscribed from', channel);
  }

  /**
   * 分发消息到订阅者
   */
  private dispatch(message: WebSocketMessage): void {
    const channel = `${message.market}:${message.type}:${message.symbol}`;
    const callbacks = this.subscriptions.get(channel);
    
    if (callbacks && callbacks.size > 0) {
      callbacks.forEach(callback => {
        try {
          callback(message.data);
        } catch (error) {
          console.error('[WS] Callback error:', error);
        }
      });
    }
  }

  /**
   * 发送订阅请求
   */
  private sendSubscribe(channel: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    
    const [market, type, symbol] = channel.split(':');
    const message = {
      action: 'subscribe',
      market,
      type,
      symbol,
    };
    
    this.ws.send(JSON.stringify(message));
    console.log('[WS] Sent subscribe:', message);
  }

  /**
   * 发送取消订阅请求
   */
  private sendUnsubscribe(channel: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    
    const [market, type, symbol] = channel.split(':');
    const message = {
      action: 'unsubscribe',
      market,
      type,
      symbol,
    };
    
    this.ws.send(JSON.stringify(message));
  }

  /**
   * 重新订阅所有频道
   */
  private resubscribeAll(): void {
    console.log('[WS] Resubscribing all channels:', this.subscriptions.size);
    for (const channel of this.subscriptions.keys()) {
      this.sendSubscribe(channel);
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 启动连接超时定时器
   */
  private startConnectionTimeout(): void {
    this.connectionTimer = setTimeout(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        console.error('[WS] Connection timeout');
        this.ws?.close();
      }
    }, this.config.connectionTimeout);
  }

  /**
   * 清除连接超时定时器
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (
      this.config.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      console.error('[WS] Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // 指数退避算法
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    this.reconnectAttempts++;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('[WS] Reconnect failed:', error);
      });
    }, delay);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    console.log('[WS] Disconnecting...');
    this.isIntentionalClose = true;
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 获取连接状态
   */
  getState(): 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED' {
    if (!this.ws) return 'CLOSED';
    
    const states = {
      [WebSocket.CONNECTING]: 'CONNECTING',
      [WebSocket.OPEN]: 'OPEN',
      [WebSocket.CLOSING]: 'CLOSING',
      [WebSocket.CLOSED]: 'CLOSED',
    } as const;
    
    return states[this.ws.readyState];
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 获取订阅统计
   */
  getStats() {
    return {
      totalChannels: this.subscriptions.size,
      totalSubscribers: Array.from(this.subscriptions.values())
        .reduce((sum, set) => sum + set.size, 0),
      reconnectAttempts: this.reconnectAttempts,
      state: this.getState(),
    };
  }
}

// 导出单例实例（可根据需要创建多个实例）
export const createMarketWS = (config: WebSocketConfig) => 
  new MarketDataWebSocket(config);
