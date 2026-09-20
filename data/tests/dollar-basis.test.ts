import { describe, expect, it } from "vitest";

import {
  dollarBasesOf,
  dollarRateFromKey,
  dollarRateFromRefined,
  MANN_CO_STORE_SOURCE,
  MANN_CO_STORE_USD_PER_KEY,
} from "../src/prices/dollar-basis.ts";
import type { KeyRate } from "../src/prices/price-source.ts";

/** 78.66 ref a Key, the rate the recorded backpack.tf currency payload carries. */
const KEY_RATE: KeyRate = { scrapPerKey: 708, lastUpdatedAt: "2026-09-19T00:00:00.000Z" };

describe("a Dollar Basis rate", () => {
  it("derives dollars per Refined from a key price at the snapshot's Key Rate", () => {
    // 708 scrap is 78.6666 Refined a Key, so $2.29 a Key is 2.29 * 9 / 708 a Refined.
    expect(dollarRateFromKey(2.29, KEY_RATE)).toEqual({ usdPerKey: 2.29, usdPerRefined: 0.029110 });
  });

  it("derives a key price from dollars per Refined at the same rate", () => {
    // $0.03 a Refined at 78.6666 Refined a Key is $2.36 a Key.
    expect(dollarRateFromRefined(0.03, KEY_RATE)).toEqual({ usdPerKey: 2.36, usdPerRefined: 0.03 });
  });

  it("refuses a rate that cannot be a price in dollars", () => {
    expect(() => dollarRateFromKey(0, KEY_RATE)).toThrow(/dollars a Key/);
    expect(() => dollarRateFromRefined(-1, KEY_RATE)).toThrow(/dollars a Refined/);
  });
});

describe("the header's Dollar Bases", () => {
  it("carries all three, each converted at the snapshot's own Key Rate", () => {
    const bases = dollarBasesOf({
      keyRate: KEY_RATE,
      marketKeyPrice: {
        source: "Steam Community Market price overview (Mann Co. Supply Crate Key)",
        takenAt: "2026-09-20T12:00:00.000Z",
        lowestUsd: 2.29,
        medianUsd: 2.33,
      },
      sourceUsdPerRefined: {
        source: "backpack.tf (IGetCurrencies v1)",
        usdPerRefined: 0.03,
        lastUpdatedAt: "2026-09-19T00:00:00.000Z",
      },
    });

    expect(bases.steamCommunityMarket).toEqual({
      source: "Steam Community Market price overview (Mann Co. Supply Crate Key)",
      takenAt: "2026-09-20T12:00:00.000Z",
      lowest: { usdPerKey: 2.29, usdPerRefined: 0.02911 },
      median: { usdPerKey: 2.33, usdPerRefined: 0.029619 },
    });
    expect(bases.backpackTf).toEqual({
      source: "backpack.tf (IGetCurrencies v1)",
      lastUpdatedAt: "2026-09-19T00:00:00.000Z",
      rate: { usdPerKey: 2.36, usdPerRefined: 0.03 },
    });
    expect(bases.mannCoStore).toEqual({
      source: MANN_CO_STORE_SOURCE,
      rate: dollarRateFromKey(MANN_CO_STORE_USD_PER_KEY, KEY_RATE),
    });
  });

  it("leaves a basis null when its rate did not arrive, and keeps the constant one", () => {
    const bases = dollarBasesOf({ keyRate: KEY_RATE });

    expect(bases.steamCommunityMarket).toBeNull();
    expect(bases.backpackTf).toBeNull();
    expect(bases.mannCoStore.rate.usdPerKey).toBe(MANN_CO_STORE_USD_PER_KEY);
  });

  it("keeps the Steam Market basis with only the figure the overview gave", () => {
    const bases = dollarBasesOf({
      keyRate: KEY_RATE,
      marketKeyPrice: { source: "market", takenAt: "2026-09-20T12:00:00.000Z", lowestUsd: 2.29, medianUsd: null },
    });

    expect(bases.steamCommunityMarket?.lowest).toEqual({ usdPerKey: 2.29, usdPerRefined: 0.02911 });
    expect(bases.steamCommunityMarket?.median).toBeNull();
  });
});
