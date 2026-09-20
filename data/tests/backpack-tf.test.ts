import { describe, expect, it } from "vitest";

import { priceKey } from "../src/prices/price-source.ts";
import { backpackTfPriceSource, fetchKeyRate, fetchPriceList } from "../src/sources/backpack-tf.ts";
import { fixtureBackpackTfFetch, FIXTURE_TAKEN_AT, fixturePriceList } from "./fixtures.ts";

const respondWith = (body: unknown, status = 200): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      statusText: status === 200 ? "OK" : "Internal Server Error",
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

const KEY_RATE = { scrapPerKey: 708, lastUpdatedAt: FIXTURE_TAKEN_AT };

describe("the Key Rate", () => {
  it("reads the Key's price in Metal and holds it in scrap", async () => {
    expect(await fetchKeyRate("fixture-key", fixtureBackpackTfFetch())).toEqual({
      scrapPerKey: 708,
      lastUpdatedAt: "2026-09-08T20:40:00.000Z",
    });
  });

  it("fails loudly when the Key is not priced in Metal", async () => {
    const fetchImpl = respondWith({
      response: { success: 1, currencies: { keys: { price: { currency: "usd", value: 2.2 } } } },
    });
    await expect(fetchKeyRate("fixture-key", fetchImpl)).rejects.toThrow(/did not price a Key in Metal/);
  });
});

describe("reading the price list", () => {
  it("keys items the way the catalogue names them, leading The and all", async () => {
    const prices = await fixturePriceList();
    expect([...prices.items.keys()].sort()).toEqual([
      "bolt boy",
      "ghastly gibus",
      "mann co. supply crate key",
      "team captain",
      "tin pot",
    ]);
    expect(prices.items.get(priceKey("The Team Captain"))).toBe(prices.items.get("team captain"));
  });

  it("keeps only tradable variants: an untradable copy has no trade price", async () => {
    const prices = await fixturePriceList();
    const teamCaptain = prices.items.get("team captain") ?? [];
    expect(teamCaptain.map((one) => ({ quality: one.quality, craftable: one.craftable }))).toEqual([
      { quality: "unique", craftable: true },
      { quality: "unique", craftable: false },
    ]);
  });

  it("reads the unrounded figures raw=2 adds, and repeats the low when there is no high", async () => {
    const prices = await fixturePriceList();
    expect(prices.items.get("bolt boy")?.[0]).toMatchObject({
      currency: "metal",
      low: 1.33,
      high: 1.55,
      lowRefined: 1.3333333,
      highRefined: 1.5555555,
    });
    expect(prices.items.get("ghastly gibus")?.[0]).toMatchObject({ low: 0.11, high: 0.11 });
  });

  it("reads a Quality bucket keyed by priceindex as well as one holding a single price", async () => {
    const prices = await fixturePriceList();
    const unusual = prices.items.get("tin pot")?.find((one) => one.quality === "unusual");
    expect(unusual).toMatchObject({ currency: "keys", low: 40, high: 45 });
  });

  it("fails on an unsuccessful response, quoting the source's own message", async () => {
    const fetchImpl = respondWith({ response: { success: 0, message: "Invalid API key" } });
    await expect(fetchPriceList("bad-key", KEY_RATE, FIXTURE_TAKEN_AT, fetchImpl)).rejects.toThrow(
      /IGetPrices failed: Invalid API key/,
    );
  });

  it("fails on an empty price list rather than repricing every Cosmetic to nothing", async () => {
    const fetchImpl = respondWith({ response: { success: 1, items: {} } });
    await expect(fetchPriceList("fixture-key", KEY_RATE, FIXTURE_TAKEN_AT, fetchImpl)).rejects.toThrow(
      /empty price list/,
    );
  });

  it("never puts the URL, and so the key, into an error message", async () => {
    const fetchImpl = respondWith({}, 500);
    await expect(fetchPriceList("s3cret", KEY_RATE, FIXTURE_TAKEN_AT, fetchImpl)).rejects.toThrow(
      /^backpack\.tf https:\/\/backpack\.tf\/api\/IGetPrices\/v4\/ failed: 500/,
    );
    await expect(fetchPriceList("s3cret", KEY_RATE, FIXTURE_TAKEN_AT, fetchImpl)).rejects.not.toThrow(/s3cret/);
  });
});

describe("the price source seam", () => {
  it("loads a whole snapshot behind the one interface the catalogue sees", async () => {
    const source = backpackTfPriceSource("fixture-key", fixtureBackpackTfFetch());
    const prices = await source.load();
    expect(source.description).toBe(prices.source);
    expect(prices.keyRate.scrapPerKey).toBe(708);
    expect(prices.items.size).toBe(5);
  });
});
