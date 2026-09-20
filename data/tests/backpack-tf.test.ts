import { describe, expect, it } from "vitest";

import {
  indexEntries,
  priceKey,
  type PriceList,
  type PriceListEntry,
  type PricedVariant,
  type Rates,
  resolveScrapPerUnit,
  variantsFor,
} from "../src/prices/price-source.ts";
import { backpackTfPriceSource, fetchPriceList, fetchRates } from "../src/sources/backpack-tf.ts";
import { fixtureBackpackTfFetch, FIXTURE_TAKEN_AT, fixturePriceList } from "./fixtures.ts";

const respondWith = (body: unknown, status = 200): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      statusText: status === 200 ? "OK" : "Internal Server Error",
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

const RATES: Rates = {
  keyRate: { scrapPerKey: 708, lastUpdatedAt: FIXTURE_TAKEN_AT },
  scrapPerUnit: new Map([
    ["metal", 9],
    ["keys", 708],
  ]),
};

describe("the currency table", () => {
  it("reads the Key's price in Metal and holds it in scrap", async () => {
    const rates = await fetchRates("fixture-key", fixtureBackpackTfFetch());
    expect(rates.keyRate).toEqual({ scrapPerKey: 708, lastUpdatedAt: "2026-09-08T20:40:00.000Z" });
  });

  it("rates every currency the source quotes, not only the Key", async () => {
    const rates = await fetchRates("fixture-key", fixtureBackpackTfFetch());
    // Metal is nine scrap by definition; a Craft Hat is 1.33 ref; a Key is 78.66 ref.
    expect(rates.scrapPerUnit.get("metal")).toBe(9);
    expect(rates.scrapPerUnit.get("hat")).toBe(12);
    expect(rates.scrapPerUnit.get("keys")).toBe(708);
    // Earbuds are quoted in Keys, so their rate only lands once the Key's has.
    expect(rates.scrapPerUnit.get("earbuds")).toBe(Math.round(9.1 * 708));
  });

  it("leaves a currency it cannot chain back to Metal unrated rather than guessing", () => {
    const quotes = new Map([
      ["keys", { currency: "metal", value: 78.66 }],
      ["doubloons", { currency: "pieces of eight", value: 3 }],
    ]);
    const scrapPerUnit = resolveScrapPerUnit(quotes);
    expect(scrapPerUnit.get("keys")).toBe(708);
    expect(scrapPerUnit.has("doubloons")).toBe(false);
  });

  it("fails loudly when the Key is not priced in Metal", async () => {
    const fetchImpl = respondWith({
      response: { success: 1, currencies: { keys: { price: { currency: "usd", value: 2.2 } } } },
    });
    await expect(fetchRates("fixture-key", fetchImpl)).rejects.toThrow(/did not price a Key in Metal/);
  });
});

