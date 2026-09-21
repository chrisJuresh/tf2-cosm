/**
 * The Cosmetic modal: what a viewer gets when they open one, the four ways out
 * of it, and the link that opens it for them.
 *
 * Everything here goes through the page the way a viewer does — a click, a key,
 * an address with a slug on the end. Nothing asserts how the grid holds which
 * Cosmetic is open.
 *
 * The one thing it cannot ask is whether a drag across a name really selects
 * the name: jsdom neither paints nor hit-tests, so what it can be told is that
 * a click arriving with a selection standing opens nothing, and whether the
 * drag makes that selection in the first place is the end-to-end suite's to
 * answer.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
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
function cardControlFor(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

/** A card by the Cosmetic it is for, so adding one to the fixture moves nothing. */
function cardFor(slug: string): HTMLElement {
  const card = document.querySelector<HTMLElement>(`[data-slug="${slug}"]`);
  if (card === null) throw new Error(`no card for ${slug}`);
  return card;
}

/**
 * Select an element's text, the way dragging the mouse across it would. What the
 * viewer did with the mouse is not the point — what the card sees afterwards is
 * a standing selection and then a click, and that is what is set up here.
 */
function selectTextOf(element: Element): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  if (selection === null) throw new Error("no selection to make");
  selection.removeAllRanges();
  selection.addRange(range);
}

/** The modal, if one is open. Its name is the Cosmetic's, which is its heading. */
function modal(): HTMLElement | null {
  return screen.queryByRole("dialog");
}

function flatten(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The open Cosmetic's fields, as a viewer reads them: term to value. */
function panelFor(slug: string): Record<string, string> {
  const panel = document.getElementById(`cosmetic-detail-${slug}`);
  if (panel === null) throw new Error(`${slug} is not open`);
  const terms = within(panel).getAllByRole("term");
  const values = within(panel).getAllByRole("definition");
  return Object.fromEntries(terms.map((term, index) => [flatten(term), flatten(values[index]!)]));
}

/** Which Cosmetic the modal is showing, by the heading it is named after. */
function openCosmetic(): string | null {
  const open = modal();
  return open === null ? null : flatten(within(open).getByRole("heading"));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("opening and closing a Cosmetic", () => {
  it("shows no modal until a viewer asks for one", () => {
    renderGrid();
    expect(modal()).toBeNull();
    expect(cardControlFor("Team Captain")).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("opens over the page as a modal named after the Cosmetic", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Team Captain"));

    const open = modal()!;
    expect(open).toHaveAttribute("aria-modal", "true");
    expect(open).toHaveAccessibleName("Team Captain");
    expect(panelFor("team-captain")).toHaveProperty("Reference Variant");
  });

  it("opens on a click anywhere on the card, not only on the name", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardFor("team-captain"));
    expect(openCosmetic()).toBe("Team Captain");
  });

  it("opens nothing when the click is the end of a drag across the name", () => {
    renderGrid();

    // A viewer dragging across the name to copy it lets go over the card, and
    // the browser calls that a click. The click is fired rather than driven,
    // because what is being set up is the state the drag leaves behind.
    selectTextOf(cardControlFor("Team Captain"));
    fireEvent.click(cardControlFor("Team Captain"));
    expect(modal()).toBeNull();

    // A selection standing somewhere else is nothing to do with this card.
    fireEvent.click(cardControlFor("Tin Pot"));
    expect(openCosmetic()).toBe("Tin Pot");
  });

  it("closes on the click that lands on the space around it", async () => {
    // The point of the space: a viewer's hand is already off the card, and the
    // nearest thing to click is the way out.
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Team Captain"));

    await user.click(modal()!.parentElement!);
    expect(modal()).toBeNull();
  });

  it("stays open when the click lands on the modal itself rather than around it", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Team Captain"));

    await user.click(within(modal()!).getByRole("heading"));
    expect(openCosmetic()).toBe("Team Captain");
  });

  it("closes on its own Close button", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Bolt Boy"));

    await user.click(within(modal()!).getByRole("button", { name: "Close" }));
    expect(modal()).toBeNull();
  });

  it("opens from the keyboard, and closes on Escape", async () => {
    const user = userEvent.setup();
    renderGrid();
    cardControlFor("Team Captain").focus();

    await user.keyboard("{Enter}");
    expect(openCosmetic()).toBe("Team Captain");

    await user.keyboard("{Escape}");
    expect(modal()).toBeNull();
  });

  it("takes the focus on the way in, so Escape and Tab reach the modal rather than the grid", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Tin Pot"));
    expect(modal()).toHaveFocus();
  });

  it("gives the focus back to the card that opened it, whichever way it closed", async () => {
    const user = userEvent.setup();
    renderGrid();

    await user.click(cardControlFor("Tin Pot"));
    await user.keyboard("{Escape}");
    expect(cardControlFor("Tin Pot")).toHaveFocus();

    await user.click(cardControlFor("Tin Pot"));
    await user.click(within(modal()!).getByRole("button", { name: "Close" }));
    expect(cardControlFor("Tin Pot")).toHaveFocus();
  });

  it("keeps the Tab inside it, so the grid behind cannot be walked blind", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Tin Pot"));

    const open = modal()!;
    const reachable = within(open).getAllByRole("button");
    const last = reachable.at(-1)!;
    last.focus();
    await user.tab();
    expect(open.contains(document.activeElement)).toBe(true);

    await user.tab({ shift: true });
    expect(open.contains(document.activeElement)).toBe(true);
  });

  it("stops the page behind it scrolling, and lets it scroll again once closed", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Tin Pot"));
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });

  it("shows one Cosmetic at a time, so opening another replaces the first", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Bolt Boy"));
    expect(openCosmetic()).toBe("Bolt Boy");

    await user.keyboard("{Escape}");
    await user.click(cardControlFor("Tin Pot"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(openCosmetic()).toBe("Tin Pot");
  });
});

