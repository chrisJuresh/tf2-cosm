/**
 * Reading Valve's KeyValues text (items_game.txt, tf_english.txt).
 *
 * Values are kept as strings, the way the file writes them, so that this job and
 * the Python resolve step see the same data. A key that appears twice in one
 * block is merged rather than replaced: dropping the earlier copy could drop a
 * "cannot trade" attribute and silently admit an item the Cosmetic rule excludes.
 */
import * as vdf from "vdf-parser";

import type { ItemDefinition, ItemsGameDocument } from "../catalogue/item-definition.ts";

type Parsed = Record<string, unknown>;

function collapse(node: unknown): unknown {
  if (Array.isArray(node)) {
    const parts = node.map(collapse);
    if (parts.every((part) => typeof part === "object" && part !== null)) {
      return parts.reduce<Parsed>((merged, part) => mergeBlocks(merged, part as Parsed), {});
    }
    return parts.at(-1);
  }
  if (typeof node === "object" && node !== null) {
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, collapse(value)]));
  }
  return node;
}

function mergeBlocks(left: Parsed, right: Parsed): Parsed {
  const merged: Parsed = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const existing = merged[key];
    merged[key] =
      typeof value === "object" && value !== null && typeof existing === "object" && existing !== null
        ? mergeBlocks(existing as Parsed, value as Parsed)
        : value;
  }
  return merged;
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
  };
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
