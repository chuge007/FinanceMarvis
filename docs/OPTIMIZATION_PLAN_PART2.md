# StrategyLab 专业投资信息系统优化方案 (Part 2/3)

## 五、Phase 2 详细方案 - 专业分析工具

### 5.1 深度技术分析模块

#### 5.1.1 多周期K线图

**功能清单**:
- 支持周期: 1分钟、5分钟、15分钟、30分钟、1小时、4小时、日线、周线、月线
- 主图指标: MA(5/10/20/60)、EMA、BOLL、SAR
- 副图指标: MACD、RSI、KDJ、OBV、ATR、CCI
- 叠加对比: 可同时显示多个品种对比

**实现示例**:

```typescript
// src/modules/technical/components/TechnicalChart.tsx
import { createChart, IChartApi } from 'lightweight-charts';

export const TechnicalChart = memo(function TechnicalChart({
  symbol,
  market,
  interval
}: TechnicalChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  
  useEffect(() => {
    if (!chartRef.current) return;
    
    chart.current = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 600,
      layout: {
        background: { color: '#090b0f' },
        textColor: '#b0b5c0',
      },
      grid: {
        vertLines: { color: '#1a1d26' },
        horzLines: { color: '#1a1d26' },
      },
      crosshair: { mode: 1 },
      timeScale: {
        borderColor: '#1a1d26',
        timeVisible: true,
      },
    });
    
    // 主图K线
    const candleSeries = chart.current.addCandlestickSeries({
      upColor: '#0ca678',
      downColor: '#e06c75',
      wickUpColor: '#0ca678',
      wickDownColor: '#e06c75',
    });
    
    // 加载数据
    marketDB.getCandles(market, symbol, interval, startTime, endTime)
      .then(candles => {
        candleSeries.setData(candles.map(c => ({
          time: c.timestamp / 1000,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })));
      });
    
    // 添加MA20
    const ma20Series = chart.current.addLineSeries({
      color: '#f7d44c',
      lineWidth: 2,
      title: 'MA20',
    });
    
    // 副图MACD
    const macdHistogram = chart.current.addHistogramSeries({
      color: '#4078ff',
      priceFormat: { type: 'volume' },
      priceScaleId: 'macd',
    });
    
    // 实时更新
    marketWS.subscribe(`${market}:kline:${symbol}:${interval}`, (kline) => {
      candleSeries.update({
        time: kline.timestamp / 1000,
        open: kline.open,
        high: kline.high,
        low: kline.low,
        close: kline.close,
      });
    });
    
    return () => {
      chart.current?.remove();
      marketWS.unsubscribe(`${market}:kline:${symbol}:${interval}`);
    };
  }, [symbol, market, interval]);
  
  return (
    <div className="relative">
      <div ref={chartRef} />
      
      {/* 工具栏 */}
      <div className="absolute top-2 left-2 flex gap-2 flex-wrap">
        <select className="px-2 py-1 bg-[#0f1118] rounded text-[11px]">
          <option>1分钟</option>
          <option>5分钟</option>
          <option>15分钟</option>
          <option>1小时</option>
          <option selected>日线</option>
        </select>
        
        <button className="px-2 py-1 bg-[#0f1118] rounded text-[11px]">
          指标
        </button>
        <button className="px-2 py-1 bg-[#0f1118] rounded text-[11px]">
          画线工具
        </button>
        <button className="px-2 py-1 bg-[#0f1118] rounded text-[11px]">
          形态识别
        </button>
      </div>
    </div>
  );
});
```

#### 5.1.2 形态识别引擎

**识别的形态**:

**经典形态**:
- 头肩顶/底 (Head and Shoulders)
- 双顶/底 (Double Top/Bottom)
- 三角形 (Triangle)
- 楔形 (Wedge)
- 旗形/三角旗 (Flag/Pennant)
- 通道 (Channel)

**K线形态**:
- 十字星 (Doji)
- 锤子线/吊颈线 (Hammer/Hanging Man)
- 吞没形态 (Engulfing)
- 晨星/暮星 (Morning/Evening Star)
- 三只乌鸦/三只白兵 (Three Crows/Soldiers)

