import { useState } from 'react';
import { useRealtime } from '../realtime/react';
import type { RunCommand } from './OperatorApp';

/**
 * Reading a real TikTok LIVE. The server must have been started with `TIKTOK_LIVE=on`; reading is read-only and unofficial
 * (the accepted risk is recorded in docs/tiktok-live-feasibility.md). Connecting switches the simulator off, and
 * Disconnect is the kill switch: it stops reading at once and cancels every retry.
 */
export function TikTokPanel({ run }: { run: RunCommand }) {
  const info = useRealtime((state) => state.hud?.providerInfo);
  const [username, setUsername] = useState('');
  const tiktok = info?.kind === 'tiktok' ? info : null;
  const active = tiktok !== null && ['connecting', 'connected', 'waiting'].includes(tiktok.state);

  return (
    <section className="panel" data-testid="tiktok">
      <h2>TikTok LIVE</h2>
      <p className="hint">Reads a public stream (comments and gifts), read-only, through unofficial access. Connecting switches the simulator off.</p>
      <div className="row">
        <label>
          TikTok username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="name after the @"
            aria-label="TikTok username"
            maxLength={200}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <button onClick={() => run({ type: 'tiktok_connect', username })} disabled={username.trim() === ''}>
          Connect TikTok
        </button>
        <button onClick={() => run({ type: 'tiktok_disconnect' })} disabled={!active} className="danger">
          Disconnect TikTok
        </button>
      </div>
      <div className="row" data-testid="tiktok-status">
        {tiktok ? (
          <span>
            <strong data-testid="tiktok-state">{tiktok.state}</strong>
            {tiktok.username ? ` · @${tiktok.username}` : ''} · {tiktok.message}
            {tiktok.state === 'connected' ? ` · ${tiktok.comments ?? 0} comments, ${tiktok.gifts ?? 0} gifts` : ''}
          </span>
        ) : (
          <span data-testid="tiktok-state">not in use (the simulator is the provider)</span>
        )}
      </div>
    </section>
  );
}
