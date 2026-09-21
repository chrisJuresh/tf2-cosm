/**
 * What a viewer owns, matched to the catalogue and priced as what they own.
 *
 * The rules are pure, so they are driven directly here and the components are
 * asserted as a surface over them in `inventory.test.tsx`.
 */
import { describe, expect, it } from "vitest";

import { fixtureCosmetics } from "./fixtures.ts";

import type { OwnedCopy } from "@/inventory/copies";
import { inventoryTotal, ownedCosmetics, ownedSlugs, withoutUntradable } from "@/inventory/owned";
import type { VariantPrices } from "@/prices/variant-prices";

const cosmetics = fixtureCosmetics();

/** A Cosmetic out of the fixture catalogue, by slug, with its real defindex. */
function fixture(slug: string) {
  const cosmetic = cosmetics.find((one) => one.slug === slug);
  if (cosmetic === undefined) throw new Error(`no fixture Cosmetic ${slug}`);
  return cosmetic;
}

const copy = (overrides: Partial<OwnedCopy> & Pick<OwnedCopy, "defindex">): OwnedCopy => ({
  quality: "unique",
  craftable: true,
  tradable: true,
  count: 1,
  ...overrides,
});

/** Variant Prices for whichever slugs a test needs, at made-up but ordered figures. */
function prices(bySlug: Record<string, { quality: string; craftable?: boolean; scrap: number; blanket?: boolean }[]>): VariantPrices {
  return {
    schemaVersion: 1,
    header: {
      snapshotTakenAt: "2026-09-20T12:00:00.000Z",
      source: "a price source",
      takenAt: "2026-09-20T12:00:00.000Z",
      keyRate: { scrap: 708, refined: 78.6667, notation: "78.66 ref", lastUpdatedAt: "2026-09-08T20:40:00.000Z" },
      counts: { cosmetics: 0, variants: 0, byVariant: {} },
    },
    bySlug: Object.fromEntries(
      Object.entries(bySlug).map(([slug, variants]) => [
        slug,
        variants.map((one) => ({
          quality: one.quality,
          craftable: one.craftable ?? true,
          blanket: one.blanket ?? false,
          scrap: { low: one.scrap, mid: one.scrap, high: one.scrap },
          lastUpdatedAt: "2026-09-01T00:00:00.000Z",
        })),
      ]),
    ),
  };
}

describe("matching what a viewer owns to the catalogue", () => {
  const teamCaptain = fixture("team-captain");

  it("matches a copy to the Cosmetic its defindex names", () => {
    const owned = ownedCosmetics(cosmetics, [copy({ defindex: teamCaptain.defindex })], null);
    expect(owned.map((one) => one.cosmetic.slug)).toEqual(["team-captain"]);
  });

  it("leaves out everything that is not a Cosmetic, without a second rule to do it", () => {
    // A Rocket Launcher, a crate and a taunt. The catalogue is the Cosmetic
    // rule; a defindex it does not carry is not a Cosmetic, and that is the
    // whole of the exclusion.
    const owned = ownedCosmetics(cosmetics, [copy({ defindex: 18 }), copy({ defindex: 5022 }), copy({ defindex: 1157 })], null);
    expect(owned).toEqual([]);
  });

  it("matches an alias to the Cosmetic its name identifies (ADR-0003)", () => {
    const withAlias = cosmetics.find((one) => one.aliases.length > 0);
    if (withAlias === undefined) throw new Error("the fixture catalogue is meant to carry a merged alias");
    const alias = withAlias.aliases[0];
    const owned = ownedCosmetics(cosmetics, [copy({ defindex: alias ?? 0 })], null);
    expect(owned.map((one) => one.cosmetic.slug)).toEqual([withAlias.slug]);
  });

  it("counts several copies of one Cosmetic as one entry", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex, count: 2 }), copy({ defindex: teamCaptain.defindex, quality: "strange" })],
      null,
    );
    expect(owned).toHaveLength(1);
    expect(owned[0]?.count).toBe(3);
    expect(owned[0]?.copies).toHaveLength(2);
  });

  it("keeps the order it was handed, so the viewer's chosen sort still holds", () => {
    const first = cosmetics[0];
    const last = cosmetics.at(-1);
    if (first === undefined || last === undefined) throw new Error("the fixture catalogue is meant to have Cosmetics");
    const owned = ownedCosmetics(cosmetics, [copy({ defindex: last.defindex }), copy({ defindex: first.defindex })], null);
    expect(owned.map((one) => one.cosmetic.slug)).toEqual([first.slug, last.slug]);
  });

  it("names the slugs the grid narrows to", () => {
    const owned = ownedCosmetics(cosmetics, [copy({ defindex: teamCaptain.defindex })], null);
    expect([...ownedSlugs(owned)]).toEqual(["team-captain"]);
  });
});

