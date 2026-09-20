/**
 * The one place the site turns a price into words or into money.
 *
 * Everything here is pure and takes only what the catalogue already carries, so
 * the tests drive it directly and the components never do arithmetic of their
 * own. The Metal arithmetic itself is the data job's (`@tf2-cosm/data`): a
 * Trader Notation formatted here and one recorded in the catalogue come out of
 * the same function at the same Key Rate, so the two can never disagree.
 *
 * A Dollar Basis is the key-to-dollar rate a dollar figure is computed from.
 * Only the Steam Community Market one is built here; the switch between all
 * three, fed by the catalogue header, is #14.
 */
import type { Metal } from "@tf2-cosm/data/catalogue";
import { formatRefined, scrapToRefined, traderNotation } from "@tf2-cosm/data/prices/metal";

export const DOLLAR_BASIS_IDS = ["steam-market"] as const;

export type DollarBasisId = (typeof DOLLAR_BASIS_IDS)[number];

export interface DollarBasis {
  readonly id: DollarBasisId;
  /** What the viewer is told a dollar means here. */
  readonly label: string;
  readonly dollarsPerRefined: number;
}

/**
 * The Steam Community Market basis: what a Key sells for there, spread over the
 * Refined a Key trades for. ADR-0002 uses the Market for the Key's dollar price
 * and nothing else, because classic Unique cosmetics are not marketable there.
 */
export function steamMarketBasis(keyPriceUsd: number, keyRate: Metal): DollarBasis {
  if (!Number.isFinite(keyPriceUsd) || keyPriceUsd <= 0) {
    throw new Error(`a Key's dollar price must be a positive number of dollars, got ${keyPriceUsd}`);
  }
  if (!Number.isInteger(keyRate.scrap) || keyRate.scrap <= 0) {
    throw new Error(`a Key Rate must be a positive whole scrap count, got ${keyRate.scrap}`);
  }
  return {
    id: "steam-market",
    label: "Steam Community Market",
    dollarsPerRefined: keyPriceUsd / scrapToRefined(keyRate.scrap),
  };
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

/** The Metal Value: the same price written wholly in Refined, whatever it is worth in Keys. */
export function formatMetalValue(metal: Metal): string {
  return `${formatRefined(metal.scrap)} ref`;
}

/** The price in dollars under a Dollar Basis, or nothing when there is no basis. */
export function dollarsFor(metal: Metal, basis: DollarBasis | null): number | null {
  if (basis === null) return null;
  return scrapToRefined(metal.scrap) * basis.dollarsPerRefined;
}

const DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Dollars as money: always two decimals, thousands grouped. */
export function formatDollars(dollars: number): string {
  return DOLLARS.format(dollars);
}
