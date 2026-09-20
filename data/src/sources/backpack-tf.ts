/**
 * The backpack.tf price source: one `PriceSource` over two endpoints.
 *
 * `IGetPrices/v4` is the whole community price list, keyed by item name and then
 * by Quality id, tradability and craftability. `raw=2` adds `value_raw` and
 * `value_high_raw`, the unrounded figures in Refined — with `raw=1` the low raw
 * value is an average of the two, which is not what we want.
 *
 * `IGetCurrencies/v1` carries the Key Rate.
 *
 * Nothing above this file knows backpack.tf exists (ADR-0002): swapping in
 * pricedb.io means writing another module with the same `load()`.
 */
import type { SourceDollarEstimate } from "../prices/dollar-basis.ts";
import {
  type CurrencyQuote,
  indexEntries,
  type PriceList,
  type PriceListEntry,
  type PricedVariant,
  type PriceSource,
  qualityFromId,
  type Rates,
  resolveScrapPerUnit,
} from "../prices/price-source.ts";
import { keyRateFromRefined } from "../prices/price-spread.ts";

const PRICES_ENDPOINT = "https://backpack.tf/api/IGetPrices/v4/";
const CURRENCIES_ENDPOINT = "https://backpack.tf/api/IGetCurrencies/v1/";
const TF2_APPID = "440";

export const BACKPACK_TF_SOURCE = "backpack.tf (IGetPrices v4, IGetCurrencies v1)";

/** The Dollar Basis backpack.tf publishes: its own estimate of a Refined in dollars. */
export const BACKPACK_TF_DOLLAR_SOURCE = "backpack.tf refined-to-dollar estimate (IGetCurrencies v1)";

/** One priced entry as backpack.tf writes it. */
interface RawPrice {
  readonly currency?: string;
  readonly value?: number;
  readonly value_high?: number;
  readonly value_raw?: number;
  readonly value_high_raw?: number;
  readonly last_update?: number;
}

/** `Craftable` is an array for an item with one price, an object when keyed by priceindex. */
type RawCraftability = Readonly<Record<string, RawPrice | undefined>> | readonly RawPrice[];

interface RawItem {
  readonly defindex?: readonly number[];
  readonly prices?: Readonly<Record<string, Readonly<Record<string, RawCraftability | undefined>> | undefined>>;
}

interface PricesResponse {
  readonly response?: {
    readonly success?: number;
    readonly message?: string;
    readonly current_time?: number;
    readonly items?: Readonly<Record<string, RawItem | undefined>>;
  };
}

interface CurrenciesResponse {
  readonly response?: {
    readonly success?: number;
    readonly message?: string;
    /** "metal", "keys", "hat", "earbuds" — each priced in one of the others. */
    readonly currencies?: Readonly<
      Record<string, { readonly price?: RawPrice; readonly blanket?: number } | undefined>
    >;
  };
}

/** Unix seconds as the catalogue records times. Missing means the snapshot's own time. */
function timestamp(seconds: number | undefined, fallback: string): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return fallback;
  return new Date(seconds * 1000).toISOString();
}

/**
 * The entry a Quality's craftability bucket holds. An item with one price puts it
 * at priceindex 0; the buckets keyed by priceindex belong to Unusual effects and
 * crate series, which are never a Reference Variant, so the first entry is right
 * for everything that reaches here.
 */
function firstPrice(bucket: RawCraftability | undefined): RawPrice | undefined {
  if (bucket === undefined) return undefined;
  if (Array.isArray(bucket)) return bucket[0];
  return Object.values(bucket as Readonly<Record<string, RawPrice | undefined>>).find((one) => one !== undefined);
}

function variantsOf(item: RawItem, takenAt: string): PricedVariant[] {
  const variants: PricedVariant[] = [];
  for (const [qualityId, byTradability] of Object.entries(item.prices ?? {})) {
    const quality = qualityFromId(Number.parseInt(qualityId, 10));
    // An untradable copy has no trade price, so only the Tradable bucket is read.
    const tradable = byTradability?.["Tradable"];
    if (quality === undefined || tradable === undefined) continue;
    for (const [craftability, bucket] of Object.entries(tradable) as [string, RawCraftability | undefined][]) {
      if (craftability !== "Craftable" && craftability !== "Non-Craftable") continue;
      const price = firstPrice(bucket);
      if (price?.currency === undefined || typeof price.value !== "number") continue;
      variants.push({
        quality,
        craftable: craftability === "Craftable",
        currency: price.currency,
        low: price.value,
        high: typeof price.value_high === "number" ? price.value_high : price.value,
        lowRefined: price.value_raw,
        highRefined: price.value_high_raw ?? price.value_raw,
        lastUpdatedAt: timestamp(price.last_update, takenAt),
      });
    }
  }
  return variants;
}

