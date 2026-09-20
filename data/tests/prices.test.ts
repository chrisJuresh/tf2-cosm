import { describe, expect, it } from "vitest";

import { buildCatalogue } from "../src/catalogue/build.ts";
import type { Price } from "../src/catalogue/schema.ts";
import { refinedToScrap } from "../src/prices/metal.ts";
import type { PricedVariant, Rates } from "../src/prices/price-source.ts";
import { priceOf } from "../src/prices/price-spread.ts";
import { chooseReferenceVariant } from "../src/prices/reference-variant.ts";
import { fixtureInputs, fixturePricedInputs } from "./fixtures.ts";

const RATES: Rates = {
  keyRate: { scrapPerKey: refinedToScrap(78.66), lastUpdatedAt: "2026-09-20T00:00:00.000Z" },
  scrapPerUnit: new Map([
    ["metal", 9],
    ["hat", 12],
    ["keys", refinedToScrap(78.66)],
  ]),
};

const variant = (overrides: Partial<PricedVariant> = {}): PricedVariant => ({
  quality: "unique",
  craftable: true,
  currency: "metal",
  low: 1.33,
  high: 1.33,
  lastUpdatedAt: "2026-09-20T00:00:00.000Z",
  ...overrides,
});

/**
 * The five cases the price snapshot has to get right, all read off one recorded
 * backpack.tf payload (`tests/fixtures/backpack-tf-prices.json`).
 */
describe("the Price Spread of each fixture Cosmetic", () => {
  const priceBySlug = async (slug: string): Promise<Price> => {
    const { catalogue } = buildCatalogue(await fixturePricedInputs());
    const cosmetic = catalogue.cosmetics.find((one) => one.slug === slug);
    if (!cosmetic?.price) throw new Error(`no priced cosmetic ${slug} in the fixture catalogue`);
    return cosmetic.price;
  };

  it("prices a Cosmetic quoted in Keys, converting at the snapshot's Key Rate", async () => {
    // The fixture's entry claims no defindex, so this one joins on the name.
    const price = await priceBySlug("team-captain");
    expect(price).toMatchObject({
      state: "priced",
      referenceVariant: { quality: "unique", craftable: true },
      currency: "keys",
      lastUpdatedAt: "2026-09-07T16:53:20.000Z",
    });
    if (price.state !== "priced") throw new Error("unreachable");
    // 2 and 2.5 Keys at 708 scrap a Key; the midpoint is 2.25 Keys.
    expect(price.spread.low).toEqual({ value: 2, metal: { scrap: 1416, refined: 157.3333, notation: "2 keys" } });
    expect(price.spread.mid.metal).toEqual({ scrap: 1593, refined: 177, notation: "2 keys, 19.66 ref" });
    expect(price.spread.high.metal).toEqual({ scrap: 1770, refined: 196.6667, notation: "2 keys, 39.33 ref" });
  });

  it("prices a Cosmetic quoted in Metal, matched by defindex although the names differ", async () => {
    // The fixture calls it "Bolt-Boy", which is not the catalogue's name for it.
    const price = await priceBySlug("bolt-boy");
    if (price.state !== "priced") throw new Error("bolt-boy should be priced");
    expect(price.currency).toBe("metal");
    expect(price.spread.low.metal).toEqual({ scrap: 12, refined: 1.3333, notation: "1.33 ref" });
    expect(price.spread.mid.metal).toEqual({ scrap: 13, refined: 1.4444, notation: "1.44 ref" });
    expect(price.spread.high.metal).toEqual({ scrap: 14, refined: 1.5556, notation: "1.55 ref" });
  });

  it("falls back to the Native Quality for a Genuine-only promo, ignoring its Unusuals", async () => {
    const price = await priceBySlug("tin-pot");
    expect(price).toMatchObject({
      state: "priced",
      referenceVariant: { quality: "genuine", craftable: true },
      currency: "metal",
    });
    if (price.state !== "priced") throw new Error("unreachable");
    expect(price.spread.low.metal.notation).toBe("18.66 ref");
    expect(price.spread.high.metal.notation).toBe("20 ref");
  });

  it("takes the non-craftable Unique when that is the only Unique priced", async () => {
    const price = await priceBySlug("ghastly-gibus");
    expect(price).toMatchObject({
      state: "priced",
      referenceVariant: { quality: "unique", craftable: false },
    });
    if (price.state !== "priced") throw new Error("unreachable");
    expect(price.spread.low.metal.notation).toBe("0.11 ref");
    expect(price.spread.high.metal.notation).toBe("0.11 ref");
  });

  it("leaves a Cosmetic the price list never mentions Unpriced, and in the catalogue", async () => {
    const price = await priceBySlug("dead-of-night");
    expect(price).toEqual({ state: "unpriced", reason: "missing-from-source" });
  });
});

describe("the price snapshot's header", () => {
  it("records the source, the Key Rate and what every Cosmetic's Reference Variant was", async () => {
    const { catalogue } = buildCatalogue(await fixturePricedInputs());
    expect(catalogue.header.prices).toEqual({
      source: "backpack.tf (IGetPrices v4, IGetCurrencies v1)",
      takenAt: "2026-09-20T12:00:00.000Z",
      keyRate: {
        scrap: 708,
        refined: 78.6667,
        notation: "78.66 ref",
        lastUpdatedAt: "2026-09-08T20:40:00.000Z",
      },
      counts: {
        priced: 4,
        unpriced: 1,
        byReferenceVariant: { "genuine-craftable": 1, "unique-craftable": 2, "unique-non-craftable": 1 },
        unpricedByReason: { "missing-from-source": 1 },
      },
    });
  });

  it("leaves prices out entirely when the run had no price source", () => {
    const { catalogue } = buildCatalogue(fixtureInputs());
    expect(catalogue.header.prices).toBeNull();
    expect(catalogue.cosmetics.every((one) => one.price === null)).toBe(true);
  });
});

