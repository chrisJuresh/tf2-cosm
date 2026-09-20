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
import type { SourceDollarEstimate } from "./dollar-basis.ts";
import { SCRAP_PER_REFINED, unitsToScrap } from "./metal.ts";

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

/**
 * The currencies the catalogue can express a price in. backpack.tf quotes prices
 * in all four — a cheap cosmetic is priced in Random Craft Hats, not in Metal —
 * and each has a rate in `Rates`. Anything else (a price in dollars) leaves the
 * Cosmetic Unpriced rather than converted on a guess.
 */
export const PRICE_CURRENCIES = ["metal", "keys", "hat", "earbuds"] as const;

export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

export function isPriceCurrency(currency: string): currency is PriceCurrency {
  return (PRICE_CURRENCIES as readonly string[]).includes(currency);
}

/** What the snapshot converts a source's figure into a Metal Value with. */
export interface Rates {
  /** Singled out from `scrapPerUnit` because the header records it and Trader Notation splits on it. */
  readonly keyRate: KeyRate;
  /** One unit of each currency the source quotes, in scrap. Metal is nine by definition. */
  readonly scrapPerUnit: ReadonlyMap<string, number>;
  /**
   * The source's own refined-to-dollar estimate, when it publishes one. It
   * converts nothing here — a Metal Value never passes through dollars — but it
   * is a Dollar Basis for the header, and it arrives in the same call the Key
   * Rate does. Undefined when the source quotes Metal in something else.
   */
  readonly dollarEstimate?: SourceDollarEstimate | undefined;
}

/** The rate for a currency, or undefined when the snapshot cannot convert it. */
export function rateFor(rates: Rates, currency: string): number | undefined {
  return isPriceCurrency(currency) ? rates.scrapPerUnit.get(currency) : undefined;
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
  readonly rates: Rates;
  /** Tradable variants by every defindex the source's entry claims — the primary join. */
  readonly byDefindex: ReadonlyMap<number, readonly PricedVariant[]>;
  /** The same variants by `priceKey(name)`, for an entry that claims no defindex. */
  readonly byName: ReadonlyMap<string, readonly PricedVariant[]>;
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

/** One currency's price as the source quotes it: so many of some other currency. */
export interface CurrencyQuote {
  readonly currency: string;
  readonly value: number;
}

/**
 * Every currency's rate in scrap, from the source's own currency table.
 *
 * A currency may be quoted in another currency rather than in Metal — Earbuds
 * are priced in Keys — so this resolves until nothing new lands. Metal is the
 * base and is not taken from the table: its own quote is in dollars, which is
 * the Dollar Basis's business, not this one's.
 */
export function resolveScrapPerUnit(quotes: ReadonlyMap<string, CurrencyQuote>): Map<string, number> {
  const scrapPerUnit = new Map<string, number>([["metal", SCRAP_PER_REFINED]]);
  for (let pass = 0; pass <= quotes.size; pass++) {
    let landedSomething = false;
    for (const [name, quote] of quotes) {
      if (scrapPerUnit.has(name)) continue;
      const base = scrapPerUnit.get(quote.currency);
      if (base === undefined) continue;
      scrapPerUnit.set(name, unitsToScrap(quote.value, base));
      landedSomething = true;
    }
    if (!landedSomething) break;
  }
  return scrapPerUnit;
}

/** One entry of a price list: what it is priced as, and which items it claims. */
export interface PriceListEntry {
  readonly name: string;
  /** The defindexes the source says this entry prices. Empty when it names none. */
  readonly defindexes: readonly number[];
  readonly variants: readonly PricedVariant[];
}

/**
 * The two indexes a `PriceList` joins on. Defindex is primary because it is what
 * the source actually asserts; a name only has to survive both sides spelling it
 * the same way. Two entries claiming one defindex, or reducing to one name key,
 * are ambiguous and are dropped from that index rather than merged — a quiet
 * merge would price one item with another's variants.
 */
export function indexEntries(entries: Iterable<PriceListEntry>): Pick<PriceList, "byDefindex" | "byName"> {
  const byDefindex = new Map<number, readonly PricedVariant[]>();
  const byName = new Map<string, readonly PricedVariant[]>();
  const ambiguousDefindexes = new Set<number>();
  const ambiguousNames = new Set<string>();

  for (const entry of entries) {
    for (const defindex of entry.defindexes) {
      if (byDefindex.has(defindex)) ambiguousDefindexes.add(defindex);
      byDefindex.set(defindex, entry.variants);
    }
    const key = priceKey(entry.name);
    if (byName.has(key)) ambiguousNames.add(key);
    byName.set(key, entry.variants);
  }
  for (const defindex of ambiguousDefindexes) byDefindex.delete(defindex);
  for (const key of ambiguousNames) byName.delete(key);
  return { byDefindex, byName };
}

/**
 * A Cosmetic's variants: by any defindex it or its aliases carry, else by name.
 * Undefined means the source prices no copy of this Cosmetic at all.
 */
export function variantsFor(
  prices: PriceList,
  defindexes: readonly number[],
  name: string,
): readonly PricedVariant[] | undefined {
  for (const defindex of defindexes) {
    const matched = prices.byDefindex.get(defindex);
    if (matched) return matched;
  }
  return prices.byName.get(priceKey(name));
}
