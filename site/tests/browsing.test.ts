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
    expect(slugsOf({ classView: "scout" })).toContain("bolt-boy");
    expect(slugsOf({ classView: "soldier" })).toContain("tin-pot");
  });

  it("includes a Multi-Class Cosmetic the Class can wear, and excludes one it cannot", () => {
    // The Team Captain is Soldier and Demoman.
    expect(slugsOf({ classView: "soldier" })).toContain("team-captain");
    expect(slugsOf({ classView: "demoman" })).toContain("team-captain");
    expect(slugsOf({ classView: "scout" })).not.toContain("team-captain");
  });

  it("includes every All-Class Cosmetic", () => {
    for (const className of ["scout", "soldier", "spy"] as const) {
      expect(slugsOf({ classView: className })).toContain("ghastly-gibus");
    }
  });

  it("excludes another Class's Class-Exclusive Cosmetics", () => {
    expect(slugsOf({ classView: "soldier" })).not.toContain("bolt-boy");
    expect(slugsOf({ classView: "soldier" })).not.toContain("dead-of-night");
  });

  it("is exactly those three groups and nothing else", () => {
    expect(slugsOf({ classView: "soldier" }).toSorted()).toEqual(["ghastly-gibus", "team-captain", "tin-pot"]);
  });
});

describe("hiding All-Class Cosmetics", () => {
  it("drops them from a Class View", () => {
    expect(slugsOf({ classView: "soldier", hideAllClass: true })).not.toContain("ghastly-gibus");
  });

  it("leaves Multi-Class Cosmetics alone: one two Classes wear is still that Class's", () => {
    expect(slugsOf({ classView: "soldier", hideAllClass: true }).toSorted()).toEqual(["team-captain", "tin-pot"]);
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
    expect(slugsOf({ classView: "spy", slot: "head" })).toEqual(["ghastly-gibus"]);
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
    expect(slugsOf({ classView: "sniper" })).not.toContain("crocodile-smile");
    expect(slugsOf({ classView: "sniper", hideEventOnly: false })).toContain("crocodile-smile");
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
