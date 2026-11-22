import { createRoot } from 'react-dom/client';
import { SOCKET_NAMESPACES } from '@live-game/contracts';
import { useSocketStatus } from '../realtime/useSocketStatus';

function OperatorApp() {
  const status = useSocketStatus(SOCKET_NAMESPACES.operator);
  return <main>Operator: {status}</main>;
}

createRoot(document.getElementById('root')!).render(<OperatorApp />);
