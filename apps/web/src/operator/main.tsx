import { type FormEvent, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SOCKET_NAMESPACES } from '@live-game/contracts';
import { createRealtimeClient, readOperatorToken } from '../realtime/client';
import { RealtimeProvider } from '../realtime/react';
import { OperatorApp } from './OperatorApp';
import './operator.css';

/** The server prints a one-time operator token at startup; paste it here (it stays in the URL fragment). */
function TokenPrompt() {
  const [token, setToken] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    window.location.hash = `token=${encodeURIComponent(token.trim())}`;
    window.location.reload();
  };
  return (
    <main className="token-prompt">
      <h1>Operator</h1>
      <form onSubmit={submit}>
        <label>
          Operator token (printed in the server terminal)
          <input value={token} onChange={(event) => setToken(event.target.value)} autoFocus />
        </label>
        <button type="submit" disabled={token.trim() === ''}>
          Connect
        </button>
      </form>
    </main>
  );
}

const token = readOperatorToken();
const root = createRoot(document.getElementById('root')!);

if (!token) {
  root.render(<TokenPrompt />);
} else {
  const client = createRealtimeClient({ namespace: SOCKET_NAMESPACES.operator, token });
  root.render(
    <StrictMode>
      <RealtimeProvider client={client}>
        <OperatorApp />
      </RealtimeProvider>
    </StrictMode>,
  );
}
