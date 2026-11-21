import { useState, useEffect, useCallback } from 'react';
import { mockOrderTicks } from '../../../data/mock';
import { getMarketState } from '../../../shared/utils/marketHours';
import type { OrderTick } from '../../../types/fundflow';

export function useOrderFlow(symbol: string) {
  const [ticks, setTicks] = useState<OrderTick[]>(mockOrderTicks());

  useEffect(() => {
    const ms = getMarketState();
    if (!ms.isOpen) {
      // 闭市期间不生成新 tick，保持最后快照
      return;
    }
    const id = setInterval(() => {
      setTicks((prev) => {
        const newTick = mockOrderTicks()[0];
        return [newTick, ...prev.slice(0, 49)];
      });
    }, 2000);
    return () => clearInterval(id);
  }, [symbol]);
  return ticks;
}
