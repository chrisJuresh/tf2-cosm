/**
 * The Price Spread: a variant's low and high as the source quotes them, their
 * midpoint, and all three as Metal Values.
 *
 * Every figure is converted with the snapshot's own Key Rate rather than with
 * whatever rate the source used, so the file is internally consistent: a
 * Cosmetic priced at two Keys is exactly twice one priced at one Key, and the
 * sort order the Metal Value gives never disagrees with the Trader Notation
 * printed next to it.
 *
 * Two things come out of here, over the same spread arithmetic. The Reference
 * Price is the one figure that stands for the Cosmetic, and goes in the
 * catalogue. The Variant Prices are every Quality-and-craftability pair the
 * source priced, and go in a document of their own; they are what a viewer
 * looking at a copy they own needs, because a Genuine copy is worth the Genuine
 * price and not the Reference Price.
 */
import { formatRefined, refinedToScrap, scrapToRefined, traderNotation, unitsToScrap } from "./metal.ts";
import {
  isBlanketCurrency,
  type KeyRate,
  type PriceCurrency,
  type PricedVariant,
  rateFor,
  type Rates,
} from "./price-source.ts";
import {
  chooseReferenceVariant,
  type ReferenceVariant,
  type ReferenceVariantContext,
} from "./reference-variant.ts";
import type { Metal, Price, PricePoint } from "../catalogue/schema.ts";
import type { VariantPrice } from "../catalogue/variant-prices.ts";

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

/**
 * A variant the snapshot has a rate for, which is all the spread arithmetic
 * needs. A Reference Variant is one of these with the rule's blessing on top.
 */
interface ConvertedVariant {
  readonly variant: PricedVariant;
  readonly currency: PriceCurrency;
  readonly scrapPerUnit: number;
  readonly blanket: boolean;
}

function pointOf(end: End, converted: ConvertedVariant, keyRate: KeyRate): PricePoint {
  // A figure in Keys, Craft Hats or Earbuds is converted with the snapshot's own
  // rate, never with the rate the source baked into its unrounded figure, so
  // that every price in the file sits on one set of rates. A figure already in
  // Metal takes the unrounded number, which is simply better.
  const scrap =
    converted.currency === "metal"
      ? refinedToScrap(end.refined ?? end.value)
      : unitsToScrap(end.value, converted.scrapPerUnit);
  return { value: end.value, metal: metalOf(scrap, keyRate) };
}

/** The low, midpoint and high a priced variant comes to, as the catalogue writes them. */
type Spread = Extract<Price, { state: "priced" }>["spread"];

/**
 * The three Metal Values a variant's figures come to. One function stands behind
 * the Reference Price and behind every Variant Price, so the two can never quote
 * the same variant differently.
 */
function spreadOfVariant(converted: ConvertedVariant, keyRate: KeyRate): Spread {
  // The source quotes one figure when it has no range; `high` then equals `low`
  // and the midpoint is both of them.
  const { low, high } = endsOf(converted.variant);
  return {
    low: pointOf(low, converted, keyRate),
    mid: pointOf(midpointOf(low, high), converted, keyRate),
    high: pointOf(high, converted, keyRate),
  };
}

/** The same three figures as bare scrap counts, which is all a Variant Price keeps. */
function scrapSpreadOf(converted: ConvertedVariant, keyRate: KeyRate): VariantPrice["scrap"] {
  const spread = spreadOfVariant(converted, keyRate);
  return { low: spread.low.metal.scrap, mid: spread.mid.metal.scrap, high: spread.high.metal.scrap };
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
  return {
    state: "priced",
    referenceVariant: { quality: variant.quality, craftable: variant.craftable },
    currency: chosen.currency,
    blanket: chosen.blanket,
    spread: spreadOfVariant(chosen, keyRate),
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

/**
 * Every Variant Price the source gives for a Cosmetic: one per
 * Quality-and-craftability pair it priced, each carrying the same spread the
 * Reference Price is written with.
 *
 * This is a plainer rule than the Reference Variant's, and deliberately so. It
 * chooses nothing and prefers nothing — it reports what the source said about
 * each Quality. The Reference Variant rule exists to pick the one figure that
 * stands for a Cosmetic nobody owns a particular copy of; a viewer holding a
 * Genuine copy has already done the choosing.
 *
 * The Reference Variant is in here too rather than held out. A reader asking
 * what a Unique craftable copy is worth should find it in one place, and one
 * duplicated entry is cheaper than a rule about where the missing one went.
 *
 * Two kinds of variant are left out, for the same reason in both cases: there is
 * no honest figure to write.
 *
 * Unusual, because a price source keys an Unusual by effect — one price per
 * hat-and-effect pair — and reducing that to a single number would report an
 * arbitrary effect's price as this Cosmetic's. An owned Unusual is priced by its
 * effect, and nothing here pretends otherwise.
 *
 * A figure quoted in a currency the snapshot has no rate for, which is the same
 * thing that leaves a Cosmetic Unpriced with `unsupported-currency`.
 *
 * Order is fixed — Quality alphabetically, craftable before non-craftable — so
 * that two runs over the same prices write the same bytes, and a diff of the
 * committed document shows only what actually moved.
 *
 * Each one keeps its spread as three scrap counts rather than as the Reference
 * Price's `PricePoint`s. `../catalogue/variant-prices.ts` has the reasoning; the
 * short of it is that there are four thousand of these and only eighteen hundred
 * Reference Prices, and the site hands the catalogue to the browser whole.
 */
export function variantPricesOf(variants: readonly PricedVariant[] | undefined, rates: Rates): VariantPrice[] {
  const priced: VariantPrice[] = [];
  for (const variant of variants ?? []) {
    if (variant.quality === "unusual") continue;
    const scrapPerUnit = rateFor(rates, variant.currency);
    if (scrapPerUnit === undefined) continue;
    const converted: ConvertedVariant = {
      variant,
      currency: variant.currency as PriceCurrency,
      scrapPerUnit,
      blanket: isBlanketCurrency(rates, variant.currency),
    };
    priced.push({
      quality: variant.quality,
      craftable: variant.craftable,
      blanket: converted.blanket,
      scrap: scrapSpreadOf(converted, rates.keyRate),
      lastUpdatedAt: variant.lastUpdatedAt,
    });
  }
  return priced.sort(
    (left, right) =>
      left.quality.localeCompare(right.quality) || Number(right.craftable) - Number(left.craftable),
  );
}
