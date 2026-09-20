import { describe, expect, it } from "vitest";

import { buildCatalogue } from "../src/catalogue/build.ts";
import {
  assertValidCatalogue,
  CATALOGUE_SCHEMA_VERSION,
  CatalogueValidationError,
  catalogueJsonSchema,
} from "../src/catalogue/schema.ts";
import { fixtureInputs } from "./fixtures.ts";

describe("the catalogue schema", () => {
  it("accepts a catalogue the builder produced", () => {
    const { catalogue } = buildCatalogue(fixtureInputs());
    expect(assertValidCatalogue(JSON.parse(JSON.stringify(catalogue)))).toEqual(catalogue);
    expect(catalogue.schemaVersion).toBe(CATALOGUE_SCHEMA_VERSION);
  });

  it("rejects a catalogue with a malformed slug", () => {
    const { catalogue } = buildCatalogue(fixtureInputs());
    const broken = { ...catalogue, cosmetics: [{ ...catalogue.cosmetics[0]!, slug: "Team Captain" }] };
    expect(() => assertValidCatalogue(broken)).toThrow(CatalogueValidationError);
  });

  it("rejects a catalogue from a different schema version", () => {
    const { catalogue } = buildCatalogue(fixtureInputs());
    expect(() => assertValidCatalogue({ ...catalogue, schemaVersion: 99 })).toThrow(CatalogueValidationError);
  });

  it("publishes a JSON Schema document for the same version", () => {
    const jsonSchema = catalogueJsonSchema();
    expect(jsonSchema["$id"]).toContain(`v${CATALOGUE_SCHEMA_VERSION}`);
    expect(jsonSchema["properties"]).toHaveProperty("cosmetics");
  });
});
