/**
 * The expanding card: what a viewer gets when they open one, how they open and
 * close it, and the link that opens it for them.
 *
 * Everything here goes through the page the way a viewer does — a click, a key,
 * an address with a slug on the end. Nothing asserts how the grid holds which
 * card is open.
 *
 * The one thing it cannot ask is whether a click anywhere on the card opens it.
 * The whole card is the control, by way of a pseudo-element stretched over it,
 * and a pseudo-element is painted rather than in the DOM — jsdom neither paints
 * nor hit-tests, so that one is the end-to-end suite's to answer.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fixtureBasis, fixtureCosmetics, fixtureKeyRate } from "./fixtures.ts";

import { CosmeticGrid } from "@/components/cosmetic-grid";
import { EMPTY_MANIFEST } from "@/renders/manifest";

function renderGrid(overrides: Partial<Parameters<typeof CosmeticGrid>[0]> = {}) {
  render(
    <CosmeticGrid
      cosmetics={fixtureCosmetics()}
      // The panel is the same panel with or without a picture in it; the Style
      // switcher and the Team toggle have a suite of their own in
      // `worn-renders.test.tsx`.
      manifest={EMPTY_MANIFEST}
      classView={null}
      keyRate={fixtureKeyRate()}
      basis={fixtureBasis()}
      {...overrides}
    />,
  );
}

/** The control a viewer clicks or tabs to, which is the Cosmetic's own name. */
function toggleFor(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function cardFor(slug: string): HTMLElement {
  const card = document.querySelector<HTMLElement>(`[data-slug="${slug}"]`);
  if (card === null) throw new Error(`no card for ${slug}`);
  return card;
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
  return [...document.querySelectorAll<HTMLElement>("[data-slug]")]
    .filter((card) => within(card).getByRole("button").getAttribute("aria-expanded") === "true")
    .map((card) => card.dataset.slug ?? "");
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("opening and closing a card", () => {
  it("shows no panel until a viewer asks for one", () => {
    renderGrid();
    expect(document.getElementById("cosmetic-detail-team-captain")).toBeNull();
    expect(toggleFor("Team Captain")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on a click, and closes on the next one", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(toggleFor("Team Captain"));
    expect(panelFor("team-captain")).toHaveProperty("Reference Variant");

    await user.click(toggleFor("Team Captain"));
    expect(document.getElementById("cosmetic-detail-team-captain")).toBeNull();
  });

  it("opens and closes from the keyboard, on the control that says whether it is open", async () => {
    const user = userEvent.setup();
    renderGrid();
    toggleFor("Team Captain").focus();

    await user.keyboard("{Enter}");
    expect(toggleFor("Team Captain")).toHaveAttribute("aria-expanded", "true");

    await user.keyboard(" ");
    expect(toggleFor("Team Captain")).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and leaves the focus on the control that opened it", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(toggleFor("Tin Pot"));
    expect(toggleFor("Tin Pot")).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(toggleFor("Tin Pot")).toHaveAttribute("aria-expanded", "false");
    expect(toggleFor("Tin Pot")).toHaveFocus();
  });

  it("points the control at the panel it opens, so a screen reader can follow it", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(toggleFor("Bolt Boy"));
    const panel = document.getElementById("cosmetic-detail-bolt-boy");
    expect(toggleFor("Bolt Boy")).toHaveAttribute("aria-controls", "cosmetic-detail-bolt-boy");
    expect(panel).toBeInTheDocument();
  });

  it("keeps only one card open, so opening another closes the first", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(toggleFor("Bolt Boy"));
    expect(expandedSlugs()).toEqual(["bolt-boy"]);

    await user.click(toggleFor("Tin Pot"));
    expect(expandedSlugs()).toEqual(["tin-pot"]);
  });
});

describe("what an open card says", () => {
  it("gives a Cosmetic priced in Keys its spread in Trader Notation, its variant, its date and its Classes", async () => {
    const user = userEvent.setup();
    renderGrid();
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
    renderGrid();
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
    renderGrid();
    await user.click(toggleFor("Dead of Night"));
    expect(panelFor("dead-of-night")).toEqual({
      Price: "Unpriced. The price source lists no entry for it.",
      Classes: "Spy",
    });
  });

  it("names the defindexes folded into a Cosmetic, and says nothing when there are none", async () => {
    const user = userEvent.setup();
    renderGrid();
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
    renderGrid();
    await user.click(toggleFor("Tin Pot"));
    const panel = document.getElementById("cosmetic-detail-tin-pot")!;
    expect(panel.querySelector("time")).toHaveAttribute("datetime", "2026-09-04T05:33:20.000Z");
  });

  it("shows no price fields at all when the snapshot was built without a price source", async () => {
    const user = userEvent.setup();
    const cosmetics = fixtureCosmetics().map((cosmetic) => ({ ...cosmetic, price: null }));
    renderGrid({ cosmetics, keyRate: null, basis: null });
    await user.click(toggleFor("Team Captain"));
    expect(panelFor("team-captain")).toEqual({ Classes: "Soldier and Demoman" });
  });
});

describe("linking to a Cosmetic", () => {
  it("puts the open Cosmetic's slug in the address, and takes it out again when the row closes", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(toggleFor("Tin Pot"));
    expect(window.location.hash).toBe("#tin-pot");

    await user.click(toggleFor("Tin Pot"));
    expect(window.location.hash).toBe("");
  });

  it("opens the Cosmetic a link names, scrolls to it and puts the focus on it", () => {
    const scrollTo = vi.fn();
    vi.spyOn(Element.prototype, "scrollTo").mockImplementation(scrollTo);
    window.history.replaceState(null, "", "/#tin-pot");

    renderGrid();

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
    renderGrid();
    expect(expandedSlugs()).toEqual([]);
  });

  it("follows the address changing under it, which is what a link on the page does", async () => {
    renderGrid();
    window.history.replaceState(null, "", "/#bolt-boy");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("button", { name: "Bolt Boy", expanded: true })).toBeInTheDocument();
  });

  it("closes the open row when the address loses its Cosmetic, rather than saying two things at once", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(toggleFor("Bolt Boy"));

    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("button", { name: "Bolt Boy", expanded: false })).toBeInTheDocument();
    expect(expandedSlugs()).toEqual([]);
  });
});

describe("where an open card puts its panel", () => {
  it("hangs it under the row of cards the open one is in, rather than inside the card", async () => {
    // A card is one of a row of equal boxes and the panel is wider than any of
    // them, so the panel is an item of its own alongside them — the same shape
    // the row list used, where it was a row of its own rather than a sixth cell.
    const user = userEvent.setup();
    renderGrid();
    await user.click(toggleFor("Ghastly Gibus"));

    const card = cardFor("ghastly-gibus");
    const panel = document.getElementById("cosmetic-detail-ghastly-gibus")!;
    const item = panel.closest('[role="listitem"]')!;
    expect(item).not.toBe(card);
    expect(card.contains(panel)).toBe(false);
    expect(item.parentElement).toBe(card.parentElement);
  });

  it("leaves the open card counted as the Cosmetic it is, and the panel out of the count", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(toggleFor("Ghastly Gibus"));

    expect(cardFor("ghastly-gibus")).toHaveAttribute("aria-posinset", "5");
    const item = document.getElementById("cosmetic-detail-ghastly-gibus")!.closest('[role="listitem"]')!;
    expect(item).not.toHaveAttribute("aria-posinset");
  });
});
