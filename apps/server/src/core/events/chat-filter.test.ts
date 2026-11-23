import { describe, expect, it } from 'vitest';
import { BLOCKLIST_TR } from '../../moderation/blocklist-tr';
import { createChatFilter } from './chat-filter';

const filter = createChatFilter({ maxLength: 30, blocklist: [...BLOCKLIST_TR, 'badword', 'nasty*'] });
const reason = (text: string) => {
  const verdict = filter(text);
  return verdict.ok ? 'ok' : verdict.reason;
};

describe('chat filter', () => {
  it('lets ordinary talk through, cleaned', () => {
    expect(filter('  Çok güzel  bir düğün  ')).toEqual({ ok: true, text: 'Çok güzel bir düğün' });
    expect(filter('Allah mutluluk versin 🎉')).toEqual({ ok: true, text: 'Allah mutluluk versin 🎉' });
  });

  it('removes control, zero-width and bidi characters', () => {
    expect(filter('he​llo‮ wor\u0000ld')).toEqual({ ok: true, text: 'hello world' });
  });

  it('rejects empty text', () => {
    expect(reason('')).toBe('empty');
    expect(reason(' ​ \n')).toBe('empty');
  });

  it('rejects links, mentions and phone numbers', () => {
    expect(reason('bak https://x.example/a')).toBe('link');
    expect(reason('www.site')).toBe('link');
    expect(reason('hesabım ornek.com')).toBe('link');
    expect(reason('beni takip et @ali')).toBe('mention');
    expect(reason('ara 0555 123 45 67')).toBe('phone');
    expect(reason('ara 05551234567')).toBe('phone');
    expect(reason('2024 yılı 3 kişi')).toBe('ok');
  });

  it('calms repeated characters and shouting', () => {
    expect(filter('yaaaaaaşasııııın')).toEqual({ ok: true, text: 'yaaaşasııın' });
    expect(filter('HERKESE MUTLULUKLAR')).toEqual({ ok: true, text: 'herkese mutluluklar' });
    expect(filter('OK')).toEqual({ ok: true, text: 'OK' });
  });

  it('shortens long text with an ellipsis', () => {
    const verdict = filter('a'.repeat(3) + ' bir iki üç dört beş altı yedi sekiz dokuz on');
    expect(verdict.ok && [...verdict.text].length).toBeLessThanOrEqual(30);
    expect(verdict.ok && verdict.text.endsWith('…')).toBe(true);
  });

  it('blocks listed words however they are written', () => {
    for (const text of ['siktir', 'SİKTİR', 'S1KT1R', 's i k t i r', 'siiiktir', 's.i.k.t.i.r', 'amk', 'AMK!', 'badword', 's!kt!r', 'nasty', 'nastyboy']) {
      expect(reason(text)).toBe('blocked');
    }
  });

  it('does not block innocent words that contain a listed word', () => {
    for (const text of ['sıkıntı yok', 'sikke taktı', 'Yaşar abi çok iyi', 'götür beni', 'sokarım', 'amca geldi', 'passionate']) {
      expect(reason(text)).toBe('ok');
    }
  });

  it('catches a blocked word hidden in a longer sentence', () => {
    expect(reason('bu düğün çok güzel orospu çocuğu')).toBe('blocked');
  });

  it('survives hostile input without throwing', () => {
    for (const text of ['\u0000'.repeat(500), '(.)'.repeat(1000), 'a'.repeat(100_000), '𝕤𝕚𝕜𝕥𝕚𝕣', '<script>alert(1)</script>']) {
      expect(() => filter(text)).not.toThrow();
    }
    expect(filter('<script>alert(1)</script>').ok).toBe(true); // markup is harmless: the screen only renders text nodes
  });
});
