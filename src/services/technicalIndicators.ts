/**
 * 技术指标计算引擎
 * 包含常用技术分析指标：MA, EMA, MACD, RSI, BOLL, KDJ, ATR等
 */

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MAResult {
  timestamp: number;
  value: number;
}

export interface MACDResult {
  timestamp: number;
  dif: number;
  dea: number;
  macd: number;
}

export interface RSIResult {
  timestamp: number;
  value: number;
}

export interface BOLLResult {
  timestamp: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface KDJResult {
  timestamp: number;
  k: number;
  d: number;
  j: number;
}

/**
 * 简单移动平均线 (SMA)
 */
export function calculateMA(data: number[], period: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result.push(sum / period);
  }
  
  return result;
}

/**
 * 指数移动平均线 (EMA)
 */
export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  let ema = data[0];
  result.push(ema);
  
  for (let i = 1; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    result.push(ema);
  }
  
  return result;
}

/**
 * MACD (移动平均收敛/发散指标)
 */
export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult[] {
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  
  const dif = emaFast.map((fast, i) => fast - emaSlow[i]);
  const dea = calculateEMA(dif, signalPeriod);
  const macd = dif.map((d, i) => (d - dea[i]) * 2);
  
  return dif.map((_, i) => ({
    timestamp: i,
    dif: dif[i],
    dea: dea[i],
    macd: macd[i],
  }));
}

/**
 * RSI (相对强弱指标)
 */
export function calculateRSI(closes: number[], period = 14): RSIResult[] {
  const result: RSIResult[] = [];
  const changes: number[] = [];
  
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push({ timestamp: i, value: NaN });
      continue;
    }
    
    let gains = 0;
    let losses = 0;
    
    for (let j = i - period; j < i; j++) {
      const change = changes[j - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    result.push({ timestamp: i, value: rsi });
  }
  
  return result;
}

/**
 * 布林带 (Bollinger Bands)
 */
export function calculateBOLL(closes: number[], period = 20, multiplier = 2): BOLLResult[] {
  const result: BOLLResult[] = [];
  const ma = calculateMA(closes, period);
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push({
        timestamp: i,
        upper: NaN,
        middle: NaN,
        lower: NaN,
      });
      continue;
    }
    
    // 计算标准差
    let sumSquaredDiff = 0;
    for (let j = 0; j < period; j++) {
      const diff = closes[i - j] - ma[i];
      sumSquaredDiff += diff * diff;
    }
    const stdDev = Math.sqrt(sumSquaredDiff / period);
    
    result.push({
      timestamp: i,
      upper: ma[i] + multiplier * stdDev,
      middle: ma[i],
      lower: ma[i] - multiplier * stdDev,
    });
  }
  
  return result;
}

/**
 * KDJ 指标
 */
export function calculateKDJ(candles: Candle[], period = 9, m1 = 3, m2 = 3): KDJResult[] {
  const result: KDJResult[] = [];
  let k = 50;
  let d = 50;
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push({ timestamp: i, k: NaN, d: NaN, j: NaN });
      continue;
    }
    
    // 计算最近N天的最高价和最低价
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    
    for (let j = 0; j < period; j++) {
      const candle = candles[i - j];
      highestHigh = Math.max(highestHigh, candle.high);
      lowestLow = Math.min(lowestLow, candle.low);
    }
    
    // RSV (未成熟随机值)
    const rsv = ((candles[i].close - lowestLow) / (highestHigh - lowestLow)) * 100;
    
    // K值
    k = (rsv + (m1 - 1) * k) / m1;
    
    // D值
    d = (k + (m2 - 1) * d) / m2;
    
    // J值
    const j = 3 * k - 2 * d;
    
    result.push({ timestamp: i, k, d, j });
  }
  
  return result;
}

/**
 * ATR (平均真实波幅)
 */
export function calculateATR(candles: Candle[], period = 14): number[] {
  const result: number[] = [];
  const trueRanges: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
      continue;
    }
    
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    
    trueRanges.push(tr);
  }
  
  return calculateEMA(trueRanges, period);
}

/**
 * 成交量加权平均价 (VWAP)
 */
export function calculateVWAP(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0; // 累计典型价格×成交量
  let cumulativeVolume = 0; // 累计成交量
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    
    result.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0);
  }
  
  return result;
}

/**
 * 成交量比率 (Volume Ratio)
 */
export function calculateVolumeRatio(volumes: number[], period = 5): number[] {
  const result: number[] = [];
  const ma = calculateMA(volumes, period);
  
  for (let i = 0; i < volumes.length; i++) {
    if (isNaN(ma[i]) || ma[i] === 0) {
      result.push(NaN);
    } else {
      result.push(volumes[i] / ma[i]);
    }
  }
  
  return result;
}

/**
 * 识别金叉/死叉
 */
export function detectCrossover(fast: number[], slow: number[]): Array<'golden' | 'death' | null> {
  const result: Array<'golden' | 'death' | null> = [];
  
  for (let i = 0; i < fast.length; i++) {
    if (i === 0 || isNaN(fast[i]) || isNaN(slow[i]) || isNaN(fast[i - 1]) || isNaN(slow[i - 1])) {
      result.push(null);
      continue;
    }
    
    const prevFast = fast[i - 1];
    const prevSlow = slow[i - 1];
    const currFast = fast[i];
    const currSlow = slow[i];
    
    // 金叉：快线从下方穿越慢线
    if (prevFast < prevSlow && currFast > currSlow) {
      result.push('golden');
    }
    // 死叉：快线从上方穿越慢线
    else if (prevFast > prevSlow && currFast < currSlow) {
      result.push('death');
    }
    else {
      result.push(null);
    }
  }
  
  return result;
}

/**
 * 趋势强度判断
 */
export function calculateTrendStrength(closes: number[], period = 20): Array<'strong_up' | 'up' | 'sideways' | 'down' | 'strong_down'> {
  const result: Array<'strong_up' | 'up' | 'sideways' | 'down' | 'strong_down'> = [];
  const ma = calculateMA(closes, period);
  
  for (let i = 1; i < closes.length; i++) {
    if (isNaN(ma[i]) || isNaN(ma[i - 1])) {
      result.push('sideways');
      continue;
    }
    
    const maChange = ((ma[i] - ma[i - 1]) / ma[i - 1]) * 100;
    const priceVsMa = ((closes[i] - ma[i]) / ma[i]) * 100;
    
    if (maChange > 0.5 && priceVsMa > 2) {
      result.push('strong_up');
    } else if (maChange > 0.2 || priceVsMa > 0) {
      result.push('up');
    } else if (maChange < -0.5 && priceVsMa < -2) {
      result.push('strong_down');
    } else if (maChange < -0.2 || priceVsMa < 0) {
      result.push('down');
    } else {
      result.push('sideways');
    }
  }
  
  return result;
}
