import type { OperatorCommand, SimulatorCommand, TikTokCommand } from '@live-game/contracts';
import { useCallback, useState } from 'react';
import { useNow, useRealtime, useRealtimeClient } from '../realtime/react';
import { formatClock, remainingMs } from '../realtime/time';
import { EventFeed } from './EventFeed';
import { GameControls, Scoreboard } from './GameControls';
import { ChatPanel } from './ChatPanel';
import { GamePanel } from './GamePanel';
import { PlayersPanel } from './PlayersPanel';
import { SimulatorPanel } from './SimulatorPanel';
import { TikTokPanel } from './TikTokPanel';
import { SoundPanel } from './SoundPanel';

export type RunCommand = (command: OperatorCommand | SimulatorCommand | TikTokCommand) => void;

const CONNECTION_LABEL = {
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected — retrying',
  unauthorized: 'Unauthorized — check the operator token in the URL',
} as const;

function StatusBar() {
  const connection = useRealtime((state) => state.connection);
  const hud = useRealtime((state) => state.hud);
  const offset = useRealtime((state) => state.clockOffsetMs);
  const actionsTotal = useRealtime((state) => state.actionsTotal);
  const now = useNow(250);

  return (
    <header className="status">
      <h1>Operator</h1>
      <span className={`badge ${connection}`} data-testid="connection">
        {CONNECTION_LABEL[connection]}
      </span>
      {hud && (
        <>
          <span className="badge" data-testid="phase">
            {hud.phase}
            {hud.paused ? ' (paused)' : ''}
          </span>
          <span className="badge">round {hud.round}</span>
          <span className="badge mono" data-testid="timer">
            {formatClock(remainingMs(hud, offset, now))}
          </span>
          <span className={`badge provider-${hud.providerStatus}`} data-testid="provider">
            provider: {hud.providerStatus}
          </span>
          <span className="badge">actions seen: {actionsTotal}</span>
        </>
      )}
    </header>
  );
}

export function OperatorApp() {
  const client = useRealtimeClient();
  const [lastResult, setLastResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = useCallback<RunCommand>(
    (command) => {
      void client.send(command).then((ack) => {
        setLastResult({ ok: ack.ok, text: ack.ok ? `${command.type}: ok` : `${command.type}: ${ack.reason}` });
      });
    },
    [client],
  );

  return (
    <div className="operator">
      <StatusBar />
      <div className="result-line" data-testid="last-result" data-ok={lastResult?.ok ?? ''}>
        {lastResult ? lastResult.text : 'No commands sent yet.'}
      </div>
      <div className="columns">
        <div className="column">
          <GamePanel run={run} />
          <GameControls run={run} />
          <SoundPanel run={run} />
          <ChatPanel run={run} />
          <Scoreboard />
          <TikTokPanel run={run} />
          <SimulatorPanel run={run} />
        </div>
        <div className="column">
          <PlayersPanel run={run} />
          <EventFeed />
        </div>
      </div>
    </div>
  );
}