```typescript
// src/services/patternRecognition.ts
import { detectEngulfingPattern, detectDojiStar } from 'technicalindicators';

interface Pattern {
  type: string;
  name: string;
  confidence: number; // 0-1
  startIndex: number;
  endIndex: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  description: string;
}

export class PatternRecognition {
  detectPatterns(candles: CandleData[]): Pattern[] {
    const patterns: Pattern[] = [];
    
    // 检测吞没形态
    const engulfing = this.detectEngulfing(candles);
    patterns.push(...engulfing);
    
    // 检测十字星
    const doji = this.detectDoji(candles);
    patterns.push(...doji);
    
    // 检测头肩顶
    const headShoulder = this.detectHeadAndShoulders(candles);
    patterns.push(...headShoulder);
    
    return patterns;
  }
  
  private detectEngulfing(candles: CandleData[]): Pattern[] {
    const patterns: Pattern[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];
      
      const prevBody = Math.abs(prev.close - prev.open);
      const currBody = Math.abs(curr.close - curr.open);
      
      // 看涨吞没
      if (
        prev.close < prev.open && // 前一根阴线
        curr.close > curr.open && // 当前阳线
        curr.open < prev.close && // 开盘低于前收
        curr.close > prev.open && // 收盘高于前开
        currBody > prevBody * 1.2 // 实体明显更大
      ) {
        patterns.push({
          type: 'engulfing',
          name: '看涨吞没',
          confidence: 0.8,
          startIndex: i - 1,
          endIndex: i,
          direction: 'bullish',
          description: '前阴后阳，阳线实体完全吞没阴线，强烈看涨信号',
        });
      }
      
      // 看跌吞没
      if (
        prev.close > prev.open &&
        curr.close < curr.open &&
        curr.open > prev.close &&
        curr.close < prev.open &&
        currBody > prevBody * 1.2
      ) {
        patterns.push({
          type: 'engulfing',
          name: '看跌吞没',
          confidence: 0.8,
          startIndex: i - 1,
          endIndex: i,
          direction: 'bearish',
          description: '前阳后阴，阴线实体完全吞没阳线，强烈看跌信号',
        });
      }
    }
    
    return patterns;
  }
  
  private detectHeadAndShoulders(candles: CandleData[]): Pattern[] {
    // 简化版头肩顶识别
    const patterns: Pattern[] = [];
    const window = 60; // 60根K线窗口
    
    if (candles.length < window) return patterns;
    
    for (let i = window; i < candles.length; i++) {
      const slice = candles.slice(i - window, i);
      const peaks = this.findPeaks(slice);
      
      if (peaks.length >= 3) {
        const [left, head, right] = peaks.slice(0, 3);
        
        // 头肩顶特征：左肩 < 头部 > 右肩，且左右肩高度相近
        if (
          head.value > left.value &&
          head.value > right.value &&
          Math.abs(left.value - right.value) / left.value < 0.05
        ) {
          patterns.push({
            type: 'head_and_shoulders',
            name: '头肩顶',
            confidence: 0.7,
            startIndex: i - window + left.index,
            endIndex: i - window + right.index,
            direction: 'bearish',
            description: '顶部反转形态，预示趋势可能转弱',
          });
        }
      }
    }
    
    return patterns;
  }
  
  private findPeaks(candles: CandleData[]): Array<{index: number; value: number}> {
    const peaks: Array<{index: number; value: number}> = [];
    
    for (let i = 2; i < candles.length - 2; i++) {
      if (
        candles[i].high > candles[i - 1].high &&
        candles[i].high > candles[i - 2].high &&
        candles[i].high > candles[i + 1].high &&
        candles[i].high > candles[i + 2].high
      ) {
        peaks.push({ index: i, value: candles[i].high });
      }
    }
    
    return peaks;
  }
}

export const patternRecognition = new PatternRecognition();
```

#### 5.1.3 量价分析

**Volume Profile (成交量分布)**:

