/**
 * The browsing controls as a viewer meets them: the Class View picker, the
 * toggles, the slot filter, the sort and the search, what the list does as each
 * is worked, and what the browser remembers of them next visit.
 *
 * The rules themselves are covered in `browsing.test.ts`, driven directly. What
 * is asserted here is the surface: that each control is labelled, reachable from
 * the keyboard, and wired to the rule it claims to be.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { fixtureBasis, fixtureCosmetics, fixtureKeyRate } from "./fixtures.ts";

import { CatalogueBrowser } from "@/components/catalogue-browser";
import { CONTROLS_STORAGE_KEY } from "@/browsing/storage";

afterEach(() => {
  localStorage.clear();
});

function renderBrowser() {
  render(<CatalogueBrowser cosmetics={fixtureCosmetics()} keyRate={fixtureKeyRate()} basis={fixtureBasis()} />);
  return userEvent.setup();
}

/** The Cosmetic names on screen, in the order they are listed. */
function namesShown(): string[] {
  const [, body] = screen.getAllByRole("rowgroup");
  if (body === undefined) throw new Error("the list should have a header and a body");
  return within(body)
    .queryAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent?.trim() ?? "");
}

const CLASS_PICKER = { name: "Class" };
const SLOT_PICKER = { name: "Slot" };
const SORT_PICKER = { name: "Sort by" };
const SEARCH_BOX = { name: "Search by name" };
const HIDE_ALL_CLASS = { name: "Hide All-Class Cosmetics" };
const HIDE_UNPRICED = { name: "Hide Unpriced" };

describe("the Class View picker", () => {
  it("starts on the whole catalogue", async () => {
    renderBrowser();
    expect(screen.getByRole("combobox", CLASS_PICKER)).toHaveValue("");
    await waitFor(() => expect(namesShown()).toHaveLength(8));
  });

  it("narrows to a Class's own items, the Multi-Class items it wears and the All-Class items", async () => {
    const user = renderBrowser();
    await user.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "soldier");
    expect(namesShown().toSorted()).toEqual(["Ghastly Gibus", "Team Captain", "Tin Pot"]);
  });

  it("leaves out another Class's Class-Exclusive items", async () => {
    const user = renderBrowser();
    await user.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "scout");
    expect(namesShown()).not.toContain("Tin Pot");
  });

  it("offers all nine Classes and a way back to the whole catalogue", () => {
    renderBrowser();
    const options = within(screen.getByRole("combobox", CLASS_PICKER))
      .getAllByRole("option")
      .map((option) => option.textContent?.trim());
    expect(options).toEqual([
      "Every Class",
      "Scout",
      "Soldier",
      "Pyro",
      "Demoman",
      "Heavy",
      "Engineer",
      "Medic",
      "Sniper",
      "Spy",
    ]);
  });
});

describe("the hide All-Class toggle", () => {
  it("drops the All-Class items from a Class View but keeps the Multi-Class ones", async () => {
    const user = renderBrowser();
    await user.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "soldier");
    await user.click(screen.getByRole("checkbox", HIDE_ALL_CLASS));
    expect(namesShown().toSorted()).toEqual(["Team Captain", "Tin Pot"]);
  });

  it("cannot be worked outside a Class View, where it has nothing to focus", async () => {
    const user = renderBrowser();
    await waitFor(() => expect(screen.getByRole("checkbox", HIDE_ALL_CLASS)).toBeDisabled());
    await user.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "soldier");
    expect(screen.getByRole("checkbox", HIDE_ALL_CLASS)).toBeEnabled();
  });
});

describe("the slot filter", () => {
  it("shows only miscs", async () => {
    const user = renderBrowser();
    await user.selectOptions(screen.getByRole("combobox", SLOT_PICKER), "misc");
    expect(namesShown()).toEqual(["Baronial Badge", "Dead of Night"]);
  });

  it("shows only heads", async () => {
    const user = renderBrowser();
    await user.selectOptions(screen.getByRole("combobox", SLOT_PICKER), "head");
    expect(namesShown()).not.toContain("Dead of Night");
    expect(namesShown()).toHaveLength(6);
  });
});

describe("the hide Unpriced toggle", () => {
  it("drops the Cosmetic with no price", async () => {
    const user = renderBrowser();
    await user.click(screen.getByRole("checkbox", HIDE_UNPRICED));
    expect(namesShown()).not.toContain("Dead of Night");
  });
});

describe("an Unpriced row", () => {
  it("says why there is no price rather than leaving a blank", () => {
    renderBrowser();
    const row = screen.getAllByRole("row").find((candidate) => candidate.dataset["slug"] === "dead-of-night");
    expect(row).toBeDefined();
    expect(row!.textContent).toContain("Unpriced");
    // The fixture's Dead of Night is missing from the price source's list.
    expect(row!.textContent).toContain("not listed");
  });
});

