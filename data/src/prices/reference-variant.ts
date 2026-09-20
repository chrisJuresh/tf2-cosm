/**
 * Choosing the Reference Variant: the one Quality-and-craftability combination
 * whose price stands for a Cosmetic.
 *
 * Unique craftable if it exists, else Unique non-craftable, else the Native
 * Quality — the Quality the Cosmetic is issued in, which is Genuine for a
 * promotional item and Haunted for some Halloween ones. Never an Unusual: an
 * Unusual price is a price for the effect, not for the Cosmetic.
 */
import {
  DEFAULT_NATIVE_QUALITY,
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
  nativeQuality: Quality,
  rates: Rates,
): ReferenceVariant | { unpriced: UnpricedReason } {
  if (variants === undefined) return { unpriced: "missing-from-source" };

  for (const quality of preferenceOrder(nativeQuality)) {
    for (const craftable of [true, false]) {
      const match = variants.find((one) => one.quality === quality && one.craftable === craftable);
      if (!match) continue;
      // A variant that matches the rule but is quoted in something the snapshot
      // has no rate for is still the Reference Variant; it just has no Metal
      // Value. We do not fall through to a lesser Quality, which would report
      // the wrong thing as this Cosmetic's price.
      const scrapPerUnit = rateFor(rates, match.currency);
      if (scrapPerUnit === undefined) return { unpriced: "unsupported-currency" };
      return { variant: match, currency: match.currency as PriceCurrency, scrapPerUnit };
    }
  }
  return { unpriced: "no-reference-variant" };
}
