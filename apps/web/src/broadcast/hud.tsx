import type { HudState, RoundResult } from '@live-game/contracts';
import type { ModePresentation } from '../game-modes/types';
import { useNow, useRealtime } from '../realtime/react';
import { formatClock, remainingMs } from '../realtime/time';

const FALLBACK_COLOR = '#8a8a99';

function teamColor(presentation: ModePresentation, teamId: string): string {
  return presentation.teamColors[teamId] ?? FALLBACK_COLOR;
}

export function PhaseTimer({ hud, presentation }: { hud: HudState; presentation: ModePresentation }) {
  const clockOffsetMs = useRealtime((state) => state.clockOffsetMs);
  const now = useNow(200);
  const playerCount = hud.teams.reduce((sum, team) => sum + team.playerCount, 0);

  return (
    <header className="top">
      <div className="phase">{presentation.text.phase[hud.phase]}</div>
      <div className="clock">{formatClock(remainingMs(hud, clockOffsetMs, now))}</div>
      <div className="meta">
        {hud.round > 0 && <span>{presentation.text.round(hud.round)}</span>}
        <span>{presentation.text.players(playerCount)}</span>
      </div>
    </header>
  );
}

export function TeamScores({ hud, presentation }: { hud: HudState; presentation: ModePresentation }) {
  const best = Math.max(...hud.teams.map((team) => team.score));
  const tied = hud.teams.filter((team) => team.score === best).length > 1;

  return (
    <section className="scores">
      {hud.teams.map((team) => {
        const leading = !tied && team.score === best && best > 0;
        return (
          <div
            key={team.id}
            className={leading ? 'team leading' : 'team'}
            style={{ borderColor: teamColor(presentation, team.id), background: `${teamColor(presentation, team.id)}cc` }}
          >
            <div className="team-name">{team.name}</div>
            <div className="team-score">{team.score}</div>
            <div className="team-count">{presentation.text.players(team.playerCount)}</div>
          </div>
        );
      })}
    </section>
  );
}

export function CommandHelp({ presentation }: { presentation: ModePresentation }) {
  return (
    <section className="help">
      <div className="help-title">{presentation.text.commandsTitle}</div>
      <div className="chips">
        {presentation.text.commands.map((command) => (
          <span key={command} className="chip">
            {command}
          </span>
        ))}
      </div>
    </section>
  );
}

export function JoinTicker({ hud, presentation }: { hud: HudState; presentation: ModePresentation }) {
  const joiners = useRealtime((state) => state.joiners);
  const teamNames = Object.fromEntries(hud.teams.map((team) => [team.id, team.name]));

  return (
    <footer className="ticker" aria-live="off">
      {joiners.map((joiner) => (
        <div key={joiner.key} className="joiner" style={{ borderLeftColor: teamColor(presentation, joiner.teamId) }}>
          {presentation.text.joined(joiner.name, teamNames[joiner.teamId] ?? joiner.teamId)}
        </div>
      ))}
    </footer>
  );
}

export function ResultBanner({ result, presentation }: { result: RoundResult; presentation: ModePresentation }) {
  const winner = result.teams.find((team) => team.id === result.winner);
  const scores = result.teams.map((team) => team.score).join(' – ');

  return (
    <div className="overlay result">
      <div className="banner">
        {winner ? (
          <>
            <div className="banner-label">{presentation.text.winner}</div>
            <div className="banner-title" style={{ color: teamColor(presentation, winner.id) }}>
              {winner.name}
            </div>
          </>
        ) : (
          <div className="banner-title">{presentation.text.draw}</div>
        )}
        <div className="banner-scores">{scores}</div>
      </div>
    </div>
  );
}

export function PausedBanner({ presentation }: { presentation: ModePresentation }) {
  return (
    <div className="overlay paused">
      <div className="banner banner-title">{presentation.text.paused}</div>
    </div>
  );
}

export function StatusBar({ text }: { text: string }) {
  return <div className="status-bar">{text}</div>;
}
