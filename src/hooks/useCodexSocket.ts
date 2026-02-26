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
  const [socketConnected, setSocketConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectCounter, setReconnectCounter] = useState(0);

  useEffect(() => {
    setIsReconnecting(true);
    const settings = ServerConnection.makeSettings();
    const wsUrl = URLExt.join(settings.wsUrl, 'codex', 'ws');
    let socket: WebSocket;

    try {
      socket = new WebSocket(wsUrl);
    } catch {
      setSocketConnected(false);
      setIsReconnecting(false);
      return;
    }

    socketRef.current = socket;

    socket.onopen = () => {
      setSocketConnected(true);
      setIsReconnecting(false);
      callbacksRef.current.onOpen?.();
    };

    socket.onclose = () => {
      setSocketConnected(false);
      setIsReconnecting(false);
      callbacksRef.current.onClose?.();
    };

    socket.onerror = () => {
      setSocketConnected(false);
      setIsReconnecting(false);
      callbacksRef.current.onError?.();
    };

    socket.onmessage = event => {
      callbacksRef.current.onMessage?.(event.data);
    };

    return () => {
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
