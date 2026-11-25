/**
 * IndexedDB 数据持久化服务
 * 存储历史行情、持仓记录、交易日志、告警历史
 *
 * 关于初始化时序：所有读写方法都会先 `ensure()` 拿连接，而不是直接判断 this.db。
 * 之前调用方（App 的 dbService.init() 与各 store 的 load*）并发触发时，
 * 读操作会抢在 open 的 onsuccess 之前执行，抛 "Database not initialized" 并丢掉一次加载。
 * 现在 open 只发起一次（opening 缓存同一个 Promise），谁先到谁等它，调用方不需要关心顺序。
 */

const DB_NAME = 'StrategyLabDB';
const DB_VERSION = 1;

export interface QuoteRecord {
  symbol: string;
  timestamp: number;
  price: number;
  volume: number;
  market: 'CN' | 'US' | 'CRYPTO';
}

export interface PositionRecord {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  market: 'CN' | 'US' | 'CRYPTO';
  createdAt: number;
  updatedAt: number;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  amount: number;
  fee: number;
  timestamp: number;
  note?: string;
}

export interface AlertRecord {
  id: string;
  symbol: string;
  condition: string;
  targetValue: number;
  triggered: boolean;
  triggeredAt?: number;
  createdAt: number;
}

class IndexedDBService {
  private db: IDBDatabase | null = null;
  /** 正在打开的连接：并发调用共享同一个 Promise，避免重复 open 与竞态。 */
  private opening: Promise<IDBDatabase> | null = null;

  async init(): Promise<void> {
    await this.ensure();
  }

  /** 拿到可用连接；未初始化则就地初始化。 */
  private ensure(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;

    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        this.opening = null;
        reject(err);
        return;
      }

      request.onerror = () => {
        this.opening = null;
        reject(request.error ?? new Error('IndexedDB 打开失败'));
      };
      request.onblocked = () => {
        this.opening = null;
        reject(new Error('IndexedDB 被其它标签页占用，请关闭重复打开的页面后刷新'));
      };
      request.onsuccess = () => {
        const db = request.result;
        this.db = db;
        this.opening = null;
        // 其它标签页触发版本升级时会要求关闭旧连接，否则会一直 blocked
        db.onversionchange = () => {
          db.close();
          this.db = null;
        };
        console.log('[IndexedDB] Database opened successfully');
        resolve(db);
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 历史行情表
        if (!db.objectStoreNames.contains('quotes')) {
          const quoteStore = db.createObjectStore('quotes', { keyPath: ['symbol', 'timestamp'] });
          quoteStore.createIndex('symbol', 'symbol', { unique: false });
          quoteStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 持仓表
        if (!db.objectStoreNames.contains('positions')) {
          const posStore = db.createObjectStore('positions', { keyPath: 'id' });
          posStore.createIndex('symbol', 'symbol', { unique: false });
        }

        // 交易记录表
        if (!db.objectStoreNames.contains('trades')) {
          const tradeStore = db.createObjectStore('trades', { keyPath: 'id' });
          tradeStore.createIndex('symbol', 'symbol', { unique: false });
          tradeStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 告警记录表
        if (!db.objectStoreNames.contains('alerts')) {
          const alertStore = db.createObjectStore('alerts', { keyPath: 'id' });
          alertStore.createIndex('symbol', 'symbol', { unique: false });
          alertStore.createIndex('triggered', 'triggered', { unique: false });
        }

        console.log('[IndexedDB] Database schema created');
      };
    });

    return this.opening;
  }

  // ========== 行情数据 ==========

  async saveQuotes(quotes: QuoteRecord[]): Promise<void> {
    const db = await this.ensure();

    const tx = db.transaction('quotes', 'readwrite');
    const store = tx.objectStore('quotes');

    for (const quote of quotes) {
      store.put(quote);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getQuotes(
    symbol: string,
    startTime: number,
    endTime: number
  ): Promise<QuoteRecord[]> {
    const db = await this.ensure();

    const tx = db.transaction('quotes', 'readonly');
    const store = tx.objectStore('quotes');
    const index = store.index('symbol');
    const range = IDBKeyRange.bound([symbol, startTime], [symbol, endTime]);

    return new Promise((resolve, reject) => {
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ========== 持仓数据 ==========

  async savePosition(position: PositionRecord): Promise<void> {
    const db = await this.ensure();

    const tx = db.transaction('positions', 'readwrite');
    const store = tx.objectStore('positions');
    store.put(position);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllPositions(): Promise<PositionRecord[]> {
    const db = await this.ensure();

    const tx = db.transaction('positions', 'readonly');
    const store = tx.objectStore('positions');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deletePosition(id: string): Promise<void> {
    const db = await this.ensure();

    const tx = db.transaction('positions', 'readwrite');
    const store = tx.objectStore('positions');
    store.delete(id);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ========== 交易记录 ==========

  async saveTrade(trade: TradeRecord): Promise<void> {
    const db = await this.ensure();

    const tx = db.transaction('trades', 'readwrite');
    const store = tx.objectStore('trades');
    store.put(trade);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getTradesBySymbol(symbol: string): Promise<TradeRecord[]> {
    const db = await this.ensure();

    const tx = db.transaction('trades', 'readonly');
    const store = tx.objectStore('trades');
    const index = store.index('symbol');

    return new Promise((resolve, reject) => {
      const request = index.getAll(symbol);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllTrades(limit?: number): Promise<TradeRecord[]> {
    const db = await this.ensure();

    const tx = db.transaction('trades', 'readonly');
    const store = tx.objectStore('trades');
    const index = store.index('timestamp');

    return new Promise((resolve, reject) => {
      const request = limit
        ? index.getAll(null, limit)
        : index.getAll();
      request.onsuccess = () => {
        const trades = request.result.sort((a, b) => b.timestamp - a.timestamp);
        resolve(trades);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ========== 告警数据 ==========

  async saveAlert(alert: AlertRecord): Promise<void> {
    const db = await this.ensure();

    const tx = db.transaction('alerts', 'readwrite');
    const store = tx.objectStore('alerts');
    store.put(alert);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllAlerts(): Promise<AlertRecord[]> {
    const db = await this.ensure();

    const tx = db.transaction('alerts', 'readonly');
    const store = tx.objectStore('alerts');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAlert(id: string): Promise<void> {
    const db = await this.ensure();

    const tx = db.transaction('alerts', 'readwrite');
    const store = tx.objectStore('alerts');
    store.delete(id);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ========== 清理数据 ==========

  async clearOldQuotes(daysToKeep: number = 30): Promise<void> {
    const db = await this.ensure();

    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const tx = db.transaction('quotes', 'readwrite');
    const store = tx.objectStore('quotes');
    const index = store.index('timestamp');
    const range = IDBKeyRange.upperBound(cutoffTime);

    return new Promise((resolve, reject) => {
      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        console.log('[IndexedDB] Old quotes cleaned');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const dbService = new IndexedDBService();
