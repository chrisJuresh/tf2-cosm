import { describe, expect, it } from "vitest";

import { issuedInPlay } from "../src/catalogue/issued-in-play.ts";
import { parseItemsGame } from "../src/sources/vdf.ts";
import { fixtureItemsGame } from "./fixtures.ts";

const NOTHING = new Set<string>();

describe("whether the game issues a Cosmetic in play", () => {
  it("says yes to an item the item server drops", () => {
    expect(issuedInPlay({ name: "Scotsman's Stove Pipe", drop_type: "drop" }, NOTHING)).toBe(true);
  });

  it("says yes to an item a crate or a case can hand out, whatever its drop_type", () => {
    expect(issuedInPlay({ name: "Crocodile Smile", drop_type: "none" }, new Set(["crocodile smile"]))).toBe(true);
  });

  it("says no to an item that neither drops nor appears in a loot list", () => {
    expect(issuedInPlay({ name: "Baronial Badge", drop_type: "none" }, new Set(["crocodile smile"]))).toBe(false);
  });

  it("says no when the definition says nothing at all, which is how a promo reads", () => {
    expect(issuedInPlay({ name: "Baronial Badge" }, NOTHING)).toBe(false);
  });
});

describe("the loot lists items_game carries", () => {
  it("reads the items a client loot list can hand out, and not the jobs it runs", () => {
    const document = parseItemsGame(`
      "items_game"
      {
        "items" { }
        "client_loot_lists"
        {
          "summer2015_cosmetics"
          {
            "Crocodile Smile"  "1"
            "lootlist_job_templates" { "add_kill_eater_and_strange" "1" }
          }
        }
      }
    `);
    expect([...document.lootListItems]).toEqual(["crocodile smile"]);
  });

  it("reads a collection's items through its rarity buckets, and not its own name", () => {
    const document = parseItemsGame(`
      "items_game"
      {
        "items" { }
        "item_collections"
        {
          "Teufort_collection"
          {
            "name"          "#teufort_collection"
            "description"   "#teufort_collection_desc"
            "items"
            {
              "ancient" { "Crocodile Smile" "10" }
              "Baron's Brim"  "10"
            }
          }
        }
      }
    `);
    expect([...document.lootListItems].sort()).toEqual(["baron's brim", "crocodile smile"]);
  });

  it("finds the shared oracle's loot-list Cosmetic and nothing else", () => {
    expect([...fixtureItemsGame().lootListItems]).toEqual(["crocodile smile"]);
  });
});
