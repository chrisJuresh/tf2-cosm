/**
 * Reading Valve's KeyValues text (items_game.txt, tf_english.txt).
 *
 * Values are kept as strings, the way the file writes them, so that this job and
 * the Python resolve step see the same data. A key that appears twice in one
 * block is merged rather than replaced: dropping the earlier copy could drop a
 * "cannot trade" attribute and silently admit an item the Cosmetic rule excludes.
 */
import * as vdf from "vdf-parser";

import {
  type ItemDefinition,
  type ItemsGameDocument,
  lootListKey,
  mergeBlocks,
} from "../catalogue/item-definition.ts";

type Parsed = Record<string, unknown>;

function collapse(node: unknown): unknown {
  if (Array.isArray(node)) {
    const parts = node.map(collapse);
    if (parts.every((part) => typeof part === "object" && part !== null)) {
      return parts.reduce<ItemDefinition>((merged, part) => mergeBlocks(merged, part as ItemDefinition), {});
    }
    return parts.at(-1);
  }
  if (typeof node === "object" && node !== null) {
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, collapse(value)]));
  }
  return node;
}

function parseKeyValues(text: string): Parsed {
  // types: false keeps every value a string, the way the file writes it and the
  // way the Python resolve step sees it. arrayify surfaces duplicate keys so
  // collapse() can merge them rather than let the parser drop one.
  return collapse(vdf.parse(text, { types: false, arrayify: true })) as Parsed;
}

export function parseItemsGame(text: string): ItemsGameDocument {
  const root = parseKeyValues(text)["items_game"] as Parsed | undefined;
  if (!root) throw new Error("items_game.txt has no items_game block");
  const items = root["items"];
  const prefabs = root["prefabs"];
  if (typeof items !== "object" || items === null) throw new Error("items_game.txt has no items block");
  return {
    items: items as Record<string, ItemDefinition>,
    prefabs: (typeof prefabs === "object" && prefabs !== null ? prefabs : {}) as Record<string, ItemDefinition>,
    lootListItems: lootListItems(root),
  };
}

/**
 * Keys that name something other than an item inside a loot list: a job the game
 * runs over what it rolled, not a thing it can roll.
 */
const NOT_AN_ITEM = new Set(["lootlist_job_templates"]);

/**
 * Every string-valued key beneath a node. In a loot list that is an item name and
 * its weight, but a list that rolls another list by name lands here too, and so
 * does anything else written that way. The set is only ever asked whether an item
 * is in it, and a name that is in it wrongly only keeps a Blanket Price that was
 * already standing, so erring wide is the safe direction (ADR-0004).
 */
function itemNamesUnder(node: unknown, into: Set<string>): void {
  if (typeof node !== "object" || node === null) return;
  for (const [key, value] of Object.entries(node)) {
    if (NOT_AN_ITEM.has(key.toLowerCase())) continue;
    // A loot list writes "<item name>" "<weight>"; a nested block is a rarity
    // bucket or a sub-list, and holds item names of its own.
    if (typeof value === "string") into.add(lootListKey(key));
    else itemNamesUnder(value, into);
  }
}

/**
 * What the game can hand out: the client loot lists (crates and cases) and the
 * item collections. An item in neither, and with no `drop_type` of `drop`, never
 * enters the game by ordinary play — which is how a promo-only Cosmetic is told
 * apart from a cheap craft hat (ADR-0004).
 */
function lootListItems(root: Parsed): ReadonlySet<string> {
  const names = new Set<string>();
  itemNamesUnder(root["client_loot_lists"], names);
  const collections = root["item_collections"];
  if (typeof collections === "object" && collections !== null) {
    // Only each collection's own `items`; its name and description are not items.
    for (const collection of Object.values(collections as Parsed)) {
      if (typeof collection === "object" && collection !== null) {
        itemNamesUnder((collection as Parsed)["items"], names);
      }
    }
  }
  return names;
}

/** tf_english.txt is UTF-16; Source treats its token names as case-insensitive. */
export function parseEnglishTokens(raw: Buffer): Record<string, string> {
  const text =
    raw[0] === 0xff || raw[0] === 0xfe
      ? raw.toString("utf16le").replace(/^﻿/, "")
      : raw.toString("utf8").replace(/^﻿/, "");
  const tokens = (parseKeyValues(text)["lang"] as Parsed | undefined)?.["Tokens"];
  if (typeof tokens !== "object" || tokens === null) throw new Error("tf_english.txt has no lang/Tokens block");
  const lowered: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (typeof value === "string") lowered[key.toLowerCase()] = value;
  }
  return lowered;
}
