import {
  DEFAULT_SOUND_SETTINGS,
  type HudState,
  type ModeId,
  type ChatSettings,
  type ProviderInfo,
  type ProviderStatus,
  type PublicSnapshot,
  type RankingEntry,
  type RoundResult,
  type SoundSettings,
  type TeamDefinition,
} from '@live-game/contracts';
import type { Clock } from '../clock';
import { type AssignResult, type Player, PlayerService } from '../players/player-service';
import {
  DEFAULT_ROUND_TIMINGS,
  type PhaseTransition,
  RoundService,
  type RoundTimings,
  type TransitionResult,
} from '../rounds/round-service';
import { decideWinner, ScoringService } from '../scoring/scoring-service';
import { TeamService } from '../teams/team-service';

export interface GameStateOptions {
  /** Whether the game shows viewers' comments, and whether that starts switched on. */
  chatSupported?: boolean;
  chatEnabled?: boolean;
  modeId: ModeId;
  teams: readonly TeamDefinition[];
  clock: Clock;
  timings?: RoundTimings;
  maxPlayers?: number;
}

export type EnergyResult =
  | { ok: true }
  | { ok: false; reason: 'unknown_player' | 'no_team' | 'not_scoring' };

/** Canonical authoritative state: composes the core services and produces snapshots. */
export class GameState {
  readonly players: PlayerService;
  readonly teams: TeamService;
  readonly scoring: ScoringService;
  readonly rounds: RoundService;
  private _lastResult: RoundResult | null = null;
  private _providerStatus: ProviderStatus = 'none';
  private providerInfoSource: (() => ProviderInfo) | undefined;
  private rankingSource: (() => readonly RankingEntry[]) | undefined;
  private _chat: ChatSettings;
  private _sound: SoundSettings = { ...DEFAULT_SOUND_SETTINGS };

  constructor(private readonly options: GameStateOptions) {
    this._chat = { supported: options.chatSupported ?? false, enabled: options.chatEnabled ?? false };
    this.players = new PlayerService(
      options.teams.map((team) => team.id),
      options.maxPlayers,
    );
    this.teams = new TeamService(options.teams, this.players);
    this.scoring = new ScoringService(this.teams.ids());
    this.rounds = new RoundService(
      options.timings ?? DEFAULT_ROUND_TIMINGS,
      options.clock,
      (transition) => this.handleTransition(transition),
    );
  }

  get lastResult(): RoundResult | null {
    return this._lastResult;
  }

  registerViewer(playerId: string, rawName: string): Player | null {
    return this.players.register(playerId, rawName, this.options.clock.now());
  }

  /**
   * First assignment is allowed in any phase (late joiners). Switching teams is allowed only before the
   * round starts (stopped, lobby, countdown), unless `force` is set for an operator correction.
   */
  joinTeam(playerId: string, teamId: string, options: { force?: boolean } = {}): AssignResult {
    const phase = this.rounds.phase;
    const allowSwitch =
      options.force === true || phase === 'stopped' || phase === 'lobby' || phase === 'countdown';
    return this.players.assignTeam(playerId, teamId, { allowSwitch });
  }

  /** Adds team energy on behalf of a player. Accepted only in an unpaused active round and for team members. */
  addEnergy(playerId: string, points: number): EnergyResult {
    const player = this.players.get(playerId);
    if (!player || player.ignored) return { ok: false, reason: 'unknown_player' };
    if (player.teamId === null) return { ok: false, reason: 'no_team' };
    if (!this.rounds.isScoring) return { ok: false, reason: 'not_scoring' };

    this.scoring.add(player.teamId, points);
    this.players.recordAction(playerId, this.options.clock.now(), points);
    return { ok: true };
  }

  /** Operator override: zero the current round's team scores. */
  resetRoundScore(): TransitionResult {
    if (this.rounds.phase !== 'active') return { ok: false, reason: 'invalid_phase' };
    this.scoring.reset();
    return { ok: true };
  }

  tick(): void {
    this.rounds.tick();
  }

  get providerStatus(): ProviderStatus {
    return this._providerStatus;
  }

  setProviderStatus(status: ProviderStatus): void {
    this._providerStatus = status;
  }

  /**
   * Adopts the settings that belong to the running server, not to a game, from the state this one replaces (the operator's
   * sound settings, the active provider's status and what it reports), so switching games does not lose them.
   */
  carryOverFrom(previous: GameState): void {
    this._sound = previous._sound;
    if (this._chat.supported) this._chat = { ...this._chat, enabled: previous._chat.enabled }; // the operator's choice survives a switch
    this._providerStatus = previous._providerStatus;
    this.providerInfoSource = previous.providerInfoSource;
  }

  /** For a game that ranks individuals: where the results get the final ranking from (read when a round ends). */
  setRankingSource(source: () => readonly RankingEntry[]): void {
    this.rankingSource = source;
  }

  /** How the HUD learns what the active provider is doing; read each time the HUD is built, so it is always current. */
  setProviderInfoSource(source: () => ProviderInfo): void {
    this.providerInfoSource = source;
  }

  get chat(): ChatSettings {
    return this._chat;
  }

  setChatEnabled(enabled: boolean): void {
    this._chat = { ...this._chat, enabled };
  }

  get sound(): SoundSettings {
    return this._sound;
  }

  setSound(change: Partial<SoundSettings>): void {
    this._sound = { muted: change.muted ?? this._sound.muted, volume: change.volume ?? this._sound.volume };
  }

  /** Everything except the roster; cheap enough to build several times per second. */
  hud(): HudState {
    return {
      modeId: this.options.modeId,
      serverNow: this.options.clock.now(),
      phase: this.rounds.phase,
      paused: this.rounds.paused,
      round: this.rounds.round,
      phaseEndsAt: this.rounds.phaseEndsAt,
      remainingMs: this.rounds.remainingMs,
      providerStatus: this._providerStatus,
      chat: this._chat,
      ...(this.providerInfoSource ? { providerInfo: this.providerInfoSource() } : {}),
      sound: this._sound,
      teams: this.standings(),
      lastResult: this._lastResult,
    };
  }

  snapshot(): PublicSnapshot {
    return {
      ...this.hud(),
      players: this.players.list().map((player) => ({
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        joinedAt: player.joinedAt,
        lastActiveAt: player.lastActiveAt,
      })),
    };
  }

  private standings(): PublicSnapshot['teams'] {
    return this.teams.list().map((team) => ({
      id: team.id,
      name: team.name,
      score: this.scoring.get(team.id),
      playerCount: this.teams.memberCount(team.id),
    }));
  }

  private handleTransition({ from, to, round }: PhaseTransition): void {
    // A new round begins when leaving the lobby: start from zero.
    if (from === 'lobby' && (to === 'countdown' || to === 'active')) this.scoring.reset();

    if (to === 'results') {
      const teams = this.standings();
      this._lastResult = {
        round,
        winner: decideWinner(teams.map((team) => ({ id: team.id, score: team.score }))),
        teams,
        ...(this.rankingSource ? { ranking: [...this.rankingSource()] } : {}),
      };
    }
  }
}
