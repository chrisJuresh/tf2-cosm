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
import { formatRefined, refinedToScrap, scrapToRefined, traderNotation, unitsToScrap } from "./metal.ts";
import type { KeyRate, PricedVariant, Rates } from "./price-source.ts";
import {
  chooseReferenceVariant,
  type ReferenceVariant,
  type ReferenceVariantContext,
} from "./reference-variant.ts";
import type { Metal, Price, PricePoint } from "../catalogue/schema.ts";

/** A scrap count in the three forms the catalogue records it. */
function metal(scrap: number, notation: string): Metal {
  return { scrap, refined: Number(scrapToRefined(scrap).toFixed(4)), notation };
}

/** A Metal Value, written in Trader Notation at the snapshot's Key Rate. */
export function metalOf(scrap: number, keyRate: KeyRate): Metal {
  return metal(scrap, traderNotation(scrap, keyRate.scrapPerKey));
}

/**
 * One end of the spread: the source's own figure, and the same figure unrounded
 * in Refined where the source computed it (`raw=2` on backpack.tf).
 */
interface End {
  readonly value: number;
  readonly refined: number | undefined;
}

function endsOf(variant: PricedVariant): { low: End; high: End } {
  const first: End = { value: variant.low, refined: variant.lowRefined };
  const second: End = { value: variant.high, refined: variant.highRefined };
  return first.value <= second.value ? { low: first, high: second } : { low: second, high: first };
}

function midpointOf(low: End, high: End): End {
  const bothUnrounded = low.refined !== undefined && high.refined !== undefined;
  return {
    value: (low.value + high.value) / 2,
    refined: bothUnrounded ? (low.refined + high.refined) / 2 : undefined,
  };
}

function pointOf(end: End, chosen: ReferenceVariant, keyRate: KeyRate): PricePoint {
  // A figure in Keys, Craft Hats or Earbuds is converted with the snapshot's own
  // rate, never with the rate the source baked into its unrounded figure, so
  // that every price in the file sits on one set of rates. A figure already in
  // Metal takes the unrounded number, which is simply better.
  const scrap =
    chosen.currency === "metal"
      ? refinedToScrap(end.refined ?? end.value)
      : unitsToScrap(end.value, chosen.scrapPerUnit);
  return { value: end.value, metal: metalOf(scrap, keyRate) };
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

/**
 * The Key Rate as the header records it. Trader Notation splits on the Key Rate,
 * so putting the Key Rate through it would only ever say "1 key"; the rate is
 * written wholly in Refined, which is how traders quote it.
 */
export function keyRateMetal(keyRate: KeyRate): Metal {
  return metal(keyRate.scrapPerKey, `${formatRefined(keyRate.scrapPerKey)} ref`);
}

function spreadOf(chosen: ReferenceVariant, keyRate: KeyRate): Price {
  const { variant } = chosen;
  // The source quotes one figure when it has no range; `high` then equals `low`
  // and the midpoint is both of them.
  const { low, high } = endsOf(variant);
  return {
    state: "priced",
    referenceVariant: { quality: variant.quality, craftable: variant.craftable },
    currency: chosen.currency,
    blanket: chosen.blanket,
    spread: {
      low: pointOf(low, chosen, keyRate),
      mid: pointOf(midpointOf(low, high), chosen, keyRate),
      high: pointOf(high, chosen, keyRate),
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
  cosmetic: ReferenceVariantContext,
  rates: Rates,
): Price {
  const chosen = chooseReferenceVariant(variants, cosmetic, rates);
  return "unpriced" in chosen ? { state: "unpriced", reason: chosen.unpriced } : spreadOf(chosen, rates.keyRate);
}
