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

describe("the Cosmetic list", () => {
  it("shows every Cosmetic in the catalogue, in the catalogue's order", () => {
    const rows = renderList();
    expect(rows.map((row) => cellsOf(row)[1])).toEqual([
      "Bolt Boy",
      "Dead of Night",
      "Ghastly Gibus",
      "Team Captain",
      "Tin Pot",
    ]);
  });

  it("writes a price in Keys in Trader Notation, and the same price in Refined beside it", () => {
    const rows = renderList();
    const teamCaptain = rows[3];
    expect(teamCaptain).toBeDefined();
    expect(cellsOf(teamCaptain!)).toEqual(["", "Team Captain", "2 keys, 19.66 ref", "177 ref", "$5.60"]);
  });

  it("writes a price in Metal the same way in both columns", () => {
    const rows = renderList();
    expect(cellsOf(rows[0]!)).toEqual(["", "Bolt Boy", "1.44 ref", "1.44 ref", "$0.05"]);
  });

  it("writes the cheapest price there is rather than rounding it away", () => {
    const rows = renderList();
    expect(cellsOf(rows[2]!).slice(2)).toEqual(["0.11 ref", "0.11 ref", "$0.00"]);
  });

  it("says an Unpriced Cosmetic is Unpriced and shows no figures for it", () => {
    const rows = renderList();
    const deadOfNight = rows[1]!;
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
    expect(table).toHaveAttribute("aria-rowcount", "6");
    expect(rows.map((row) => row.getAttribute("aria-rowindex"))).toEqual(["2", "3", "4", "5", "6"]);
  });

  it("addresses each row by the Cosmetic's slug, so a later per-item page can link to it", () => {
    const rows = renderList();
    expect(rows.map((row) => row.getAttribute("data-slug"))).toEqual([
      "bolt-boy",
      "dead-of-night",
      "ghastly-gibus",
      "team-captain",
      "tin-pot",
    ]);
  });
});

describe("the Backpack Icon", () => {
  it("is loaded lazily and named for the Cosmetic it pictures", () => {
    const rows = renderList();
    const icon = within(rows[0]!).getByRole("img");
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
    const cosmetics = fixtureCosmetics();
    const first = cosmetics[0]!;
    const rows = renderList({ cosmetics: [{ ...first, backpackIcon: null }, ...cosmetics.slice(1)] });
    expect(within(rows[0]!).queryByRole("img")).toBeNull();
    expect(cellsOf(rows[0]!)[1]).toBe("Bolt Boy");
  });
});

describe("a snapshot with no prices in it", () => {
  it("still lists every Cosmetic, and says nothing about price rather than calling it Unpriced", () => {
    // A Cosmetic with no price at all is a snapshot built without a price source,
    // which is not the same thing as the source having no price for it.
    const cosmetics = fixtureCosmetics().map((cosmetic) => ({ ...cosmetic, price: null }));
    const rows = renderList({ cosmetics, keyRate: null, basis: null });
    expect(rows).toHaveLength(5);
    expect(cellsOf(rows[3]!)).toEqual(["", "Team Captain", "—", "—", "—"]);
  });

  it("writes prices in Refined alone when the snapshot carries no Key Rate", () => {
    const rows = renderList({ keyRate: null, basis: null });
    expect(cellsOf(rows[3]!)).toEqual(["", "Team Captain", "177 ref", "177 ref", "—"]);
  });
});
