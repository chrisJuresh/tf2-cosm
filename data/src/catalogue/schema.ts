/**
 * The catalogue file's shape, versioned. The site and the render job read this
 * file, so every change to it is a schema version change.
 *
 * Version 1 carried the Cosmetic list only. Version 2 adds the price snapshot:
 * each Cosmetic's Reference Variant and Price Spread, and the Key Rate they were
 * converted at. Version 3 completes the header with the Dollar Bases — the rate
 * each dollar figure the site shows is computed from. Version 4 marks a price
 * the source quoted in a blanket currency (ADR-0004).
 */
import { z } from "zod";

import { CLASSES, COSMETIC_SLOTS } from "./cosmetic-rule.ts";
import { PRICE_CURRENCIES, QUALITIES } from "../prices/price-source.ts";
import { UNPRICED_REASONS } from "../prices/reference-variant.ts";

export const CATALOGUE_SCHEMA_VERSION = 4;

export const COSMETIC_KINDS = ["class-exclusive", "multi-class", "all-class"] as const;

export type CosmeticKind = (typeof COSMETIC_KINDS)[number];

const styleSchema = z.object({
  index: z.int().nonnegative(),
  name: z.string().min(1),
});

/**
 * A Metal figure, three ways: the exact scrap count the catalogue sorts and does
 * arithmetic on, the same thing in Refined, and Trader Notation for display.
 */
const metalSchema = z.object({
  scrap: z.int().nonnegative(),
  refined: z.number().nonnegative(),
  notation: z.string().min(1),
});

/** One end of the Price Spread: the source's own figure, and its Metal Value. */
const pricePointSchema = z.object({
  /** In the Reference Variant's currency, exactly as the source quotes it. */
  value: z.number().nonnegative(),
  metal: metalSchema,
});

const priceSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("priced"),
    /** Which Quality and craftability this price is for. */
    referenceVariant: z.object({
      quality: z.enum(QUALITIES),
      craftable: z.boolean(),
    }),
    currency: z.enum(PRICE_CURRENCIES),
    /**
     * Whether this is a Blanket Price: a figure the source applies to a whole
     * class of items rather than one it observed for this Cosmetic. True of
     * every price quoted in Random Craft Hats, and worth showing as an order of
     * magnitude rather than as a quote (ADR-0004).
     */
    blanket: z.boolean(),
    /** Low, midpoint and high. `mid` is the midpoint of the source's two figures. */
    spread: z.object({ low: pricePointSchema, mid: pricePointSchema, high: pricePointSchema }),
    /** When the source last repriced this variant, not when the snapshot was taken. */
    lastUpdatedAt: z.iso.datetime(),
  }),
  z.object({
    state: z.literal("unpriced"),
    reason: z.enum(UNPRICED_REASONS),
  }),
]);

const cosmeticSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  /** The lowest defindex that carries a worn model; the one renders and icons use. */
  defindex: z.int().positive(),
  /** Every other defindex sharing this name, ascending (ADR-0003). */
  aliases: z.array(z.int().positive()),
  slot: z.enum(COSMETIC_SLOTS),
  classes: z.array(z.enum(CLASSES)).min(1),
  kind: z.enum(COSMETIC_KINDS),
  /** Whether a copy can be painted; the catalogue records it so the site can filter on it. */
  paintable: z.boolean(),
  /**
   * The Cosmetic's named Styles, in game order. Every Cosmetic has a default
   * Style; this list is empty when that default is the only one, so a site shows
   * a Style switcher exactly when the list is non-empty.
   */
  styles: z.array(styleSchema),
  backpackIcon: z
    .object({ small: z.url(), large: z.url() })
    .nullable(),
  /** Null exactly when the run had no price source; then `header.prices` is null too. */
  price: priceSchema.nullable(),
});

/**
 * One Dollar Basis's rate, in both denominations, so a site holding either one
 * never has to know the Key Rate to show a price in dollars.
 */
const dollarRateSchema = z.object({
  usdPerKey: z.number().positive(),
  usdPerRefined: z.number().positive(),
});

/**
 * The three Dollar Bases the site switches between. Null when the run had no
 * price source: every rate is anchored to the snapshot's own Key Rate, and
 * without prices there is no Key Rate to anchor it to.
 */
