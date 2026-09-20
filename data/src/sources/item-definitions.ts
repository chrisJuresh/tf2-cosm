/**
 * Item definitions: the local game install when it is there, the community daily
 * mirror otherwise. The mirror is what a machine without TF2 uses.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ItemsGameDocument } from "../catalogue/item-definition.ts";
import { parseEnglishTokens, parseItemsGame } from "./vdf.ts";

export const MIRROR_URL =
  "https://raw.githubusercontent.com/SteamDatabase/GameTracking-TF2/master/tf/scripts/items/items_game.txt";

export interface ItemDefinitionSource {
  readonly itemsGame: ItemsGameDocument;
  /** Present only for the local install; the mirror has no tf_english.txt. */
  readonly englishTokens?: Record<string, string> | undefined;
  /** What the catalogue header records about where the definitions came from. */
  readonly description: string;
}

export async function loadFromGameInstall(tfPath: string): Promise<ItemDefinitionSource> {
  const [itemsGameText, englishRaw] = await Promise.all([
    readFile(join(tfPath, "scripts/items/items_game.txt"), "utf8"),
    readFile(join(tfPath, "resource/tf_english.txt")),
  ]);
  return {
    itemsGame: parseItemsGame(itemsGameText),
    englishTokens: parseEnglishTokens(englishRaw),
    description: `local game install (${tfPath})`,
  };
}

export async function loadFromMirror(
  url: string = MIRROR_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<ItemDefinitionSource> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`items_game mirror ${url} failed: ${response.status} ${response.statusText}`);
  return { itemsGame: parseItemsGame(await response.text()), description: `daily mirror (${url})` };
}