describe("pricing a copy as the copy it is", () => {
  const teamCaptain = fixture("team-captain");

  it("prices a Genuine copy at the Genuine figure and not the Reference Price", () => {
    // The whole point of reading a backpack. The Reference Price here is the
    // Unique one and it is a different number about a different copy.
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex, quality: "genuine" })],
      prices({ "team-captain": [{ quality: "unique", scrap: 12 }, { quality: "genuine", scrap: 900 }] }),
    );
    expect(owned[0]?.copies[0]).toMatchObject({ quality: "genuine", price: { scrap: { mid: 900 } } });
    expect(owned[0]?.scrap).toBe(900);
  });

  it("tells a non-craftable copy from a craftable one, which is half of what a price is keyed by", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex, craftable: false })],
      prices({
        "team-captain": [
          { quality: "unique", craftable: true, scrap: 100 },
          { quality: "unique", craftable: false, scrap: 9 },
        ],
      }),
    );
    expect(owned[0]?.copies[0]?.price?.scrap.mid).toBe(9);
  });

  it("puts the most valuable copy first, so a card's one figure is the best they hold", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex, quality: "unique" }), copy({ defindex: teamCaptain.defindex, quality: "genuine" })],
      prices({ "team-captain": [{ quality: "unique", scrap: 12 }, { quality: "genuine", scrap: 900 }] }),
    );
    expect(owned[0]?.copies.map((one) => one.quality)).toEqual(["genuine", "unique"]);
  });

  it("multiplies by how many are held", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex, count: 3 })],
      prices({ "team-captain": [{ quality: "unique", scrap: 100 }] }),
    );
    expect(owned[0]?.scrap).toBe(300);
  });

  it("never prices an Unusual, and says it is priced by its effect rather than unpriced", () => {
    // A price source prices an Unusual by effect, one figure per hat-and-effect
    // pair, so the Unique figure would be wrong by two orders of magnitude.
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex, quality: "unusual", effect: "Burning Flames" })],
      prices({ "team-captain": [{ quality: "unique", scrap: 12 }, { quality: "unusual", scrap: 999999 }] }),
    );
    expect(owned[0]?.copies[0]).toMatchObject({ price: null, noPrice: "priced-per-effect", effect: "Burning Flames" });
    expect(owned[0]?.scrap).toBe(0);
  });

  it("prices an untradable copy at nothing, whatever the source says a tradable one is worth", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex, tradable: false })],
      prices({ "team-captain": [{ quality: "unique", scrap: 900 }] }),
    );
    expect(owned[0]?.copies[0]).toMatchObject({ price: null, noPrice: "untradable" });
    expect(owned[0]?.scrap).toBe(0);
  });

  it("prices an untradable Unusual at nothing too, rather than by its effect", () => {
    // Untradable is settled first: what an effect would fetch does not matter
    // for a copy nobody can be handed.
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex, quality: "unusual", tradable: false, effect: "Burning Flames" })],
      prices({ "team-captain": [{ quality: "unique", scrap: 12 }] }),
    );
    expect(owned[0]?.copies[0]?.noPrice).toBe("untradable");
  });

  it("puts a tradable copy ahead of an untradable one, so the card shows the one worth something", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [
        copy({ defindex: teamCaptain.defindex, tradable: false }),
        copy({ defindex: teamCaptain.defindex, quality: "strange" }),
      ],
      prices({ "team-captain": [{ quality: "unique", scrap: 900 }, { quality: "strange", scrap: 100 }] }),
    );
    expect(owned[0]?.copies.map((one) => one.noPrice)).toEqual([null, "untradable"]);
  });

  it("says so when the source has no figure for that Quality, which is not the same thing", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex, quality: "haunted" })],
      prices({ "team-captain": [{ quality: "unique", scrap: 12 }] }),
    );
    expect(owned[0]?.copies[0]).toMatchObject({ price: null, noPrice: "no-variant-price" });
  });

  it("prices nothing at all when the Variant Prices did not load, and still matches", () => {
    // The Inventory is still the filter the viewer asked for.
    const owned = ownedCosmetics(cosmetics, [copy({ defindex: teamCaptain.defindex })], null);
    expect(owned).toHaveLength(1);
    expect(owned[0]?.copies[0]?.price).toBeNull();
  });

  it("carries the Blanket Price flag through, so a card can say about (ADR-0004)", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex })],
      prices({ "team-captain": [{ quality: "unique", scrap: 12, blanket: true }] }),
    );
    expect(owned[0]?.copies[0]?.price?.blanket).toBe(true);
  });
});