describe("choosing the Reference Variant", () => {
  it("prefers Unique craftable over everything else", () => {
    const chosen = chooseReferenceVariant(
      [variant({ quality: "genuine" }), variant({ craftable: false }), variant()],
      "genuine",
      RATES,
    );
    expect(chosen).toEqual({ variant: variant(), currency: "metal", scrapPerUnit: 9 });
  });

  it("prefers a Unique copy over the Native Quality even when the Unique is non-craftable", () => {
    const chosen = chooseReferenceVariant(
      [variant({ quality: "genuine" }), variant({ craftable: false })],
      "genuine",
      RATES,
    );
    expect(chosen).toEqual({ variant: variant({ craftable: false }), currency: "metal", scrapPerUnit: 9 });
  });

  it("finds the Genuine promo price even when Valve's schema calls the item Unique", () => {
    // The ten Cosmetics with no Unique price are Genuine promos, and the schema
    // does not mark all of them, so the fallback chain runs regardless.
    const chosen = chooseReferenceVariant([variant({ quality: "genuine" })], "unique", RATES);
    expect(chosen).toEqual({ variant: variant({ quality: "genuine" }), currency: "metal", scrapPerUnit: 9 });
  });

  it("falls through the Native Qualities in the order the spec fixes", () => {
    const priced = (["collectors", "strange", "haunted", "vintage", "genuine"] as const).map((quality) =>
      variant({ quality }),
    );
    const order: string[] = [];
    for (let remaining = [...priced]; remaining.length > 0; remaining = remaining.slice(0, -1)) {
      const chosen = chooseReferenceVariant(remaining, "unique", RATES);
      if (!("variant" in chosen)) throw new Error("should be priced");
      order.push(chosen.variant.quality);
    }
    expect(order).toEqual(["genuine", "vintage", "haunted", "strange", "collectors"]);
  });

  it("never takes an Unusual, even when it is the Native Quality", () => {
    expect(chooseReferenceVariant([variant({ quality: "unusual" })], "unusual", RATES)).toEqual({
      unpriced: "no-reference-variant",
    });
  });

  it("reports an item the source never listed as missing from it", () => {
    expect(chooseReferenceVariant(undefined, "unique", RATES)).toEqual({ unpriced: "missing-from-source" });
  });

  it("reports an item priced only in a Quality the rule does not accept", () => {
    expect(chooseReferenceVariant([variant({ quality: "self-made" })], "unique", RATES)).toEqual({
      unpriced: "no-reference-variant",
    });
  });

  it("refuses to quietly drop to a lesser Quality when the Reference Variant is in dollars", () => {
    const chosen = chooseReferenceVariant([variant({ currency: "usd" }), variant({ quality: "genuine" })], "genuine", RATES);
    expect(chosen).toEqual({ unpriced: "unsupported-currency" });
  });
});

describe("the Price Spread", () => {
  it("makes low, mid and high one figure when the source quotes one", () => {
    const price = priceOf([variant({ low: 1.33, high: 1.33 })], "unique", RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    expect([price.spread.low, price.spread.mid, price.spread.high].map((point) => point.metal.scrap)).toEqual([
      12, 12, 12,
    ]);
  });

  it("keeps the midpoint between the two ends after rounding to the nearest scrap", () => {
    const price = priceOf([variant({ low: 1, high: 2 })], "unique", RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    const { low, mid, high } = price.spread;
    expect(low.metal.scrap).toBeLessThanOrEqual(mid.metal.scrap);
    expect(mid.metal.scrap).toBeLessThanOrEqual(high.metal.scrap);
    expect(mid.value).toBe(1.5);
  });

  it("reads a spread the source quoted backwards in the order the catalogue wants", () => {
    const price = priceOf([variant({ low: 3, high: 1 })], "unique", RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    expect([price.spread.low.value, price.spread.high.value]).toEqual([1, 3]);
  });

  it("converts a price quoted in Random Craft Hats, which is how cheap Cosmetics are priced", () => {
    const price = priceOf([variant({ currency: "hat", low: 1, high: 2 })], "unique", RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    expect(price.currency).toBe("hat");
    // A Craft Hat is 1.33 ref, so twelve scrap.
    expect(price.spread.low.metal).toEqual({ scrap: 12, refined: 1.3333, notation: "1.33 ref" });
    expect(price.spread.high.metal).toEqual({ scrap: 24, refined: 2.6667, notation: "2.66 ref" });
  });

  it("takes the unrounded Metal figure over the rounded one the source displays", () => {
    // 0.115 ref rounds to 0.11 for display but is a scrap either way; the point
    // is that the unrounded figure is what the arithmetic runs on.
    const price = priceOf([variant({ low: 1.33, high: 1.33, lowRefined: 1.4444, highRefined: 1.4444 })], "unique", RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    expect(price.spread.low.value).toBe(1.33);
    expect(price.spread.low.metal.scrap).toBe(13);
  });

  it("converts a Key price with the snapshot's Key Rate, not with the source's own", () => {
    const price = priceOf(
      // The source's unrounded figures say 100 ref a Key; the snapshot says 78.66.
      [variant({ currency: "keys", low: 1, high: 1, lowRefined: 100, highRefined: 100 })],
      "unique",
      RATES,
    );
    if (price.state !== "priced") throw new Error("should be priced");
    expect(price.spread.low.metal.scrap).toBe(708);
  });
});
