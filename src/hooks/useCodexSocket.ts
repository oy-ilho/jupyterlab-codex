import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ServerConnection } from '@jupyterlab/services';
import { URLExt } from '@jupyterlab/coreutils';

interface SocketCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
  onMessage?: (rawMessage: unknown) => void;
}

interface UseCodexSocketResult {
  socketRef: MutableRefObject<WebSocket | null>;
  socketConnected: boolean;
  isReconnecting: boolean;
  reconnect: () => void;
}

export function useCodexSocket(callbacks: SocketCallbacks = {}): UseCodexSocketResult {
  const callbacksRef = useRef<SocketCallbacks>(callbacks);
  callbacksRef.current = callbacks;

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectCounter, setReconnectCounter] = useState(0);

  useEffect(() => {
    setIsReconnecting(true);
    const settings = ServerConnection.makeSettings();
    const wsUrl = URLExt.join(settings.wsUrl, 'codex', 'ws');
    let socket: WebSocket;
    let disposed = false;
    let reconnectScheduled = false;

    try {
      socket = new WebSocket(wsUrl);
    } catch {
      setSocketConnected(false);
      setIsReconnecting(false);
      return;
    }

    socketRef.current = socket;

    const scheduleReconnect = () => {
      if (disposed || reconnectScheduled) {
        return;
      }
      reconnectScheduled = true;
      setIsReconnecting(true);
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        setReconnectCounter(value => value + 1);
      }, 800);
    };

    socket.onopen = () => {
      setSocketConnected(true);
      setIsReconnecting(false);
      callbacksRef.current.onOpen?.();
    };

    socket.onclose = () => {
      setSocketConnected(false);
      callbacksRef.current.onClose?.();
      scheduleReconnect();
    };

    socket.onerror = () => {
      setSocketConnected(false);
      callbacksRef.current.onError?.();
      scheduleReconnect();
    };

    socket.onmessage = event => {
      callbacksRef.current.onMessage?.(event.data);
    };

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socket.onopen = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
      socketRef.current = null;
    };
  }, [reconnectCounter]);

  const reconnect = useCallback(() => {
    if (isReconnecting) {
      return;
    }
    setReconnectCounter(value => value + 1);
  }, [isReconnecting]);

  return {
    socketRef,
    socketConnected,
    isReconnecting,
    reconnect
  };
}