```typescript
// src/modules/technical/components/VolumeProfile.tsx
export const VolumeProfile = memo(function VolumeProfile({
  candles
}: {
  candles: CandleData[];
}) {
  const profile = useMemo(() => {
    // 按价格区间统计成交量
    const priceRange = {
      min: Math.min(...candles.map(c => c.low)),
      max: Math.max(...candles.map(c => c.high)),
    };
    
    const bins = 50; // 50个价格区间
    const binSize = (priceRange.max - priceRange.min) / bins;
    const volumeByPrice = new Array(bins).fill(0);
    
    candles.forEach(candle => {
      const avgPrice = (candle.high + candle.low) / 2;
      const binIndex = Math.floor((avgPrice - priceRange.min) / binSize);
      if (binIndex >= 0 && binIndex < bins) {
        volumeByPrice[binIndex] += candle.volume;
      }
    });
    
    const maxVolume = Math.max(...volumeByPrice);
    
    return volumeByPrice.map((vol, i) => ({
      price: priceRange.min + (i + 0.5) * binSize,
      volume: vol,
      normalized: vol / maxVolume,
    }));
  }, [candles]);
  
  return (
    <svg width="200" height="400" viewBox="0 0 200 400">
      {profile.map((bar, i) => (
        <rect
          key={i}
          x="0"
          y={i * (400 / profile.length)}
          width={bar.normalized * 180}
          height={400 / profile.length}
          fill="#4078ff"
          opacity="0.6"
        />
      ))}
    </svg>
  );
});
```

### 5.2 板块轮动分析模块

#### 5.2.1 板块强弱矩阵

```typescript
// src/modules/sector/components/SectorRotationMatrix.tsx
export const SectorRotationMatrix = memo(function SectorRotationMatrix() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  
  useEffect(() => {
    // 获取所有板块数据
    fetchSectorPerformance().then(data => {
      // 计算相对强度和动量
      const processed = data.map(sector => ({
        ...sector,
        relativeStrength: sector.change_pct - benchmarkChange,
        momentum: calculateMomentum(sector.history),
      }));
      setSectors(processed);
    });
  }, []);
  
  // 象限定义
  const quadrants = [
    { 
      name: '领先', 
      color: '#0ca678', 
      range: { x: [0, 100], y: [0, 100] },
      description: '相对强势且上涨动量强，优先配置'
    },
    { 
      name: '改善', 
      color: '#4078ff', 
      range: { x: [-100, 0], y: [0, 100] },
      description: '相对弱势但动量转正，关注反转机会'
    },
    { 
      name: '落后', 
      color: '#636878', 
      range: { x: [-100, 0], y: [-100, 0] },
      description: '相对弱势且下跌动量，规避'
    },
    { 
      name: '疲弱', 
      color: '#e06c75', 
      range: { x: [0, 100], y: [-100, 0] },
      description: '相对强势但动量转弱，考虑减仓'
    },
  ];
  
  return (
    <div className="bg-[#0f1118] p-4 rounded">
      <h3 className="text-[13px] font-bold mb-3">板块轮动矩阵</h3>
      
      <svg width="600" height="600" viewBox="-120 -120 240 240">
        {/* 坐标轴 */}
        <line x1="-100" y1="0" x2="100" y2="0" 
          stroke="#1a1d26" strokeWidth="1" />
        <line x1="0" y1="-100" x2="0" y2="100" 
          stroke="#1a1d26" strokeWidth="1" />
        
        {/* 象限背景 */}
        {quadrants.map(q => (
          <g key={q.name}>
            <rect
              x={q.range.x[0]}
              y={q.range.y[0]}
              width={q.range.x[1] - q.range.x[0]}
              height={q.range.y[1] - q.range.y[0]}
              fill={q.color}
              opacity="0.05"
            />
            <text
              x={(q.range.x[0] + q.range.x[1]) / 2}
              y={(q.range.y[0] + q.range.y[1]) / 2}
              textAnchor="middle"
              fill="#636878"
              fontSize="12"
            >
              {q.name}
            </text>
          </g>
        ))}
        
        {/* 板块气泡 */}
        {sectors.map(sector => (
          <g 
            key={sector.id} 
            transform={`translate(${sector.relativeStrength}, ${sector.momentum})`}
          >
            <circle
              r={Math.sqrt(sector.marketCap / 1e9) * 2}
              fill={sector.color}
              opacity="0.7"
              stroke={sector.color}
              strokeWidth="2"
            />
            <text
              y="4"
              textAnchor="middle"
              fill="#d8dce6"
              fontSize="9"
            >
              {sector.name}
            </text>
            <text
              y="15"
              textAnchor="middle"
              fill="#b0b5c0"
              fontSize="8"
            >
              {sector.change_pct > 0 ? '+' : ''}{sector.change_pct.toFixed(1)}%
            </text>
          </g>
        ))}
        
        {/* 坐标轴标签 */}
        <text x="105" y="5" fill="#636878" fontSize="10">
          相对强度
        </text>
        <text x="-5" y="-105" fill="#636878" fontSize="10" textAnchor="end">
          动量
        </text>
      </svg>
      
      {/* 图例 */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        {quadrants.map(q => (
          <div key={q.name} className="flex items-start gap-2">
            <div 
              className="w-3 h-3 rounded-sm mt-0.5" 
              style={{ backgroundColor: q.color }}
            />
            <div>
              <div className="font-medium text-[#d8dce6]">{q.name}</div>
              <div className="text-[#636878]">{q.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
```

