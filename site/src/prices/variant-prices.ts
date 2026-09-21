/**
 * The Variant Prices document, as the site reads it.
 *
 * It is the other half of the price snapshot (ADR-0005): the catalogue carries
 * one price per Cosmetic, its Reference Price, and this carries every
 * Quality-and-craftability pair the source listed. The catalogue answers what a
 * Cosmetic costs; this answers what the copy in somebody's own backpack is
 * worth, and they are different questions.
 *
 * ## Why this one is fetched and the catalogue is not
 *
 * Both are committed files and neither is an API (ADR-0002). The catalogue is
 * read at build time and baked into the exported page, because every row on the
 * page shows a figure out of it. This one is a megabyte that only matters to a
 * viewer who has asked to see their own backpack, so it is served as a static
 * file and fetched when that happens. Baking it in would put a megabyte into
 * every visit for a feature most visits never open.
 *
 * ## Why the contract is here twice
 *
 * The data job writes this document and validates it against its own schema, in
 * its own package. This is the same shape declared again, on the reading side,
 * for the reason `renders/manifest.ts` declares the render manifest again: a
 * document that arrives over the network at runtime is not a document the build
 * could check. `tests/variant-prices.test.ts` reads the data job's golden file
 * through this schema, which is what holds the two together.
 */
import { z } from "zod";

export const VARIANT_PRICES_SCHEMA_VERSION = 1;

const variantPriceSchema = z.object({
  quality: z.string().min(1),
  craftable: z.boolean(),
  /** Whether the figure is the source's craft-hat default rather than a quote (ADR-0004). */
  blanket: z.boolean(),
  /** Low, midpoint and high, in scrap, at the Key Rate in this document's header. */
  scrap: z.object({
    low: z.number().int().nonnegative(),
    mid: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
  }),
  lastUpdatedAt: z.string().min(1),
});

export const variantPricesSchema = z.object({
  schemaVersion: z.literal(VARIANT_PRICES_SCHEMA_VERSION),
  header: z.object({
    /**
     * The catalogue's own snapshot time, repeated by the run that wrote both.
     * The site checks it: a Variant Prices document from a different run than
     * the catalogue would price a viewer's copies at a Key Rate the rest of the
     * page is not using, and a figure that disagrees with the one beside it is
     * worse than no figure.
     */
    snapshotTakenAt: z.string().min(1),
    source: z.string().min(1),
    takenAt: z.string().min(1),
    keyRate: z.object({
      scrap: z.number().int().nonnegative(),
      refined: z.number().nonnegative(),
      notation: z.string().min(1),
      lastUpdatedAt: z.string().min(1),
    }),
    counts: z.object({
      cosmetics: z.number().int().nonnegative(),
      variants: z.number().int().nonnegative(),
      byVariant: z.record(z.string(), z.number().int().nonnegative()),
    }),
  }),
  /** Keyed by the catalogue's slug. A Cosmetic with no Variant Price is absent. */
  bySlug: z.record(z.string(), z.array(variantPriceSchema).min(1)),
});

export type VariantPrice = z.infer<typeof variantPriceSchema>;
export type VariantPrices = z.infer<typeof variantPricesSchema>;

export class VariantPricesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariantPricesError";
  }
}

/**
 * The document, checked — or a throw naming what is wrong with it.
 *
 * `snapshotTakenAt` is checked against the catalogue's rather than trusted,
 * because the two files are committed separately and a half-updated pair is the
 * one way they can be wrong without either being malformed.
 */
export function readVariantPrices(document: unknown, catalogueSnapshotTakenAt: string): VariantPrices {
  const result = variantPricesSchema.safeParse(document);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new VariantPricesError(
      `the Variant Prices do not match schema v${VARIANT_PRICES_SCHEMA_VERSION}` +
        (first === undefined ? "." : `: ${first.path.join(".") || "(root)"}: ${first.message}`),
    );
  }
  if (result.data.header.snapshotTakenAt !== catalogueSnapshotTakenAt) {
    throw new VariantPricesError(
      "the Variant Prices are from a different snapshot than the catalogue " +
        `(${result.data.header.snapshotTakenAt} against ${catalogueSnapshotTakenAt}), ` +
        "so they would be priced at the wrong Key Rate.",
    );
  }
  return result.data;
}

/**
 * What one Quality-and-craftability pair of a Cosmetic is worth, or undefined
 * when the source priced no such copy.
 *
 * Undefined is common and is not a failure: plenty of Cosmetics are priced
 * Unique and in nothing else, so a Strange copy of one has no figure. It is also
 * always the answer for an Unusual, which a price source prices by effect rather
 * than as one figure for the Cosmetic.
 */
export function variantPriceFor(
  prices: VariantPrices | null,
  slug: string,
  quality: string,
  craftable: boolean,
): VariantPrice | undefined {
  return prices?.bySlug[slug]?.find((one) => one.quality === quality && one.craftable === craftable);
}
