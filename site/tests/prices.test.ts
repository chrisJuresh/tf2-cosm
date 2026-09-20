/**
 * The price module is the only place the site turns a Metal figure into words or
 * into money, so this is where Trader Notation, the Metal Value and the dollar
 * conversion are pinned down.
 */
import type { DollarBases, Metal } from "@tf2-cosm/data/catalogue";
import { describe, expect, it } from "vitest";

import {
  dollarsFor,
  formatDollars,
  formatMetalValue,
  formatTraderNotation,
  steamMarketBasis,
} from "@/prices/format";

/** A Metal figure the way the catalogue carries it: scrap is the truth. */
function metal(scrap: number, notation = ""): Metal {
  return { scrap, refined: Number((scrap / 9).toFixed(4)), notation };
}

/** 64.11 ref to the Key: the rate the first committed snapshot was taken at. */
const KEY_RATE = metal(577, "64.11 ref");

describe("Trader Notation", () => {
  it("writes a sub-Key price in Refined alone", () => {
    expect(formatTraderNotation(metal(220), KEY_RATE)).toBe("24.44 ref");
  });

  it("writes one ninth as traders do, truncated rather than rounded", () => {
    expect(formatTraderNotation(metal(1), KEY_RATE)).toBe("0.11 ref");
    expect(formatTraderNotation(metal(8), KEY_RATE)).toBe("0.88 ref");
  });

  it("writes a free item as zero Refined, not as nothing", () => {
    expect(formatTraderNotation(metal(0), KEY_RATE)).toBe("0 ref");
  });

  it("drops the Refined part when the price is exactly whole Keys", () => {
    expect(formatTraderNotation(metal(577), KEY_RATE)).toBe("1 key");
    expect(formatTraderNotation(metal(577 * 3), KEY_RATE)).toBe("3 keys");
  });

  it("splits a price above a Key into Keys and the Refined left over", () => {
    expect(formatTraderNotation(metal(577 * 2 + 12), KEY_RATE)).toBe("2 keys, 1.33 ref");
  });

  it("falls back to Refined alone when the snapshot carries no Key Rate", () => {
    expect(formatTraderNotation(metal(577 * 2 + 12), null)).toBe("129.55 ref");
  });

  it("agrees with the notation the data job recorded for the same figure", () => {
    // Both halves format from the same scrap count with the same Key Rate, so a
    // disagreement here means one of them has drifted.
    const recorded = metal(577 * 2 + 12, "2 keys, 1.33 ref");
    expect(formatTraderNotation(recorded, KEY_RATE)).toBe(recorded.notation);
  });
});

describe("the Metal Value", () => {
  it("is written wholly in Refined, whatever the price is worth in Keys", () => {
    expect(formatMetalValue(metal(577 * 2 + 12))).toBe("129.55 ref");
  });

  it("writes a whole Refined without a fraction", () => {
    expect(formatMetalValue(metal(9))).toBe("1 ref");
  });

  it("writes the cheapest possible price", () => {
    expect(formatMetalValue(metal(1))).toBe("0.11 ref");
  });
});

/** A header's Dollar Bases, with only the parts the Steam Market basis reads filled in. */
function bases(lowest: number | null, median: number | null): DollarBases {
  const rate = (usdPerKey: number) => ({ usdPerKey, usdPerRefined: usdPerKey / (577 / 9) });
  return {
    steamCommunityMarket: {
      source: "Steam Community Market price overview",
      takenAt: "2026-09-20T12:00:00.000Z",
      lowest: lowest === null ? null : rate(lowest),
      median: median === null ? null : rate(median),
    },
    priceSource: null,
    mannCoStore: { source: "Mann Co. Store constant", rate: rate(2.49) },
  };
}

describe("the Steam Community Market Dollar Basis", () => {
  it("takes its rate from the header, already anchored to the snapshot's Key Rate", () => {
    const basis = steamMarketBasis(bases(2.29, 2.33));
    expect(basis?.usdPerKey).toBe(2.29);
    expect(basis?.usdPerRefined).toBeCloseTo(2.29 / (577 / 9), 10);
    expect(basis?.label).toBe("Steam Community Market");
  });

  it("prefers the lowest listing, which is what a viewer would actually pay", () => {
    expect(steamMarketBasis(bases(2.29, 2.33))?.usdPerKey).toBe(2.29);
  });

  it("falls back to the median when the Market published no lowest", () => {
    expect(steamMarketBasis(bases(null, 2.33))?.usdPerKey).toBe(2.33);
  });

  it("is nothing at all when the snapshot has no rates, or the Market did not answer", () => {
    expect(steamMarketBasis(null)).toBeNull();
    expect(steamMarketBasis({ ...bases(2.29, 2.33), steamCommunityMarket: null })).toBeNull();
    expect(steamMarketBasis(bases(null, null))).toBeNull();
  });
});

describe("the dollar figure", () => {
  const basis = steamMarketBasis(bases(2.49, 2.49));

  it("is the Metal Value at the basis rate", () => {
    expect(dollarsFor(metal(577), basis)).toBeCloseTo(2.49, 10);
  });

  it("scales with the price", () => {
    expect(dollarsFor(metal(577 * 4), basis)).toBeCloseTo(2.49 * 4, 10);
  });

  it("is nothing at all when there is no basis to convert at", () => {
    expect(dollarsFor(metal(577), null)).toBeNull();
  });

  it("is zero dollars for a free item, not nothing", () => {
    expect(dollarsFor(metal(0), basis)).toBe(0);
  });
});

describe("writing dollars", () => {
  it("always shows cents", () => {
    expect(formatDollars(2.5)).toBe("$2.50");
    expect(formatDollars(0)).toBe("$0.00");
  });

  it("rounds to the cent", () => {
    expect(formatDollars(1.005)).toBe("$1.01");
    expect(formatDollars(0.004)).toBe("$0.00");
  });

  it("groups thousands, because some hats cost that much", () => {
    expect(formatDollars(12345.6)).toBe("$12,345.60");
  });
});
