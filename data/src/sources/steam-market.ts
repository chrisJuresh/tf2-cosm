/**
 * The Steam Community Market's price for a Mann Co. Supply Crate Key, which is
 * one of the catalogue's Dollar Bases.
 *
 * The Market is read for the Key and nothing else (ADR-0002): it does not list
 * classic Unique cosmetics at all, so it can price the currency but never the
 * items. The price overview endpoint needs no key, and answers with the two
 * figures the Market shows — the lowest asking price and the median of recent
 * sales — as display strings in the requested currency.
 */
import type { MarketKeyPrice } from "../prices/dollar-basis.ts";

const PRICE_OVERVIEW_ENDPOINT = "https://steamcommunity.com/market/priceoverview/";
const TF2_APPID = "440";

/** Steam's currency ids; 1 is USD, which is the only currency the catalogue quotes. */
const USD = "1";

const KEY_MARKET_HASH_NAME = "Mann Co. Supply Crate Key";

export const STEAM_MARKET_KEY_SOURCE = `Steam Community Market price overview (${KEY_MARKET_HASH_NAME}, USD)`;

interface PriceOverviewResponse {
  readonly success?: boolean;
  readonly lowest_price?: string;
  readonly median_price?: string;
}

/**
 * A displayed price to a number: "$1,234.56" is 1234.56. Only the USD form is
 * parsed, because USD is the only currency asked for — a comma-decimal locale
 * would need its own rule rather than a guess about which separator is which.
 */
function dollars(display: string | undefined): number | null {
  if (typeof display !== "string") return null;
  const digits = display.replace(/[^0-9.,]/g, "").replaceAll(",", "");
  if (digits === "") return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The Key's Market price. Throws when the Market does not answer — it rate-limits
 * an unauthenticated caller — so the run can report the basis as missing and
 * carry on with the other two rather than write a guessed rate.
 */
export async function fetchMarketKeyPrice(takenAt: string, fetchImpl: typeof fetch = fetch): Promise<MarketKeyPrice> {
  const url = new URL(PRICE_OVERVIEW_ENDPOINT);
  url.searchParams.set("appid", TF2_APPID);
  url.searchParams.set("currency", USD);
  url.searchParams.set("market_hash_name", KEY_MARKET_HASH_NAME);

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Steam Market price overview failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as PriceOverviewResponse;
  if (body.success !== true) throw new Error("Steam Market price overview reported no success");

  return {
    source: STEAM_MARKET_KEY_SOURCE,
    takenAt,
    lowestUsd: dollars(body.lowest_price),
    medianUsd: dollars(body.median_price),
  };
}
