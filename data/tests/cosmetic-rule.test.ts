import { describe, expect, it } from "vitest";

import { classesFor, exclusionReason, modelFor, stylesOf } from "../src/catalogue/cosmetic-rule.ts";
import { type ItemDefinition, resolvePrefabs } from "../src/catalogue/item-definition.ts";
import { parseItemsGame } from "../src/sources/vdf.ts";
import { fixtureItemsGame } from "./fixtures.ts";

const resolved = (defindex: string): ItemDefinition => {
  const itemsGame = fixtureItemsGame();
  const item = itemsGame.items[defindex];
  if (!item) throw new Error(`no item ${defindex} in the fixture`);
  return resolvePrefabs(item, itemsGame.prefabs);
};

describe("prefab inheritance", () => {
  it("applies the chain left to right with the item's own keys on top", () => {
    // 844 inherits item_slot and item_type_name from the "hat" prefab chain.
    expect(resolved("844")["item_slot"]).toBe("head");
    expect(resolved("844")["item_type_name"]).toBe("#TF_Wearable_Hat");
    expect(resolved("844")["item_name"]).toBe("#TF_Soldier_Robot_Helmet");
  });

  it("merges blocks key by key rather than replacing them", () => {
    const capabilities = resolved("844")["capabilities"];
    expect(capabilities).toMatchObject({ nameable: "1" });
  });

  it("gives an item that is nothing but a prefab reference the prefab's definition", () => {
    // 814 is "name" plus "prefab" and nothing else.
    expect(resolved("814")["item_slot"]).toBe("misc");
    expect(classesFor(resolved("814"))).toEqual(["scout", "heavy", "engineer", "sniper", "spy"]);
  });
});

describe("the Cosmetic rule", () => {
  it("keeps an item whose only model lives in its Styles", () => {
    expect(exclusionReason(resolved("844"))).toBeUndefined();
    expect(modelFor(resolved("844"), "soldier")).toBeUndefined();
    expect(stylesOf(resolved("844"))).toHaveLength(2);
  });

  it("substitutes the class into a per-class basename, with demo for Demoman", () => {
    expect(modelFor(resolved("116"), "demoman")).toBe("models/player/items/all_class/all_domination_b_demo.mdl");
    expect(modelFor(resolved("116"), "scout")).toBe("models/player/items/all_class/all_domination_b_scout.mdl");
  });

  it("treats an item that names no Classes as All-Class", () => {
    const itemsGame = parseItemsGame(`"items_game" { "items" { "1" { "item_class" "tf_wearable" } } }`);
    expect(classesFor(itemsGame.items["1"]!)).toHaveLength(9);
  });

  it("reads a blanked-out model path as no model", () => {
    const itemsGame = parseItemsGame(
      `"items_game" { "items" { "1" { "item_class" "tf_wearable" "item_slot" "misc" "model_player" "" } } }`,
    );
    expect(exclusionReason(itemsGame.items["1"]!)).toBe("no-worn-model");
  });
});
