import { type CSSProperties, useEffect, useState } from 'react';
import { getPresentation } from '../game-modes/registry';
import { useRealtime } from '../realtime/react';
import { CommandHelp, JoinTicker, PausedBanner, PhaseTimer, ResultBanner, StatusBar, TeamScores } from './hud';

/** Largest 9:16 box that fits the window, so OBS (or any window) always shows the whole composition. */
function useStageSize() {
  const measure = () => {
    const width = Math.floor(Math.min(window.innerWidth, (window.innerHeight * 9) / 16));
    return { width, height: Math.floor((width * 16) / 9) };
  };
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const onResize = () => setSize(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export function BroadcastApp() {
  const hud = useRealtime((state) => state.hud);
  const connection = useRealtime((state) => state.connection);
  const { width, height } = useStageSize();

  // One CSS unit = 1% of the stage width, so every size scales with the composition.
  const stageStyle = { width, height, '--u': `${width / 100}px` } as CSSProperties;
  const presentation = hud ? getPresentation(hud.modeId) : null;

  return (
    <div className="viewport">
      <main className="stage" style={stageStyle} data-testid="stage">
        {!hud || !presentation ? (
          <StatusBar text="Bağlanıyor…" />
        ) : (
          <>
            {connection !== 'connected' && <StatusBar text={presentation.text.connecting} />}
            {connection === 'connected' && hud.providerStatus === 'disconnected' && (
              <StatusBar text={presentation.text.providerDown} />
            )}
            <PhaseTimer hud={hud} presentation={presentation} />
            <TeamScores hud={hud} presentation={presentation} />
            <section className="arena">{hud.phase !== 'results' && <CommandHelp presentation={presentation} />}</section>
            <JoinTicker hud={hud} presentation={presentation} />
            {hud.phase === 'results' && hud.lastResult && (
              <ResultBanner result={hud.lastResult} presentation={presentation} />
            )}
            {hud.paused && <PausedBanner presentation={presentation} />}
          </>
        )}
      </main>
    </div>
  );
}
