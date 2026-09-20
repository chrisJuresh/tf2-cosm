/**
 * The price module is the only place the site turns a Metal figure into words or
 * into money, so this is where Trader Notation, the Metal Value, the Dollar
 * Bases on offer and the dollar conversion are pinned down.
 */
import type { DollarBases, Metal } from "@tf2-cosm/data/catalogue";
import { describe, expect, it } from "vitest";

import {
  chooseBasis,
  dollarBases,
  dollarsFor,
  formatDollars,
  formatMetalValue,
  formatTraderNotation,
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

/** A header's Dollar Bases at a Key Rate of 64.11 ref, with the Market's two figures dialled in. */
function bases(lowest: number | null, median: number | null): DollarBases {
  const rate = (usdPerKey: number) => ({ usdPerKey, usdPerRefined: usdPerKey / (577 / 9) });
  return {
    steamCommunityMarket: {
      source: "Steam Community Market price overview",
      takenAt: "2026-09-20T12:00:00.000Z",
      lowest: lowest === null ? null : rate(lowest),
      median: median === null ? null : rate(median),
    },
    priceSource: {
      source: "backpack.tf refined-to-dollar estimate (IGetCurrencies v1)",
      lastUpdatedAt: "2026-09-08T20:40:00.000Z",
      rate: rate(2.36),
    },
    mannCoStore: { source: "Mann Co. Store constant", rate: rate(2.49) },
  };
}

describe("the Dollar Bases a snapshot offers", () => {
  it("offers all three, the Steam Community Market first because it is the default", () => {
    expect(dollarBases(bases(2.29, 2.33)).map((basis) => basis.id)).toEqual([
      "steam-community-market",
      "price-source",
      "mann-co-store",
    ]);
  });

  it("names each one the way a viewer would recognise it", () => {
    expect(dollarBases(bases(2.29, 2.33)).map((basis) => basis.label)).toEqual([
      "Steam Community Market",
      "backpack.tf estimate",
      "Mann Co. Store",
    ]);
  });

  it("takes the price source's name from the header rather than knowing the vendor itself", () => {
    // ADR-0002 keeps the price source swappable behind one seam; a site that
    // spelled the vendor out would have to be edited the day it is swapped.
    const header = bases(2.29, 2.33);
    const swapped = dollarBases({
      ...header,
      priceSource: { ...header.priceSource!, source: "pricedb.io refined-to-dollar estimate" },
    });
    expect(swapped[1]?.label).toBe("pricedb.io estimate");
  });

  it("carries each basis's rate, already anchored to the snapshot's Key Rate", () => {
    const [market, source, store] = dollarBases(bases(2.29, 2.33));
    expect(market?.usdPerKey).toBe(2.29);
    expect(market?.usdPerRefined).toBeCloseTo(2.29 / (577 / 9), 10);
    expect(source?.usdPerKey).toBe(2.36);
    expect(store?.usdPerKey).toBe(2.49);
  });

  it("carries what the header says each rate came from, so a viewer can check it", () => {
    expect(dollarBases(bases(2.29, 2.33)).map((basis) => basis.source)).toEqual([
      "Steam Community Market price overview",
      "backpack.tf refined-to-dollar estimate (IGetCurrencies v1)",
      "Mann Co. Store constant",
    ]);
  });

  it("prefers the Market's lowest listing, which is what a viewer would actually pay", () => {
    expect(dollarBases(bases(2.29, 2.33))[0]?.usdPerKey).toBe(2.29);
  });

  it("falls back to the Market's median when it published no lowest", () => {
    expect(dollarBases(bases(null, 2.33))[0]?.usdPerKey).toBe(2.33);
  });

  it("leaves out a basis whose rate never arrived rather than guessing one", () => {
    // A dollar figure nobody can stand behind is worse than no dollar figure.
    expect(dollarBases(bases(null, null)).map((basis) => basis.id)).toEqual(["price-source", "mann-co-store"]);
    expect(dollarBases({ ...bases(2.29, null), steamCommunityMarket: null }).map((basis) => basis.id)).toEqual([
      "price-source",
      "mann-co-store",
    ]);
    expect(dollarBases({ ...bases(2.29, null), priceSource: null }).map((basis) => basis.id)).toEqual([
      "steam-community-market",
      "mann-co-store",
    ]);
  });

  it("offers nothing at all when the snapshot took no prices", () => {
    expect(dollarBases(null)).toEqual([]);
  });
});

describe("choosing a Dollar Basis", () => {
  const offered = dollarBases(bases(2.29, 2.33));

  it("picks the one asked for", () => {
    expect(chooseBasis(offered, "mann-co-store")?.id).toBe("mann-co-store");
  });

  it("falls back to the first on offer when the one asked for is not there", () => {
    // A basis remembered in a browser outlives the snapshot that offered it.
    expect(chooseBasis(offered, "nonsense")?.id).toBe("steam-community-market");
    expect(chooseBasis(offered, null)?.id).toBe("steam-community-market");
  });

  it("is nothing at all when the snapshot offers no basis", () => {
    expect(chooseBasis([], "mann-co-store")).toBeNull();
  });
});

describe("the dollar figure", () => {
  const basis = dollarBases(bases(2.49, 2.49))[0] ?? null;

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
