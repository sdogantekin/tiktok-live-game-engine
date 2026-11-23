import type { ModeId, Phase } from '@live-game/contracts';
import type { ComponentType } from 'react';
import type { TagAnchor } from '../game-renderer/name-tags';
import type { SoundDesign } from '../game-renderer/audio/types';
import type { CameraConfig, SceneProps } from '../game-renderer/types';

/** Everything the web app needs to present a game mode. Visual style and wording live here, not in shared UI. */
export interface ModePresentation {
  id: ModeId;
  title: string;
  /** Fixed camera framing for the 3D scene. */
  camera: CameraConfig;
  /** The 3D scene for this mode, rendered inside the renderer's Stage. */
  Scene: ComponentType<SceneProps>;
  /** Screen anchors of every avatar slot, for the name-tag layer. */
  tagAnchors: Readonly<Record<string, TagAnchor>>;
  /** The viewer word the operator's simulator panel preselects (the words themselves are `text.commands`). */
  simulatorDefaultWord: string;
  /** The mode's music and sound effects (also rendered offline by the loudness check). */
  soundDesign: SoundDesign;
  /** Team accent colours by team id. */
  teamColors: Readonly<Record<string, string>>;
  text: {
    phase: Readonly<Record<Phase, string>>;
    round: (round: number) => string;
    players: (count: number) => string;
    paused: string;
    winner: string;
    draw: string;
    /** Instruction chips shown while viewers can still play. */
    commands: readonly string[];
    commandsTitle: string;
    joined: (name: string, teamName: string) => string;
    connecting: string;
    /** Shown until the page has had the click that browsers require before they play sound. */
    enableSound: string;
    providerDown: string;
  };
}
