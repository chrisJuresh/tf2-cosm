/**
 * What a viewer actually sees in the grid, driven by the fixture catalogue: the
 * cards, their order, and the figures as they are written on screen. Nothing in
 * here knows how the grid is built.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fixtureBasis, fixtureCosmetics, fixtureKeyRate } from "./fixtures.ts";

import { CosmeticGrid } from "@/components/cosmetic-grid";
import { EMPTY_MANIFEST } from "@/renders/manifest";

function renderGrid(overrides: Partial<Parameters<typeof CosmeticGrid>[0]> = {}) {
  render(
    <CosmeticGrid
      cosmetics={fixtureCosmetics()}
      // What a card says is the same whether it has a picture or an icon, so
      // these are driven against a manifest with nothing in it; the pictures
      // have a suite of their own in `worn-renders.test.tsx`.
      manifest={EMPTY_MANIFEST}
      classView={null}
      keyRate={fixtureKeyRate()}
      basis={fixtureBasis()}
      {...overrides}
    />,
  );
  return cards();
}

/** Every Cosmetic's card on screen. An open card's panel is an item too, and is not one. */
function cards(): HTMLElement[] {
  return screen.queryAllByRole("listitem").filter((item) => item.dataset["slug"] !== undefined);
}

/** What a card calls the Cosmetic — which is the control a viewer opens it with. */
function nameOn(card: HTMLElement): string {
  return within(card).getByRole("button").textContent?.trim() ?? "";
}

/** A card's figures, as a viewer reads them and a screen reader hears them: name to value. */
function figuresOn(card: HTMLElement): Record<string, string> {
  const terms = within(card).getAllByRole("term");
  const values = within(card).getAllByRole("definition");
  return Object.fromEntries(
    terms.map((term, index) => [term.textContent?.trim() ?? "", values[index]?.textContent?.trim() ?? ""]),
  );
}

/** A card by the Cosmetic it is for, so adding one to the fixture moves nothing. */
function cardFor(shown: readonly HTMLElement[], slug: string): HTMLElement {
  const card = shown.find((one) => one.getAttribute("data-slug") === slug);
  if (card === undefined) throw new Error(`no card for ${slug}`);
  return card;
}

describe("the Cosmetic grid", () => {
  it("shows every Cosmetic in the catalogue, in the catalogue's order", () => {
    expect(renderGrid().map(nameOn)).toEqual([
      "Baronial Badge",
      "Bolt Boy",
      "Crocodile Smile",
      "Dead of Night",
      "Ghastly Gibus",
      "Scotsman's Stove Pipe",
      "Team Captain",
      "Tin Pot",
    ]);
  });

  it("writes a price in Keys in Trader Notation, and the same price in Refined beside it", () => {
    expect(figuresOn(cardFor(renderGrid(), "team-captain"))).toEqual({
      "Trader Notation": "2 keys, 19.66 ref",
      "Metal Value": "177 ref",
      Dollars: "$5.15",
    });
  });

  it("writes a price in Metal the same way in both figures", () => {
    expect(figuresOn(cardFor(renderGrid(), "bolt-boy"))).toEqual({
      "Trader Notation": "1.44 ref",
      "Metal Value": "1.44 ref",
      Dollars: "$0.04",
    });
  });

  it("writes the cheapest price there is rather than rounding it away", () => {
    expect(figuresOn(cardFor(renderGrid(), "ghastly-gibus"))).toEqual({
      "Trader Notation": "0.11 ref",
      "Metal Value": "0.11 ref",
      Dollars: "$0.00",
    });
  });

  it("writes a Blanket Price as about, since the source quotes it for every cheap hat", () => {
    // The Scotsman's Stove Pipe is priced at one Random Craft Hat, which is a
    // figure backpack.tf lays over the whole class rather than one it observed
    // for this Cosmetic (ADR-0004).
    const shown = renderGrid();
    expect(figuresOn(cardFor(shown, "scotsmans-stove-pipe"))).toEqual({
      "Trader Notation": "≈1.33 ref",
      "Metal Value": "≈1.33 ref",
      Dollars: "≈$0.04",
    });
    // The Baronial Badge's blanket figure was passed over, so its Genuine price
    // is written plainly.
    expect(figuresOn(cardFor(shown, "baronial-badge"))["Trader Notation"]).toBe("6.11 ref");
  });

  it("says an Unpriced Cosmetic is Unpriced, why, and shows no figures for it", () => {
    const deadOfNight = cardFor(renderGrid(), "dead-of-night");
    expect(figuresOn(deadOfNight)).toEqual({
      "Trader Notation": "Unpriced",
      Why: "not listed",
      "Metal Value": "—",
      Dollars: "—",
    });
    expect(deadOfNight.textContent).not.toContain("$");
  });

  it("names every figure it shows, since a card has no column heading over it", () => {
    // Three bare numbers on a card read aloud as three bare numbers. The names
    // are for a screen reader only: a viewer can see which figure is which.
    const teamCaptain = cardFor(renderGrid(), "team-captain");
    const terms = within(teamCaptain).getAllByRole("term");
    expect(terms.map((term) => term.textContent)).toEqual(["Trader Notation", "Metal Value", "Dollars"]);
    for (const term of terms) expect(term).toHaveClass("sr-only");
  });

  it("tells a screen reader which of how many each card is", () => {
    // Only a screenful of cards is ever in the DOM, so the count and each card's
    // place in it have to be stated rather than counted off the page.
    const shown = renderGrid();
    expect(shown.map((card) => card.getAttribute("aria-posinset"))).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
    for (const card of shown) expect(card).toHaveAttribute("aria-setsize", "8");
  });

  it("names the list the cards are in, so a screen reader can say what it is landing in", () => {
    renderGrid();
    expect(screen.getByRole("list", { name: "Cosmetics" })).toBeInTheDocument();
  });

  it("addresses each card by the Cosmetic's slug, so a later per-item page can link to it", () => {
    expect(renderGrid().map((card) => card.getAttribute("data-slug"))).toEqual([
      "baronial-badge",
      "bolt-boy",
      "crocodile-smile",
      "dead-of-night",
      "ghastly-gibus",
      "scotsmans-stove-pipe",
      "team-captain",
      "tin-pot",
    ]);
  });
});

