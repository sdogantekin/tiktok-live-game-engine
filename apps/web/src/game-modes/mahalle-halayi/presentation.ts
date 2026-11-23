import type { ModePresentation } from '../types';
import { Scene } from './Scene';
import { computeTagAnchors } from '../../game-renderer/name-tags';
import { slotCapacities } from '../../game-renderer/avatar-slots';
import { AVATAR_CAP, camera, formation, TEAM_IDS } from './scene-config';
import { soundDesign } from './sound-design';

export const mahalleHalayiPresentation: ModePresentation = {
  id: 'mahalle-halayi',
  title: 'Mahalle Halayı',
  camera,
  Scene,
  tagAnchors: computeTagAnchors(camera, formation, slotCapacities(TEAM_IDS, AVATAR_CAP)),
  simulatorDefaultWord: 'halay',
  soundDesign,
  teamColors: { gelin: '#e0457b', damat: '#2f6fdb' },
  text: {
    phase: {
      stopped: 'Oyun yakında başlıyor',
      lobby: 'Tarafını seç!',
      countdown: 'Başlıyor',
      active: 'Halay zamanı!',
      results: 'Sonuç',
    },
    round: (round) => `${round}. tur`,
    players: (count) => `${count} oyuncu`,
    paused: 'Oyun duraklatıldı',
    winner: 'Kazanan',
    draw: 'Berabere!',
    commandsTitle: 'Yorum yaz, oyuna katıl!',
    commands: ['gelin', 'damat', 'halay', 'zıpla', 'oyna'],
    joined: (name, teamName) => `${name} → ${teamName}`,
    connecting: 'Bağlanıyor…',
    enableSound: 'Sesi açmak için dokun',
    providerDown: 'Yorum bağlantısı koptu, oyun devam ediyor',
  },
};
