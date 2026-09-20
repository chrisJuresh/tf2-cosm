import { describe, expect, it } from "vitest";

import {
  formatRefined,
  keysToScrap,
  refinedToScrap,
  SCRAP_PER_REFINED,
  scrapToRefined,
  traderNotation,
} from "../src/prices/metal.ts";

/** A plausible Key Rate: 78.66 ref a Key, which is 708 scrap. */
const KEY_RATE = refinedToScrap(78.66);

describe("Metal in ninths", () => {
  it("counts nine scrap to the Refined", () => {
    expect(SCRAP_PER_REFINED).toBe(9);
    expect(refinedToScrap(1)).toBe(9);
    expect(refinedToScrap(0)).toBe(0);
  });

  it("lands every trader decimal on its ninth", () => {
    const ninths = ["0.11", "0.22", "0.33", "0.44", "0.55", "0.66", "0.77", "0.88"];
    ninths.forEach((written, index) => {
      expect(refinedToScrap(Number(written)), written).toBe(index + 1);
    });
  });

  it("writes each ninth back the way traders write it", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(formatRefined)).toEqual([
      "0.11",
      "0.22",
      "0.33",
      "0.44",
      "0.55",
      "0.66",
      "0.77",
      "0.88",
    ]);
  });

  it("writes a whole Refined without a fraction", () => {
    expect(formatRefined(9)).toBe("1");
    expect(formatRefined(0)).toBe("0");
    expect(formatRefined(220)).toBe("24.44");
  });

  it("rounds an unrounded price to the nearest scrap", () => {
    expect(refinedToScrap(1.3333333)).toBe(12);
    expect(refinedToScrap(1.4444444)).toBe(13);
    expect(refinedToScrap(78.66)).toBe(708);
  });

  it("refuses a Metal Value that is not a whole number of scrap", () => {
    expect(() => formatRefined(1.5)).toThrow(/whole scrap/);
    expect(() => formatRefined(-1)).toThrow(/whole scrap/);
  });

  it("reports the Metal Value in Refined", () => {
    expect(scrapToRefined(12)).toBeCloseTo(1.3333, 4);
    expect(scrapToRefined(708)).toBeCloseTo(78.6667, 4);
  });
});

describe("converting Keys at a Key Rate", () => {
  it("converts whole Keys", () => {
    expect(keysToScrap(1, KEY_RATE)).toBe(708);
    expect(keysToScrap(3, KEY_RATE)).toBe(2124);
  });

  it("converts a fractional Key to the nearest scrap", () => {
    expect(keysToScrap(1.5, KEY_RATE)).toBe(1062);
    expect(keysToScrap(0.11, KEY_RATE)).toBe(78);
  });

  it("refuses a Key Rate of zero, which would make every price meaningless", () => {
    expect(() => keysToScrap(1, 0)).toThrow(/Key Rate/);
  });
});

describe("Trader Notation", () => {
  it("writes whole Keys with no Metal", () => {
    expect(traderNotation(708, KEY_RATE)).toBe("1 key");
    expect(traderNotation(2124, KEY_RATE)).toBe("3 keys");
  });

  it("writes Keys plus the leftover Refined", () => {
    expect(traderNotation(2124 + 12, KEY_RATE)).toBe("3 keys, 1.33 ref");
    expect(traderNotation(708 + 1, KEY_RATE)).toBe("1 key, 0.11 ref");
  });

  it("writes Metal alone below a Key", () => {
    expect(traderNotation(12, KEY_RATE)).toBe("1.33 ref");
    expect(traderNotation(707, KEY_RATE)).toBe("78.55 ref");
  });

  it("writes a free Cosmetic as no Metal at all", () => {
    expect(traderNotation(0, KEY_RATE)).toBe("0 ref");
  });
});
