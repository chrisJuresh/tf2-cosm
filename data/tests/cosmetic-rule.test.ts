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
    // 101 inherits item_class from base_wearable and the slot from hat.
    expect(resolved("101")["item_class"]).toBe("tf_wearable");
    expect(resolved("101")["item_slot"]).toBe("head");
    expect(resolved("101")["item_name"]).toBe("#TF_BoltBoy");
  });

  it("merges blocks key by key rather than replacing them", () => {
    // 109 sets capabilities.paintable; base_wearable sets capabilities.nameable.
    expect(resolved("109")["capabilities"]).toMatchObject({ nameable: "1", paintable: "1" });
  });

  it("follows a prefab's own prefab", () => {
    // tournament_medal -> misc -> base_wearable
    expect(resolved("106")["item_slot"]).toBe("misc");
    expect(resolved("106")["item_type_name"]).toBe("#TF_Wearable_TournamentMedal");
  });
});

describe("the Cosmetic rule", () => {
  it("keeps an item whose only model lives in its Styles", () => {
    expect(exclusionReason(resolved("105"))).toBeUndefined();
    expect(modelFor(resolved("105"), "soldier")).toBeUndefined();
    expect(stylesOf(resolved("105"))).toHaveLength(2);
  });

  it("substitutes the class into a per-class basename, with demo for Demoman", () => {
    expect(modelFor(resolved("102"), "demoman")).toBe("models/player/items/demo/demo_officer.mdl");
    expect(modelFor(resolved("102"), "soldier")).toBe("models/player/items/soldier/soldier_officer.mdl");
  });

  it("treats an item that names no Classes as All-Class", () => {
    expect(classesFor(resolved("103"))).toHaveLength(9);
  });

  it("reads a blanked-out model path as no model", () => {
    const itemsGame = parseItemsGame(
      `"items_game" { "items" { "1" { "item_class" "tf_wearable" "item_slot" "misc" "model_player" "" } } }`,
    );
    expect(exclusionReason(itemsGame.items["1"]!)).toBe("no-model");
  });
});