describe("the Backpack Icon", () => {
  it("is loaded lazily and named for the Cosmetic it pictures", () => {
    const icon = within(cardFor(renderGrid(), "bolt-boy")).getByRole("img");
    expect(icon).toHaveAttribute("loading", "lazy");
    expect(icon).toHaveAccessibleName("Bolt Boy");
    expect(icon.getAttribute("src")).toContain("boltboy");
  });

  it("is loaded over https, whatever scheme Valve's schema gave it", () => {
    // Every icon in the catalogue arrives as plain http, which a page served over
    // https will not load at all.
    for (const card of renderGrid()) {
      expect(within(card).getByRole("img").getAttribute("src")).toMatch(/^https:\/\//);
    }
  });

  it("leaves a blank rather than a broken image when the Cosmetic has no icon", () => {
    const cosmetics = fixtureCosmetics().map((cosmetic) =>
      cosmetic.slug === "bolt-boy" ? { ...cosmetic, backpackIcon: null } : cosmetic,
    );
    const boltBoy = cardFor(renderGrid({ cosmetics }), "bolt-boy");
    expect(within(boltBoy).queryByRole("img")).toBeNull();
    expect(nameOn(boltBoy)).toBe("Bolt Boy");
  });
});

describe("a snapshot with no prices in it", () => {
  it("still shows every Cosmetic, and says nothing about price rather than calling it Unpriced", () => {
    // A Cosmetic with no price at all is a snapshot built without a price source,
    // which is not the same thing as the source having no price for it.
    const cosmetics = fixtureCosmetics().map((cosmetic) => ({ ...cosmetic, price: null }));
    const shown = renderGrid({ cosmetics, keyRate: null, basis: null });
    expect(shown).toHaveLength(8);
    expect(figuresOn(cardFor(shown, "team-captain"))).toEqual({
      "Trader Notation": "—",
      "Metal Value": "—",
      Dollars: "—",
    });
  });

  it("writes prices in Refined alone when the snapshot carries no Key Rate", () => {
    const shown = renderGrid({ keyRate: null, basis: null });
    expect(figuresOn(cardFor(shown, "team-captain"))).toEqual({
      "Trader Notation": "177 ref",
      "Metal Value": "177 ref",
      Dollars: "—",
    });
  });
});
