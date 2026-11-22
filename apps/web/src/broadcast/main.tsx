import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SOCKET_NAMESPACES } from '@live-game/contracts';
import { createRealtimeClient } from '../realtime/client';
import { RealtimeProvider } from '../realtime/react';
import { BroadcastApp } from './BroadcastApp';
import './broadcast.css';

const client = createRealtimeClient({ namespace: SOCKET_NAMESPACES.broadcast });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RealtimeProvider client={client}>
      <BroadcastApp />
    </RealtimeProvider>
  </StrictMode>,
);
