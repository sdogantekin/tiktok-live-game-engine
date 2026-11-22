import { createRoot } from 'react-dom/client';
import { SOCKET_NAMESPACES } from '@live-game/contracts';
import { useSocketStatus } from '../realtime/useSocketStatus';

function BroadcastApp() {
  const status = useSocketStatus(SOCKET_NAMESPACES.broadcast);
  return <main>Broadcast: {status}</main>;
}

createRoot(document.getElementById('root')!).render(<BroadcastApp />);
