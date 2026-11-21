import { useEffect, useRef, useCallback } from 'react';

interface WSOptions {
  onMessage: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnect?: boolean;
}

export function useWebSocket(url: string, options: WSOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      options.onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        options.onMessage(data);
      } catch {
        options.onMessage(event.data);
      }
    };

    ws.onclose = () => {
      options.onClose?.();
      if (options.reconnect !== false) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    wsRef.current?.send(JSON.stringify(data));
  }, []);

  return { send };
}
