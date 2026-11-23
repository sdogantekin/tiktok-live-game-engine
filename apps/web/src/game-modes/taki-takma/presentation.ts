import { slotCapacities } from '../../game-renderer/avatar-slots';
import { computeTagAnchors } from '../../game-renderer/name-tags';
import type { ModePresentation } from '../types';
import { Scene } from './Scene';
import { AVATAR_CAP, camera, formation, TEAM_IDS } from './scene-config';
import { soundDesign } from './sound-design';

export const takiTakmaPresentation: ModePresentation = {
  id: 'taki-takma',
  title: 'Takı Takma Töreni',
  camera,
  Scene,
  tagAnchors: computeTagAnchors(camera, formation, slotCapacities(TEAM_IDS, AVATAR_CAP)),
  simulatorDefaultWord: 'tak',
  soundDesign,
  teamColors: { gelin: '#e0457b', damat: '#2f6fdb' },
  text: {
    phase: {
      stopped: 'Tören yakında başlıyor',
      lobby: 'Tarafını seç!',
      countdown: 'Başlıyor',
      active: 'Takı zamanı!',
      results: 'Sonuç',
    },
    round: (round) => `${round}. tur`,
    players: (count) => `${count} misafir`,
    paused: 'Tören duraklatıldı',
    winner: 'Daha cömert taraf',
    draw: 'Berabere!',
    commandsTitle: 'Yorum yaz, takı tak!',
    commands: ['gelin', 'damat', 'tak', 'alkış'],
    joined: (name, teamName) => `${name} → ${teamName}`,
    connecting: 'Bağlanıyor…',
    enableSound: 'Sesi açmak için dokun',
    providerDown: 'Yorum bağlantısı koptu, tören devam ediyor',
  },
};
