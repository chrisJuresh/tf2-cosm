/**
 * What a viewer actually sees in the list, driven by the fixture catalogue: the
 * rows, their order, and the figures as they are written on screen. Nothing in
 * here knows how the list is built.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fixtureBasis, fixtureCosmetics, fixtureKeyRate } from "./fixtures.ts";

import { CosmeticList } from "@/components/cosmetic-list";

function renderList(overrides: Partial<Parameters<typeof CosmeticList>[0]> = {}) {
  render(
    <CosmeticList
      cosmetics={fixtureCosmetics()}
      keyRate={fixtureKeyRate()}
      basis={fixtureBasis()}
      {...overrides}
    />,
  );
  const [, body] = screen.getAllByRole("rowgroup");
  if (body === undefined) throw new Error("the list should have a header and a body");
  return within(body).getAllByRole("row");
}

/** The five figures a row shows, in the order the columns run. */
function cellsOf(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent?.trim() ?? "");
}

/** A row by the Cosmetic it is for, so adding one to the fixture moves nothing. */
function rowFor(rows: readonly HTMLElement[], slug: string): HTMLElement {
  const row = rows.find((one) => one.getAttribute("data-slug") === slug);
  if (row === undefined) throw new Error(`no row for ${slug}`);
  return row;
}

describe("the Cosmetic list", () => {
  it("shows every Cosmetic in the catalogue, in the catalogue's order", () => {
    const rows = renderList();
    expect(rows.map((row) => cellsOf(row)[1])).toEqual([
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
    const rows = renderList();
    const teamCaptain = rowFor(rows, "team-captain");
    expect(cellsOf(teamCaptain)).toEqual(["", "Team Captain", "2 keys, 19.66 ref", "177 ref", "$5.15"]);
  });

  it("writes a price in Metal the same way in both columns", () => {
    const rows = renderList();
    expect(cellsOf(rowFor(rows, "bolt-boy"))).toEqual(["", "Bolt Boy", "1.44 ref", "1.44 ref", "$0.04"]);
  });

  it("writes the cheapest price there is rather than rounding it away", () => {
    const rows = renderList();
    expect(cellsOf(rowFor(rows, "ghastly-gibus")).slice(2)).toEqual(["0.11 ref", "0.11 ref", "$0.00"]);
  });

  it("writes a Blanket Price as about, since the source quotes it for every cheap hat", () => {
    // The Scotsman's Stove Pipe is priced at one Random Craft Hat, which is a
    // figure backpack.tf lays over the whole class rather than one it observed
    // for this Cosmetic (ADR-0004).
    const rows = renderList();
    expect(cellsOf(rowFor(rows, "scotsman-s-stove-pipe")).slice(2)).toEqual([
      "≈1.33 ref",
      "≈1.33 ref",
      "≈$0.04",
    ]);
    // The Baronial Badge's blanket figure was passed over, so its Genuine price
    // is written plainly.
    expect(cellsOf(rowFor(rows, "baronial-badge")).slice(2)).toEqual(["6.11 ref", "6.11 ref", "$0.18"]);
  });

  it("says an Unpriced Cosmetic is Unpriced and shows no figures for it", () => {
    const rows = renderList();
    const deadOfNight = rowFor(rows, "dead-of-night");
    expect(within(deadOfNight).getByText("Unpriced")).toBeInTheDocument();
    expect(deadOfNight.textContent).not.toContain("$");
  });

  it("names every column it shows", () => {
    renderList();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent?.trim())).toEqual([
      "Icon",
      "Cosmetic",
      "Trader Notation",
      "Metal Value",
      "Dollars",
    ]);
  });

  it("tells a screen reader how many rows there are, counting the header among them", () => {
    // Only a screenful of rows is ever in the DOM, so the count and each row's
    // index have to be stated rather than counted off the page — and the last
    // Cosmetic must not come out as "row 1,834 of 1,833".
    const rows = renderList();
    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("aria-rowcount", "9");
    expect(rows.map((row) => row.getAttribute("aria-rowindex"))).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
  });

  it("addresses each row by the Cosmetic's slug, so a later per-item page can link to it", () => {
    const rows = renderList();
    expect(rows.map((row) => row.getAttribute("data-slug"))).toEqual([
      "baronial-badge",
      "bolt-boy",
      "crocodile-smile",
      "dead-of-night",
      "ghastly-gibus",
      "scotsman-s-stove-pipe",
      "team-captain",
      "tin-pot",
    ]);
  });
});

describe("the Backpack Icon", () => {
  it("is loaded lazily and named for the Cosmetic it pictures", () => {
    const rows = renderList();
    const icon = within(rowFor(rows, "bolt-boy")).getByRole("img");
    expect(icon).toHaveAttribute("loading", "lazy");
    expect(icon).toHaveAccessibleName("Bolt Boy");
    expect(icon.getAttribute("src")).toContain("boltboy");
  });

  it("is loaded over https, whatever scheme Valve's schema gave it", () => {
    // Every icon in the catalogue arrives as plain http, which a page served over
    // https will not load at all.
    const rows = renderList();
    for (const row of rows) {
      expect(within(row).getByRole("img").getAttribute("src")).toMatch(/^https:\/\//);
    }
  });

  it("leaves a blank rather than a broken image when the Cosmetic has no icon", () => {
    const cosmetics = fixtureCosmetics().map((cosmetic) =>
      cosmetic.slug === "bolt-boy" ? { ...cosmetic, backpackIcon: null } : cosmetic,
    );
    const boltBoy = rowFor(renderList({ cosmetics }), "bolt-boy");
    expect(within(boltBoy).queryByRole("img")).toBeNull();
    expect(cellsOf(boltBoy)[1]).toBe("Bolt Boy");
  });
});

describe("a snapshot with no prices in it", () => {
  it("still lists every Cosmetic, and says nothing about price rather than calling it Unpriced", () => {
    // A Cosmetic with no price at all is a snapshot built without a price source,
    // which is not the same thing as the source having no price for it.
    const cosmetics = fixtureCosmetics().map((cosmetic) => ({ ...cosmetic, price: null }));
    const rows = renderList({ cosmetics, keyRate: null, basis: null });
    expect(rows).toHaveLength(8);
    expect(cellsOf(rowFor(rows, "team-captain"))).toEqual(["", "Team Captain", "—", "—", "—"]);
  });

  it("writes prices in Refined alone when the snapshot carries no Key Rate", () => {
    const rows = renderList({ keyRate: null, basis: null });
    expect(cellsOf(rowFor(rows, "team-captain"))).toEqual(["", "Team Captain", "177 ref", "177 ref", "—"]);
  });
});
