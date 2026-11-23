import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { getSoundEngine } from '../game-renderer/audio/shared-engine';
import { CueBus, cuesFromBatch } from '../game-renderer/cue-bus';
import { TagBoard } from '../game-renderer/name-tags';
import { NameTags } from '../game-renderer/NameTags';
import { LiveFeed } from '../game-renderer/live-feed';
import { markCueOrigin, PERF_OVERLAY, PROBE_ENABLED } from '../game-renderer/perf';
import { renderOffline, type OfflineOptions } from '../game-renderer/audio/offline';
import { PerfOverlay } from '../game-renderer/PerfOverlay';
import { Stage } from '../game-renderer/Stage';
import { getPresentation } from '../game-modes/registry';
import { useRealtime, useRealtimeClient } from '../realtime/react';
import { remainingMs } from '../realtime/time';
import { SoundGate } from './SoundGate';
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
  const players = useRealtime((state) => state.players);
  const client = useRealtimeClient();
  const { width, height } = useStageSize();
  const clockOffsetMs = useRealtime((state) => state.clockOffsetMs);

  // Sound: one engine per page, its volume and mute held by the server (so every view agrees and a refresh keeps them).
  const audio = useMemo(() => getSoundEngine(), []);
  const soundMuted = hud?.sound.muted;
  const soundVolume = hud?.sound.volume;
  useEffect(() => {
    if (audio && soundMuted !== undefined && soundVolume !== undefined) audio.setSettings({ muted: soundMuted, volume: soundVolume });
  }, [audio, soundMuted, soundVolume]);

  // Whole seconds left in the phase, for the countdown ticks. Only changes once a second, so it does not re-render the scene more often.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const ms = remainingMs(hud, clockOffsetMs, Date.now());
      const seconds = ms === null ? null : Math.ceil(ms / 1000);
      setSecondsLeft((previous) => (previous === seconds ? previous : seconds));
    };
    update();
    const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [hud, clockOffsetMs]);

  // Scene cues travel on a bus, not through React state, so a burst of events never causes a burst of renders.
  const cues = useMemo(() => new CueBus(), []);
  useEffect(
    () =>
      client.onPresentation((batch) => {
        for (const cue of cuesFromBatch(batch)) cues.emit(cue);
        if (batch.oldestIngestedAt !== undefined) markCueOrigin(batch.oldestIngestedAt);
      }),
    [client, cues],
  );
  // The live view of a game that simulates on the server (a race) travels the same way: a plain feed the scene reads every frame.
  const liveFeed = useMemo(() => new LiveFeed(), []);
  useEffect(() => client.onLive((view) => liveFeed.push(view)), [client, liveFeed]);
  const roster = useMemo(() => Object.values(players).map((player) => ({ id: player.id, name: player.name, teamId: player.teamId })), [players]);

  // One CSS unit = 1% of the stage width, so every size scales with the composition.
  const stageStyle = { width, height, '--u': `${width / 100}px` } as CSSProperties;
  const presentation = hud ? getPresentation(hud.modeId) : null;
  // `?probe=1` lets the browser tests render the real sound offline and measure it (loudness, clipping).
  useEffect(() => {
    if (!PROBE_ENABLED || !presentation) return;
    (window as unknown as { __soundEngine?: unknown }).__soundEngine = audio;
    (window as unknown as { __soundProbe?: (options: OfflineOptions) => ReturnType<typeof renderOffline> }).__soundProbe = (options) =>
      renderOffline(presentation.soundDesign, options);
  }, [presentation, audio]);
  const tags = useMemo(() => (presentation ? new TagBoard(presentation.tagAnchors) : null), [presentation]);

  return (
    <div className="viewport">
      <main className="stage" style={stageStyle} data-testid="stage">
        {!hud || !presentation || !tags ? (
          <StatusBar text="Bağlanıyor…" />
        ) : (
          <>
            <div className="scene-layer">
              <Stage key={hud.modeId} camera={presentation.camera}>
                <presentation.Scene
                  roster={roster}
                  teams={hud.teams}
                  cues={cues}
                  live={liveFeed}
                  tags={tags}
                  audio={audio}
                  phase={hud.phase}
                  paused={hud.paused}
                  secondsLeft={secondsLeft}
                />
              </Stage>
              <NameTags board={tags} teamColors={presentation.teamColors} />
            </div>
            {PERF_OVERLAY && <PerfOverlay />}
            {audio && <SoundGate engine={audio} muted={hud.sound.muted} text={presentation.text.enableSound} />}
            {connection !== 'connected' && <StatusBar text={presentation.text.connecting} />}
            {connection === 'connected' && hud.providerStatus === 'disconnected' && (
              <StatusBar text={presentation.text.providerDown} />
            )}
            <PhaseTimer hud={hud} presentation={presentation} />
            {presentation.showTeamScores !== false && <TeamScores hud={hud} presentation={presentation} />}
            {presentation.Overlay && <presentation.Overlay hud={hud} live={liveFeed} />}
            <section className="arena">{hud.phase !== 'results' && <CommandHelp presentation={presentation} />}</section>
            <JoinTicker hud={hud} presentation={presentation} />
            {hud.phase === 'results' && hud.lastResult && presentation.showTeamScores !== false && (
              <ResultBanner result={hud.lastResult} presentation={presentation} />
            )}
            {hud.paused && <PausedBanner presentation={presentation} />}
          </>
        )}
      </main>
    </div>
  );
}