describe("the sort", () => {
  it("starts on the highest Metal Value", async () => {
    renderBrowser();
    await waitFor(() => expect(namesShown()[0]).toBe("Team Captain"));
  });

  it("turns round to the lowest first", async () => {
    const user = renderBrowser();
    await user.selectOptions(screen.getByRole("combobox", SORT_PICKER), "metal-value-low");
    expect(namesShown()[0]).toBe("Ghastly Gibus");
  });

  it("sorts by name", async () => {
    const user = renderBrowser();
    await user.selectOptions(screen.getByRole("combobox", SORT_PICKER), "name");
    expect(namesShown()).toEqual([
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
});

describe("the name search", () => {
  it("narrows the list as the name is typed, letter by letter", async () => {
    const user = renderBrowser();
    const search = screen.getByRole("searchbox", SEARCH_BOX);
    await user.type(search, "t");
    expect(namesShown().length).toBeGreaterThan(1);
    await user.type(search, "in ");
    expect(namesShown()).toEqual(["Tin Pot"]);
  });

  it("says so plainly when nothing matches", async () => {
    const user = renderBrowser();
    await user.type(screen.getByRole("searchbox", SEARCH_BOX), "australium");
    expect(namesShown()).toEqual([]);
    expect(screen.getByText(/no cosmetic/i)).toBeInTheDocument();
  });

  it("counts what is left against the whole catalogue", async () => {
    const user = renderBrowser();
    expect(screen.getByRole("status")).toHaveTextContent("8 Cosmetics");
    await user.type(screen.getByRole("searchbox", SEARCH_BOX), "bolt");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 8 Cosmetics");
  });
});

describe("what the browser remembers", () => {
  it("opens where the last visit left off", async () => {
    const first = renderBrowser();
    await first.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "soldier");
    await first.selectOptions(screen.getByRole("combobox", SORT_PICKER), "name");
    await first.click(screen.getByRole("checkbox", HIDE_ALL_CLASS));
    await waitFor(() => expect(localStorage.getItem(CONTROLS_STORAGE_KEY)).toContain("soldier"));

    cleanup();
    renderBrowser();

    await waitFor(() => expect(screen.getByRole("combobox", CLASS_PICKER)).toHaveValue("soldier"));
    expect(screen.getByRole("combobox", SORT_PICKER)).toHaveValue("name");
    expect(screen.getByRole("checkbox", HIDE_ALL_CLASS)).toBeChecked();
    expect(namesShown()).toEqual(["Team Captain", "Tin Pot"]);
  });

  it("does not reopen into a search nobody remembers typing", async () => {
    const first = renderBrowser();
    await first.type(screen.getByRole("searchbox", SEARCH_BOX), "gibus");
    await waitFor(() => expect(namesShown()).toEqual(["Ghastly Gibus"]));

    cleanup();
    renderBrowser();
    await waitFor(() => expect(namesShown()).toHaveLength(8));
    expect(screen.getByRole("searchbox", SEARCH_BOX)).toHaveValue("");
  });

  it("returns to the defaults once the storage is cleared", async () => {
    const first = renderBrowser();
    await first.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "medic");
    await waitFor(() => expect(localStorage.getItem(CONTROLS_STORAGE_KEY)).toContain("medic"));

    localStorage.clear();
    cleanup();
    renderBrowser();

    await waitFor(() => expect(namesShown()).toHaveLength(8));
    expect(screen.getByRole("combobox", CLASS_PICKER)).toHaveValue("");
  });
});

describe("working the controls from the keyboard", () => {
  it("reaches every one of them by tabbing, in the order they are read", async () => {
    const user = renderBrowser();
    // In a Class View, where all six are live.
    await user.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "soldier");
    (document.activeElement as HTMLElement | null)?.blur();
    const inTabOrder = [
      screen.getByRole("searchbox", SEARCH_BOX),
      screen.getByRole("combobox", CLASS_PICKER),
      screen.getByRole("combobox", SLOT_PICKER),
      screen.getByRole("combobox", SORT_PICKER),
      screen.getByRole("checkbox", HIDE_ALL_CLASS),
      screen.getByRole("checkbox", HIDE_UNPRICED),
    ];
    for (const control of inTabOrder) {
      await user.tab();
      expect(control).toHaveFocus();
    }
  });

  it("works a toggle with the space bar, the way a checkbox is worked", async () => {
    const user = renderBrowser();
    const hideUnpriced = screen.getByRole("checkbox", HIDE_UNPRICED);
    hideUnpriced.focus();
    await user.keyboard(" ");
    expect(hideUnpriced).toBeChecked();
    expect(namesShown()).not.toContain("Dead of Night");
  });
});
