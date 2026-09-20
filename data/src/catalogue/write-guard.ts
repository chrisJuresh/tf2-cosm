/**
 * The guard on overwriting the committed catalogue.
 *
 * The catalogue is a snapshot in git, refreshed daily (ADR-0002), so a broken
 * upstream response does not merely produce a bad run — it commits one, and the
 * site serves it. Two things say a run is not worth committing: the Cosmetic
 * count fell off a cliff against the file already in the repository, or the price
 * list priced a fraction of the catalogue. Either way the run reports and writes
 * nothing.
 *
 * This is a pure decision over two counts, so the CLI's only job is to read the
 * committed file's count and print what comes back.
 */
import type { Catalogue } from "./schema.ts";

export interface WriteGuardLimits {
  /** How much of the committed Cosmetic count a run may lose before it is refused. */
  readonly maxCosmeticDropFraction: number;
  /** Below this many priced Cosmetics the price list came back partial. */
  readonly minimumPricedCosmetics: number;
}

export const DEFAULT_WRITE_GUARD_LIMITS: WriteGuardLimits = {
  /**
   * Valve does remove a cosmetic now and then, and two runs either side of a
   * schema update can differ by one or two items, so a couple of percent is
   * noise. Anything past it is upstream breaking, not the game changing.
   */
  maxCosmeticDropFraction: 0.02,
  /**
   * The catalogue has around 1,830 Cosmetics and backpack.tf prices all but a
   * handful of them, so a whole snapshot never comes in under this.
   */
  minimumPricedCosmetics: 1780,
};

/** The committed catalogue a run would overwrite, as much of it as the guard needs. */
export interface CommittedCatalogue {
  readonly path: string;
  readonly cosmetics: number;
}

function percent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(4))}%`;
}

/**
 * Why this catalogue must not overwrite the committed one, or undefined when it
 * may. The message is the whole explanation, so a caller only has to print it.
 */
export function writeRefusal(
  next: Catalogue,
  previous: CommittedCatalogue | null,
  limits: WriteGuardLimits = DEFAULT_WRITE_GUARD_LIMITS,
): string | undefined {
  const cosmetics = next.header.counts.cosmetics;
  if (previous !== null && previous.cosmetics > 0) {
    const floor = previous.cosmetics * (1 - limits.maxCosmeticDropFraction);
    if (cosmetics < floor) {
      const lost = previous.cosmetics - cosmetics;
      return (
        `this run found ${cosmetics} Cosmetics where ${previous.path} holds ${previous.cosmetics}: ` +
        `${lost} fewer, past the ${percent(limits.maxCosmeticDropFraction)} a refresh may lose. ` +
        `Either the item schema came back partial or the Cosmetic rule stopped matching; nothing was written. ` +
        `Raise the allowance with --max-drop <fraction> once you know which.`
      );
    }
  }

  // A run without a price source carries no prices at all by design, so the
  // price floor is not its to answer for.
  const priced = next.header.prices?.counts.priced;
  if (priced !== undefined && priced < limits.minimumPricedCosmetics) {
    return (
      `only ${priced} Cosmetics were priced, under the ${limits.minimumPricedCosmetics} a whole snapshot ` +
      `carries. The price list came back partial, or the names stopped matching; nothing was written.`
    );
  }
  return undefined;
}
