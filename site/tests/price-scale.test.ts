/**
 * The notches of the price sliders: where the top of the scale comes from, what
 * each notch is worth, and which notch a bound is drawn at.
 *
 * Nothing here renders anything. What the sliders do with the scale is in
 * `catalogue-browser.test.tsx`, and what a bound does to the catalogue is in
 * `browsing.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { fixtureCosmetics } from "./fixtures.ts";

import { PRICE_STEPS, priceCeiling, priceScale, stepForScrap } from "@/browsing/price-scale";

/** The fixture's dearest Cosmetic is the Team Captain, at 1593 scrap. */
const FIXTURE_CEILING = 1593;

describe("the top of the scale", () => {
  it("is the dearest Metal Value the snapshot priced", () => {
    expect(priceCeiling(fixtureCosmetics())).toBe(FIXTURE_CEILING);
  });

  it("ignores the Cosmetics with no price at all", () => {
    const priced = fixtureCosmetics().filter((cosmetic) => cosmetic.price?.state === "priced");
    expect(priceCeiling(priced)).toBe(priceCeiling(fixtureCosmetics()));
  });

  it("is a scale rather than a row of zeroes for a catalogue with no prices in it", () => {
    // A snapshot taken without a price source prices nothing, and a slider whose
    // every notch is worth the same is a slider that reads as broken.
    const scale = priceScale(priceCeiling([]));
    expect(new Set(scale).size).toBe(scale.length);
  });
});

describe("what each notch is worth", () => {
  const scale = priceScale(FIXTURE_CEILING);

  it("has a notch for every step of the slider, and one at each end", () => {
    expect(scale).toHaveLength(PRICE_STEPS + 1);
  });

  it("starts at nothing and ends at the dearest Cosmetic exactly", () => {
    expect(scale[0]).toBe(0);
    expect(scale[PRICE_STEPS]).toBe(FIXTURE_CEILING);
  });

  it("never goes backwards, and never stalls on a notch worth what the last one was", () => {
    for (let step = 1; step <= PRICE_STEPS; step += 1) {
      expect(scale[step]).toBeGreaterThan(scale[step - 1] ?? -1);
    }
  });

  it("spends half its notches under a Key, which is where the catalogue is", () => {
    // The point of a geometric scale: a linear one would put every notch but
    // the last two above anything a player actually browses for. A Key is 708
    // scrap in the fixture snapshot.
    const underAKey = scale.filter((scrap) => scrap < 708).length;
    expect(underAKey).toBeGreaterThan(PRICE_STEPS / 2);
  });
});

describe("the notch a bound is drawn at", () => {
  const scale = priceScale(FIXTURE_CEILING);

  it("is the one worth exactly that, for a bound this scale set itself", () => {
    for (let step = 0; step <= PRICE_STEPS; step += 1) {
      expect(stepForScrap(scale, scale[step] ?? 0)).toBe(step);
    }
  });

  it("is the nearest notch for a bound that falls between two", () => {
    // 55 scrap — remembered from a visit whose snapshot had a different dearest
    // Cosmetic — is between the notches worth 51 and 59, and nearer 59 as a
    // price is read: a sixteenth dearer against a thirteenth cheaper.
    expect(scale[26]).toBe(51);
    expect(scale[27]).toBe(59);
    expect(stepForScrap(scale, 55)).toBe(27);
  });

  it("does not run off either end of the track for a bound outside this scale", () => {
    expect(stepForScrap(scale, 0)).toBe(0);
    expect(stepForScrap(scale, FIXTURE_CEILING * 100)).toBe(PRICE_STEPS);
  });
});
