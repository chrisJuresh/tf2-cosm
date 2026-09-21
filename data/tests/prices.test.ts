import { describe, expect, it } from "vitest";

import { buildCatalogue } from "../src/catalogue/build.ts";
import type { Price } from "../src/catalogue/schema.ts";
import { refinedToScrap } from "../src/prices/metal.ts";
import type { PricedVariant, Quality, Rates } from "../src/prices/price-source.ts";
import { priceOf, variantPricesOf } from "../src/prices/price-spread.ts";
import { chooseReferenceVariant, type ReferenceVariantContext } from "../src/prices/reference-variant.ts";
import { fixtureInputs, fixturePricedInputs } from "./fixtures.ts";

const RATES: Rates = {
  keyRate: { scrapPerKey: refinedToScrap(78.66), lastUpdatedAt: "2026-09-20T00:00:00.000Z" },
  scrapPerUnit: new Map([
    ["metal", 9],
    ["hat", 12],
    ["keys", refinedToScrap(78.66)],
  ]),
  // The Random Craft Hat is the one currency backpack.tf marks as a blanket.
  blanketCurrencies: new Set(["hat"]),
};

/**
 * The Cosmetic side of the rule. Nothing is Issued in Play unless a test says
 * so, which is the reading that makes a Blanket Price have to justify itself.
 */
const cosmetic = (nativeQuality: Quality, issuedInPlay = false): ReferenceVariantContext => ({
  nativeQuality,
  issuedInPlay,
});

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
        priced: 7,
        unpriced: 1,
        byReferenceVariant: { "genuine-craftable": 2, "unique-craftable": 4, "unique-non-craftable": 1 },
        // The Stove Pipe and the Crocodile Smile; the Baronial Badge took its
        // Genuine price instead of the blanket one (ADR-0004).
        blanketPriced: 2,
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

/**
 * The second document the run writes. It is the same price list reduced the
 * other way: not the one figure that stands for a Cosmetic, but every figure a
 * copy somebody holds could be worth.
 */
describe("the Variant Prices document", () => {
  it("is keyed by the catalogue's own slug, and carries what the Reference Price left behind", async () => {
    const { variantPrices } = buildCatalogue(await fixturePricedInputs());
    // The Crocodile Smile takes its blanket Unique figure as the Reference
    // Price, so its Genuine price is nowhere in the catalogue — and it is what
    // a Genuine copy of it is worth.
    expect(variantPrices?.bySlug["crocodile-smile"]).toMatchObject([
      { quality: "genuine", craftable: true, blanket: false },
      { quality: "unique", craftable: true, blanket: true },
    ]);
  });

  it("repeats the catalogue's snapshot time and Key Rate, so a reader can see they are one run", async () => {
    const { catalogue, variantPrices } = buildCatalogue(await fixturePricedInputs());
    expect(variantPrices?.header.snapshotTakenAt).toBe(catalogue.header.snapshotTakenAt);
    expect(variantPrices?.header.keyRate).toEqual(catalogue.header.prices?.keyRate);
  });

  it("counts every Quality a copy can be held in, which is more than the Reference Variants", async () => {
    const { variantPrices } = buildCatalogue(await fixturePricedInputs());
    // The rule only ever picks one. The Crocodile Smile and the Stove Pipe are
    // priced Genuine as well as Unique; the Baronial Badge keeps the blanket
    // Unique figure ADR-0004 refused to let stand for it; the Team Captain is
    // priced non-craftable as well. Unusual is never counted — the Tin Pot has
    // two effects priced and neither is a figure for the Cosmetic.
    expect(variantPrices?.header.counts).toEqual({
      cosmetics: 7,
      variants: 11,
      byVariant: { "genuine-craftable": 4, "unique-craftable": 5, "unique-non-craftable": 2 },
    });
  });

  it("leaves out a Cosmetic with no Variant Price rather than writing it empty", async () => {
    const { variantPrices } = buildCatalogue(await fixturePricedInputs());
    // The one the fixture price list never mentions.
    expect(variantPrices?.bySlug["dead-of-night"]).toBeUndefined();
  });

  it("is not written at all when the run had no price source", () => {
    expect(buildCatalogue(fixtureInputs()).variantPrices).toBeNull();
  });
});