#### 5.2.2 资金流向热力图

```typescript
// src/modules/sector/components/MoneyFlowHeatmap.tsx
export const MoneyFlowHeatmap = memo(function MoneyFlowHeatmap() {
  const [flowData, setFlowData] = useState<SectorFlow[]>([]);
  
  return (
    <div className="bg-[#0f1118] p-4 rounded">
      <h3 className="text-[13px] font-bold mb-3">板块资金流向 (实时)</h3>
      
      <div className="grid grid-cols-5 gap-1">
        {flowData.map(sector => {
          const intensity = Math.abs(sector.net_inflow) / sector.total_volume;
          const color = sector.net_inflow > 0 
            ? `rgba(12, 166, 120, ${intensity})` 
            : `rgba(224, 108, 117, ${intensity})`;
          
          return (
            <div
              key={sector.id}
              className="aspect-square flex flex-col items-center justify-center p-2 rounded cursor-pointer hover:opacity-80"
              style={{ backgroundColor: color }}
              title={`净流入: ${(sector.net_inflow / 1e8).toFixed(2)}亿`}
            >
              <div className="text-[11px] font-medium text-white">
                {sector.name}
              </div>
              <div className="text-[10px] text-white/80">
                {sector.net_inflow > 0 ? '+' : ''}
                {(sector.net_inflow / 1e8).toFixed(1)}亿
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-3 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#e06c75] rounded"></div>
          <span className="text-[#636878]">资金流出</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#0ca678] rounded"></div>
          <span className="text-[#636878]">资金流入</span>
        </div>
      </div>
    </div>
  );
});
```

### 5.3 相关性分析模块

```typescript
// src/modules/correlation/CorrelationMatrix.tsx
export const CorrelationMatrix = memo(function CorrelationMatrix({
  symbols
}: {
  symbols: string[];
}) {
  const [matrix, setMatrix] = useState<number[][]>([]);
  
  useEffect(() => {
    // 获取所有标的的历史价格
    Promise.all(
      symbols.map(symbol => 
        marketDB.getCandles('CN', symbol, '1d', startTime, endTime)
      )
    ).then(allCandles => {
      // 计算相关系数矩阵
      const returns = allCandles.map(candles => 
        candles.map((c, i) => 
          i === 0 ? 0 : (c.close - candles[i-1].close) / candles[i-1].close
        ).slice(1)
      );
      
      const correlationMatrix = symbols.map((_, i) => 
        symbols.map((_, j) => 
          calculateCorrelation(returns[i], returns[j])
        )
      );
      
      setMatrix(correlationMatrix);
    });
  }, [symbols]);
  
  return (
    <div className="bg-[#0f1118] p-4 rounded">
      <h3 className="text-[13px] font-bold mb-3">相关性矩阵</h3>
      
      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th></th>
            {symbols.map(symbol => (
              <th key={symbol} className="px-2 py-1">{symbol}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={symbols[i]}>
              <td className="font-medium px-2 py-1">{symbols[i]}</td>
              {row.map((corr, j) => {
                const color = corr > 0 
                  ? `rgba(12, 166, 120, ${corr})` 
                  : `rgba(224, 108, 117, ${Math.abs(corr)})`;
                
                return (
                  <td 
                    key={j} 
                    className="text-center px-2 py-1"
                    style={{ backgroundColor: color }}
                  >
                    {corr.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      
      <div className="mt-3 text-[10px] text-[#636878]">
        说明：1.0 = 完全正相关，-1.0 = 完全负相关，0 = 无相关
      </div>
    </div>
  );
});

function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  const meanX = x.slice(0, n).reduce((a, b) => a + b) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b) / n;
  
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  
  return num / Math.sqrt(denX * denY);
}
```