describe("reading the price list", () => {
  it("indexes an entry under every defindex it claims, and under its name", async () => {
    const prices = await fixturePriceList();
    expect([...prices.byDefindex.keys()].sort((left, right) => left - right)).toEqual([101, 103, 104, 105, 5021]);
    expect([...prices.byName.keys()].sort()).toEqual([
      "bolt-boy",
      "ghastly gibus",
      "mann co. supply crate key",
      "team captain",
      "tin pot",
    ]);
    // Two defindexes of one Cosmetic point at the same entry (ADR-0003).
    expect(prices.byDefindex.get(103)).toBe(prices.byDefindex.get(104));
    expect(prices.byName.get(priceKey("The Team Captain"))).toBe(prices.byName.get("team captain"));
  });

  it("keeps only tradable variants: an untradable copy has no trade price", async () => {
    const prices = await fixturePriceList();
    const teamCaptain = prices.byName.get("team captain") ?? [];
    expect(teamCaptain.map((one) => ({ quality: one.quality, craftable: one.craftable }))).toEqual([
      { quality: "unique", craftable: true },
      { quality: "unique", craftable: false },
    ]);
  });

  it("reads the unrounded figures raw=2 adds, and repeats the low when there is no high", async () => {
    const prices = await fixturePriceList();
    expect(prices.byDefindex.get(101)?.[0]).toMatchObject({
      currency: "metal",
      low: 1.33,
      high: 1.55,
      lowRefined: 1.3333333,
      highRefined: 1.5555555,
    });
    expect(prices.byDefindex.get(103)?.[0]).toMatchObject({ low: 0.11, high: 0.11 });
  });

  it("reads a Quality bucket keyed by priceindex as well as one holding a single price", async () => {
    const prices = await fixturePriceList();
    const unusual = prices.byDefindex.get(105)?.find((one) => one.quality === "unusual");
    expect(unusual).toMatchObject({ currency: "keys", low: 40, high: 45 });
  });

  it("fails on an unsuccessful response, quoting the source's own message", async () => {
    const fetchImpl = respondWith({ response: { success: 0, message: "Invalid API key" } });
    await expect(fetchPriceList("bad-key", RATES, FIXTURE_TAKEN_AT, fetchImpl)).rejects.toThrow(
      /IGetPrices failed: Invalid API key/,
    );
  });

  it("fails on an empty price list rather than repricing every Cosmetic to nothing", async () => {
    const fetchImpl = respondWith({ response: { success: 1, items: {} } });
    await expect(fetchPriceList("fixture-key", RATES, FIXTURE_TAKEN_AT, fetchImpl)).rejects.toThrow(
      /empty price list/,
    );
  });

  it("never puts the URL, and so the key, into an error message", async () => {
    const fetchImpl = respondWith({}, 500);
    await expect(fetchPriceList("s3cret", RATES, FIXTURE_TAKEN_AT, fetchImpl)).rejects.toThrow(
      /^backpack\.tf https:\/\/backpack\.tf\/api\/IGetPrices\/v4\/ failed: 500/,
    );
    await expect(fetchPriceList("s3cret", RATES, FIXTURE_TAKEN_AT, fetchImpl)).rejects.not.toThrow(/s3cret/);
  });
});

describe("the price source seam", () => {
  it("loads a whole snapshot behind the one interface the catalogue sees", async () => {
    const source = backpackTfPriceSource("fixture-key", fixtureBackpackTfFetch());
    const prices = await source.load();
    expect(source.description).toBe(prices.source);
    expect(prices.rates.keyRate.scrapPerKey).toBe(708);
    expect(prices.byName.size).toBe(5);
  });
});

describe("joining a price list to a Cosmetic", () => {
  const entry = (name: string, defindexes: number[], quality: PricedVariant["quality"]): PriceListEntry => ({
    name,
    defindexes,
    variants: [
      {
        quality,
        craftable: true,
        currency: "metal",
        low: 1,
        high: 1,
        lastUpdatedAt: FIXTURE_TAKEN_AT,
      },
    ],
  });

  const listOf = (...entries: PriceListEntry[]): PriceList => ({
    source: "fixture",
    takenAt: FIXTURE_TAKEN_AT,
    rates: RATES,
    ...indexEntries(entries),
  });

  it("takes the defindex match over the name, because the source asserts the defindex", () => {
    const prices = listOf(entry("Something Else", [42], "genuine"), entry("Team Captain", [99], "unique"));
    expect(variantsFor(prices, [42], "Team Captain")?.[0]?.quality).toBe("genuine");
  });

  it("falls back to the name when no defindex of the Cosmetic is claimed", () => {
    const prices = listOf(entry("Team Captain", [], "unique"));
    expect(variantsFor(prices, [42, 43], "The Team Captain")?.[0]?.quality).toBe("unique");
  });

  it("matches on an alias defindex, not only the primary", () => {
    const prices = listOf(entry("Ghastly Gibus", [104], "unique"));
    expect(variantsFor(prices, [103, 104], "Ghastly Gibus")).toBeDefined();
  });

  it("drops a defindex two entries both claim rather than pricing one item as the other", () => {
    const prices = listOf(entry("First", [42], "unique"), entry("Second", [42], "genuine"));
    expect(prices.byDefindex.has(42)).toBe(false);
    // The name is a separate assertion by a separate route, so it still joins.
    expect(variantsFor(prices, [42], "First")?.[0]?.quality).toBe("unique");
    expect(variantsFor(prices, [42], "Neither Of Them")).toBeUndefined();
  });

  it("drops a name two entries reduce to, for the same reason", () => {
    const prices = listOf(entry("The Gibus", [], "unique"), entry("Gibus", [], "genuine"));
    expect(variantsFor(prices, [], "Gibus")).toBeUndefined();
  });
});