describe("choosing the Reference Variant", () => {
  it("prefers Unique craftable over everything else", () => {
    const chosen = chooseReferenceVariant(
      [variant({ quality: "genuine" }), variant({ craftable: false }), variant()],
      cosmetic("genuine"),
      RATES,
    );
    expect(chosen).toEqual({ variant: variant(), currency: "metal", scrapPerUnit: 9, blanket: false });
  });

  it("prefers a Unique copy over the Native Quality even when the Unique is non-craftable", () => {
    const chosen = chooseReferenceVariant(
      [variant({ quality: "genuine" }), variant({ craftable: false })],
      cosmetic("genuine"),
      RATES,
    );
    expect(chosen).toEqual({
      variant: variant({ craftable: false }),
      currency: "metal",
      scrapPerUnit: 9,
      blanket: false,
    });
  });

  it("finds the Genuine promo price even when Valve's schema calls the item Unique", () => {
    // The ten Cosmetics with no Unique price are Genuine promos, and the schema
    // does not mark all of them, so the fallback chain runs regardless.
    const chosen = chooseReferenceVariant([variant({ quality: "genuine" })], cosmetic("unique"), RATES);
    expect(chosen).toEqual({
      variant: variant({ quality: "genuine" }),
      currency: "metal",
      scrapPerUnit: 9,
      blanket: false,
    });
  });

  it("falls through the Native Qualities in the order the spec fixes", () => {
    const priced = (["collectors", "strange", "haunted", "vintage", "genuine"] as const).map((quality) =>
      variant({ quality }),
    );
    const order: string[] = [];
    for (let remaining = [...priced]; remaining.length > 0; remaining = remaining.slice(0, -1)) {
      const chosen = chooseReferenceVariant(remaining, cosmetic("unique"), RATES);
      if (!("variant" in chosen)) throw new Error("should be priced");
      order.push(chosen.variant.quality);
    }
    expect(order).toEqual(["genuine", "vintage", "haunted", "strange", "collectors"]);
  });

  it("never takes an Unusual, even when it is the Native Quality", () => {
    expect(chooseReferenceVariant([variant({ quality: "unusual" })], cosmetic("unusual"), RATES)).toEqual({
      unpriced: "no-reference-variant",
    });
  });

  it("reports an item the source never listed as missing from it", () => {
    expect(chooseReferenceVariant(undefined, cosmetic("unique"), RATES)).toEqual({ unpriced: "missing-from-source" });
  });

  it("reports an item priced only in a Quality the rule does not accept", () => {
    expect(chooseReferenceVariant([variant({ quality: "self-made" })], cosmetic("unique"), RATES)).toEqual({
      unpriced: "no-reference-variant",
    });
  });

  it("refuses to quietly drop to a lesser Quality when the Reference Variant is in dollars", () => {
    const chosen = chooseReferenceVariant([variant({ currency: "usd" }), variant({ quality: "genuine" })], cosmetic("genuine"), RATES);
    expect(chosen).toEqual({ unpriced: "unsupported-currency" });
  });
});

