import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { CatalogueInputs } from "../src/catalogue/build.ts";
import type { WebApiSchemaItem } from "../src/sources/steam-web-api.ts";
import { parseEnglishTokens, parseItemsGame } from "../src/sources/vdf.ts";

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The shared Cosmetic oracle: one items_game excerpt that this job and the render
 * job's resolve step both resolve, with the verdicts written down in
 * `docs/fixtures/cosmetic-oracle.md`.
 */
const ORACLE_DIR = here("../../tests/fixtures/");

export function fixtureItemsGame() {
  return parseItemsGame(readFileSync(`${ORACLE_DIR}items_game_excerpt.txt`, "utf8"));
}

export function fixtureEnglishTokens() {
  return parseEnglishTokens(readFileSync(`${ORACLE_DIR}tf_english_excerpt.txt`));
}

export function fixtureWebApiItems(): WebApiSchemaItem[] {
  return JSON.parse(readFileSync(here("./fixtures/web-api-schema-items.json"), "utf8")) as WebApiSchemaItem[];
}

/** Inputs with a fixed snapshot time, so the golden file is a function of the fixtures alone. */
export function fixtureInputs(overrides: Partial<CatalogueInputs> = {}): CatalogueInputs {
  return {
    itemsGame: fixtureItemsGame(),
    webApiItems: fixtureWebApiItems(),
    snapshotTakenAt: "2026-09-20T12:00:00.000Z",
    sources: {
      itemDefinitions: "tests/fixtures/items_game_excerpt.txt",
      englishNames: "fixtures: ISteamEconomy/GetSchemaItems",
    },
    ...overrides,
  };
}
