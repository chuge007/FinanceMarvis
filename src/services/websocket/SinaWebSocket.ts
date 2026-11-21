import { MarketDataWebSocket, createMarketWS } from "./MarketDataWebSocket";

export interface SinaQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  preClose: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  time: string;
  bid: Array<{ price: number; volume: number }>;
  ask: Array<{ price: number; volume: number }>;
}

export class SinaWebSocketManager {
  private ws: MarketDataWebSocket;
  private symbolMap = new Map<string, string>();

  constructor() {
    const wsUrl = "wss://hq.sinajs.cn/wskt";
    this.ws = createMarketWS({
      url: wsUrl,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      heartbeatInterval: 30000,
    });
  }

  async connect(): Promise<void> {
    return this.ws.connect();
  }

  subscribeQuote(symbol: string, callback: (quote: SinaQuote) => void): void {
    const sinaSymbol = this.toSinaSymbol(symbol);
    this.symbolMap.set(sinaSymbol, symbol);
    const channel = `CN:quote:${symbol}`;
    this.ws.subscribe(channel, (rawData: string) => {
      const quote = this.parseQuote(rawData);
      if (quote) callback(quote);
    });
  }

  unsubscribeQuote(symbol: string, callback?: (quote: SinaQuote) => void): void {
    const channel = `CN:quote:${symbol}`;
    this.ws.unsubscribe(channel, callback as any);
  }

  private parseQuote(rawData: string): SinaQuote | null {
    try {
      const match = rawData.match(/var hq_str_(.+?)="(.+?)"/);
      if (!match) return null;
      const [, symbolWithPrefix, dataStr] = match;
      const fields = dataStr.split(",");
      if (fields.length < 32) return null;
      const symbol = symbolWithPrefix.replace(/^(sh|sz)/, "");
      return {
        symbol,
        name: fields[0],
        open: parseFloat(fields[1]) || 0,
        preClose: parseFloat(fields[2]) || 0,
        price: parseFloat(fields[3]) || 0,
        high: parseFloat(fields[4]) || 0,
        low: parseFloat(fields[5]) || 0,
        change: parseFloat(fields[3]) - parseFloat(fields[2]),
        changePercent: ((parseFloat(fields[3]) - parseFloat(fields[2])) / parseFloat(fields[2])) * 100,
        volume: parseFloat(fields[8]) || 0,
        amount: parseFloat(fields[9]) || 0,
        time: fields[31],
        bid: [
          { price: parseFloat(fields[11]) || 0, volume: parseFloat(fields[10]) || 0 },
          { price: parseFloat(fields[13]) || 0, volume: parseFloat(fields[12]) || 0 },
          { price: parseFloat(fields[15]) || 0, volume: parseFloat(fields[14]) || 0 },
          { price: parseFloat(fields[17]) || 0, volume: parseFloat(fields[16]) || 0 },
          { price: parseFloat(fields[19]) || 0, volume: parseFloat(fields[18]) || 0 },
        ],
        ask: [
          { price: parseFloat(fields[21]) || 0, volume: parseFloat(fields[20]) || 0 },
          { price: parseFloat(fields[23]) || 0, volume: parseFloat(fields[22]) || 0 },
          { price: parseFloat(fields[25]) || 0, volume: parseFloat(fields[24]) || 0 },
          { price: parseFloat(fields[27]) || 0, volume: parseFloat(fields[26]) || 0 },
          { price: parseFloat(fields[29]) || 0, volume: parseFloat(fields[28]) || 0 },
        ],
      };
    } catch (error) {
      console.error("[Sina] Failed to parse quote:", error);
      return null;
    }
  }

  private toSinaSymbol(symbol: string): string {
    if (/^[46]/.test(symbol)) return `bj${symbol}`;
    if (/^6/.test(symbol)) return `sh${symbol}`;
    return `sz${symbol}`;
  }

  disconnect(): void {
    this.ws.disconnect();
  }

  getState() {
    return this.ws.getState();
  }

  getStats() {
    return this.ws.getStats();
  }
}

export const sinaWS = new SinaWebSocketManager();
