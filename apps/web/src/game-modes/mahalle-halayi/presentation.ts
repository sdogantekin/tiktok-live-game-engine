import type { ModePresentation } from '../types';
import { Scene } from './Scene';
import { camera } from './scene-config';

export const mahalleHalayiPresentation: ModePresentation = {
  id: 'mahalle-halayi',
  title: 'Mahalle Halayı',
  camera,
  Scene,
  teamColors: { gelin: '#e0457b', damat: '#2f6fdb' },
  text: {
    phase: {
      stopped: 'Oyun yakında başlıyor',
      lobby: 'Takımını seç!',
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
    providerDown: 'Yorum bağlantısı koptu, oyun devam ediyor',
  },
};
