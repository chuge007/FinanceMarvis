import { useState, useEffect, useRef } from 'react';
import { mockDepthData } from '../../../data/mock';
import { fetchTencentQuotes, type TencentQuote } from '../../../services/api';
import type { DepthData, DepthLevel } from '../../../types/fundflow';

/** A股交易时段检测（本地时间） */
function cnSessionLabel(): { isOpen: boolean; label: string } {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return { isOpen: false, label: '周末休市' };
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inMorning = minutes >= 9 * 60 + 30 && minutes < 11 * 60 + 30;
  const inAfternoon = minutes >= 13 * 60 && minutes < 15 * 60;
  return inMorning || inAfternoon ? { isOpen: true, label: 'A股交易中' } : { isOpen: false, label: 'A股休市' };
}

function tencentToDepth(q: TencentQuote): DepthData {
  return {
    bids: q.bids,
    asks: q.asks,
    bidTotal: q.bids.reduce((s, b) => s + b.volume, 0),
    askTotal: q.asks.reduce((s, a) => s + a.volume, 0),
    imbalance: 0, // 由组件基于 bid/askTotal 重新计算
  };
}

export function useDepth(symbol: string) {
  const [data, setData] = useState<DepthData>(mockDepthData());
  const [marketStatus, setMarketStatus] = useState<string>('');
  const [source, setSource] = useState<'tencent' | 'mock'>('mock');
  const [quote, setQuote] = useState<Pick<TencentQuote, 'price' | 'changePercent' | 'prevClose'> | null>(null);
  const frozenRef = useRef<DepthData | null>(null);

  useEffect(() => {
    setMarketStatus(cnSessionLabel().label);

    let disposed = false;

    const load = async () => {
      const qs = await fetchTencentQuotes([symbol]);
      if (disposed) return;
      const q = qs[symbol];
      if (q && q.price > 0 && q.bids.length === 5 && q.asks.length === 5) {
        setData(tencentToDepth(q));
        setSource('tencent');
        setQuote({ price: q.price, changePercent: q.changePercent, prevClose: q.prevClose });
        setMarketStatus(`${cnSessionLabel().label} · 腾讯实时`);
      } else {
        // 拉取失败：闭市/网络异常 → 静态快照
        if (!frozenRef.current) frozenRef.current = mockDepthData();
        setData(frozenRef.current);
        setSource('mock');
        setQuote(null);
      }
    };

    // 立即拉取 + 每 5 秒轮询（闭市时数据静止，请求轻量）
    load();
    const id = setInterval(() => {
      setMarketStatus(cnSessionLabel().label);
      load();
    }, 5000);

    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [symbol]);

  return { data, marketStatus, source, quote };
}

// 重新导出类型以保持组件使用一致
export type { DepthLevel };

