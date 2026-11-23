import { useRealtime } from '../realtime/react';
import type { RunCommand } from './OperatorApp';

/**
 * Viewers' comments on screen: the on/off switch. Only joined players' short, filtered comments appear, as speech bubbles.
 * The server keeps the setting. To hide one person, use Ignore on the players list.
 */
export function ChatPanel({ run }: { run: RunCommand }) {
  const chat = useRealtime((state) => state.hud?.chat);
  if (!chat) return null;

  return (
    <section className="panel" data-testid="chat">
      <h2>Comments on screen</h2>
      <div className="row">
        <button onClick={() => run({ type: 'set_chat', enabled: !chat.enabled })} disabled={!chat.supported} aria-pressed={chat.enabled}>
          {chat.enabled ? 'Turn off' : 'Turn on'}
        </button>
        <span data-testid="chat-state">{!chat.supported ? 'not in this game' : chat.enabled ? 'on' : 'off'}</span>
      </div>
    </section>
  );
}
