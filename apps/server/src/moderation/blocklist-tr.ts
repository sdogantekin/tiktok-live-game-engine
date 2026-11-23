/**
 * A starter list of Turkish words that must never appear on a live stream: strong profanity, sexual insults and slurs.
 * It is a starting point, not a guarantee: any list misses spellings, other languages and context, so on a real stream the
 * operator's chat switch and per-player hide are the safety net. Games add their own words on top.
 *
 * Format (both sides are folded before comparing: case, Turkish letters, look-alike digits and symbols, spacing; one word
 * at a time, so a whole-word entry does not fire inside harmless words):
 *   `word`   matches that whole word only (so `sik` does not catch `sıkıntı` or `sikke`)
 *   `stem*`  matches any word that starts with the stem (for words with many endings)
 * Entries are chosen to avoid common innocent words (for example `götür`, `sokarım` and `yaşar` are deliberately absent).
 */
export const BLOCKLIST_TR: readonly string[] = [
  // profanity and sexual insults
  'amk',
  'aq',
  'amq',
  'amına*',
  'amcık*',
  'sik',
  'sikt*',
  'sikik*',
  'sikiş*',
  'siktir*',
  'sikeyim*',
  'yarrak*',
  'orospu*',
  'oruspu*',
  'piç',
  'piçler',
  'götü',
  'götün*',
  'götten',
  'götveren*',
  'ananı*',
  'bacını*',
  // slurs and degrading insults
  'ibne*',
  'gavat*',
  'pezevenk*',
  'puşt',
  'kahpe*',
  'dangalak',
  'şerefsiz*',
  // threats
  'öldüreceğim*',
  'geberte*',
];
