import { QUALITIES } from "@tf2-cosm/data/catalogue";
import { describe, expect, it } from "vitest";

import { qualityFromSteam, STEAM_QUALITY_NAMES } from "../src/quality.ts";

/**
 * The one place two vocabularies meet. The catalogue's Quality names are the
 * ones every price in this project is keyed by; Steam's inventory uses its own,
 * and they are nearly the same, which is what makes the differences dangerous.
 */
describe("Steam's Quality names against the catalogue's", () => {
  it("only ever produces a Quality the catalogue knows", () => {
    // The import is the point of this test: the data job owns the vocabulary, so
    // a Quality renamed there fails here rather than turning into a Variant
    // Price lookup that silently finds nothing.
    const produced = new Set(Object.values(STEAM_QUALITY_NAMES));
    expect([...produced].filter((one) => !(QUALITIES as readonly string[]).includes(one))).toEqual([]);
  });

  it("covers every Quality the catalogue has, so no copy is unreadable for want of a row", () => {
    const covered = new Set(Object.values(STEAM_QUALITY_NAMES));
    expect(QUALITIES.filter((one) => !covered.has(one))).toEqual([]);
  });

  it("translates the two that are named differently, which are the two that matter", () => {
    // A promo copy and an Unusual: Steam names both after a schema index.
    expect(qualityFromSteam("rarity1")).toBe("genuine");
    expect(qualityFromSteam("rarity4")).toBe("unusual");
  });

  it("does not care about case, because Steam is not consistent about it", () => {
    expect(qualityFromSteam("Unique")).toBe("unique");
    expect(qualityFromSteam("unique")).toBe("unique");
    expect(qualityFromSteam("STRANGE")).toBe("strange");
  });

  it("refuses a Quality it does not know rather than falling back on Unique", () => {
    // A copy shown at the Unique price because its real Quality went
    // unrecognised would be a wrong figure presented as a right one.
    expect(qualityFromSteam("somethingnew")).toBeUndefined();
    expect(qualityFromSteam(undefined)).toBeUndefined();
  });
});
