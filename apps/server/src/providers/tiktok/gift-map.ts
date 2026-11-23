import type { GiftKeyFor } from './messages';

/**
 * Which TikTok gifts mean which of the game's semantic gift keys. The engine never sees a price or a coin value; this map
 * is the only place a TikTok gift is turned into a game key. The values below are placeholders chosen for the first
 * private test: the real tiers are a product decision (and gifts stay cosmetic whatever they are mapped to).
 */
export interface GiftMap {
  /** Exact gift names (case-insensitive) that map to a key. Checked first. */
  byName: Readonly<Record<string, string>>;
  /** Otherwise the gift's value in diamonds picks the highest tier it reaches. Highest first. */
  tiers: readonly { minDiamonds: number; key: string }[];
}

export const DEFAULT_GIFT_MAP: GiftMap = {
  byName: { rose: 'rose', gg: 'gg' },
  tiers: [
    { minDiamonds: 1000, key: 'big_celebration' },
    { minDiamonds: 99, key: 'gg' },
    { minDiamonds: 1, key: 'rose' },
  ],
};

/** Builds the lookup the parser uses. A gift worth nothing (0 diamonds, unnamed) maps to nothing. */
export function giftKeyLookup(map: GiftMap = DEFAULT_GIFT_MAP): GiftKeyFor {
  const byName = new Map(Object.entries(map.byName).map(([name, key]) => [name.toLowerCase(), key]));
  return ({ name, diamondCount }) => {
    const named = byName.get(name.trim().toLowerCase());
    if (named !== undefined) return named;
    return map.tiers.find((tier) => diamondCount >= tier.minDiamonds)?.key ?? null;
  };
}
