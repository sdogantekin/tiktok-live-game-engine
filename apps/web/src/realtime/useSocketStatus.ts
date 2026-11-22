import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { HelloSchema, type SocketNamespace } from '@live-game/contracts';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** Phase 0 hello-world: connects to a namespace and reports connection status. */
export function useSocketStatus(namespace: SocketNamespace): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const socket = io(namespace);
    socket.on('hello', (payload: unknown) => {
      if (HelloSchema.safeParse(payload).success) setStatus('connected');
    });
    socket.on('disconnect', () => setStatus('disconnected'));
    return () => {
      socket.close();
    };
  }, [namespace]);

  return status;
}