describe("what an Inventory comes to", () => {
  const teamCaptain = fixture("team-captain");
  const other = cosmetics.find((one) => one.slug !== "team-captain");

  it("adds up every copy with a figure, and says what it left out", () => {
    if (other === undefined) throw new Error("the fixture catalogue is meant to have more than one Cosmetic");
    const owned = ownedCosmetics(
      cosmetics,
      [
        copy({ defindex: teamCaptain.defindex, count: 2 }),
        copy({ defindex: teamCaptain.defindex, quality: "unusual" }),
        copy({ defindex: other.defindex, quality: "haunted" }),
      ],
      prices({ "team-captain": [{ quality: "unique", scrap: 100 }] }),
    );
    expect(inventoryTotal(owned)).toEqual({ scrap: 200, counted: 2, untradable: 0, pricedPerEffect: 1, unpriced: 1 });
  });

  it("counts the untradable copies on their own, and adds nothing for them", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex }), copy({ defindex: teamCaptain.defindex, tradable: false, count: 4 })],
      prices({ "team-captain": [{ quality: "unique", scrap: 100 }] }),
    );
    expect(inventoryTotal(owned)).toEqual({ scrap: 100, counted: 1, untradable: 4, pricedPerEffect: 0, unpriced: 0 });
  });

  it("comes to nothing, and says so, when nothing could be priced", () => {
    const owned = ownedCosmetics(cosmetics, [copy({ defindex: teamCaptain.defindex })], null);
    expect(inventoryTotal(owned)).toEqual({ scrap: 0, counted: 0, untradable: 0, pricedPerEffect: 0, unpriced: 1 });
  });

  it("has nothing to say about an empty Inventory", () => {
    expect(inventoryTotal([])).toEqual({ scrap: 0, counted: 0, untradable: 0, pricedPerEffect: 0, unpriced: 0 });
  });
});

describe("leaving the untradable copies out", () => {
  const teamCaptain = fixture("team-captain");
  const other = cosmetics.find((one) => one.slug !== "team-captain");

  it("drops the untradable copies and counts what is left", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [
        copy({ defindex: teamCaptain.defindex, count: 2 }),
        copy({ defindex: teamCaptain.defindex, quality: "strange", tradable: false, count: 3 }),
      ],
      prices({ "team-captain": [{ quality: "unique", scrap: 100 }, { quality: "strange", scrap: 200 }] }),
    );
    const kept = withoutUntradable(owned);
    expect(kept[0]?.copies.map((one) => one.quality)).toEqual(["unique"]);
    expect(kept[0]?.count).toBe(2);
  });

  it("drops a Cosmetic the viewer owns no tradable copy of, which is what narrows the grid", () => {
    if (other === undefined) throw new Error("the fixture catalogue is meant to have more than one Cosmetic");
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex }), copy({ defindex: other.defindex, tradable: false })],
      prices({ "team-captain": [{ quality: "unique", scrap: 100 }] }),
    );
    expect([...ownedSlugs(withoutUntradable(owned))]).toEqual(["team-captain"]);
  });

  it("leaves the Metal Value where it was, because what it dropped was worth nothing", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex }), copy({ defindex: teamCaptain.defindex, tradable: false })],
      prices({ "team-captain": [{ quality: "unique", scrap: 100 }] }),
    );
    expect(inventoryTotal(withoutUntradable(owned)).scrap).toBe(inventoryTotal(owned).scrap);
  });

  it("does nothing to an Inventory with nothing untradable in it", () => {
    const owned = ownedCosmetics(
      cosmetics,
      [copy({ defindex: teamCaptain.defindex })],
      prices({ "team-captain": [{ quality: "unique", scrap: 100 }] }),
    );
    expect(withoutUntradable(owned)).toEqual(owned);
  });
});
