/**
 * The catalogue file's shape, versioned. The site and the render job read this
 * file, so every change to it is a schema version change.
 *
 * Version 1 carries the Cosmetic list only; prices (#10) and the Dollar Basis
 * header (#11) add to it under later versions.
 */
import { z } from "zod";

import { CLASSES, COSMETIC_SLOTS } from "./cosmetic-rule.ts";

export const CATALOGUE_SCHEMA_VERSION = 1;

export const COSMETIC_KINDS = ["class-exclusive", "multi-class", "all-class"] as const;

export type CosmeticKind = (typeof COSMETIC_KINDS)[number];

const styleSchema = z.object({
  index: z.int().nonnegative(),
  name: z.string().min(1),
});

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
});

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
});

export const catalogueSchema = z.object({
  schemaVersion: z.literal(CATALOGUE_SCHEMA_VERSION),
  header: headerSchema,
  cosmetics: z.array(cosmeticSchema),
});

export type Style = z.infer<typeof styleSchema>;
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