const dollarBasesSchema = z
  .object({
    /** The Market's key price, both figures it publishes. Null when it did not answer. */
    steamCommunityMarket: z
      .object({
        source: z.string().min(1),
        takenAt: z.iso.datetime(),
        lowest: dollarRateSchema.nullable(),
        median: dollarRateSchema.nullable(),
      })
      .nullable(),
    /**
     * The price source's own refined-to-dollar estimate. Null when it published
     * none. The vendor is named in `source`, never in the key: ADR-0002 keeps
     * the source swappable without a change to this file's shape.
     */
    priceSource: z
      .object({
        source: z.string().min(1),
        lastUpdatedAt: z.iso.datetime(),
        rate: dollarRateSchema,
      })
      .nullable(),
    /** A constant, so always present. */
    mannCoStore: z.object({ source: z.string().min(1), rate: dollarRateSchema }),
  })
  .nullable();

const headerSchema = z.object({
  snapshotTakenAt: z.iso.datetime(),
  sources: z.object({
    itemDefinitions: z.string().min(1),
    englishNames: z.string().min(1),
  }),
  counts: z.object({
    cosmetics: z.int().nonnegative(),
    classExclusive: z.int().nonnegative(),
    multiClass: z.int().nonnegative(),
    allClass: z.int().nonnegative(),
    aliasesMerged: z.int().nonnegative(),
    /** Cosmetics the Web API schema had no entry for: name fell back to items_game. */
    withoutWebApiEntry: z.int().nonnegative(),
    withoutBackpackIcon: z.int().nonnegative(),
  }),
  /**
   * The price snapshot's own header, or null when the run had no price source —
   * then every Cosmetic's `price` is null as well.
   */
  prices: z
    .object({
      source: z.string().min(1),
      takenAt: z.iso.datetime(),
      /** The rate every Key figure in this file was converted at. */
      keyRate: metalSchema.extend({ lastUpdatedAt: z.iso.datetime() }),
      counts: z.object({
        priced: z.int().nonnegative(),
        unpriced: z.int().nonnegative(),
        /** How many Cosmetics took each Reference Variant, e.g. "genuine-craftable". */
        byReferenceVariant: z.record(z.string(), z.int().nonnegative()),
        /** How many of the priced ones ended up on a Blanket Price. */
        blanketPriced: z.int().nonnegative(),
        /** Only the reasons that actually occurred; a reason nobody hit is absent. */
        unpricedByReason: z.partialRecord(z.enum(UNPRICED_REASONS), z.int().nonnegative()),
      }),
    })
    .nullable(),
  /**
   * The rate a dollar price is computed from, one per Dollar Basis. Per-item
   * dollar figures are not stored: the site multiplies a Cosmetic's Metal Value
   * by the basis it is showing.
   */
  dollarBases: dollarBasesSchema,
});

export const catalogueSchema = z.object({
  schemaVersion: z.literal(CATALOGUE_SCHEMA_VERSION),
  header: headerSchema,
  cosmetics: z.array(cosmeticSchema),
});

export type Style = z.infer<typeof styleSchema>;
export type Metal = z.infer<typeof metalSchema>;
export type PricePoint = z.infer<typeof pricePointSchema>;
export type Price = z.infer<typeof priceSchema>;
export type PriceHeader = NonNullable<z.infer<typeof headerSchema>["prices"]>;
export type DollarRate = z.infer<typeof dollarRateSchema>;
export type DollarBases = NonNullable<z.infer<typeof dollarBasesSchema>>;
export type Cosmetic = z.infer<typeof cosmeticSchema>;
export type Catalogue = z.infer<typeof catalogueSchema>;

export class CatalogueValidationError extends Error {
  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    const lines = issues.slice(0, 10).map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    super(`catalogue does not match schema v${CATALOGUE_SCHEMA_VERSION}:\n${lines.join("\n")}`);
    this.name = "CatalogueValidationError";
  }
}

/** Throws rather than returning a result: an invalid catalogue is never written. */
export function assertValidCatalogue(candidate: unknown): Catalogue {
  const result = catalogueSchema.safeParse(candidate);
  if (!result.success) throw new CatalogueValidationError(result.error.issues);
  return result.data;
}

/** The JSON Schema document published alongside the catalogue. */
export function catalogueJsonSchema(): Record<string, unknown> {
  return {
    $id: `https://github.com/chrisJuresh/tf2-cosm/catalogue/v${CATALOGUE_SCHEMA_VERSION}`,
    title: `TF2 Cosmetics catalogue v${CATALOGUE_SCHEMA_VERSION}`,
    ...z.toJSONSchema(catalogueSchema),
  };
}
