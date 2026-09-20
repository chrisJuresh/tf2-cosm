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
  isPriceCurrency,
  type PricedVariant,
  type Quality,
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

/** An Unusual price prices the effect, not the Cosmetic, so it is never a candidate. */
const NEVER_A_REFERENCE: ReadonlySet<Quality> = new Set<Quality>(["unusual"]);

/**
 * The Qualities to try, best first. Craftability is the tiebreak within each:
 * the craftable copy is the one traders quote.
 */
function preferenceOrder(nativeQuality: Quality): Quality[] {
  const order: Quality[] = [DEFAULT_NATIVE_QUALITY];
  if (nativeQuality !== DEFAULT_NATIVE_QUALITY) order.push(nativeQuality);
  return order.filter((quality) => !NEVER_A_REFERENCE.has(quality));
}

/**
 * The Reference Variant among an item's tradable variants, or the reason there
 * is none. `variants` being undefined means the source never listed the item.
 */
export function chooseReferenceVariant(
  variants: readonly PricedVariant[] | undefined,
  nativeQuality: Quality,
): { variant: PricedVariant } | { unpriced: UnpricedReason } {
  if (variants === undefined) return { unpriced: "missing-from-source" };

  for (const quality of preferenceOrder(nativeQuality)) {
    for (const craftable of [true, false]) {
      const match = variants.find((one) => one.quality === quality && one.craftable === craftable);
      if (!match) continue;
      // A variant that matches the rule but is quoted in something we cannot
      // convert is still the Reference Variant; it just has no Metal Value. We
      // do not fall through to a lesser Quality, which would misreport the item.
      return isPriceCurrency(match.currency) ? { variant: match } : { unpriced: "unsupported-currency" };
    }
  }
  return { unpriced: "no-reference-variant" };
}
