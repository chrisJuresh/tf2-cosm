import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fetchMarketKeyPrice, STEAM_MARKET_KEY_SOURCE } from "../src/sources/steam-market.ts";

/** The saved price overview for a Mann Co. Supply Crate Key, in USD. */
const SAVED = readFileSync(
  fileURLToPath(new URL("./fixtures/steam-market-key-priceoverview.json", import.meta.url)),
  "utf8",
);

function stubFetch(body: string, status = 200): { fetch: typeof fetch; seen: URL[] } {
  const seen: URL[] = [];
  const fetchImpl = ((url: URL) => {
    seen.push(url);
    return Promise.resolve(new Response(body, { status }));
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, seen };
}

describe("the Steam Community Market price overview", () => {
  it("reads the Key's lowest and median price in dollars", async () => {
    const { fetch, seen } = stubFetch(SAVED);
    const price = await fetchMarketKeyPrice("2026-09-20T12:00:00.000Z", fetch);

    expect(price).toEqual({
      source: STEAM_MARKET_KEY_SOURCE,
      takenAt: "2026-09-20T12:00:00.000Z",
      lowestUsd: 2.29,
      medianUsd: 2.33,
    });
    expect(seen[0]?.searchParams.get("appid")).toBe("440");
    expect(seen[0]?.searchParams.get("currency")).toBe("1");
    expect(seen[0]?.searchParams.get("market_hash_name")).toBe("Mann Co. Supply Crate Key");
  });

  it("reads a price written with a thousands separator", async () => {
    const { fetch } = stubFetch(JSON.stringify({ success: true, lowest_price: "$1,234.56" }));
    const price = await fetchMarketKeyPrice("2026-09-20T12:00:00.000Z", fetch);
    expect(price.lowestUsd).toBe(1234.56);
  });

  it("leaves a figure the overview omitted null rather than guessing", async () => {
    const { fetch } = stubFetch(JSON.stringify({ success: true, median_price: "$2.33" }));
    const price = await fetchMarketKeyPrice("2026-09-20T12:00:00.000Z", fetch);
    expect(price).toMatchObject({ lowestUsd: null, medianUsd: 2.33 });
  });

  it("fails when the overview does not answer, so the run can report the basis missing", async () => {
    const { fetch } = stubFetch("rate limited", 429);
    await expect(fetchMarketKeyPrice("2026-09-20T12:00:00.000Z", fetch)).rejects.toThrow(/429/);
  });

  it("fails when the overview reports no success", async () => {
    const { fetch } = stubFetch(JSON.stringify({ success: false }));
    await expect(fetchMarketKeyPrice("2026-09-20T12:00:00.000Z", fetch)).rejects.toThrow(/no success/);
  });
});
