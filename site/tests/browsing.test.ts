/**
 * The browsing rules, driven directly: the Class View's three inclusion rules,
 * the toggles, the slot filter, every sort order and the name search. Nothing in
 * here renders anything — these are the rules the controls are a surface for.
 */
import { describe, expect, it } from "vitest";

import { fixtureCosmetics } from "./fixtures.ts";

import { DEFAULT_CONTROLS, visibleCosmetics } from "@/browsing/controls";

/** The fixture's eight, by slug, for the shorthand the assertions read in. */
function slugsOf(overrides: Partial<typeof DEFAULT_CONTROLS> = {}): string[] {
  return visibleCosmetics(fixtureCosmetics(), { ...DEFAULT_CONTROLS, ...overrides }).map((c) => c.slug);
}

describe("with no controls touched", () => {
  it("shows every Cosmetic but the Event-Only one, most valuable first", () => {
    expect(slugsOf()).toEqual([
      "team-captain",
      "tin-pot",
      "baronial-badge",
      "bolt-boy",
      // The Crocodile Smile sits between these two on value, tied with the
      // Stove Pipe on a Blanket Price; it is Event-Only, so it is not here.
      "scotsmans-stove-pipe",
      "ghastly-gibus",
      "dead-of-night",
    ]);
  });
});

describe("the Class View", () => {
  it("includes the Class's own Class-Exclusive Cosmetics", () => {
    expect(slugsOf({ classFilter: "scout" })).toContain("bolt-boy");
    expect(slugsOf({ classFilter: "soldier" })).toContain("tin-pot");
  });

  it("includes a Multi-Class Cosmetic the Class can wear, and excludes one it cannot", () => {
    // The Team Captain is Soldier and Demoman.
    expect(slugsOf({ classFilter: "soldier" })).toContain("team-captain");
    expect(slugsOf({ classFilter: "demoman" })).toContain("team-captain");
    expect(slugsOf({ classFilter: "scout" })).not.toContain("team-captain");
  });

  it("includes every All-Class Cosmetic", () => {
    for (const className of ["scout", "soldier", "spy"] as const) {
      expect(slugsOf({ classFilter: className })).toContain("ghastly-gibus");
    }
  });

  it("excludes another Class's Class-Exclusive Cosmetics", () => {
    expect(slugsOf({ classFilter: "soldier" })).not.toContain("bolt-boy");
    expect(slugsOf({ classFilter: "soldier" })).not.toContain("dead-of-night");
  });

  it("is exactly those three groups and nothing else", () => {
    expect(slugsOf({ classFilter: "soldier" }).toSorted()).toEqual(["ghastly-gibus", "team-captain", "tin-pot"]);
  });
});

describe("picking a kind instead of a Class", () => {
  it("keeps only the All-Class Cosmetics", () => {
    expect(slugsOf({ classFilter: "all-class" })).toEqual(["ghastly-gibus"]);
  });

  it("keeps only the Multi-Class Cosmetics, which are not the All-Class ones", () => {
    expect(slugsOf({ classFilter: "multi-class" })).toEqual(["team-captain"]);
  });

  it("is not a Class View, so the All-Class toggle does not reach it", () => {
    expect(slugsOf({ classFilter: "all-class", hideAllClass: true })).toEqual(["ghastly-gibus"]);
  });

  it("narrows with the other filters rather than replacing them", () => {
    expect(slugsOf({ classFilter: "all-class", slot: "misc" })).toEqual([]);
    expect(slugsOf({ classFilter: "multi-class", search: "captain" })).toEqual(["team-captain"]);
  });
});

describe("hiding All-Class Cosmetics", () => {
  it("drops them from a Class View", () => {
    expect(slugsOf({ classFilter: "soldier", hideAllClass: true })).not.toContain("ghastly-gibus");
  });

  it("leaves Multi-Class Cosmetics alone: one two Classes wear is still that Class's", () => {
    expect(slugsOf({ classFilter: "soldier", hideAllClass: true }).toSorted()).toEqual(["team-captain", "tin-pot"]);
  });

  it("does nothing with no Class chosen, where there is no Class View to focus", () => {
    expect(slugsOf({ hideAllClass: true })).toEqual(slugsOf());
  });
});

describe("the slot filter", () => {
  it("keeps only head Cosmetics", () => {
    expect(slugsOf({ slot: "head" })).not.toContain("dead-of-night");
    expect(slugsOf({ slot: "head" })).not.toContain("baronial-badge");
    expect(slugsOf({ slot: "head" })).toHaveLength(5);
  });

  it("keeps only miscs", () => {
    expect(slugsOf({ slot: "misc" })).toEqual(["baronial-badge", "dead-of-night"]);
  });

  it("narrows a Class View rather than replacing it", () => {
    expect(slugsOf({ classFilter: "spy", slot: "head" })).toEqual(["ghastly-gibus"]);
  });
});

describe("hiding Unpriced Cosmetics", () => {
  it("drops the Cosmetic the price source has no price for", () => {
    expect(slugsOf({ hideUnpriced: true })).not.toContain("dead-of-night");
  });

  it("keeps a Cosmetic whose snapshot carried no prices at all, which is not the same thing", () => {
    const priceless = fixtureCosmetics().map((cosmetic) => ({ ...cosmetic, price: null }));
    const visible = visibleCosmetics(priceless, { ...DEFAULT_CONTROLS, hideUnpriced: true });
    expect(visible).toHaveLength(7);
  });
});