describe("the Price Spread", () => {
  it("makes low, mid and high one figure when the source quotes one", () => {
    const price = priceOf([variant({ low: 1.33, high: 1.33 })], cosmetic("unique"), RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    expect([price.spread.low, price.spread.mid, price.spread.high].map((point) => point.metal.scrap)).toEqual([
      12, 12, 12,
    ]);
  });

  it("keeps the midpoint between the two ends after rounding to the nearest scrap", () => {
    const price = priceOf([variant({ low: 1, high: 2 })], cosmetic("unique"), RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    const { low, mid, high } = price.spread;
    expect(low.metal.scrap).toBeLessThanOrEqual(mid.metal.scrap);
    expect(mid.metal.scrap).toBeLessThanOrEqual(high.metal.scrap);
    expect(mid.value).toBe(1.5);
  });

  it("reads a spread the source quoted backwards in the order the catalogue wants", () => {
    const price = priceOf([variant({ low: 3, high: 1 })], cosmetic("unique"), RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    expect([price.spread.low.value, price.spread.high.value]).toEqual([1, 3]);
  });

  it("converts a price quoted in Random Craft Hats, which is how cheap Cosmetics are priced", () => {
    const price = priceOf([variant({ currency: "hat", low: 1, high: 2 })], cosmetic("unique"), RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    expect(price.currency).toBe("hat");
    // A Craft Hat is 1.33 ref, so twelve scrap.
    expect(price.spread.low.metal).toEqual({ scrap: 12, refined: 1.3333, notation: "1.33 ref" });
    expect(price.spread.high.metal).toEqual({ scrap: 24, refined: 2.6667, notation: "2.66 ref" });
  });

  it("takes the unrounded Metal figure over the rounded one the source displays", () => {
    // 0.115 ref rounds to 0.11 for display but is a scrap either way; the point
    // is that the unrounded figure is what the arithmetic runs on.
    const price = priceOf([variant({ low: 1.33, high: 1.33, lowRefined: 1.4444, highRefined: 1.4444 })], cosmetic("unique"), RATES);
    if (price.state !== "priced") throw new Error("should be priced");
    expect(price.spread.low.value).toBe(1.33);
    expect(price.spread.low.metal.scrap).toBe(13);
  });

  it("converts a Key price with the snapshot's Key Rate, not with the source's own", () => {
    const price = priceOf(
      // The source's unrounded figures say 100 ref a Key; the snapshot says 78.66.
      [variant({ currency: "keys", low: 1, high: 1, lowRefined: 100, highRefined: 100 })],
      cosmetic("unique"),
      RATES,
    );
    if (price.state !== "priced") throw new Error("should be priced");
    expect(price.spread.low.metal.scrap).toBe(708);
  });
});

/**
 * A Blanket Price is the Random Craft Hat figure backpack.tf lays over every
 * craft hat. For a craft hat it is the plainest true thing anyone can say; for a
 * Promo-Only Cosmetic it prices a Unique copy that was never issued (ADR-0004).
 */
describe("a Blanket Price", () => {
  const blanket = variant({ currency: "hat", low: 1, high: 1 });
  const genuine = variant({ quality: "genuine", low: 5.77, high: 6.44 });

  it("gives way to the Native Quality for a promo the game does not issue in play", () => {
    const chosen = chooseReferenceVariant([blanket, genuine], cosmetic("unique", false), RATES);
    expect(chosen).toMatchObject({ variant: genuine, currency: "metal", blanket: false });
  });

  it("stands for a promo the game does issue in play, whose Unique copies are real", () => {
    // The Scotsman's Stove Pipe: a Genuine price, and a craft hat that drops.
    const chosen = chooseReferenceVariant([blanket, genuine], cosmetic("unique", true), RATES);
    expect(chosen).toMatchObject({ variant: blanket, currency: "hat", blanket: true });
  });

  it("stands for a Cosmetic with no Genuine price, whatever the game does with it", () => {
    // A case Cosmetic, which items_game puts in no loot list it carries. Nothing
    // says it was ever issued as anything but Unique, so its blanket figure
    // prices a copy that exists — and must not give way to a Strange one.
    const strange = variant({ quality: "strange", low: 26.66 });
    const chosen = chooseReferenceVariant([blanket, strange], cosmetic("unique", false), RATES);
    expect(chosen).toMatchObject({ variant: blanket, blanket: true });
  });

  it("is passed over for a promo even where the Quality below it is further down the chain", () => {
    const vintage = variant({ quality: "vintage", low: 31.88 });
    const chosen = chooseReferenceVariant([blanket, genuine, vintage], cosmetic("unique", false), RATES);
    expect(chosen).toMatchObject({ variant: genuine });
  });

  it("never gives way to an Unusual, which prices the effect and not the Cosmetic", () => {
    const unusual = variant({ quality: "unusual", currency: "keys", low: 29 });
    const chosen = chooseReferenceVariant([blanket, unusual], cosmetic("unique", false), RATES);
    expect(chosen).toMatchObject({ variant: blanket, blanket: true });
  });

  it("leaves a promo Unpriced rather than falling back on it when the real price will not convert", () => {
    // Inherited from the rule that a Reference Variant quoted in something the
    // snapshot cannot convert is Unpriced rather than quietly demoted: once the
    // blanket figure is out of the running, there is nothing below it either.
    const inDollars = variant({ quality: "genuine", currency: "usd", low: 3 });
    expect(chooseReferenceVariant([blanket, inDollars], cosmetic("unique", false), RATES)).toEqual({
      unpriced: "unsupported-currency",
    });
  });

  it("is marked on the price the catalogue records, so the site can show it as approximate", () => {
    const price = priceOf([blanket], cosmetic("unique", false), RATES);
    expect(price).toMatchObject({ state: "priced", blanket: true });
    expect(priceOf([genuine], cosmetic("unique", false), RATES)).toMatchObject({ blanket: false });
  });
});

/**
 * The Variant Prices: what a copy somebody actually owns is worth. The Reference
 * Variant rule answers "what does this Cosmetic cost"; this answers "what is my
 * copy worth", and those are different questions with different answers.
 */
describe("the Variant Prices", () => {
  const anyUnique = variant({ quality: "unique", low: 1.33, high: 1.55 });
  const anyGenuine = variant({ quality: "genuine", low: 18.66, high: 20 });

  it("prices every Quality the source listed, not only the Reference Variant", () => {
    const prices = variantPricesOf([anyUnique, anyGenuine], RATES);
    expect(prices.map((one) => `${one.quality}-${one.craftable}`)).toEqual(["genuine-true", "unique-true"]);
  });

  it("keeps the Reference Variant among them rather than holding it out", () => {
    const chosen = chooseReferenceVariant([anyUnique, anyGenuine], cosmetic("unique", true), RATES);
    if ("unpriced" in chosen) throw new Error("unreachable");
    const mine = variantPricesOf([anyUnique, anyGenuine], RATES).find(
      (one) => one.quality === chosen.variant.quality && one.craftable === chosen.variant.craftable,
    );
    expect(mine).toBeDefined();
  });

  it("comes to the same Metal Values the Reference Price would have been written at", () => {
    // The point of the lean shape: it drops what a reader can recompute, never
    // what the figure is. The scrap counts have to be the Reference Price's.
    const reference = priceOf([anyGenuine], cosmetic("genuine", true), RATES);
    if (reference.state !== "priced") throw new Error("unreachable");
    const [only] = variantPricesOf([anyGenuine], RATES);
    expect(only?.scrap).toEqual({
      low: reference.spread.low.metal.scrap,
      mid: reference.spread.mid.metal.scrap,
      high: reference.spread.high.metal.scrap,
    });
    expect(only?.lastUpdatedAt).toBe(reference.lastUpdatedAt);
  });

  it("converts a figure in Keys at the snapshot's own Key Rate, as the Reference Price does", () => {
    const inKeys = variant({ quality: "strange", currency: "keys", low: 2, high: 2.5 });
    const [only] = variantPricesOf([inKeys], RATES);
    // 2 and 2.5 Keys at 708 scrap a Key, and the midpoint of the two.
    expect(only?.scrap).toEqual({ low: 1416, mid: 1593, high: 1770 });
  });

  it("leaves out an Unusual, which is priced by its effect and not as one figure", () => {
    const unusual = variant({ quality: "unusual", currency: "keys", low: 29 });
    expect(variantPricesOf([anyUnique, unusual], RATES).map((one) => one.quality)).toEqual(["unique"]);
  });

  it("leaves out a figure quoted in a currency the snapshot has no rate for", () => {
    const inDollars = variant({ quality: "vintage", currency: "usd", low: 3 });
    expect(variantPricesOf([anyUnique, inDollars], RATES).map((one) => one.quality)).toEqual(["unique"]);
  });

  it("marks a Blanket Price as one on the variant that carries it", () => {
    const blanket = variant({ currency: "hat", low: 1, high: 1 });
    expect(variantPricesOf([blanket], RATES)).toMatchObject([{ quality: "unique", blanket: true }]);
  });

  it("keeps a blanket Unique that ADR-0004 refused to let stand for a Promo-Only Cosmetic", () => {
    // The two rules part company here, and on purpose. ADR-0004 is about which
    // figure stands for a Cosmetic nobody owns a particular copy of; it does not
    // say the source never quoted one. A Unique copy of a Promo-Only Cosmetic
    // was never issued, so no Inventory holds one and nothing is ever shown at
    // this figure — but inventing an absence here would be this file editing the
    // source rather than reporting it.
    const blanket = variant({ currency: "hat", low: 1, high: 1 });
    const promo = variant({ quality: "genuine", low: 18.66, high: 20 });
    expect(priceOf([blanket, promo], cosmetic("unique", false), RATES)).toMatchObject({
      referenceVariant: { quality: "genuine" },
    });
    expect(variantPricesOf([blanket, promo], RATES).map((one) => one.quality)).toEqual(["genuine", "unique"]);
  });

  it("has nothing to say about a Cosmetic the source never listed", () => {
    expect(variantPricesOf(undefined, RATES)).toEqual([]);
  });

  it("orders itself, so two runs over one price list write the same bytes", () => {
    const shuffled = [
      variant({ quality: "unique", craftable: false }),
      variant({ quality: "genuine" }),
      variant({ quality: "unique" }),
      variant({ quality: "genuine", craftable: false }),
    ];
    expect(variantPricesOf(shuffled, RATES).map((one) => `${one.quality}-${one.craftable}`)).toEqual([
      "genuine-true",
      "genuine-false",
      "unique-true",
      "unique-false",
    ]);
  });
});
