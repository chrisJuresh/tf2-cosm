/**
 * The expanding row: what a viewer gets when they open one, how they open and
 * close it, and the link that opens it for them.
 *
 * Everything here goes through the page the way a viewer does — a click, a key,
 * an address with a slug on the end. Nothing asserts how the list holds which
 * row is open.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fixtureBasis, fixtureCosmetics, fixtureKeyRate } from "./fixtures.ts";

import { CosmeticList } from "@/components/cosmetic-list";

function renderList(overrides: Partial<Parameters<typeof CosmeticList>[0]> = {}) {
  render(<CosmeticList cosmetics={fixtureCosmetics()} keyRate={fixtureKeyRate()} basis={fixtureBasis()} {...overrides} />);
}

/** The control a viewer clicks or tabs to, which is the Cosmetic's own name. */
function toggleFor(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function rowFor(slug: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[role="row"][data-slug="${slug}"]`);
  if (row === null) throw new Error(`no row for ${slug}`);
  return row;
}

function flatten(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The expanded panel's fields, as a viewer reads them: term to value. */
function panelFor(slug: string): Record<string, string> {
  const panel = document.getElementById(`cosmetic-detail-${slug}`);
  if (panel === null) throw new Error(`${slug} is not expanded`);
  const terms = within(panel).getAllByRole("term");
  const values = within(panel).getAllByRole("definition");
  return Object.fromEntries(terms.map((term, index) => [flatten(term), flatten(values[index]!)]));
}

function expandedSlugs(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="row"][data-slug]')]
    .filter((row) => within(row).getByRole("button").getAttribute("aria-expanded") === "true")
    .map((row) => row.dataset.slug ?? "");
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("opening and closing a row", () => {
  it("shows no panel until a viewer asks for one", () => {
    renderList();
    expect(document.getElementById("cosmetic-detail-team-captain")).toBeNull();
    expect(toggleFor("Team Captain")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on a click anywhere in the row, and closes on the next one", async () => {
    const user = userEvent.setup();
    renderList();
    // The row itself, not its control: a viewer aims at the line, not the name.
    await user.click(within(rowFor("team-captain")).getByText("2 keys, 19.66 ref"));
    expect(panelFor("team-captain")).toHaveProperty("Reference Variant");

    await user.click(within(rowFor("team-captain")).getByText("2 keys, 19.66 ref"));
    expect(document.getElementById("cosmetic-detail-team-captain")).toBeNull();
  });

  it("opens and closes from the keyboard, on the control that says whether it is open", async () => {
    const user = userEvent.setup();
    renderList();
    toggleFor("Team Captain").focus();

    await user.keyboard("{Enter}");
    expect(toggleFor("Team Captain")).toHaveAttribute("aria-expanded", "true");

    await user.keyboard(" ");
    expect(toggleFor("Team Captain")).toHaveAttribute("aria-expanded", "false");
  });

  it("hands the focus to the row's control even when the click landed somewhere else in the row", async () => {
    // Otherwise the viewer who just opened a row has the focus on the body and
    // nothing to press Escape on.
    const user = userEvent.setup();
    renderList();
    await user.click(within(rowFor("tin-pot")).getByRole("img"));
    expect(toggleFor("Tin Pot")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(toggleFor("Tin Pot")).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and leaves the focus on the control that opened it", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Tin Pot"));
    expect(toggleFor("Tin Pot")).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(toggleFor("Tin Pot")).toHaveAttribute("aria-expanded", "false");
    expect(toggleFor("Tin Pot")).toHaveFocus();
  });

  it("points the control at the panel it opens, so a screen reader can follow it", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Bolt Boy"));
    const panel = document.getElementById("cosmetic-detail-bolt-boy");
    expect(toggleFor("Bolt Boy")).toHaveAttribute("aria-controls", "cosmetic-detail-bolt-boy");
    expect(panel).toBeInTheDocument();
  });

  it("keeps only one row open, so opening another closes the first", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Bolt Boy"));
    expect(expandedSlugs()).toEqual(["bolt-boy"]);

    await user.click(toggleFor("Tin Pot"));
    expect(expandedSlugs()).toEqual(["tin-pot"]);
  });
});

describe("what an open row says", () => {
  it("gives a Cosmetic priced in Keys its spread in Trader Notation, its variant, its date and its Classes", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Team Captain"));
    expect(panelFor("team-captain")).toEqual({
      "Price Spread": "Low 2 keys · Mid 2 keys, 19.66 ref · High 2 keys, 39.33 ref",
      "Reference Variant": "Unique, craftable",
      "Last updated": "7 September 2026",
      Classes: "Soldier and Demoman",
    });
  });

  it("gives a Cosmetic priced in Metal a spread in Refined alone", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Bolt Boy"));
    expect(panelFor("bolt-boy")).toEqual({
      "Price Spread": "Low 1.33 ref · Mid 1.44 ref · High 1.55 ref",
      "Reference Variant": "Unique, craftable",
      "Last updated": "8 September 2026",
      Classes: "Scout",
    });
  });

  it("says why an Unpriced Cosmetic has no figures, instead of showing a spread of nothing", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Dead of Night"));
    expect(panelFor("dead-of-night")).toEqual({
      Price: "Unpriced. The price source lists no entry for it.",
      Classes: "Spy",
    });
  });

  it("names the defindexes folded into a Cosmetic, and says nothing when there are none", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Ghastly Gibus"));
    expect(panelFor("ghastly-gibus")).toMatchObject({
      Aliases: "defindex 104",
      Classes: "All nine Classes",
    });

    await user.click(toggleFor("Tin Pot"));
    expect(panelFor("tin-pot")).not.toHaveProperty("Aliases");
  });

  it("carries the exact timestamp alongside the date it rounds to", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Tin Pot"));
    const panel = document.getElementById("cosmetic-detail-tin-pot")!;
    expect(panel.querySelector("time")).toHaveAttribute("datetime", "2026-09-04T05:33:20.000Z");
  });

  it("shows no price fields at all when the snapshot was built without a price source", async () => {
    const user = userEvent.setup();
    const cosmetics = fixtureCosmetics().map((cosmetic) => ({ ...cosmetic, price: null }));
    renderList({ cosmetics, keyRate: null, basis: null });
    await user.click(toggleFor("Team Captain"));
    expect(panelFor("team-captain")).toEqual({ Classes: "Soldier and Demoman" });
  });
});

describe("linking to a Cosmetic", () => {
  it("puts the open Cosmetic's slug in the address, and takes it out again when the row closes", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Tin Pot"));
    expect(window.location.hash).toBe("#tin-pot");

    await user.click(toggleFor("Tin Pot"));
    expect(window.location.hash).toBe("");
  });

  it("opens the Cosmetic a link names, scrolls to it and puts the focus on it", () => {
    const scrollTo = vi.fn();
    vi.spyOn(Element.prototype, "scrollTo").mockImplementation(scrollTo);
    window.history.replaceState(null, "", "/#tin-pot");

    renderList();

    expect(expandedSlugs()).toEqual(["tin-pot"]);
    expect(toggleFor("Tin Pot")).toHaveFocus();
    // Tin Pot is the last of the five, so reaching it is a scroll rather than a
    // no-op at the top of the list.
    expect(scrollTo).toHaveBeenCalled();
    expect(scrollTo.mock.calls.at(-1)?.[0]).toMatchObject({ top: expect.any(Number) });
    vi.restoreAllMocks();
  });

  it("ignores a hash that names no Cosmetic rather than opening the wrong row", () => {
    window.history.replaceState(null, "", "/#not-a-cosmetic");
    renderList();
    expect(expandedSlugs()).toEqual([]);
  });

  it("follows the address changing under it, which is what a link on the page does", async () => {
    renderList();
    window.history.replaceState(null, "", "/#bolt-boy");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("button", { name: "Bolt Boy", expanded: true })).toBeInTheDocument();
  });

  it("closes the open row when the address loses its Cosmetic, rather than saying two things at once", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Bolt Boy"));

    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("button", { name: "Bolt Boy", expanded: false })).toBeInTheDocument();
    expect(expandedSlugs()).toEqual([]);
  });
});

describe("the table an open row leaves behind", () => {
  it("counts the open row's panel as the row it is, and shifts every row below it down", async () => {
    // A panel spanning the columns is a row of its own; folding it into the
    // summary row would leave that row with six cells under five headings.
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Ghastly Gibus"));

    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "10");
    const [, body] = screen.getAllByRole("rowgroup");
    expect(within(body!).getAllByRole("row").map((row) => row.getAttribute("aria-rowindex"))).toEqual([
      "2", // Baronial Badge
      "3", // Bolt Boy
      "4", // Crocodile Smile
      "5", // Dead of Night
      "6", // Ghastly Gibus
      "7", // its panel
      "8", // Scotsman's Stove Pipe
      "9", // Team Captain
      "10", // Tin Pot
    ]);
  });

  it("gives the summary row its five cells and the panel one across all of them", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(toggleFor("Ghastly Gibus"));

    expect(within(rowFor("ghastly-gibus")).getAllByRole("cell")).toHaveLength(5);
    const panelCell = document.getElementById("cosmetic-detail-ghastly-gibus")?.closest('[role="cell"]');
    expect(panelCell).toHaveAttribute("aria-colspan", "5");
  });
});
