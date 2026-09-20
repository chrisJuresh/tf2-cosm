import { describe, expect, it } from "vitest";

import { buildCatalogue } from "../src/catalogue/build.ts";
import { assertValidCatalogue } from "../src/catalogue/schema.ts";
import { MANN_CO_STORE_USD_PER_KEY } from "../src/prices/dollar-basis.ts";
import { BACKPACK_TF_DOLLAR_SOURCE } from "../src/sources/backpack-tf.ts";
import { STEAM_MARKET_KEY_SOURCE } from "../src/sources/steam-market.ts";
import { FIXTURE_TAKEN_AT, fixtureMarketKeyPrice, fixturePricedInputs } from "./fixtures.ts";

describe("the snapshot header", () => {
  it("records when the snapshot was taken, the Key Rate and which sources it read", async () => {
    const { catalogue } = buildCatalogue(await fixturePricedInputs());

    expect(catalogue.header.snapshotTakenAt).toBe(FIXTURE_TAKEN_AT);
    expect(catalogue.header.sources.itemDefinitions).toBe("tests/fixtures/items_game_excerpt.txt");
    // 78.66 ref a Key, from the recorded currency payload.
    expect(catalogue.header.prices?.keyRate).toMatchObject({ scrap: 708, refined: 78.6667, notation: "78.66 ref" });
  });

  it("carries a dollar rate for each of the three Dollar Bases", async () => {
    const { catalogue } = buildCatalogue(
      await fixturePricedInputs({ marketKeyPrice: await fixtureMarketKeyPrice() }),
    );
    const bases = catalogue.header.dollarBases;

    // A Key is 78.6666 Refined here, so each key price divides by that for a Refined.
    expect(bases?.steamCommunityMarket).toEqual({
      source: STEAM_MARKET_KEY_SOURCE,
      takenAt: FIXTURE_TAKEN_AT,
      lowest: { usdPerKey: 2.29, usdPerRefined: 0.02911 },
      median: { usdPerKey: 2.33, usdPerRefined: 0.029619 },
    });
    // backpack.tf quotes a Refined at $0.03 to $0.05; the basis is the midpoint.
    expect(bases?.backpackTf).toEqual({
      source: BACKPACK_TF_DOLLAR_SOURCE,
      lastUpdatedAt: "2026-09-08T20:40:00.000Z",
      rate: { usdPerKey: 3.1467, usdPerRefined: 0.04 },
    });
    expect(bases?.mannCoStore.rate).toEqual({ usdPerKey: MANN_CO_STORE_USD_PER_KEY, usdPerRefined: 0.031653 });
  });

  it("reports the Steam Market basis missing rather than guessing it", async () => {
    const { catalogue } = buildCatalogue(await fixturePricedInputs());

    expect(catalogue.header.dollarBases?.steamCommunityMarket).toBeNull();
    expect(catalogue.header.dollarBases?.backpackTf).not.toBeNull();
  });

  it("has no Dollar Bases at all when the run had no price source, so no Key Rate", async () => {
    const inputs = await fixturePricedInputs();
    const { catalogue } = buildCatalogue({ ...inputs, prices: undefined });

    expect(catalogue.header.prices).toBeNull();
    expect(catalogue.header.dollarBases).toBeNull();
  });

  it("validates against the schema with the Dollar Bases in it", async () => {
    const { catalogue } = buildCatalogue(
      await fixturePricedInputs({ marketKeyPrice: await fixtureMarketKeyPrice() }),
    );
    expect(assertValidCatalogue(JSON.parse(JSON.stringify(catalogue)))).toEqual(catalogue);
  });
});

describe("determinism", () => {
  it("writes byte-identical files from identical inputs", async () => {
    const serialise = async () =>
      `${JSON.stringify(buildCatalogue(await fixturePricedInputs({ marketKeyPrice: await fixtureMarketKeyPrice() })).catalogue, null, 2)}\n`;

    expect(await serialise()).toBe(await serialise());
  });

  it("orders every keyed count so a reordered source payload changes nothing", async () => {
    const inputs = await fixturePricedInputs({ marketKeyPrice: await fixtureMarketKeyPrice() });
    const reversed = {
      ...inputs,
      webApiItems: [...inputs.webApiItems].reverse(),
      itemsGame: {
        ...inputs.itemsGame,
        items: Object.fromEntries(Object.entries(inputs.itemsGame.items).reverse()),
      },
    };

    expect(JSON.stringify(buildCatalogue(reversed).catalogue)).toBe(
      JSON.stringify(buildCatalogue(inputs).catalogue),
    );
  });
});
