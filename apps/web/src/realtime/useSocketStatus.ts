import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { HelloSchema, SOCKET_NAMESPACES, type SocketNamespace } from '@live-game/contracts';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** The operator token is passed in the URL fragment (`#token=…`), which is never sent to a server. */
function operatorTokenFromHash(): string | undefined {
  return new URLSearchParams(window.location.hash.slice(1)).get('token') ?? undefined;
}

/** Phase 0/3 hello-world: connects to a namespace and reports connection status. */
export function useSocketStatus(namespace: SocketNamespace): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const auth = namespace === SOCKET_NAMESPACES.operator ? { token: operatorTokenFromHash() } : undefined;
    const socket = io(namespace, { auth });
    socket.on('hello', (payload: unknown) => {
      if (HelloSchema.safeParse(payload).success) setStatus('connected');
    });
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('disconnected'));
    return () => {
      socket.close();
    };
  }, [namespace]);

  return status;
}
