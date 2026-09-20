import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { CatalogueInputs } from "../src/catalogue/build.ts";
import { parseItemsGame } from "../src/sources/vdf.ts";
import type { WebApiSchemaItem } from "../src/sources/steam-web-api.ts";

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/** The shared Cosmetic-rule oracle, read by the Python resolve step as well. */
export const SHARED_FIXTURE_DIR = here("../../fixtures/cosmetic-rule/");

export function fixtureItemsGame() {
  return parseItemsGame(readFileSync(`${SHARED_FIXTURE_DIR}items_game.txt`, "utf8"));
}

export function fixtureWebApiItems(): WebApiSchemaItem[] {
  return JSON.parse(readFileSync(here("./fixtures/web-api-schema-items.json"), "utf8")) as WebApiSchemaItem[];
}

export function fixtureExpectedCosmetics() {
  return JSON.parse(readFileSync(`${SHARED_FIXTURE_DIR}expected-cosmetics.json`, "utf8")) as {
    cosmetics: { name: string; defindex: number; aliases: number[]; slot: string; classes: string[] }[];
    excluded: { defindex: number; reason: string }[];
  };
}

/** Inputs with a fixed snapshot time, so the golden file is a function of the fixtures alone. */
export function fixtureInputs(overrides: Partial<CatalogueInputs> = {}): CatalogueInputs {
  return {
    itemsGame: fixtureItemsGame(),
    webApiItems: fixtureWebApiItems(),
    snapshotTakenAt: "2026-09-20T12:00:00.000Z",
    sources: {
      itemDefinitions: "fixtures/cosmetic-rule/items_game.txt",
      englishNames: "fixtures: ISteamEconomy/GetSchemaItems",
    },
    ...overrides,
  };
}
