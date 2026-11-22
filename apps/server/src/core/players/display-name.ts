export const MAX_DISPLAY_NAME_GRAPHEMES = 24;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Cleans an untrusted display name: strips control/invisible characters, limits stacked marks, truncates by grapheme. */
export function sanitizeDisplayName(raw: string, fallback = 'Viewer'): string {
  const cleaned = raw
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\p{M}{3,}/gu, (marks) => Array.from(marks).slice(0, 2).join('')) // tame "zalgo" text
    .trim();

  // Bound the work done on pathological input before segmenting.
  const graphemes = Array.from(segmenter.segment(cleaned.slice(0, 256)), (part) => part.segment);
  const truncated = graphemes.slice(0, MAX_DISPLAY_NAME_GRAPHEMES).join('').trim();
  return truncated.length > 0 ? truncated : fallback;
}
