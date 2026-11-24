import { useState } from 'react';
import { useRealtime } from '../realtime/react';
import type { RunCommand } from './OperatorApp';

/** The active game's own settings (whatever it declares), changed here and applied from the next round. Hidden for a game with none. */
export function SettingsPanel({ run }: { run: RunCommand }) {
  const settings = useRealtime((state) => state.hud?.settings);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!settings || settings.defs.length === 0) return null;

  return (
    <section className="panel" data-testid="settings">
      <h2>Game settings</h2>
      {settings.defs.map((def) => {
        const current = settings.values[def.key] ?? def.default;
        const draft = drafts[def.key] ?? String(current);
        return (
          <div className="row" key={def.key}>
            <label>
              {def.label}{' '}
              <input
                type="number"
                min={def.min}
                max={def.max}
                step={1}
                value={draft}
                onChange={(event) => setDrafts((previous) => ({ ...previous, [def.key]: event.target.value }))}
              />
            </label>
            <button
              onClick={() => {
                run({ type: 'set_setting', key: def.key, value: Number(draft) });
                setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== def.key)));
              }}
              disabled={!Number.isInteger(Number(draft)) || draft.trim() === '' || Number(draft) === current}
            >
              Apply
            </button>
            <span>
              now <strong data-testid={`setting-${def.key}`}>{current}</strong>
            </span>
          </div>
        );
      })}
      <p className="hint">Applies to the next race; refused while a race is running.</p>
    </section>
  );
}
