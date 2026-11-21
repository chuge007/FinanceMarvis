import { useEffect, useState, useCallback, useRef } from 'react';
import { sinaWS, type SinaQuote } from '../services/websocket/SinaWebSocket';

export interface UseRealtimeQuoteOptions {
  enabled?: boolean;
  throttle?: number;
}

export function useRealtimeQuote(
  symbol: string | null,
  options: UseRealtimeQuoteOptions = {}
) {
  const { enabled = true, throttle = 100 } = options;
  const [quote, setQuote] = useState<SinaQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!symbol || !enabled) {
      setLoading(false);
      return;
    }

    let isSubscribed = true;
    setLoading(true);
    setError(null);

    sinaWS.connect()
      .then(() => {
        if (!isSubscribed) return;
        const callback = (newQuote: SinaQuote) => {
          if (!isSubscribed) return;
          const now = Date.now();
          if (now - lastUpdateRef.current >= throttle) {
            setQuote(newQuote);
            setLoading(false);
            lastUpdateRef.current = now;
          }
        };

        sinaWS.subscribeQuote(symbol, callback);
      })
      .catch(err => {
        if (isSubscribed) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      isSubscribed = false;
      if (symbol) {
        sinaWS.unsubscribeQuote(symbol);
      }
    };
  }, [symbol, enabled, throttle]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    lastUpdateRef.current = 0;
  }, []);

  return { quote, loading, error, refresh };
}

export function useRealtimeQuotes(
  symbols: string[],
  options: UseRealtimeQuoteOptions = {}
) {
  const { enabled = true, throttle = 100 } = options;
  const [quotes, setQuotes] = useState<Record<string, SinaQuote>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const lastUpdateRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (symbols.length === 0 || !enabled) {
      setLoading(false);
      return;
    }

    let isSubscribed = true;
    setLoading(true);
    setError(null);

    sinaWS.connect()
      .then(() => {
        if (!isSubscribed) return;
        symbols.forEach(symbol => {
          const callback = (newQuote: SinaQuote) => {
            if (!isSubscribed) return;
            const now = Date.now();
            const lastUpdate = lastUpdateRef.current[symbol] || 0;
            if (now - lastUpdate >= throttle) {
              setQuotes(prev => ({
                ...prev,
                [symbol]: newQuote,
              }));
              lastUpdateRef.current[symbol] = now;
            }
          };
          sinaWS.subscribeQuote(symbol, callback);
        });
        setLoading(false);
      })
      .catch(err => {
        if (isSubscribed) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      isSubscribed = false;
      symbols.forEach(symbol => {
        sinaWS.unsubscribeQuote(symbol);
      });
    };
  }, [symbols.join(','), enabled, throttle]);

  return { quotes, loading, error };
}

export function useWebSocketState() {
  const [state, setState] = useState<'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'>('CLOSED');
  const [stats, setStats] = useState(sinaWS.getStats());

  useEffect(() => {
    const interval = setInterval(() => {
      setState(sinaWS.getState());
      setStats(sinaWS.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return { state, stats, isConnected: state === 'OPEN' };
}
