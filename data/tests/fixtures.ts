import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { CatalogueInputs } from "../src/catalogue/build.ts";
import type { PriceList } from "../src/prices/price-source.ts";
import { fetchKeyRate, fetchPriceList } from "../src/sources/backpack-tf.ts";
import type { WebApiSchemaItem } from "../src/sources/steam-web-api.ts";
import { parseEnglishTokens, parseItemsGame } from "../src/sources/vdf.ts";

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The shared Cosmetic oracle: one items_game excerpt that this job and the render
 * job's resolve step both resolve, with the verdicts written down in
 * `docs/fixtures/cosmetic-oracle.md`.
 */
const ORACLE_DIR = here("../../tests/fixtures/");

/** The moment every fixture-built catalogue is taken at, so the golden file is stable. */
export const FIXTURE_TAKEN_AT = "2026-09-20T12:00:00.000Z";

export function fixtureItemsGame() {
  return parseItemsGame(readFileSync(`${ORACLE_DIR}items_game_excerpt.txt`, "utf8"));
}

export function fixtureEnglishTokens() {
  return parseEnglishTokens(readFileSync(`${ORACLE_DIR}tf_english_excerpt.txt`));
}

export function fixtureWebApiItems(): WebApiSchemaItem[] {
  return JSON.parse(readFileSync(here("./fixtures/web-api-schema-items.json"), "utf8")) as WebApiSchemaItem[];
}

/**
 * A `fetch` that serves the two recorded backpack.tf payloads and nothing else,
 * so the price fixtures go through the real adapter rather than around it.
 */
export function fixtureBackpackTfFetch(): typeof fetch {
  const bodies: Record<string, string> = {
    IGetPrices: "./fixtures/backpack-tf-prices.json",
    IGetCurrencies: "./fixtures/backpack-tf-currencies.json",
  };
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const match = Object.keys(bodies).find((endpoint) => url.includes(endpoint));
    if (!match) throw new Error(`no fixture for ${url}`);
    return new Response(readFileSync(here(bodies[match] as string), "utf8"), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

/**
 * The recorded price list: a Key at 78.66 ref, a Cosmetic priced in Keys, one in
 * Metal, a Genuine-only promo, a non-craftable-only Unique, and one Cosmetic the
 * list does not mention at all.
 */
export async function fixturePriceList(): Promise<PriceList> {
  const fetchImpl = fixtureBackpackTfFetch();
  const keyRate = await fetchKeyRate("fixture-key", fetchImpl);
  return fetchPriceList("fixture-key", keyRate, FIXTURE_TAKEN_AT, fetchImpl);
}

/** Inputs with a fixed snapshot time, so the golden file is a function of the fixtures alone. */
export function fixtureInputs(overrides: Partial<CatalogueInputs> = {}): CatalogueInputs {
  return {
    itemsGame: fixtureItemsGame(),
    webApiItems: fixtureWebApiItems(),
    snapshotTakenAt: FIXTURE_TAKEN_AT,
    sources: {
      itemDefinitions: "tests/fixtures/items_game_excerpt.txt",
      englishNames: "fixtures: ISteamEconomy/GetSchemaItems",
    },
    ...overrides,
  };
}

/** The same inputs with the recorded price snapshot attached. */
export async function fixturePricedInputs(overrides: Partial<CatalogueInputs> = {}): Promise<CatalogueInputs> {
  return fixtureInputs({ prices: await fixturePriceList(), ...overrides });
}
