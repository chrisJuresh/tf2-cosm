import { describe, expect, it } from "vitest";

import { readKeyPrice, STEAM_MARKET_KEY_PRICE_USD } from "@/config";

describe("the Steam Community Market Key price", () => {
  it("has a default, so the site builds with nothing configured", () => {
    expect(readKeyPrice(undefined)).toBe(2.49);
    expect(readKeyPrice("  ")).toBe(2.49);
    expect(STEAM_MARKET_KEY_PRICE_USD).toBeGreaterThan(0);
  });

  it("is taken from the environment when it is set there", () => {
    expect(readKeyPrice("3.10")).toBe(3.1);
  });

  it("refuses a setting that is not a price, rather than quietly pricing nothing", () => {
    expect(() => readKeyPrice("free")).toThrow(/STEAM_MARKET_KEY_PRICE_USD/);
    expect(() => readKeyPrice("0")).toThrow(/STEAM_MARKET_KEY_PRICE_USD/);
    expect(() => readKeyPrice("-1")).toThrow(/STEAM_MARKET_KEY_PRICE_USD/);
  });
});
