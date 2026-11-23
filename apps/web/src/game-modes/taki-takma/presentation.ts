import { mahalleHalayiPresentation } from '../mahalle-halayi/presentation';
import type { ModePresentation } from '../types';

/**
 * PLACEHOLDER until Step 3.4: Takı Takma Töreni borrows the Mahalle Halayı scene, camera and sound so the game can be played
 * end to end from the operator dashboard. Step 3.4 replaces the scene, characters and sound; only wording lives here for now.
 */
export const takiTakmaPresentation: ModePresentation = {
  ...mahalleHalayiPresentation,
  id: 'taki-takma',
  title: 'Takı Takma Töreni',
  simulatorDefaultWord: 'tak',
  text: {
    ...mahalleHalayiPresentation.text,
    phase: {
      stopped: 'Tören yakında başlıyor',
      lobby: 'Tarafını seç!',
      countdown: 'Başlıyor',
      active: 'Takı zamanı!',
      results: 'Sonuç',
    },
    commandsTitle: 'Yorum yaz, takı tak!',
    commands: ['gelin', 'damat', 'tak', 'alkış'],
  },
};
