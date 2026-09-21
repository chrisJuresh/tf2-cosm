import { describe, expect, it } from "vitest";

import { buildCatalogue, DisplayNameCollisionError } from "../src/catalogue/build.ts";
import { fixtureInputs, fixtureItemsGame } from "./fixtures.ts";

/**
 * The verdicts in `docs/fixtures/cosmetic-oracle.md`, which the render job's
 * resolve step is held to as well (`tests/test_resolve.py`).
 */
const ORACLE = {
  cosmetics: [
    { defindex: 101, name: "Bolt Boy", slug: "bolt-boy", aliases: [], kind: "class-exclusive" },
    { defindex: 102, name: "Team Captain", slug: "team-captain", aliases: [], kind: "multi-class" },
    { defindex: 103, name: "Ghastly Gibus", slug: "ghastly-gibus", aliases: [104], kind: "all-class" },
    { defindex: 105, name: "Tin Pot", slug: "tin-pot", aliases: [], kind: "class-exclusive" },
    { defindex: 109, name: "Dead of Night", slug: "dead-of-night", aliases: [], kind: "class-exclusive" },
    {
      defindex: 111,
      name: "Scotsman's Stove Pipe",
      slug: "scotsmans-stove-pipe",
      aliases: [],
      kind: "class-exclusive",
    },
    { defindex: 112, name: "Crocodile Smile", slug: "crocodile-smile", aliases: [], kind: "class-exclusive" },
    { defindex: 113, name: "Baronial Badge", slug: "baronial-badge", aliases: [], kind: "class-exclusive" },
  ],
  excluded: [
    { defindex: 106, reason: "medal" },
    { defindex: 107, reason: "never-tradable" },
    { defindex: 108, reason: "no-model" },
    { defindex: 110, reason: "not-wearable" },
  ],
} as const;

const bySlug = (slug: string) => {
  const cosmetic = buildCatalogue(fixtureInputs()).catalogue.cosmetics.find((one) => one.slug === slug);
  if (!cosmetic) throw new Error(`no cosmetic ${slug} in the fixture catalogue`);
  return cosmetic;
};

describe("the shared Cosmetic oracle", () => {
  it("keeps exactly the Cosmetics the oracle lists, with its names, slugs and aliases", () => {
    const { catalogue } = buildCatalogue(fixtureInputs());
    expect(
      catalogue.cosmetics.map(({ defindex, name, slug, aliases, kind }) => ({ defindex, name, slug, aliases, kind })),
    ).toEqual([...ORACLE.cosmetics].sort((left, right) => (left.slug < right.slug ? -1 : 1)));
  });

  it("drops each non-Cosmetic for the reason the oracle gives", () => {
    const { catalogue, exclusions } = buildCatalogue(fixtureInputs());
    const reasons = new Map(exclusions.map((one) => [one.defindex, one.reason]));
    for (const excluded of ORACLE.excluded) {
      // A weapon never reaches the near-miss report; it is simply not wearable.
      if (excluded.reason === "not-wearable") {
        expect(catalogue.cosmetics.some((one) => one.defindex === excluded.defindex)).toBe(false);
      } else {
        expect(reasons.get(excluded.defindex), `defindex ${excluded.defindex}`).toBe(excluded.reason);
      }
    }
  });
});

describe("identity", () => {
  it("strips a leading The and slugs the name", () => {
    expect(bySlug("team-captain").name).toBe("Team Captain");
    expect(bySlug("dead-of-night").name).toBe("Dead of Night");
  });

  it("merges defindexes that share a name into one Cosmetic with aliases", () => {
    const gibus = bySlug("ghastly-gibus");
    expect(gibus.defindex).toBe(103);
    expect(gibus.aliases).toEqual([104]);
  });

  it("fails loudly when two genuinely different items share a display name", () => {
    const itemsGame = fixtureItemsGame();
    const collided = {
      ...itemsGame,
      // Ghastly Gibus's name on an item worn as a different model is a real
      // collision, not an alias.
      items: {
        ...itemsGame.items,
        "9103": { ...itemsGame.items["103"], model_player_per_class: { basename: "models/player/items/other_%s.mdl" } },
      },
    };
    expect(() => buildCatalogue(fixtureInputs({ itemsGame: collided }))).toThrow(DisplayNameCollisionError);
  });
});