describe("hiding Event-Only Cosmetics", () => {
  it("is where a viewer starts, because the game will not draw them today", () => {
    expect(DEFAULT_CONTROLS.hideEventOnly).toBe(true);
    expect(slugsOf()).not.toContain("crocodile-smile");
  });

  it("shows them once the toggle is cleared, in their place in the order", () => {
    expect(slugsOf({ hideEventOnly: false })).toEqual([
      "team-captain",
      "tin-pot",
      "baronial-badge",
      "bolt-boy",
      // Two Blanket Prices at the same figure; the name settles the tie.
      "crocodile-smile",
      "scotsmans-stove-pipe",
      "ghastly-gibus",
      "dead-of-night",
    ]);
  });

  it("narrows a Class View like every other filter", () => {
    expect(slugsOf({ classFilter: "sniper" })).not.toContain("crocodile-smile");
    expect(slugsOf({ classFilter: "sniper", hideEventOnly: false })).toContain("crocodile-smile");
  });
});

describe("narrowing to what a viewer owns", () => {
  it("is where a viewer starts, and costs them nothing before an Inventory is read", () => {
    expect(DEFAULT_CONTROLS.onlyOwned).toBe(true);
    expect(slugsOf()).toContain("team-captain");
  });

  it("narrows to the Inventory the moment there is one", () => {
    const owned = new Set(["team-captain"]);
    const visible = visibleCosmetics(fixtureCosmetics(), DEFAULT_CONTROLS, owned);
    expect(visible.map((c) => c.slug)).toEqual(["team-captain"]);
  });
});

describe("the price range", () => {
  // The fixture's Metal Values, in scrap: the Ghastly Gibus at 1, the Scotsman's
  // Stove Pipe at 12, the Bolt Boy at 13, the Baronial Badge at 55, the Tin Pot
  // at 174 and the Team Captain at 1593 — and the Dead of Night with none.
  it("shows everything, Unpriced included, while neither end is bounded", () => {
    expect(slugsOf({ minScrap: null, maxScrap: null })).toEqual(slugsOf());
    expect(slugsOf()).toContain("dead-of-night");
  });

  it("drops what is dearer than the ceiling", () => {
    expect(slugsOf({ maxScrap: 174 })).not.toContain("team-captain");
    expect(slugsOf({ maxScrap: 174 })).toContain("tin-pot");
  });

  it("drops what is cheaper than the floor", () => {
    expect(slugsOf({ minScrap: 55 }).toSorted()).toEqual(["baronial-badge", "team-captain", "tin-pot"]);
  });

  it("keeps a Cosmetic priced at either bound exactly", () => {
    expect(slugsOf({ minScrap: 174, maxScrap: 174 })).toEqual(["tin-pot"]);
  });

  it("takes both ends at once", () => {
    expect(slugsOf({ minScrap: 12, maxScrap: 55 }).toSorted()).toEqual([
      "baronial-badge",
      "bolt-boy",
      "scotsmans-stove-pipe",
    ]);
  });

  it("leaves out the Unpriced as soon as either end is bounded", () => {
    // Not because an Unpriced Cosmetic is worth nothing — it is unknown, which
    // is why the sorts put it last — but because it has no price to be within a
    // range. The bound that says so can be either end.
    expect(slugsOf({ maxScrap: 1593 })).not.toContain("dead-of-night");
    expect(slugsOf({ minScrap: 0 })).not.toContain("dead-of-night");
  });

  it("shows nothing rather than everything when the range holds no Cosmetic", () => {
    expect(slugsOf({ minScrap: 2, maxScrap: 11 })).toEqual([]);
  });
});

describe("the sort orders", () => {
  it("puts the highest Metal Value first by default", () => {
    expect(slugsOf().slice(0, 3)).toEqual(["team-captain", "tin-pot", "baronial-badge"]);
  });

  it("puts the lowest first the other way round", () => {
    expect(slugsOf({ sort: "metal-value-low" }).slice(0, 3)).toEqual([
      "ghastly-gibus",
      "scotsmans-stove-pipe",
      "bolt-boy",
    ]);
  });

  it("leaves an Unpriced Cosmetic at the end whichever way the value sorts", () => {
    expect(slugsOf().at(-1)).toBe("dead-of-night");
    expect(slugsOf({ sort: "metal-value-low" }).at(-1)).toBe("dead-of-night");
  });

  it("sorts by name, Unpriced Cosmetics among the rest", () => {
    expect(slugsOf({ sort: "name" })).toEqual([
      "baronial-badge",
      "bolt-boy",
      "dead-of-night",
      "ghastly-gibus",
      "scotsmans-stove-pipe",
      "team-captain",
      "tin-pot",
    ]);
  });
});

describe("the name search", () => {
  it("narrows to the Cosmetics whose name contains what was typed", () => {
    expect(slugsOf({ search: "gib" })).toEqual(["ghastly-gibus"]);
  });

  it("does not care about case or stray spaces", () => {
    expect(slugsOf({ search: "  TEAM captain " })).toEqual(["team-captain"]);
  });

  it("matches the middle of a name, not only its start", () => {
    expect(slugsOf({ search: "pot" })).toEqual(["tin-pot"]);
  });

  it("shows nothing rather than everything when nothing matches", () => {
    expect(slugsOf({ search: "australium" })).toEqual([]);
  });

  it("is ignored when it is empty or only spaces", () => {
    expect(slugsOf({ search: "   " })).toEqual(slugsOf());
  });
});
