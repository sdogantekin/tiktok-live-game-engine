import { floatingAnchors } from '../../game-renderer/name-tags';
import type { ModePresentation } from '../types';
import { Overlay } from './Overlay';
import { Scene } from './Scene';
import { camera, MAX_RACERS } from './scene-config';
import { soundDesign } from './sound-design';

export const atYarisiPresentation: ModePresentation = {
  id: 'at-yarisi',
  title: 'At Yarışı',
  camera,
  Scene,
  tagAnchors: floatingAnchors(MAX_RACERS),
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
