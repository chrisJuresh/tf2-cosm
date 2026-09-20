/**
 * The one seam every price crosses (ADR-0002).
 *
 * backpack.tf is the origin of community prices today, but pricedb.io mirrors it
 * and others may follow, so the catalogue only ever sees a `PriceList`: a Key
 * Rate and, per item name, the tradable variants that item is priced in. Adding
 * a second source means writing one `PriceSource` and nothing else.
 *
 * Item names are the key because ADR-0003 already makes the English display name
 * a Cosmetic's identity, and every price source keys its list the same way.
 */

/**
 * The Qualities a copy of an item carries, by Valve's schema ids — the same ids
 * a price source keys its per-item price table by.
 */
export const QUALITIES_BY_ID = {
  0: "normal",
  1: "genuine",
  2: "rarity2",
  3: "vintage",
  4: "rarity3",
  5: "unusual",
  6: "unique",
  7: "community",
  8: "valve",
  9: "self-made",
  10: "customized",
  11: "strange",
  12: "completed",
  13: "haunted",
  14: "collectors",
  15: "decorated",
} as const;

export const QUALITIES = Object.values(QUALITIES_BY_ID);

export type Quality = (typeof QUALITIES_BY_ID)[keyof typeof QUALITIES_BY_ID];

/** The Quality an item is issued in when nothing says otherwise. */
export const DEFAULT_NATIVE_QUALITY: Quality = "unique";

export function qualityFromId(id: number | undefined): Quality | undefined {
  if (id === undefined) return undefined;
  return QUALITIES_BY_ID[id as keyof typeof QUALITIES_BY_ID];
}

/** The currencies a price can be quoted in that the catalogue knows how to convert. */
export const PRICE_CURRENCIES = ["metal", "keys"] as const;

export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

export function isPriceCurrency(currency: string): currency is PriceCurrency {
  return (PRICE_CURRENCIES as readonly string[]).includes(currency);
}

/**
 * One priced Quality-and-craftability combination of an item. Only tradable
 * variants reach here: an untradable copy has no trade price to report.
 */
export interface PricedVariant {
  readonly quality: Quality;
  readonly craftable: boolean;
  readonly currency: string;
  /** The low figure in `currency`, as the source quotes it. */
  readonly low: number;
  /** The high figure in `currency`; equal to `low` when the source gives one figure. */
  readonly high: number;
  /**
   * The same two figures in Refined, unrounded, when the source computes them
   * itself. Recorded for comparison only — the catalogue converts with its own
   * Key Rate so that the snapshot is internally consistent.
   */
  readonly lowRefined?: number | undefined;
  readonly highRefined?: number | undefined;
  readonly lastUpdatedAt: string;
}

/** How much Metal one Key trades for, at the moment the snapshot was taken. */
export interface KeyRate {
  readonly scrapPerKey: number;
  readonly lastUpdatedAt: string;
}

export interface PriceList {
  /** What the catalogue header records about where the prices came from. */
  readonly source: string;
  readonly takenAt: string;
  readonly keyRate: KeyRate;
  /** Tradable variants per item, keyed by `priceKey(name)`. */
  readonly items: ReadonlyMap<string, readonly PricedVariant[]>;
}

export interface PriceSource {
  readonly description: string;
  load(): Promise<PriceList>;
}

/**
 * The key both sides of the join are reduced to. Sources differ on the leading
 * "The" and on casing, and neither difference makes it a different item.
 */
export function priceKey(name: string): string {
  return name
    .trim()
    .replace(/^the\s+/i, "")
    .replaceAll(/\s+/g, " ")
    .toLowerCase();
}

/** Every variant of an item, indexed the way `priceKey` spells its name. */
export function indexByName(entries: Iterable<readonly [string, readonly PricedVariant[]]>): Map<string, readonly PricedVariant[]> {
  const items = new Map<string, readonly PricedVariant[]>();
  for (const [name, variants] of entries) {
    const key = priceKey(name);
    const existing = items.get(key);
    // Two source names reducing to one key (say "The Gibus" and "Gibus") are the
    // same Cosmetic to ADR-0003, so their variants pool rather than one winning.
    items.set(key, existing ? [...existing, ...variants] : variants);
  }
  return items;
}