describe("what an open Cosmetic says", () => {
  it("gives a Cosmetic priced in Keys its spread in Trader Notation, its variant, its date and its Classes", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Team Captain"));
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
    await user.click(cardControlFor("Bolt Boy"));
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
    await user.click(cardControlFor("Dead of Night"));
    expect(panelFor("dead-of-night")).toEqual({
      Price: "Unpriced. The price source lists no entry for it.",
      Classes: "Spy",
    });
  });

  it("names the defindexes folded into a Cosmetic, and says nothing when there are none", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Ghastly Gibus"));
    expect(panelFor("ghastly-gibus")).toMatchObject({
      Aliases: "defindex 104",
      Classes: "All nine Classes",
    });

    await user.keyboard("{Escape}");
    await user.click(cardControlFor("Tin Pot"));
    expect(panelFor("tin-pot")).not.toHaveProperty("Aliases");
  });

  it("carries the exact timestamp alongside the date it rounds to", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Tin Pot"));
    const panel = document.getElementById("cosmetic-detail-tin-pot")!;
    expect(panel.querySelector("time")).toHaveAttribute("datetime", "2026-09-04T05:33:20.000Z");
  });

  it("shows no price fields at all when the snapshot was built without a price source", async () => {
    const user = userEvent.setup();
    const cosmetics = fixtureCosmetics().map((cosmetic) => ({ ...cosmetic, price: null }));
    renderGrid({ cosmetics, keyRate: null, basis: null });
    await user.click(cardControlFor("Team Captain"));
    expect(panelFor("team-captain")).toEqual({ Classes: "Soldier and Demoman" });
  });
});

describe("linking to a Cosmetic", () => {
  it("puts the open Cosmetic's slug in the address, and takes it out again when it closes", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Tin Pot"));
    expect(window.location.hash).toBe("#tin-pot");

    await user.keyboard("{Escape}");
    expect(window.location.hash).toBe("");
  });

  it("opens the Cosmetic a link names, and scrolls the grid to the card behind it", () => {
    const scrollTo = vi.fn();
    vi.spyOn(Element.prototype, "scrollTo").mockImplementation(scrollTo);
    window.history.replaceState(null, "", "/#tin-pot");

    renderGrid();

    expect(openCosmetic()).toBe("Tin Pot");
    expect(modal()).toHaveFocus();
    // Tin Pot is the last of the eight, so reaching it is a scroll rather than a
    // no-op at the top of the grid — and closing the modal has to land on it.
    expect(scrollTo).toHaveBeenCalled();
    expect(scrollTo.mock.calls.at(-1)?.[0]).toMatchObject({ top: expect.any(Number) });
    vi.restoreAllMocks();
  });

  it("ignores a hash that names no Cosmetic rather than opening the wrong one", () => {
    window.history.replaceState(null, "", "/#not-a-cosmetic");
    renderGrid();
    expect(modal()).toBeNull();
  });

  it("follows the address changing under it, which is what a link on the page does", async () => {
    renderGrid();
    window.history.replaceState(null, "", "/#bolt-boy");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("dialog", { name: "Bolt Boy" })).toBeInTheDocument();
  });

  it("closes the open Cosmetic when the address loses it, rather than saying two things at once", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Bolt Boy"));

    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await vi.waitFor(() => expect(modal()).toBeNull());
  });
});

describe("what the grid does while a Cosmetic is open", () => {
  it("leaves the cards exactly as they were, rather than making room for a panel", async () => {
    const user = userEvent.setup();
    renderGrid();
    const before = [...document.querySelectorAll<HTMLElement>("[data-slug]")].map((card) => card.dataset.slug);

    await user.click(cardControlFor("Ghastly Gibus"));

    const after = [...document.querySelectorAll<HTMLElement>("[data-slug]")].map((card) => card.dataset.slug);
    expect(after).toEqual(before);
    // The panel is over the page, not in the grid: no card holds it.
    const panel = document.getElementById("cosmetic-detail-ghastly-gibus")!;
    expect(panel.closest("[data-slug]")).toBeNull();
  });

  it("leaves every card counted as the Cosmetic it is", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(cardControlFor("Ghastly Gibus"));

    const card = document.querySelector<HTMLElement>('[data-slug="ghastly-gibus"]')!;
    expect(card).toHaveAttribute("aria-posinset", "5");
    expect(card).toHaveAttribute("aria-setsize", String(fixtureCosmetics().length));
  });
});