function checkSuccess(what: string, body: { success?: number; message?: string } | undefined): void {
  if (body?.success === 1) return;
  // The key is in the query string, so the URL never goes into the message.
  throw new Error(`backpack.tf ${what} failed${body?.message ? `: ${body.message}` : ""}`);
}

async function getJson<T>(endpoint: string, apiKey: string, params: Record<string, string>, fetchImpl: typeof fetch): Promise<T> {
  const url = new URL(endpoint);
  url.searchParams.set("key", apiKey);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`backpack.tf ${endpoint} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/**
 * The whole currency table, not just the Key Rate: backpack.tf prices a cheap
 * cosmetic in Random Craft Hats and an expensive one in Earbuds, and both need a
 * rate before they can become a Metal Value.
 */
export async function fetchRates(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Rates> {
  const body = await getJson<CurrenciesResponse>(CURRENCIES_ENDPOINT, apiKey, { appid: TF2_APPID }, fetchImpl);
  checkSuccess("IGetCurrencies", body.response);

  const quotes = new Map<string, CurrencyQuote>();
  // `blanket` is backpack.tf saying so itself: the Random Craft Hat's figure is
  // one it applies to every craft hat, not one it observed for any of them.
  const blanketCurrencies = new Set<string>();
  for (const [name, currency] of Object.entries(body.response?.currencies ?? {})) {
    if (currency?.blanket === 1) blanketCurrencies.add(name);
    const price = currency?.price;
    if (typeof price?.currency !== "string" || typeof price.value !== "number") continue;
    quotes.set(name, { currency: price.currency, value: price.value });
  }

  const keysQuote = quotes.get("keys");
  const keysPrice = body.response?.currencies?.["keys"]?.price;
  if (keysQuote?.currency !== "metal") {
    throw new Error("backpack.tf IGetCurrencies did not price a Key in Metal");
  }
  return {
    keyRate: keyRateFromRefined(keysQuote.value, timestamp(keysPrice?.last_update, new Date().toISOString())),
    scrapPerUnit: resolveScrapPerUnit(quotes),
    blanketCurrencies,
    dollarEstimate: dollarEstimateOf(body.response?.currencies?.["metal"]?.price),
  };
}

/**
 * backpack.tf's refined-to-dollar estimate, the one currency it quotes in dollars
 * rather than in Metal.
 *
 * Its quoted `value` is the estimate, and is recorded as it stands. The Price
 * Spread's midpoint rule is not applied here: that rule lets a Reference Price
 * stand for a range of asking prices, whereas a Dollar Basis is one rate the
 * site multiplies by, and folding in the range's top would publish a figure the
 * source never gave.
 */
function dollarEstimateOf(price: RawPrice | undefined): SourceDollarEstimate | undefined {
  if (price?.currency !== "usd" || typeof price.value !== "number" || price.value <= 0) return undefined;
  return {
    source: BACKPACK_TF_DOLLAR_SOURCE,
    usdPerRefined: price.value,
    lastUpdatedAt: timestamp(price.last_update, new Date().toISOString()),
  };
}

export async function fetchPriceList(
  apiKey: string,
  rates: Rates,
  takenAt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PriceList> {
  const body = await getJson<PricesResponse>(
    PRICES_ENDPOINT,
    apiKey,
    { appid: TF2_APPID, raw: "2" },
    fetchImpl,
  );
  checkSuccess("IGetPrices", body.response);
  const entries: PriceListEntry[] = [];
  for (const [name, item] of Object.entries(body.response?.items ?? {})) {
    if (item === undefined) continue;
    const variants = variantsOf(item, takenAt);
    if (variants.length === 0) continue;
    const defindexes = (item.defindex ?? []).filter((one) => Number.isInteger(one) && one > 0);
    entries.push({ name, defindexes, variants });
  }
  if (entries.length === 0) throw new Error("backpack.tf IGetPrices returned an empty price list");
  return { source: BACKPACK_TF_SOURCE, takenAt, rates, ...indexEntries(entries) };
}

/** The price source ADR-0002 names, behind the one interface the catalogue sees. */
export function backpackTfPriceSource(apiKey: string, fetchImpl: typeof fetch = fetch): PriceSource {
  return {
    description: BACKPACK_TF_SOURCE,
    async load() {
      const takenAt = new Date().toISOString();
      const rates = await fetchRates(apiKey, fetchImpl);
      return fetchPriceList(apiKey, rates, takenAt, fetchImpl);
    },
  };
}
