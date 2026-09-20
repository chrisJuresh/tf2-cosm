/**
 * The one place the site turns a price into words or into money.
 *
 * Everything here is pure and takes only what the catalogue already carries, so
 * the tests drive it directly and the components never do arithmetic of their
 * own. The Metal arithmetic itself is the data job's (`@tf2-cosm/data`): a
 * Trader Notation formatted here and one recorded in the catalogue come out of
 * the same function at the same Key Rate, so the two can never disagree.
 *
 * A Dollar Basis is the key-to-dollar rate a dollar figure is computed from. The
 * catalogue's header carries all three, already anchored to the snapshot's own
 * Key Rate; the site picks one out and does no rate arithmetic of its own. Only
 * the Steam Community Market one is picked here — the switch between all three
 * is #14.
 */
import type { DollarBases, Metal } from "@tf2-cosm/data/catalogue";
import { formatRefined, scrapToRefined, traderNotation } from "@tf2-cosm/data/prices/metal";

export interface DollarBasis {
  /** What the viewer is told a dollar means here. */
  readonly label: string;
  /** What a Key costs under this basis, which is how a viewer recognises it. */
  readonly usdPerKey: number;
  readonly usdPerRefined: number;
}

/**
 * The Steam Community Market basis, out of the header. ADR-0002 uses the Market
 * for the Key's dollar price and nothing else, because classic Unique cosmetics
 * are not marketable there.
 *
 * The lowest listing is what a viewer would actually pay, so it is preferred
 * over the median. Null when the run took no price snapshot, or when the Market
 * did not answer — a dollar figure nobody can stand behind is worse than none.
 */
export function steamMarketBasis(bases: DollarBases | null): DollarBasis | null {
  const market = bases?.steamCommunityMarket;
  if (market === undefined || market === null) return null;
  const rate = market.lowest ?? market.median;
  if (rate === null) return null;
  return { label: "Steam Community Market", usdPerKey: rate.usdPerKey, usdPerRefined: rate.usdPerRefined };
}

/**
 * Trader Notation — "2 keys, 1.33 ref". The Key Rate decides where the split
 * falls; a snapshot taken without one leaves every price in Refined alone,
 * which is still true, just longer.
 */
export function formatTraderNotation(metal: Metal, keyRate: Metal | null): string {
  if (keyRate === null) return formatMetalValue(metal);
  return traderNotation(metal.scrap, keyRate.scrap);
}

/**
 * A Blanket Price written as what it is. The source quotes one figure for a whole
 * class of items rather than for this one (ADR-0004), so the site says about,
 * rather than printing it with the confidence of a quote.
 */
export function approximately(figure: string): string {
  return `≈${figure}`;
}

/** The Metal Value: the same price written wholly in Refined, whatever it is worth in Keys. */
export function formatMetalValue(metal: Metal): string {
  return `${formatRefined(metal.scrap)} ref`;
}

/** The price in dollars under a Dollar Basis, or nothing when there is no basis. */
export function dollarsFor(metal: Metal, basis: DollarBasis | null): number | null {
  if (basis === null) return null;
  return scrapToRefined(metal.scrap) * basis.usdPerRefined;
}

const DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Dollars as money: always two decimals, thousands grouped. */
export function formatDollars(dollars: number): string {
  return DOLLARS.format(dollars);
}
