import { useState, useEffect } from 'react';
import type { NAAIMData, McClellanData, PutCallData, DarkPoolData, GEXData, AlgoSentimentRow } from '../../../types/sentiment';

// ─── 机构级情绪算法指标（基于 NAAIM / McClellan / VIX Term Structure / Dark Pool / Gamma 方法论）───

export function useNAAIM(): NAAIMData {
  const [data] = useState<NAAIMData>({
    current: 87.52,
    week4MA: 82.31,
    week13MA: 78.45,
    historicalMedian: 75.0,
    interpretation: 'NAAIM 暴露指数 87.52，高于四周均值和历史中位数，主动管理型基金经理仓位偏积极。当 NAAIM > 90 时通常视为极端看多信号，需警惕均值回归。',
  });
  return data;
}

export function useMcClellan(): McClellanData {
  const [data] = useState<McClellanData>({
    oscillator: 28.5,
    summation: 450.3,
    advances: 1680,
    declines: 1420,
    sparkline: {
      oscillator: [15, 10, 8, 5, 12, 20, 28, 32, 28, 25, 22, 18, 22, 28, 30, 28, 25],
      summation: [320, 340, 350, 360, 370, 385, 400, 420, 430, 440, 445, 448, 450, 452, 450, 448, 450],
    },
  });
  return data;
}

export function usePutCall(): PutCallData {
  const [data] = useState<PutCallData>({
    equityPC: 0.52,
    indexPC: 1.28,
    totalPC: 0.76,
    otmPutCall: 0.68,
    callVolumeDelta: 8.3,
    putVolumeDelta: -3.1,
    skew25Delta: -4.2,
    openInterestPC: 0.81,
  });
  return data;
}

export function useDarkPool(): DarkPoolData {
  const [data] = useState<DarkPoolData>({
    dpi: 48.5,
    buyRatio: 0.47,
    sellRatio: 0.53,
    netBuy: -120,
    sparkline: {
      buys: [52, 48, 45, 47, 50, 48, 46, 44, 47, 48, 46, 45, 47],
      sells: [48, 52, 55, 53, 50, 52, 54, 56, 53, 52, 54, 55, 53],
    },
  });
  return data;
}

export function useGEX(): GEXData {
  const [data] = useState<GEXData>({
    netGEX: 8.2,
    zeroGamma: 5820,
    callWall: 6000,
    putWall: 5700,
    distribution: Array.from({ length: 20 }, (_, i) => ({ strike: 5700 + i * 30, gamma: Math.max(0, 3 - Math.abs(i - 10) * 0.5 + Math.random() * 0.5) })),
  });
  return data;
}

export function useAlgoTable(): AlgoSentimentRow[] {
  const [data] = useState<AlgoSentimentRow[]>([
    { name: 'CNN Fear & Greed (7因子)', value: '—', signal: '实时', signalColor: '#4078ff', methodology: 'CNN Business · alternative.me API' },
    { name: 'VIX Term Structure', value: 'Contango', signal: '偏多', signalColor: '#0ca678', methodology: '近月 < 远月 → Contango，正常市场结构' },
    { name: 'NAAIM Exposure', value: '87.52', signal: '偏多', signalColor: '#f59e4b', methodology: '主动管理基金仓位指数，>90 极端看多' },
    { name: 'McClellan Oscillator', value: '+28.5', signal: '偏多', signalColor: '#0ca678', methodology: '上涨-下跌家数差异的指数平滑' },
    { name: 'Put/Call Ratio', value: '0.76', signal: '偏多', signalColor: '#0ca678', methodology: 'CBOE 总 Put/Call < 0.8 偏看涨' },
    { name: 'Dark Pool Index', value: '48.5%', signal: '中性', signalColor: '#636878', methodology: '暗池买卖占比，<45%=空方，>55%=多方' },
    { name: 'Gamma Exposure', value: '+8.2B', signal: '偏多', signalColor: '#0ca678', methodology: 'GEX > 0 做市商对冲抑制波动' },
    { name: 'Smart Money Index', value: '1.25', signal: '偏多', signalColor: '#0ca678', methodology: '开盘 30min vs 收盘 30min 成交量比' },
    { name: 'HY Spread (OAS)', value: '365bp', signal: '中性', signalColor: '#636878', methodology: '高收益债 OAS，>500bp=信用恐慌' },
    { name: 'AAII Bull/Bear', value: '1.42', signal: '偏多', signalColor: '#0ca678', methodology: '散户多空调查，>2=过度乐观' },
  ]);
  return data;
}
