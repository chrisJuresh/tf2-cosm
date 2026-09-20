/**
 * The Dollar Basis: the key-to-dollar rate a dollar price is computed from.
 *
 * Three of them reach the header, and the site switches between them: the Steam
 * Community Market's key price (lowest and median), the price source's own
 * refined-to-dollar estimate, and the Mann Co. Store's constant. Per-item dollar
 * figures are not stored — the site multiplies a Cosmetic's Metal Value by the
 * basis it is showing — so a basis is exactly two numbers, and both are here so
 * that a site holding either one never has to know the Key Rate.
 *
 * Both numbers come from one figure converted at the snapshot's own Key Rate,
 * the same rule `price-spread.ts` follows: everything in the file sits on one
 * set of rates, so a Cosmetic priced at two Keys is worth exactly twice one
 * priced at one Key in dollars as well as in Metal.
 */
import { scrapToRefined } from "./metal.ts";
import type { KeyRate } from "./price-source.ts";

/** A dollar price is quoted in cents, so four decimal places is already generous. */
const USD_PER_KEY_PLACES = 4;

/** A Refined is worth a few cents, so its rate needs the smaller places to survive. */
const USD_PER_REFINED_PLACES = 6;

/** What the Mann Co. Store charges for a Mann Co. Supply Crate Key, in dollars. */
export const MANN_CO_STORE_USD_PER_KEY = 2.49;

export const MANN_CO_STORE_SOURCE = "Mann Co. Store constant ($2.49 a Mann Co. Supply Crate Key)";

/** One Dollar Basis's rate, in the two denominations a price in this file uses. */
export interface DollarRate {
  readonly usdPerKey: number;
  readonly usdPerRefined: number;
}

/** The Steam Community Market's key price, as its price overview reports it. */
export interface MarketKeyPrice {
  readonly source: string;
  readonly takenAt: string;
  /** Null when the overview did not carry that figure. */
  readonly lowestUsd: number | null;
  readonly medianUsd: number | null;
}

/** A price source's own refined-to-dollar estimate, which is a Dollar Basis of its own. */
export interface SourceDollarEstimate {
  readonly source: string;
  readonly usdPerRefined: number;
  readonly lastUpdatedAt: string;
}

export interface DollarBases {
  /** Null when the price overview was skipped or did not answer. */
  readonly steamCommunityMarket: {
    readonly source: string;
    readonly takenAt: string;
    readonly lowest: DollarRate | null;
    readonly median: DollarRate | null;
  } | null;
  /** Null when the price source published no dollar estimate. */
  readonly backpackTf: {
    readonly source: string;
    readonly lastUpdatedAt: string;
    readonly rate: DollarRate;
  } | null;
  /** Always present: it is a constant, not a fetch. */
  readonly mannCoStore: { readonly source: string; readonly rate: DollarRate };
}

function round(value: number, places: number): number {
  return Number(value.toFixed(places));
}

function assertDollars(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`a Dollar Basis must be a positive number of ${what}, got ${value}`);
  }
}

/** A basis quoted as a key price: the Steam Market's and the Mann Co. Store's. */
export function dollarRateFromKey(usdPerKey: number, keyRate: KeyRate): DollarRate {
  assertDollars(usdPerKey, "dollars a Key");
  return {
    usdPerKey: round(usdPerKey, USD_PER_KEY_PLACES),
    usdPerRefined: round(usdPerKey / scrapToRefined(keyRate.scrapPerKey), USD_PER_REFINED_PLACES),
  };
}

/** A basis quoted per Refined, as the price source's own estimate arrives. */
export function dollarRateFromRefined(usdPerRefined: number, keyRate: KeyRate): DollarRate {
  assertDollars(usdPerRefined, "dollars a Refined");
  return {
    usdPerKey: round(usdPerRefined * scrapToRefined(keyRate.scrapPerKey), USD_PER_KEY_PLACES),
    usdPerRefined: round(usdPerRefined, USD_PER_REFINED_PLACES),
  };
}

export interface DollarBasisInputs {
  readonly keyRate: KeyRate;
  readonly marketKeyPrice?: MarketKeyPrice | undefined;
  readonly sourceUsdPerRefined?: SourceDollarEstimate | undefined;
}

/**
 * The header's three Dollar Bases. A basis whose rate never arrived is null
 * rather than absent or guessed: the site can then say which basis it cannot
 * offer, and a missing key price never silently becomes the Store's.
 */
export function dollarBasesOf(inputs: DollarBasisInputs): DollarBases {
  const { keyRate, marketKeyPrice, sourceUsdPerRefined } = inputs;
  return {
    steamCommunityMarket: marketKeyPrice
      ? {
          source: marketKeyPrice.source,
          takenAt: marketKeyPrice.takenAt,
          lowest: marketKeyPrice.lowestUsd === null ? null : dollarRateFromKey(marketKeyPrice.lowestUsd, keyRate),
          median: marketKeyPrice.medianUsd === null ? null : dollarRateFromKey(marketKeyPrice.medianUsd, keyRate),
        }
      : null,
    backpackTf: sourceUsdPerRefined
      ? {
          source: sourceUsdPerRefined.source,
          lastUpdatedAt: sourceUsdPerRefined.lastUpdatedAt,
          rate: dollarRateFromRefined(sourceUsdPerRefined.usdPerRefined, keyRate),
        }
      : null,
    mannCoStore: { source: MANN_CO_STORE_SOURCE, rate: dollarRateFromKey(MANN_CO_STORE_USD_PER_KEY, keyRate) },
  };
}
