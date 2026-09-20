/**
 * The Worn Render manifest's shape, as the site reads it.
 *
 * The render job writes this file and publishes a JSON Schema beside it
 * (`catalogue/renders.v2.schema.json`); the job is in Python and the site is
 * not, so the contract exists twice and the two have to be held together
 * deliberately. They are: this module mirrors that schema field for field, and
 * `tests/test_site_render_manifest.py` runs the site's fixture manifest through
 * the render job's own validator, so a manifest the site's tests are written
 * against is one the job would actually write.
 *
 * Reading it is deliberately strict. A manifest that does not match this throws
 * where it is loaded, which fails `next build` rather than deploying a page
 * whose pictures point at nothing.
 */
import { z } from "zod";

import { CLASSES } from "@tf2-cosm/data/catalogue";

/** The current manifest version. A change to the shape is a change to this. */
export const RENDER_MANIFEST_VERSION = 2;

export const TEAMS = ["red", "blu"] as const;

export type Team = (typeof TEAMS)[number];

/** One image file, by its path relative to the configured image base. */
const imageSchema = z.object({
  path: z.string().min(1),
  width: z.int().positive(),
  height: z.int().positive(),
});

export type RenderImage = z.infer<typeof imageSchema>;

const entrySchema = z.object({
  master: imageSchema,
  /** The web sizes made from the master, keyed by their size in pixels. */
  derivatives: z.record(z.string().regex(/^[0-9]+$/), imageSchema),
  model: z.string(),
  style_name: z.string().nullable(),
  rendered_at: z.string(),
  job_version: z.int(),
  /** True when BLU was asked for and the RED render was used for it. */
  team_fallback: z.boolean(),
});

export type RenderEntry = z.infer<typeof entrySchema>;

/**
 * Why a job produced no image. The site does not show these — a Cosmetic with a
 * failure and one with nothing recorded at all both fall back to the Backpack
 * Icon, which is the same picture either way — but the field is part of the
 * contract and reading it strictly keeps a malformed manifest from loading.
 */
const failureSchema = z.object({
  slug: z.string(),
  class: z.enum(CLASSES),
  team: z.enum(TEAMS),
  style: z.int(),
  model: z.string(),
  reason: z.enum(["model-missing", "import-error", "render-error", "no-skeleton", "derive-error"]),
  detail: z.string().nullable(),
  failed_at: z.string(),
  job_version: z.int(),
});

/**
 * Renders by Cosmetic slug, then Class, then Team, then Style index.
 *
 * Partial at every level, which is the whole character of this file: a run
 * renders what it can reach and records what it managed, so a Class with no key
 * is a Class nobody has rendered yet rather than a malformed manifest. A full
 * record would demand nine Classes and two Teams for every Cosmetic before the
 * site could read the file at all.
 */
const manifestSchema = z.object({
  version: z.literal(RENDER_MANIFEST_VERSION),
  renders: z.record(
    z.string(),
    z.partialRecord(
      z.enum(CLASSES),
      z.partialRecord(z.enum(TEAMS), z.record(z.string().regex(/^[0-9]+$/), entrySchema)),
    ),
  ),
  failures: z.array(failureSchema),
});

export type RenderManifest = z.infer<typeof manifestSchema>;

/** A manifest with nothing rendered yet: every Cosmetic falls back to its icon. */
export const EMPTY_MANIFEST: RenderManifest = { version: RENDER_MANIFEST_VERSION, renders: {}, failures: [] };

/** The manifest, or a thrown error naming what is wrong with it. */
export function assertValidRenderManifest(document: unknown): RenderManifest {
  return manifestSchema.parse(document);
}
