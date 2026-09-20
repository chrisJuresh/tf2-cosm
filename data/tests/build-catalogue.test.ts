import { describe, expect, it } from "vitest";

import { buildCatalogue, DisplayNameCollisionError } from "../src/catalogue/build.ts";
import { fixtureExpectedCosmetics, fixtureInputs, fixtureItemsGame } from "./fixtures.ts";

const bySlug = (slug: string) => {
  const cosmetic = buildCatalogue(fixtureInputs()).catalogue.cosmetics.find((one) => one.slug === slug);
  if (!cosmetic) throw new Error(`no cosmetic ${slug} in the fixture catalogue`);
  return cosmetic;
};

describe("the Cosmetic rule over the shared fixture", () => {
  it("keeps exactly the Cosmetics the shared oracle lists, as the oracle describes them", () => {
    const { catalogue } = buildCatalogue(fixtureInputs());
    const shape = ({ name, defindex, aliases, slot, classes }: (typeof catalogue.cosmetics)[number]) => ({
      name,
      defindex,
      aliases,
      slot,
      classes,
    });
    expect(catalogue.cosmetics.map(shape)).toEqual(
      fixtureExpectedCosmetics()
        .cosmetics.map(({ name, defindex, aliases, slot, classes }) => ({ name, defindex, aliases, slot, classes }))
        .sort((left, right) => (left.name < right.name ? -1 : 1)),
    );
  });

  it("excludes each non-Cosmetic for the reason the shared oracle gives", () => {
    const { exclusions } = buildCatalogue(fixtureInputs());
    const byDefindex = new Map(exclusions.map((one) => [one.defindex, one.reason]));
    for (const excluded of fixtureExpectedCosmetics().excluded) {
      expect(byDefindex.get(excluded.defindex), `defindex ${excluded.defindex}`).toBe(excluded.reason);
    }
  });
});

describe("identity", () => {
  it("strips a leading The and slugs the name", () => {
    expect(bySlug("team-captain").name).toBe("Team Captain");
  });

  it("merges defindexes that share a name into one Cosmetic with aliases", () => {
    const trinket = bySlug("triad-trinket");
    expect(trinket.defindex).toBe(814);
    expect(trinket.aliases).toEqual([835]);
  });

  it("fails loudly when two genuinely different items share a display name", () => {
    const itemsGame = fixtureItemsGame();
    const collided = {
      ...itemsGame,
      items: {
        ...itemsGame.items,
        // Team Captain's name on a misc-slot item is a real collision, not an alias.
        "90378": { ...itemsGame.items["378"], item_slot: "misc" },
      },
    };
    expect(() => buildCatalogue(fixtureInputs({ itemsGame: collided }))).toThrow(DisplayNameCollisionError);
  });
});

describe("Cosmetic fields", () => {
  it("records the wearing Classes and the kind", () => {
    expect(bySlug("texas-ten-gallon")).toMatchObject({ kind: "class-exclusive", classes: ["engineer"] });
    expect(bySlug("team-captain")).toMatchObject({ kind: "multi-class", classes: ["soldier", "heavy", "medic"] });
    expect(bySlug("ghastlierest-gibus").kind).toBe("all-class");
    expect(bySlug("ghastlierest-gibus").classes).toHaveLength(9);
  });

  it("records the slot and the paintable flag", () => {
    expect(bySlug("texas-ten-gallon")).toMatchObject({ slot: "head", paintable: true });
    expect(bySlug("triad-trinket")).toMatchObject({ slot: "misc", paintable: false });
  });

  it("names the Styles from the Web API, and has none when the item has none", () => {
    expect(bySlug("tin-pot").styles).toEqual([
      { index: 0, name: "Battered" },
      { index: 1, name: "Standard Issue" },
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
  it("falls back to the items_game token and warns when the Web API has no entry", () => {
    const webApiItems = fixtureInputs().webApiItems.filter((item) => item.defindex !== 378);
    const { catalogue, warnings } = buildCatalogue(fixtureInputs({ webApiItems }));
    const captain = catalogue.cosmetics.find((one) => one.defindex === 378);
    expect(captain?.name).toBe("Team Captain");
    expect(captain?.backpackIcon).toBeNull();
    expect(warnings.join("\n")).toContain("378");
  });

  it("resolves the fallback name through the English tokens when they are supplied", () => {
    const { catalogue } = buildCatalogue(
      fixtureInputs({
        webApiItems: [],
        englishTokens: { tf_teamcaptain: "The Team Captain" },
      }),
    );
    expect(catalogue.cosmetics.find((one) => one.defindex === 378)?.name).toBe("Team Captain");
  });
});

describe("the catalogue document", () => {
  it("counts the Cosmetics it holds", () => {
    const { catalogue } = buildCatalogue(fixtureInputs());
    expect(catalogue.header.counts).toMatchObject({
      cosmetics: catalogue.cosmetics.length,
      classExclusive: 2,
      multiClass: 2,
      allClass: 1,
      aliasesMerged: 1,
    });
  });

  it("orders Cosmetics by slug so a daily diff shows only real changes", () => {
    const slugs = buildCatalogue(fixtureInputs()).catalogue.cosmetics.map((one) => one.slug);
    expect(slugs).toEqual([...slugs].sort());
  });
});