---

## 六、Phase 3 详细方案 - 交易执行与智能化

### 6.1 模拟交易系统

```typescript
// src/modules/trading/PaperTrading.tsx
interface Order {
  id: number;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  quantity: number;
  price?: number;
  status: 'pending' | 'filled' | 'cancelled';
  filled_qty: number;
  filled_price: number;
  created_at: string;
  filled_at?: string;
}

export class PaperTradingEngine {
  private orders: Order[] = [];
  private positions: Map<string, Position> = new Map();
  private cash = 1000000; // 初始100万
  
  placeOrder(order: Omit<Order, 'id' | 'status' | 'filled_qty' | 'filled_price' | 'created_at'>) {
    const newOrder: Order = {
      ...order,
      id: Date.now(),
      status: 'pending',
      filled_qty: 0,
      filled_price: 0,
      created_at: new Date().toISOString(),
    };
    
    this.orders.push(newOrder);
    
    // 市价单立即成交
    if (order.type === 'market') {
      this.fillOrder(newOrder.id, order.quantity, this.getCurrentPrice(order.symbol));
    }
    
    return newOrder;
  }
  
  private fillOrder(orderId: number, quantity: number, price: number) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;
    
    order.status = 'filled';
    order.filled_qty = quantity;
    order.filled_price = price;
    order.filled_at = new Date().toISOString();
    
    // 更新持仓
    this.updatePosition(order);
    
    // 更新现金
    const cost = quantity * price;
    this.cash += order.side === 'buy' ? -cost : cost;
  }
  
  private updatePosition(order: Order) {
    const key = order.symbol;
    const existing = this.positions.get(key);
    
    if (!existing) {
      this.positions.set(key, {
        symbol: order.symbol,
        quantity: order.side === 'buy' ? order.filled_qty : -order.filled_qty,
        avg_cost: order.filled_price,
      });
    } else {
      // 更新平均成本和数量
      const newQty = existing.quantity + 
        (order.side === 'buy' ? order.filled_qty : -order.filled_qty);
      
      if (newQty === 0) {
        this.positions.delete(key);
      } else {
        const totalCost = existing.avg_cost * existing.quantity + 
          order.filled_price * (order.side === 'buy' ? order.filled_qty : -order.filled_qty);
        existing.quantity = newQty;
        existing.avg_cost = totalCost / newQty;
      }
    }
  }
  
  checkLimitOrders() {
    // 检查限价单是否触发
    const pendingLimits = this.orders.filter(
      o => o.status === 'pending' && o.type === 'limit'
    );
    
    pendingLimits.forEach(order => {
      const currentPrice = this.getCurrentPrice(order.symbol);
      
      if (
        (order.side === 'buy' && currentPrice <= order.price!) ||
        (order.side === 'sell' && currentPrice >= order.price!)
      ) {
        this.fillOrder(order.id, order.quantity, order.price!);
      }
    });
  }
  
  private getCurrentPrice(symbol: string): number {
    // 从实时行情获取
    return 0; // placeholder
  }
}
```

### 6.2 AI辅助决策

```typescript
// src/services/aiAnalysis.ts
interface MarketContext {
  symbol: string;
  candles: CandleData[];
  indicators: {
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    ma20: number;
    ma60: number;
  };
  patterns: Pattern[];
  sentiment: number; // -1 to 1
  news: NewsItem[];
}

export class AIMarketAnalyzer {
  async analyze(context: MarketContext): Promise<{
    signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
    confidence: number;
    reasoning: string[];
    risk_level: 'low' | 'medium' | 'high';
    suggested_action: string;
  }> {
    // 调用GPT-4进行分析
    const prompt = this.buildPrompt(context);
    
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    
    const result = await response.json();
    return result;
  }
  
  private buildPrompt(context: MarketContext): string {
    return `
作为专业的量化分析师，请分析以下市场数据并给出交易建议：

标的: ${context.symbol}

