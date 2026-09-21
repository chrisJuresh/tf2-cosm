/**
 * The Variant Prices document: what a copy somebody actually owns is worth.
 *
 * The catalogue records one price per Cosmetic, its Reference Price, because
 * that is the figure that stands for a Cosmetic nobody owns a particular copy
 * of. A viewer looking at their own backpack has already done the choosing: the
 * copy in their hands is Genuine, or Strange, or non-craftable, and the
 * Reference Price is not what it is worth. This file is the other prices — every
 * Quality-and-craftability pair the source listed, for every Cosmetic.
 *
 * ## Why a second document and not a field on the Cosmetic
 *
 * There are a little over two Variant Prices for every Cosmetic, so this is
 * about four thousand small records against the catalogue's eighteen hundred
 * large ones. Written into `catalogue.json` they add around forty percent to a
 * file the site hands to the browser whole — every viewer paying, on every
 * visit, for a feature most of them will not open.
 *
 * Kept apart they are fetched by the viewer who asks for them and by nobody
 * else, and the page's own payload does not move. `renders.json` is already this
 * pattern: a second committed document under `catalogue/`, with its own schema,
 * read through the same seam. Nothing here is an API — ADR-0002 is about where
 * prices come from and when, and a static file committed in the same run as the
 * catalogue is the snapshot, not a call.
 *
 * ## What holds the two documents together
 *
 * Both are written by one run, from one price list, at one Key Rate. The header
 * repeats the catalogue's `snapshotTakenAt` and its Key Rate so that a reader
 * holding both can check it is looking at one snapshot rather than yesterday's
 * prices beside today's, and the entries are keyed by the catalogue's own slug.
 */
import { z } from "zod";

import { QUALITIES } from "../prices/price-source.ts";

export const VARIANT_PRICES_SCHEMA_VERSION = 1;

/**
 * One Quality-and-craftability pair, priced. A viewer holding a copy of a
 * Cosmetic is holding one of these.
 *
 * Unusual never appears. A price source prices an Unusual by effect — one figure
 * per hat-and-effect pair — so there is no single Unusual figure for a Cosmetic,
 * and none is invented. A reader meeting an Unusual copy knows from its Quality
 * alone that it is priced by its effect.
 */
const variantPriceSchema = z.object({
  quality: z.enum(QUALITIES),
  craftable: z.boolean(),
  /**
   * Whether this is a Blanket Price: a figure the source applies to a whole
   * class of items rather than one it observed for this Cosmetic (ADR-0004), and
   * so worth showing as an order of magnitude rather than as a quote.
   */
  blanket: z.boolean(),
  /**
   * Low, midpoint and high as exact scrap counts, converted at the Key Rate in
   * this file's header — the same arithmetic, and the same rate, the catalogue's
   * Reference Prices are written at.
   *
   * Three integers rather than the catalogue's `PricePoint`s, and that is the
   * whole reason this document is a fifth of the size it might be. `refined` and
   * `notation` are the scrap count put through `scrapToRefined` and
   * `traderNotation`, which every reader of this file already has; the catalogue
   * carries them precomputed because every row on the page shows one, and a
   * Variant Price is read one at a time. The source's own figure and the unit it
   * quoted in are dropped with them: nothing displays either, and the one thing
   * that hangs off the unit and *is* displayed is `blanket`.
   */
  scrap: z.object({
    low: z.int().nonnegative(),
    mid: z.int().nonnegative(),
    high: z.int().nonnegative(),
  }),
  /** When the source last repriced this variant, not when the snapshot was taken. */
  lastUpdatedAt: z.iso.datetime(),
});

const headerSchema = z.object({
  /**
   * The catalogue's own `snapshotTakenAt`, repeated. Both documents come out of
   * one run, and a reader holding one from today beside one from last week
   * should be able to see that rather than quietly pricing against the wrong
   * Key Rate.
   */
  snapshotTakenAt: z.iso.datetime(),
  source: z.string().min(1),
  takenAt: z.iso.datetime(),
  /** The rate every figure in this file was converted at, as the catalogue records it. */
  keyRate: z.object({
    scrap: z.int().nonnegative(),
    refined: z.number().nonnegative(),
    notation: z.string().min(1),
    lastUpdatedAt: z.iso.datetime(),
  }),
  counts: z.object({
    /** How many Cosmetics have at least one Variant Price. */
    cosmetics: z.int().nonnegative(),
    variants: z.int().nonnegative(),
    /**
     * How many Cosmetics are priced in each Quality, e.g. "genuine-craftable".
     * Against the catalogue's `byReferenceVariant` this is what a viewer's own
     * copy can be priced in beyond what the catalogue shows by default. A
     * Quality nobody was priced in is absent rather than zero.
     */
    byVariant: z.record(z.string(), z.int().nonnegative()),
  }),
});

export const variantPricesSchema = z.object({
  schemaVersion: z.literal(VARIANT_PRICES_SCHEMA_VERSION),
  header: headerSchema,
  /**
   * Keyed by the catalogue's slug, which is a Cosmetic's identity on both sides
   * (ADR-0003). A Cosmetic the source never listed, or priced only in Unusual,
   * is absent rather than present and empty — which is not the same as being
   * Unpriced, and the catalogue is where a reader looks for that.
   */
  bySlug: z.record(z.string(), z.array(variantPriceSchema).min(1)),
});

export type VariantPrice = z.infer<typeof variantPriceSchema>;
export type VariantPricesHeader = z.infer<typeof headerSchema>;
export type VariantPrices = z.infer<typeof variantPricesSchema>;

export class VariantPricesValidationError extends Error {
  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    const lines = issues.slice(0, 10).map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    super(`variant prices do not match schema v${VARIANT_PRICES_SCHEMA_VERSION}:\n${lines.join("\n")}`);
    this.name = "VariantPricesValidationError";
  }
}

/** Throws rather than returning a result: an invalid document is never written. */
export function assertValidVariantPrices(candidate: unknown): VariantPrices {
  const result = variantPricesSchema.safeParse(candidate);
  if (!result.success) throw new VariantPricesValidationError(result.error.issues);
  return result.data;
}

/** The JSON Schema document published alongside it. */
export function variantPricesJsonSchema(): Record<string, unknown> {
  return {
    $id: `https://github.com/chrisJuresh/tf2-cosm/catalogue/variant-prices/v${VARIANT_PRICES_SCHEMA_VERSION}`,
    title: `TF2 Cosmetics Variant Prices v${VARIANT_PRICES_SCHEMA_VERSION}`,
    ...z.toJSONSchema(variantPricesSchema),
  };
}
