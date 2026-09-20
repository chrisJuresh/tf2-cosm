/**
 * Choosing the Reference Variant: the one Quality-and-craftability combination
 * whose price stands for a Cosmetic.
 *
 * Unique craftable if it exists, else Unique non-craftable, else the Native
 * Quality — the Quality the Cosmetic is issued in, which is Genuine for a
 * promotional item and Haunted for some Halloween ones. Never an Unusual: an
 * Unusual price is a price for the effect, not for the Cosmetic.
 *
 * A Blanket Price is the one thing that bends that order (ADR-0004): it is a
 * figure the source applies to a whole class of items rather than one it
 * observed, and for a Promo-Only Cosmetic it prices a Unique copy that was never
 * issued. There the rule is not offered it and falls to the Native Quality.
 * Everywhere else it stands, because for a craft hat it is true.
 */
import {
  DEFAULT_NATIVE_QUALITY,
  isBlanketCurrency,
  type PriceCurrency,
  type PricedVariant,
  type Quality,
  rateFor,
  type Rates,
} from "./price-source.ts";

/** Why a Cosmetic ended up Unpriced. It stays in the catalogue either way. */
export const UNPRICED_REASONS = [
  /** The price source's list has no entry under this name at all. */
  "missing-from-source",
  /** The source prices the item, but in no Quality the Reference Variant rule accepts. */
  "no-reference-variant",
  /** The Reference Variant is quoted in something the snapshot cannot convert to Metal. */
  "unsupported-currency",
] as const;

export type UnpricedReason = (typeof UNPRICED_REASONS)[number];

/**
 * The Native Qualities to fall through once no Unique copy is priced, in the
 * order the spec fixes.
 *
 * The item's own Native Quality is tried first, but it is not enough on its own:
 * Valve's `GetSchemaItems` reports quality 6 (Unique) for every cosmetic and
 * never once reports Genuine, so a promo's real Native Quality is not in any
 * payload this job reads. The chain is what actually finds a Genuine-only
 * promo's price, and it runs whether or not the schema said anything.
 *
 * Unusual is absent by design: an Unusual price prices the effect, not the
 * Cosmetic.
 */
const NATIVE_QUALITY_FALLBACK: readonly Quality[] = ["genuine", "vintage", "haunted", "strange", "collectors"];

/**
 * The Qualities to try, best first. Craftability is the tiebreak within each:
 * the craftable copy is the one traders quote.
 */
function preferenceOrder(nativeQuality: Quality): Quality[] {
  const order = [DEFAULT_NATIVE_QUALITY, nativeQuality, ...NATIVE_QUALITY_FALLBACK];
  return [...new Set(order)].filter((quality) => quality !== "unusual");
}

/** The Reference Variant, with its currency and that currency's rate already resolved. */
export interface ReferenceVariant {
  readonly variant: PricedVariant;
  readonly currency: PriceCurrency;
  readonly scrapPerUnit: number;
  /** Whether the figure is a Blanket Price, and so an order of magnitude rather than a quote. */
  readonly blanket: boolean;
}

/** What the rule needs to know about the Cosmetic itself, beyond its prices. */
export interface ReferenceVariantContext {
  readonly nativeQuality: Quality;
  /**
   * Whether the game hands this Cosmetic out in ordinary play — it drops, or it
   * is in a loot list. One the game does not issue only ever enters the game in
   * its Native Quality, so a Blanket Price for a Unique copy of it prices
   * nothing that exists.
   */
  readonly issuedInPlay: boolean;
}

/** How the counts name a Reference Variant: "unique-craftable", "genuine-non-craftable". */
export function referenceVariantLabel(quality: Quality, craftable: boolean): string {
  return `${quality}-${craftable ? "craftable" : "non-craftable"}`;
}

/**
 * The Reference Variant among an item's tradable variants, or the reason there
 * is none. `variants` being undefined means the source never listed the item.
 */
export function chooseReferenceVariant(
  variants: readonly PricedVariant[] | undefined,
  cosmetic: ReferenceVariantContext,
  rates: Rates,
): ReferenceVariant | { unpriced: UnpricedReason } {
  if (variants === undefined) return { unpriced: "missing-from-source" };

  // A Promo-Only Cosmetic's blanket Unique entry prices a copy of it that does
  // not exist, so the rule is never offered it.
  const considered = promoOnly(variants, cosmetic, rates)
    ? variants.filter((one) => !isBlanketCurrency(rates, one.currency))
    : variants;

  for (const quality of preferenceOrder(cosmetic.nativeQuality)) {
    for (const craftable of [true, false]) {
      const match = considered.find((one) => one.quality === quality && one.craftable === craftable);
      if (!match) continue;
      // A variant that matches the rule but is quoted in something the snapshot
      // has no rate for is still the Reference Variant; it just has no Metal
      // Value. We do not fall through to a lesser Quality, which would report
      // the wrong thing as this Cosmetic's price.
      const scrapPerUnit = rateFor(rates, match.currency);
      if (scrapPerUnit === undefined) return { unpriced: "unsupported-currency" };
      return {
        variant: match,
        currency: match.currency as PriceCurrency,
        scrapPerUnit,
        blanket: isBlanketCurrency(rates, match.currency),
      };
    }
  }
  return { unpriced: "no-reference-variant" };
}

/**
 * Whether the Cosmetic is Promo-Only: one Valve gave away and the game never
 * hands out, so no Unique copy of it was ever issued.
 *
 * Two facts have to hold together, and neither is enough alone.
 *
 * The source prices a Genuine copy. Genuine is the Quality Valve stamps on a
 * promotional copy and on nothing else, so a Genuine price is the only evidence
 * in reach that the Cosmetic was issued in a Quality other than Unique — Valve's
 * own schema never says so, reporting Unique for every cosmetic there is.
 *
 * And the game does not issue it in play. Plenty of promos were later made to
 * drop or put in a case, and for those a craft hat really is what a Unique copy
 * costs; the Scotsman's Stove Pipe and the Backbiter's Billycock are both this,
 * and both keep their blanket price.
 *
 * Nothing else is demoted. A Cosmetic with no Genuine price is one the game only
 * ever issued as Unique, however it was handed out, so its blanket figure prices
 * a copy that exists — which matters, because `items_game.txt` does not carry
 * the loot lists of the older crates, and treating "not in a loot list" as
 * "never issued" on its own would demote hundreds of ordinary case Cosmetics to
 * the price of a Strange copy.
 */
function promoOnly(
  variants: readonly PricedVariant[],
  cosmetic: ReferenceVariantContext,
  rates: Rates,
): boolean {
  if (cosmetic.issuedInPlay) return false;
  return variants.some((one) => one.quality === "genuine" && !isBlanketCurrency(rates, one.currency));
}