describe("Cosmetic fields", () => {
  it("records the wearing Classes and the kind", () => {
    expect(bySlug("bolt-boy")).toMatchObject({ kind: "class-exclusive", classes: ["scout"] });
    expect(bySlug("team-captain")).toMatchObject({ kind: "multi-class", classes: ["soldier", "demoman"] });
    expect(bySlug("ghastly-gibus").classes).toHaveLength(9);
  });

  it("records the slot and the paintable flag", () => {
    expect(bySlug("bolt-boy")).toMatchObject({ slot: "head", paintable: false });
    expect(bySlug("dead-of-night")).toMatchObject({ slot: "misc", paintable: true });
  });

  it("records which event an Event-Only Cosmetic is bound to, and nothing for the rest", () => {
    expect(bySlug("crocodile-smile").eventRestriction).toBe("halloween_or_fullmoon");
    expect(bySlug("bolt-boy").eventRestriction).toBeNull();
  });

  it("takes the restriction from any defindex under the name, alias or not (ADR-0003)", () => {
    // 103 carries none and its alias 104 is given one. They are the same item,
    // so the Cosmetic a viewer hides is gated whichever defindex says so.
    const itemsGame = fixtureItemsGame();
    const gated = {
      ...itemsGame,
      items: { ...itemsGame.items, "104": { ...itemsGame.items["104"], holiday_restriction: "halloween" } },
    };
    const built = buildCatalogue(fixtureInputs({ itemsGame: gated })).catalogue;
    expect(built.cosmetics.find((one) => one.slug === "ghastly-gibus")).toMatchObject({
      aliases: [104],
      eventRestriction: "halloween",
    });
  });

  it("names the Styles from the Web API, and has none when the item has none", () => {
    expect(bySlug("tin-pot").styles).toEqual([
      { index: 0, name: "Closed" },
      { index: 1, name: "Open" },
    ]);
    expect(bySlug("team-captain").styles).toEqual([]);
  });

  it("carries the Backpack Icon URLs", () => {
    expect(bySlug("team-captain").backpackIcon).toEqual({
      small: expect.stringContaining("soldier_officer."),
      large: expect.stringContaining("soldier_officer_large."),
    });
  });
});

describe("the Web API leg", () => {
  it("falls back to the items_game name and warns when the Web API has no entry", () => {
    const webApiItems = fixtureInputs().webApiItems.filter((item) => item.defindex !== 102);
    const { catalogue, warnings } = buildCatalogue(fixtureInputs({ webApiItems }));
    const captain = catalogue.cosmetics.find((one) => one.defindex === 102);
    expect(captain?.name).toBe("Team Captain");
    expect(captain?.backpackIcon).toBeNull();
    expect(warnings.join("\n")).toContain("102");
  });

  it("resolves the fallback name through the English tokens when they are supplied", () => {
    const { catalogue } = buildCatalogue(
      fixtureInputs({ webApiItems: [], englishTokens: { tf_teamcaptain: "The Team Captain" } }),
    );
    expect(catalogue.cosmetics.find((one) => one.defindex === 102)?.name).toBe("Team Captain");
  });
});

describe("the catalogue document", () => {
  it("counts the Cosmetics it holds", () => {
    const { catalogue } = buildCatalogue(fixtureInputs());
    expect(catalogue.header.counts).toMatchObject({
      cosmetics: catalogue.cosmetics.length,
      classExclusive: 6,
      multiClass: 1,
      allClass: 1,
      aliasesMerged: 1,
    });
  });

  it("orders Cosmetics by slug so a daily diff shows only real changes", () => {
    const slugs = buildCatalogue(fixtureInputs()).catalogue.cosmetics.map((one) => one.slug);
    expect(slugs).toEqual([...slugs].sort());
  });
});
