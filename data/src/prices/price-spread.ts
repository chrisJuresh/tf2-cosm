/**
 * The Price Spread: a Reference Variant's low and high as the source quotes
 * them, their midpoint, and all three as Metal Values.
 *
 * Every figure is converted with the snapshot's own Key Rate rather than with
 * whatever rate the source used, so the file is internally consistent: a
 * Cosmetic priced at two Keys is exactly twice one priced at one Key, and the
 * sort order the Metal Value gives never disagrees with the Trader Notation
 * printed next to it.
 */
import { formatRefined, keysToScrap, refinedToScrap, scrapToRefined, traderNotation } from "./metal.ts";
import type { KeyRate, PriceCurrency, PricedVariant, Quality } from "./price-source.ts";
import { chooseReferenceVariant, type UnpricedReason } from "./reference-variant.ts";
import type { Metal, Price, PricePoint } from "../catalogue/schema.ts";

/** A scrap count in the three forms the catalogue records it. */
export function metalOf(scrap: number, keyRate: KeyRate): Metal {
  return {
    scrap,
    refined: Number(scrapToRefined(scrap).toFixed(4)),
    notation: traderNotation(scrap, keyRate.scrapPerKey),
  };
}

function toScrap(value: number, currency: PriceCurrency, keyRate: KeyRate): number {
  return currency === "keys" ? keysToScrap(value, keyRate.scrapPerKey) : refinedToScrap(value);
}

function pointOf(value: number, currency: PriceCurrency, keyRate: KeyRate): PricePoint {
  return { value, metal: metalOf(toScrap(value, currency, keyRate), keyRate) };
}

/**
 * The Key Rate itself, for the catalogue header. It arrives in Refined and is
 * held in scrap like every other Metal figure.
 */
export function keyRateFromRefined(refined: number, lastUpdatedAt: string): KeyRate {
  const scrapPerKey = refinedToScrap(refined);
  if (scrapPerKey <= 0) throw new Error(`the Key Rate came back as ${refined} Refined, which cannot be right`);
  return { scrapPerKey, lastUpdatedAt };
}

/** The Key Rate written the way the header records it: scrap, Refined and "78.66". */
export function keyRateMetal(keyRate: KeyRate): Metal {
  return {
    scrap: keyRate.scrapPerKey,
    refined: Number(scrapToRefined(keyRate.scrapPerKey).toFixed(4)),
    notation: `${formatRefined(keyRate.scrapPerKey)} ref`,
  };
}

function spreadOf(variant: PricedVariant, currency: PriceCurrency, keyRate: KeyRate): Price {
  // The source quotes one figure when it has no range; `high` then equals `low`
  // and the midpoint is both of them.
  const low = Math.min(variant.low, variant.high);
  const high = Math.max(variant.low, variant.high);
  return {
    state: "priced",
    referenceVariant: { quality: variant.quality, craftable: variant.craftable },
    currency,
    spread: {
      low: pointOf(low, currency, keyRate),
      mid: pointOf((low + high) / 2, currency, keyRate),
      high: pointOf(high, currency, keyRate),
    },
    lastUpdatedAt: variant.lastUpdatedAt,
  };
}

/**
 * A Cosmetic's price: its Reference Variant's spread, or why it is Unpriced.
 * `variants` being undefined means the price source never listed the item.
 */
export function priceOf(
  variants: readonly PricedVariant[] | undefined,
  nativeQuality: Quality,
  keyRate: KeyRate,
): Price {
  const chosen = chooseReferenceVariant(variants, nativeQuality);
  if ("unpriced" in chosen) return unpriced(chosen.unpriced);
  // chooseReferenceVariant has already rejected any currency we cannot convert.
  return spreadOf(chosen.variant, chosen.variant.currency as PriceCurrency, keyRate);
}

export function unpriced(reason: UnpricedReason): Price {
  return { state: "unpriced", reason };
}
