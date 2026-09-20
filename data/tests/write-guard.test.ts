import { describe, expect, it } from "vitest";

import { buildCatalogue } from "../src/catalogue/build.ts";
import type { Catalogue } from "../src/catalogue/schema.ts";
import { DEFAULT_WRITE_GUARD_LIMITS, writeRefusal } from "../src/catalogue/write-guard.ts";
import { fixturePricedInputs } from "./fixtures.ts";

/** The fixture catalogue, with however many of its Cosmetics survive the run. */
async function fixtureCatalogue(keep?: number): Promise<Catalogue> {
  const { catalogue } = buildCatalogue(await fixturePricedInputs());
  const cosmetics = keep === undefined ? catalogue.cosmetics : catalogue.cosmetics.slice(0, keep);
  return {
    ...catalogue,
    header: { ...catalogue.header, counts: { ...catalogue.header.counts, cosmetics: cosmetics.length } },
    cosmetics,
  };
}

/** The whole fixture catalogue's five Cosmetics, as the committed file would hold them. */
const committed = (cosmetics: number) => ({ path: "catalogue/catalogue.json", cosmetics });

/** The fixture catalogue prices four of its five Cosmetics, so the floor has to suit it. */
const LIMITS = { ...DEFAULT_WRITE_GUARD_LIMITS, minimumPricedCosmetics: 4 };

describe("the guard on overwriting the committed catalogue", () => {
  it("allows a run that lost nothing", async () => {
    expect(writeRefusal(await fixtureCatalogue(), committed(5), LIMITS)).toBeUndefined();
  });

  it("blocks a run that lost more than the configured fraction, and says what it lost", async () => {
    const refusal = writeRefusal(await fixtureCatalogue(3), committed(5), LIMITS);

    expect(refusal).toContain("3");
    expect(refusal).toContain("5");
    expect(refusal).toContain("2%");
    expect(refusal).toContain("--max-drop");
  });

  it("allows a drop inside the configured fraction", async () => {
    const limits = { ...LIMITS, maxCosmeticDropFraction: 0.5 };
    expect(writeRefusal(await fixtureCatalogue(3), committed(5), limits)).toBeUndefined();
  });

  it("never blocks a run that gained Cosmetics", async () => {
    expect(writeRefusal(await fixtureCatalogue(), committed(2), LIMITS)).toBeUndefined();
  });

  it("allows the first run, with no committed catalogue to compare against", async () => {
    expect(writeRefusal(await fixtureCatalogue(3), null, LIMITS)).toBeUndefined();
  });

  it("blocks a snapshot that priced fewer Cosmetics than a whole one carries", async () => {
    const refusal = writeRefusal(await fixtureCatalogue(), committed(5), DEFAULT_WRITE_GUARD_LIMITS);

    expect(refusal).toContain("priced");
    expect(refusal).toContain(String(DEFAULT_WRITE_GUARD_LIMITS.minimumPricedCosmetics));
  });

  it("does not hold a price floor against a run that had no price source", async () => {
    const inputs = await fixturePricedInputs();
    const { catalogue } = buildCatalogue({ ...inputs, prices: undefined });

    expect(writeRefusal(catalogue, committed(5), DEFAULT_WRITE_GUARD_LIMITS)).toBeUndefined();
  });
});