技术指标:
- RSI: ${context.indicators.rsi.toFixed(2)}
- MACD: ${context.indicators.macd.value.toFixed(2)} (信号线: ${context.indicators.macd.signal.toFixed(2)})
- MA20: ${context.indicators.ma20.toFixed(2)}
- MA60: ${context.indicators.ma60.toFixed(2)}

识别到的形态:
${context.patterns.map(p => `- ${p.name} (置信度: ${(p.confidence * 100).toFixed(0)}%)`).join('\n')}

市场情绪: ${context.sentiment > 0 ? '乐观' : context.sentiment < 0 ? '悲观' : '中性'} (${context.sentiment.toFixed(2)})

近期新闻:
${context.news.slice(0, 3).map(n => `- ${n.title}`).join('\n')}

请提供：
1. 交易信号 (strong_buy/buy/hold/sell/strong_sell)
2. 置信度 (0-1)
3. 理由 (3-5条要点)
4. 风险等级 (low/medium/high)
5. 建议的具体操作

以JSON格式返回。
    `.trim();
  }
}
```

---

## 七、用户界面优化

### 7.1 多窗口布局

```typescript
// src/services/multiWindow.ts
class MultiWindowManager {
  private windows = new Map<string, Window>();
  private channel = new BroadcastChannel('marvis-sync');
  
  constructor() {
    this.channel.onmessage = this.handleMessage.bind(this);
  }
  
  openWindow(layout: 'portfolio' | 'technical' | 'alerts' | 'watchlist') {
    const configs = {
      portfolio: { 
        width: 1200, 
        height: 800, 
        url: '/portfolio',
        title: '持仓监控' 
      },
      technical: { 
        width: 1600, 
        height: 900, 
        url: '/technical',
        title: '技术分析' 
      },
      alerts: { 
        width: 400, 
        height: 600, 
        url: '/alerts',
        title: '预警中心' 
      },
      watchlist: { 
        width: 300, 
        height: 800, 
        url: '/watchlist',
        title: '自选股' 
      },
    };
    
    const config = configs[layout];
    const win = window.open(
      config.url,
      `marvis-${layout}`,
      `width=${config.width},height=${config.height},menubar=no,toolbar=no,location=no`
    );
    
    if (win) {
      win.document.title = `StrategyLab - ${config.title}`;
      this.windows.set(layout, win);
    }
  }
  
  broadcast(message: { type: string; data: any }) {
    this.channel.postMessage(message);
  }
  
  private handleMessage(event: MessageEvent) {
    const { type, data } = event.data;
    
    switch (type) {
      case 'quote-update':
        // 所有窗口同步更新行情
        window.dispatchEvent(new CustomEvent('quote-update', { detail: data }));
        break;
        
      case 'alert-triggered':
        // 所有窗口显示预警
        window.dispatchEvent(new CustomEvent('alert', { detail: data }));
        break;
    }
  }
}

export const multiWindow = new MultiWindowManager();
```

### 7.2 快捷键系统

```typescript
// src/hooks/useHotkeys.ts
export const HOTKEY_MAP = {
  // 导航
  'Ctrl+1': { action: 'go-rhythm', description: '切换到节奏总览' },
  'Ctrl+2': { action: 'go-macro', description: '切换到宏观' },
  'Ctrl+3': { action: 'go-strategy', description: '切换到策略' },
  'Ctrl+4': { action: 'go-fundflow', description: '切换到资金流' },
  'Ctrl+5': { action: 'go-sentiment', description: '切换到情绪' },
  'Ctrl+6': { action: 'go-discipline', description: '切换到纪律' },
  'Ctrl+7': { action: 'go-portfolio', description: '切换到持仓' },
  'Ctrl+8': { action: 'go-technical', description: '切换到技术分析' },
  
  // 功能
  'Ctrl+F': { action: 'search', description: '快速搜索股票' },
  'Ctrl+Space': { action: 'command-palette', description: '打开命令面板' },
  'Ctrl+Shift+A': { action: 'alerts', description: '打开预警管理' },
  'Ctrl+Shift+P': { action: 'portfolio', description: '打开持仓详情' },
  'Ctrl+Shift+T': { action: 'trade', description: '快速下单' },
  
  // 视图
  'F11': { action: 'fullscreen', description: '全屏' },
  'F5': { action: 'refresh', description: '刷新数据' },
  'Esc': { action: 'close-modal', description: '关闭弹窗' },
  
  // 操作
  '/': { action: 'focus-search', description: '聚焦搜索框' },
  '?': { action: 'show-help', description: '显示帮助' },
};

export function useHotkeys() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = [
        e.ctrlKey && 'Ctrl',
        e.shiftKey && 'Shift',
        e.altKey && 'Alt',
        e.key,
      ].filter(Boolean).join('+');
      
      const binding = HOTKEY_MAP[key as keyof typeof HOTKEY_MAP];
      
      if (binding) {
        e.preventDefault();
        handleAction(binding.action);
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

function handleAction(action: string) {
  const actions: Record<string, () => void> = {
    'go-rhythm': () => useAppStore.getState().setTab('rhythm'),
    'search': () => openSearchModal(),
    'refresh': () => window.location.reload(),
    // ... 其他操作
  };
  
  actions[action]?.();
}
```

