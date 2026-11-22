/** Comments longer than this (after cleaning) are never commands. */
export const MAX_COMMENT_LENGTH = 100;

/**
 * Turkish-aware comparison key: lower-cases with the `tr` locale (I→ı, İ→i), then folds
 * diacritics and dotless ı to ASCII, so `ZIPLA`, `Zıpla` and `zipla` are the same key.
 */
function foldTurkish(text: string): string {
  return text.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
}

/**
 * Normalizes a viewer comment (or a configured command word) into a command key.
 * Returns null for empty or over-long input. Matching is exact on the whole comment,
 * so punctuation or extra words ("halay!", "halay halay") produce keys that match no command.
 */
export function normalizeComment(raw: string): string | null {
  const cleaned = raw
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '') // control, zero-width and bidi characters
    .replace(/\s+/gu, ' ')
    .trim();

  if (cleaned.length === 0 || cleaned.length > MAX_COMMENT_LENGTH) return null;
  return foldTurkish(cleaned);
}
