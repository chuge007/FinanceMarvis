import React, { useState, useEffect, useMemo } from 'react';
import { createChart } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { calculateMA, calculateMACD, calculateRSI, calculateBOLL, calculateKDJ } from '../../services/technicalIndicators';
import type { Candle } from '../../services/technicalIndicators';
import { fetchStockCandles } from '../../services/api';
import { useAppStore } from '../../stores/useAppStore';
import { DemoBanner } from '../../shared/components/DemoBanner';

interface TechnicalChartProps {
  symbol: string;
  candles: Candle[];
}

const IndicatorPanel: React.FC<{ candles: Candle[] }> = ({ candles }) => {
  const [selectedIndicator, setSelectedIndicator] = useState<'MA' | 'MACD' | 'RSI' | 'BOLL' | 'KDJ'>('MA');
  
  const indicators = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    
    const closes = candles.map(c => c.close);
    
    return {
      ma5: calculateMA(closes, 5),
      ma10: calculateMA(closes, 10),
      ma20: calculateMA(closes, 20),
      ma60: calculateMA(closes, 60),
      macd: calculateMACD(closes),
      rsi: calculateRSI(closes, 14),
      boll: calculateBOLL(closes, 20, 2),
      kdj: calculateKDJ(candles, 9),
    };
  }, [candles]);

  if (!indicators) return null;

  const latest = {
    ma5: indicators.ma5[indicators.ma5.length - 1],
    ma10: indicators.ma10[indicators.ma10.length - 1],
    ma20: indicators.ma20[indicators.ma20.length - 1],
    ma60: indicators.ma60[indicators.ma60.length - 1],
    macd: indicators.macd[indicators.macd.length - 1],
    rsi: indicators.rsi[indicators.rsi.length - 1],
    boll: indicators.boll[indicators.boll.length - 1],
    kdj: indicators.kdj[indicators.kdj.length - 1],
  };

  const currentPrice = candles[candles.length - 1]?.close || 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* MA 均线 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500 mb-2">移动平均线</div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-blue-500">MA5:</span>
            <span className="font-medium">{latest.ma5?.toFixed(2) || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-green-500">MA10:</span>
            <span className="font-medium">{latest.ma10?.toFixed(2) || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-orange-500">MA20:</span>
            <span className="font-medium">{latest.ma20?.toFixed(2) || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-purple-500">MA60:</span>
            <span className="font-medium">{latest.ma60?.toFixed(2) || '-'}</span>
          </div>
        </div>
      </div>

      {/* MACD */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500 mb-2">MACD</div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>DIF:</span>
            <span className={`font-medium ${latest.macd.dif >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {latest.macd.dif.toFixed(3)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>DEA:</span>
            <span className="font-medium">{latest.macd.dea.toFixed(3)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>MACD:</span>
            <span className={`font-medium ${latest.macd.macd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {latest.macd.macd.toFixed(3)}
            </span>
          </div>
          <div className="text-xs mt-2">
            {latest.macd.dif > latest.macd.dea ? (
              <span className="text-green-600">● 多头趋势</span>
            ) : (
              <span className="text-red-600">● 空头趋势</span>
            )}
          </div>
        </div>
      </div>

      {/* RSI */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500 mb-2">RSI 相对强弱</div>
        <div className="space-y-2">
          <div className="text-3xl font-bold">
            {latest.rsi.value?.toFixed(1) || '-'}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                latest.rsi.value > 70 ? 'bg-red-500' : 
                latest.rsi.value < 30 ? 'bg-green-500' : 
                'bg-blue-500'
              }`}
              style={{ width: `${Math.min(latest.rsi.value, 100)}%` }}
            />
          </div>
          <div className="text-xs space-y-1">
            <div className={latest.rsi.value > 70 ? 'text-red-600 font-medium' : 'text-gray-500'}>
              {latest.rsi.value > 70 ? '⚠️ 超买区域' : '超买 >70'}
            </div>
            <div className={latest.rsi.value < 30 ? 'text-green-600 font-medium' : 'text-gray-500'}>
              {latest.rsi.value < 30 ? '⚠️ 超卖区域' : '超卖 <30'}
            </div>
          </div>
        </div>
      </div>

      {/* KDJ */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500 mb-2">KDJ 随机指标</div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-blue-500">K:</span>
            <span className="font-medium">{latest.kdj.k?.toFixed(2) || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-orange-500">D:</span>
            <span className="font-medium">{latest.kdj.d?.toFixed(2) || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-purple-500">J:</span>
            <span className="font-medium">{latest.kdj.j?.toFixed(2) || '-'}</span>
          </div>
          <div className="text-xs mt-2">
            {latest.kdj.k > 80 ? (
              <span className="text-red-600">● 超买</span>
            ) : latest.kdj.k < 20 ? (
              <span className="text-green-600">● 超卖</span>
            ) : (
              <span className="text-gray-600">● 正常</span>
            )}
          </div>
        </div>
      </div>

      {/* 布林带 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow col-span-2">
        <div className="text-sm text-gray-500 mb-2">布林带 (BOLL)</div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-red-500">上轨:</span>
            <span className="font-medium">{latest.boll.upper?.toFixed(2) || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">中轨:</span>
            <span className="font-medium">{latest.boll.middle?.toFixed(2) || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-green-500">下轨:</span>
            <span className="font-medium">{latest.boll.lower?.toFixed(2) || '-'}</span>
          </div>
          <div className="text-xs mt-2 space-y-1">
            <div>当前价格: ¥{currentPrice.toFixed(2)}</div>
            {currentPrice > latest.boll.upper ? (
              <div className="text-red-600">⚠️ 价格突破上轨，可能回调</div>
            ) : currentPrice < latest.boll.lower ? (
              <div className="text-green-600">⚠️ 价格跌破下轨，可能反弹</div>
            ) : (
              <div className="text-gray-600">价格在布林带内运行</div>
            )}
          </div>
        </div>
      </div>

      {/* 技术信号汇总 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow col-span-2">
        <div className="text-sm text-gray-500 mb-3">综合信号</div>
        <div className="space-y-2">
          {latest.macd.dif > latest.macd.dea && latest.macd.macd > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <span className="w-2 h-2 bg-green-600 rounded-full"></span>
              MACD 金叉，多头趋势
            </div>
          )}
          {latest.rsi.value > 70 && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <span className="w-2 h-2 bg-red-600 rounded-full"></span>
              RSI 超买，注意回调风险
            </div>
          )}
          {latest.rsi.value < 30 && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <span className="w-2 h-2 bg-green-600 rounded-full"></span>
              RSI 超卖，可能存在反弹机会
            </div>
          )}
          {latest.kdj.k < 20 && latest.kdj.d < 20 && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <span className="w-2 h-2 bg-green-600 rounded-full"></span>
              KDJ 超卖区，关注反弹信号
            </div>
          )}
          {currentPrice > latest.ma5 && latest.ma5 > latest.ma10 && latest.ma10 > latest.ma20 && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <span className="w-2 h-2 bg-green-600 rounded-full"></span>
              均线多头排列，趋势向上
            </div>
          )}
          {currentPrice < latest.ma5 && latest.ma5 < latest.ma10 && latest.ma10 < latest.ma20 && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <span className="w-2 h-2 bg-red-600 rounded-full"></span>
              均线空头排列，趋势向下
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const TechnicalAnalysisPage: React.FC = () => {
  const market = useAppStore((s) => s.market);
  const [input, setInput] = useState('600519');
  const [symbol, setSymbol] = useState('');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const currentRef = React.useRef('600519');

  const analyze = React.useCallback(async (code: string) => {
    const s = code.trim();
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchStockCandles(s, market, '1y', '1d');
      if (!raw.length) throw new Error('empty');
      setCandles(raw.map((c) => ({
        timestamp: new Date(c.time).getTime(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })));
      setSymbol(s);
      setAsOf(raw[raw.length - 1]?.time ?? null);
      currentRef.current = s;
    } catch {
      setCandles([]);
      setSymbol(s);
      setAsOf(null);
      setError(`取不到 ${s} 的真实日线数据（代码有误、停牌，或上游不可达）。本页不会用随机数据填充。`);
    } finally {
      setLoading(false);
    }
  }, [market]);

  useEffect(() => { void analyze(currentRef.current); }, [analyze]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">技术分析</h1>
          <p className="text-sm text-gray-500 mt-1">深度技术指标分析，辅助交易决策</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void analyze(input); }}
            placeholder="股票代码"
            className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
          <button
            onClick={() => void analyze(input)}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '读取中…' : '分析'}
          </button>
        </div>
      </div>

      <DemoBanner title="指标只描述过去，不是买卖信号">
        均线、MACD、RSI 等只能刻画已经发生的价格与成交量，不能预测未来；在震荡市里金叉死叉会频繁失效。
        本页已改为读取真实日线，取不到数据时直接提示，不再用随机数生成 K 线。据此操作，风险自负。
      </DemoBanner>

      {asOf && (
        <div className="text-xs text-gray-500">
          数据源：腾讯 / 东方财富 / Yahoo Finance 真实日线 · 最新交易日 {asOf} · 可能存在延迟
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="mt-2 text-gray-600">读取真实日线并计算指标…</div>
        </div>
      ) : candles.length > 0 ? (
        <IndicatorPanel candles={candles} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
          <div className="text-gray-400 text-lg">暂无数据</div>
        </div>
      )}
    </div>
  );
};
