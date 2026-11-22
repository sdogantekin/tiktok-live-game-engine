import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { RealtimeClient } from './client';
import type { RealtimeState } from './store';

const RealtimeContext = createContext<RealtimeClient | null>(null);

export function RealtimeProvider({ client, children }: { client: RealtimeClient; children: ReactNode }) {
  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeClient(): RealtimeClient {
  const client = useContext(RealtimeContext);
  if (!client) throw new Error('useRealtimeClient must be used inside <RealtimeProvider>');
  return client;
}

/** Subscribes a component to a slice of the realtime store. */
export function useRealtime<T>(selector: (state: RealtimeState) => T): T {
  return useStore(useRealtimeClient().store, selector);
}

/** Re-renders the component about every `intervalMs` with the current client time (for countdowns). */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
