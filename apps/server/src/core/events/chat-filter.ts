/**
 * Moderation of conversational comments before they may appear on a stream. Pure and deterministic. What it does:
 * cleans the text (control, zero-width and bidi characters, spacing), rejects links, @mentions and phone numbers,
 * calms shouting and repeated letters, shortens to what fits on screen, and rejects anything on the blocklist, which
 * is compared word by word after folding case, Turkish letters, look-alike digits and spacing, so `S1KT1R` and `s i k t i r`
 * are caught while a whole-word entry such as `sik` does not fire inside `sıkıntı`.
 * This is best effort: a list cannot know every spelling, language or context.
 */
export type ChatVerdict = { ok: true; text: string } | { ok: false; reason: 'empty' | 'link' | 'mention' | 'phone' | 'blocked' };

export interface ChatFilterConfig {
  /** Longest text shown, in characters (longer comments are shortened with an ellipsis). */
  maxLength: number;
  /** Extra blocked words, in the format of `moderation/blocklist-tr.ts` (`word` or `stem*`). */
  blocklist: readonly string[];
}

const LOOK_ALIKES: Readonly<Record<string, string>> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '$': 's' };

/** Folds text for comparison: lower-case (Turkish locale), no diacritics, ı as i, look-alike digits and symbols as letters. */
function fold(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/(?<=\p{L})!(?=\p{L})/gu, 'i') // `s!kt!r`, but not the `!` that ends a shout
    .replace(/[013457$]/g, (ch) => LOOK_ALIKES[ch]!);
}

/** One letter for each run of the same letter (`siiiktir` becomes `siktir`). */
const squeeze = (word: string) => word.replace(/(.)\1+/gu, '$1');

interface Entry {
  prefix: boolean;
  word: string;
  squeezed: string;
}

function compile(blocklist: readonly string[]): Entry[] {
  return blocklist.map((raw) => {
    const prefix = raw.endsWith('*');
    const word = fold(prefix ? raw.slice(0, -1) : raw).replace(/[^a-z]/g, '');
    return { prefix, word, squeezed: squeeze(word) };
  });
}

function matches(entry: Entry, token: string): boolean {
  const squeezed = squeeze(token);
  return entry.prefix ? token.startsWith(entry.word) || squeezed.startsWith(entry.squeezed) : token === entry.word || squeezed === entry.squeezed;
}

/** The words of a text as comparison tokens, plus the joined form of any run of single letters (`s i k t i r`). */
function tokens(text: string): string[] {
  const words = fold(text).split(/[^a-z]+/).filter(Boolean);
  const out = [...words];
  let run = '';
  for (const word of [...words, '']) {
    if (word.length === 1) run += word;
    else {
      if (run.length > 1) out.push(run);
      run = '';
    }
  }
  return out;
}

const LINK = /(?:https?:\/\/|www\.)|\b[\p{L}\d-]+\.(?:com|net|org|tr|ly|me|io|gg|xyz|co|info|app|tv|link|live|shop|site|online)\b/iu;

export function createChatFilter(config: ChatFilterConfig): (raw: string) => ChatVerdict {
  const entries = compile(config.blocklist);

  return (raw) => {
    let text = raw
      .normalize('NFC')
      .replace(/[\p{Cc}\p{Cf}]/gu, '') // control, zero-width and bidi characters
      .replace(/\s+/gu, ' ')
      .trim();
    if (text === '') return { ok: false, reason: 'empty' };

    if (LINK.test(text)) return { ok: false, reason: 'link' };
    if (text.includes('@')) return { ok: false, reason: 'mention' };
    if ((text.match(/\d/g) ?? []).length >= 7) return { ok: false, reason: 'phone' };

    text = text.replace(/(.)\1{3,}/gu, '$1$1$1'); // at most three of the same character in a row
    const letters = [...text].filter((ch) => /\p{L}/u.test(ch));
    if (letters.length >= 8 && letters.filter((ch) => ch !== ch.toLocaleLowerCase('tr')).length / letters.length > 0.7) {
      text = text.toLocaleLowerCase('tr'); // SHOUTING becomes normal speech
    }
    const characters = [...text];
    if (characters.length > config.maxLength) text = `${characters.slice(0, Math.max(1, config.maxLength - 1)).join('').trimEnd()}…`;

    const words = tokens(text);
    if (entries.some((entry) => words.some((word) => matches(entry, word)))) return { ok: false, reason: 'blocked' };
    return { ok: true, text };
  };
}
