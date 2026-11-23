import { useState } from 'react';
import { getPresentation } from '../game-modes/registry';
import { useRealtime } from '../realtime/react';
import type { RunCommand } from './OperatorApp';

const GIFTS = ['rose', 'gg', 'big_celebration'] as const;

/** Parses a numeric input, clamping into [min, max] and falling back when empty or invalid. */
function clampInt(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : Math.min(max, Math.max(min, parsed));
}

export function SimulatorPanel({ run }: { run: RunCommand }) {
  const provider = useRealtime((state) => state.hud?.providerStatus ?? 'none');
  const modeId = useRealtime((state) => state.hud?.modeId);
  // The words viewers can type belong to the active game; the panel only offers what that game understands.
  const presentation = modeId ? getPresentation(modeId) : null;
  const WORDS: readonly string[] = presentation?.text.commands ?? [];
  const defaultWord = presentation?.simulatorDefaultWord ?? '';
  const [addCount, setAddCount] = useState('50');
  const [pickedWord, setBurstWord] = useState<string | null>(null);
  const [burstCount, setBurstCount] = useState('50');
  const [burstSpread, setBurstSpread] = useState('2000');
  const [viewerId, setViewerId] = useState('');
  const [typedText, setText] = useState<string | null>(null);
  const burstWord = pickedWord ?? defaultWord; // until the operator chooses, the game's default word
  const text = typedText ?? defaultWord;
  const [gift, setGift] = useState<string>('rose');
  const [likeCount, setLikeCount] = useState('20');
  const [scenario, setScenario] = useState<'steady' | 'chaos'>('steady');
  const [scenarioViewers, setScenarioViewers] = useState('100');
  const [scenarioSeconds, setScenarioSeconds] = useState('120');

  const viewer = viewerId.trim() === '' ? undefined : viewerId.trim();

  return (
    <section className="panel" data-testid="simulator">
      <h2>Simulator</h2>
      <div className="row">
        <span>Provider: {provider}</span>
        <button onClick={() => run({ type: 'sim_connect' })} disabled={provider === 'connected'}>
          Connect
        </button>
        <button onClick={() => run({ type: 'sim_disconnect' })} disabled={provider !== 'connected'}>
          Disconnect
        </button>
        <button onClick={() => run({ type: 'sim_stop' })}>Stop playback</button>
      </div>

      <div className="row">
        <label>
          Add viewers
          <input
            type="number"
            min={1}
            max={200}
            value={addCount}
            onChange={(event) => setAddCount(event.target.value)}
            aria-label="Viewers to add"
          />
        </label>
        <button onClick={() => run({ type: 'sim_add_viewers', count: clampInt(addCount, 1, 200, 50) })}>Add</button>
      </div>

      <div className="row">
        <label>
          Burst
          <select value={burstWord} onChange={(event) => setBurstWord(event.target.value)} aria-label="Burst word">
            {WORDS.map((word) => (
              <option key={word}>{word}</option>
            ))}
          </select>
        </label>
        <input
          type="number"
          min={1}
          max={200}
          value={burstCount}
          onChange={(event) => setBurstCount(event.target.value)}
          aria-label="Burst viewers"
        />
        <input
          type="number"
          min={0}
          max={10000}
          step={500}
          value={burstSpread}
          onChange={(event) => setBurstSpread(event.target.value)}
          aria-label="Burst spread ms"
        />
        <button
          onClick={() =>
            run({
              type: 'sim_burst',
              text: burstWord,
              count: clampInt(burstCount, 1, 200, 50),
              spreadMs: clampInt(burstSpread, 0, 10_000, 2000),
            })
          }
        >
          Send burst
        </button>
      </div>

      <div className="row">
        <input
          placeholder="viewer id (blank = random)"
          value={viewerId}
          onChange={(event) => setViewerId(event.target.value)}
          aria-label="Viewer id"
        />
        <input value={text} onChange={(event) => setText(event.target.value)} aria-label="Comment text" />
        <button onClick={() => run({ type: 'sim_comment', viewerId: viewer, text })}>Send comment</button>
      </div>
      <div className="row">
        <select value={gift} onChange={(event) => setGift(event.target.value)} aria-label="Gift">
          {GIFTS.map((key) => (
            <option key={key}>{key}</option>
          ))}
        </select>
        <button onClick={() => run({ type: 'sim_gift', viewerId: viewer, giftKey: gift })}>Send gift</button>
        <input type="number" min={1} max={10000} value={likeCount} onChange={(event) => setLikeCount(event.target.value)} aria-label="Likes" />
        <button onClick={() => run({ type: 'sim_like', viewerId: viewer, count: Math.min(10_000, Math.max(1, Math.trunc(Number(likeCount)) || 1)) })}>Send likes</button>
      </div>

      <div className="row">
        <label>
          Scenario
          <select
            value={scenario}
            onChange={(event) => setScenario(event.target.value === 'chaos' ? 'chaos' : 'steady')}
            aria-label="Scenario"
          >
            <option>steady</option>
            <option>chaos</option>
          </select>
        </label>
        <input
          type="number"
          min={1}
          max={200}
          value={scenarioViewers}
          onChange={(event) => setScenarioViewers(event.target.value)}
          aria-label="Scenario viewers"
        />
        <input
          type="number"
          min={1}
          max={600}
          value={scenarioSeconds}
          onChange={(event) => setScenarioSeconds(event.target.value)}
          aria-label="Scenario seconds"
        />
        <button
          onClick={() =>
            run({
              type: 'sim_scenario',
              name: scenario,
              viewers: clampInt(scenarioViewers, 1, 200, 100),
              durationMs: clampInt(scenarioSeconds, 1, 600, 120) * 1000,
            })
          }
        >
          Run
        </button>
      </div>

      <div className="row">
        <span>Inject fault:</span>
        <button onClick={() => run({ type: 'sim_inject', fault: 'duplicate' })}>Duplicate event</button>
        <button onClick={() => run({ type: 'sim_inject', fault: 'malformed' })}>Malformed event</button>
      </div>
    </section>
  );
}
