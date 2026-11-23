import type { ModePresentation } from '../types';
import { Overlay } from './Overlay';
import { Scene } from './Scene';
import { soundDesign } from './sound-design';

export const atYarisiPresentation: ModePresentation = {
  id: 'at-yarisi',
  title: 'At Yarışı',
  // PLACEHOLDER camera until Step 4.3: straight down over the whole track.
  camera: { position: [0, 62, 0.01], lookAt: [0, 0, 0], fov: 52 },
  Scene,
  tagAnchors: {},
  simulatorDefaultWord: '1',
  soundDesign,
  showTeamScores: false,
  Overlay,
  teamColors: { yarisci: '#f2b705' },
  text: {
    phase: {
      stopped: 'Yarış yakında başlıyor',
      lobby: 'Yarışçılar toplanıyor',
      countdown: 'Başlıyor',
      active: 'Yarış başladı!',
      results: 'Sonuç',
    },
    round: (round) => `${round}. yarış`,
    players: (count) => `${count} katılımcı`,
    paused: 'Yarış duraklatıldı',
    winner: 'Kazanan',
    draw: 'Berabere!',
    commandsTitle: 'Yorum yaz, yarışa katıl!',
    commands: ['1'],
    joined: (name) => `${name} yarışa katıldı`,
    connecting: 'Bağlanıyor…',
    enableSound: 'Sesi açmak için dokun',
    providerDown: 'Yorum bağlantısı koptu, yarış devam ediyor',
  },
};
