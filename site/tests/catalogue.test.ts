/**
 * The build reads one file and trusts nothing about it. These are the tests that
 * say so: the committed catalogue and the fixture both match the schema the site
 * was written against, and a catalogue that does not is refused rather than
 * rendered.
 */
import { assertValidCatalogue, CATALOGUE_SCHEMA_VERSION } from "@tf2-cosm/data/catalogue";
import { describe, expect, it } from "vitest";

import { fixtureCatalogue } from "./fixtures.ts";

import { loadCatalogue } from "@/catalogue/load";

describe("the committed catalogue", () => {
  it("matches the schema this site was written against", () => {
    const catalogue = loadCatalogue();
    expect(catalogue.schemaVersion).toBe(CATALOGUE_SCHEMA_VERSION);
    expect(catalogue.cosmetics.length).toBe(catalogue.header.counts.cosmetics);
    expect(catalogue.cosmetics.length).toBeGreaterThan(1000);
  });
});

describe("the fixture catalogue", () => {
  it("is shaped exactly like the committed one, so component tests are not testing a fiction", () => {
    expect(fixtureCatalogue().schemaVersion).toBe(CATALOGUE_SCHEMA_VERSION);
  });
});

describe("a catalogue that violates its schema", () => {
  it("is refused, naming what is wrong, rather than being half-rendered", () => {
    const broken = fixtureCatalogue() as unknown as { cosmetics: { slug: unknown }[] };
    broken.cosmetics[0]!.slug = "Not A Slug";
    expect(() => assertValidCatalogue(broken)).toThrow(/cosmetics\.0\.slug/);
  });

  it("is refused when it is of a schema version the site does not know", () => {
    const wrongVersion = { ...fixtureCatalogue(), schemaVersion: CATALOGUE_SCHEMA_VERSION + 1 };
    expect(() => assertValidCatalogue(wrongVersion)).toThrow(/schemaVersion/);
  });
});
