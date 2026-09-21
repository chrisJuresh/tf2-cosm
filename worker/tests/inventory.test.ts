import { describe, expect, it } from "vitest";

import fixture from "./fixtures/inventory.json" with { type: "json" };
import { type OwnedCopy, readInventory, type SteamInventory } from "../src/inventory.ts";

const inventory = fixture as unknown as SteamInventory;

const read = (...pages: SteamInventory[]) => readInventory(pages);

const find = (copies: readonly OwnedCopy[], defindex: number, quality: string, craftable = true) =>
  copies.find((one) => one.defindex === defindex && one.quality === quality && one.craftable === craftable);

describe("reading a Steam backpack", () => {
  const { copies, items, unreadable } = read(inventory);

  it("joins the assets to their descriptions and counts identical copies together", () => {
    // Two assets point at one description: one kind of copy, held twice.
    expect(find(copies, 378, "unique")).toEqual({
      defindex: 378,
      quality: "unique",
      craftable: true,
      tradable: true,
      count: 2,
    });
  });

  it("finds the defindex in the wiki link, which is where the inventory endpoint puts it", () => {
    expect(copies.map((one) => one.defindex)).toContain(30027);
  });

  it("reads craftability out of the description text, in both the sentences Steam writes it as", () => {
    expect(find(copies, 378, "unique", false)?.count).toBe(1);
    expect(find(copies, 30027, "strange", false)?.count).toBe(1);
  });

  it("gives Steam's Quality names the catalogue's names, so nothing downstream sees rarity4", () => {
    expect(find(copies, 844, "genuine")).toBeDefined();
    expect(find(copies, 378, "unusual")).toBeDefined();
    expect(copies.map((one) => one.quality)).not.toContain("rarity1");
    expect(copies.map((one) => one.quality)).not.toContain("rarity4");
  });

  it("carries an Unusual's effect, because an Unusual is priced by its effect and not as a Cosmetic", () => {
    expect(find(copies, 378, "unusual")?.effect).toBe("Burning Flames");
  });

  it("puts no effect on anything that is not Unusual", () => {
    expect(copies.filter((one) => one.quality !== "unusual").every((one) => one.effect === undefined)).toBe(true);
  });

  it("leaves an Unusual with no effect without one, because a few genuinely have none", () => {
    // The Horseless Headless Horsemann's Headtaker is Unusual and is not on
    // fire: the Quality is a historical label there rather than an effect. Its
    // absence has to read as "there is none" and not as a parse that failed.
    const headtaker = copies.find((one) => one.defindex === 266);
    expect(headtaker).toMatchObject({ quality: "unusual" });
    expect(headtaker?.effect).toBeUndefined();
  });

  it("records whether a copy can be traded, which the price is for", () => {
    expect(find(copies, 378, "unique", false)?.tradable).toBe(false);
    expect(find(copies, 378, "unique")?.tradable).toBe(true);
  });

  it("counts a stack by its amount rather than once", () => {
    // Three Refined Metal is one asset saying "3".
    expect(copies.find((one) => one.defindex === 5002)?.count).toBe(3);
  });

  it("passes weapons and craft items through rather than deciding what a Cosmetic is", () => {
    // The catalogue is the Cosmetic rule and the site holds the catalogue, so a
    // Rocket Launcher simply fails to match there. Deciding it twice, in two
    // places, from two different sources, is how two answers come to disagree.
    expect(copies.map((one) => one.defindex)).toContain(18);
  });

  it("counts what it could not read rather than dropping it quietly", () => {
    // One item with no wiki link, and one asset whose description never arrived.
    expect(unreadable).toBe(2);
    expect(items).toBe(13);
  });

  it("orders itself, so two reads of one backpack come out the same way", () => {
    const again = read(inventory).copies;
    expect(again).toEqual(copies);
    const defindexes = copies.map((one) => one.defindex);
    expect(defindexes).toEqual([...defindexes].sort((left, right) => left - right));
  });
});

describe("a backpack that came in more than one page", () => {
  it("adds a kind of copy up across the page boundary", () => {
    // The same description in both pages, with one asset each: one kind, held
    // twice, and not two entries of one.
    const page = (assetid: string): SteamInventory => ({
      assets: [{ classid: "100", instanceid: "0", amount: "1" }],
      descriptions: [
        {
          classid: "100",
          instanceid: "0",
          tradable: 1,
          actions: [{ link: `http://wiki.teamfortress.com/scripts/itemredirect.php?id=378&lang=en_US#${assetid}` }],
          tags: [{ category: "Quality", internal_name: "Unique" }],
        },
      ],
    });
    const { copies } = read(page("1"), page("2"));
    expect(copies).toEqual([{ defindex: 378, quality: "unique", craftable: true, tradable: true, count: 2 }]);
  });

  it("has nothing to say about an empty backpack", () => {
    expect(read()).toEqual({ copies: [], items: 0, unreadable: 0 });
    expect(read({})).toEqual({ copies: [], items: 0, unreadable: 0 });
  });
});