### 7.3 自定义仪表盘

```typescript
// src/modules/dashboard/CustomDashboard.tsx
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const AVAILABLE_WIDGETS = [
  { id: 'market-overview', name: '市场总览', component: MarketOverviewWidget },
  { id: 'watchlist', name: '自选股', component: WatchlistWidget },
  { id: 'portfolio', name: '持仓概览', component: PortfolioWidget },
  { id: 'alerts', name: '活跃预警', component: AlertsWidget },
  { id: 'news', name: '新闻快讯', component: NewsWidget },
  { id: 'chart', name: '实时图表', component: ChartWidget },
  { id: 'sector-heat', name: '板块热力', component: SectorHeatWidget },
  { id: 'top-movers', name: '涨跌排行', component: TopMoversWidget },
];

export const CustomDashboard = memo(function CustomDashboard() {
  const [layouts, setLayouts] = useState<Layouts>(
    loadLayouts() || getDefaultLayouts()
  );
  const [widgets, setWidgets] = useState<string[]>(
    loadWidgets() || ['market-overview', 'watchlist', 'portfolio', 'alerts']
  );
  
  const handleLayoutChange = (layout: Layout[], layouts: Layouts) => {
    setLayouts(layouts);
    saveLayouts(layouts);
  };
  
  const addWidget = (widgetId: string) => {
    if (!widgets.includes(widgetId)) {
      setWidgets([...widgets, widgetId]);
      saveWidgets([...widgets, widgetId]);
    }
  };
  
  return (
    <div className="p-3">
      <div className="flex justify-between mb-3">
        <h2 className="text-[15px] font-bold">我的仪表盘</h2>
        <div className="flex gap-2">
          <select 
            className="px-2 py-1 bg-[#0f1118] rounded text-[11px]"
            onChange={(e) => addWidget(e.target.value)}
            value=""
          >
            <option value="">+ 添加组件</option>
            {AVAILABLE_WIDGETS.filter(w => !widgets.includes(w.id)).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button 
            className="px-2 py-1 bg-[#0f1118] rounded text-[11px]"
            onClick={() => {
              setLayouts(getDefaultLayouts());
              setWidgets(['market-overview', 'watchlist', 'portfolio', 'alerts']);
            }}
          >
            重置布局
          </button>
        </div>
      </div>
      
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={80}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".drag-handle"
      >
        {widgets.map(widgetId => {
          const widget = AVAILABLE_WIDGETS.find(w => w.id === widgetId);
          if (!widget) return null;
          
          const Component = widget.component;
          
          return (
            <div 
              key={widgetId} 
              className="bg-[#0f1118] border border-[#1a1d26] rounded overflow-hidden"
            >
              <div className="flex items-center justify-between p-2 border-b border-[#1a1d26] drag-handle cursor-move">
                <span className="text-[11px] font-medium">{widget.name}</span>
                <button 
                  className="text-[#636878] hover:text-[#e06c75]"
                  onClick={() => {
                    const newWidgets = widgets.filter(w => w !== widgetId);
                    setWidgets(newWidgets);
                    saveWidgets(newWidgets);
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="p-2">
                <Component />
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
});
```

---

**文档版本**: v1.0  
**最后更新**: 2026-11-17  
**下一部分**: Part 3 - 性能优化、成本估算、实施路线图
