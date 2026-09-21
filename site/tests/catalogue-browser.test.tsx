/**
 * The browsing controls as a viewer meets them: the Class View picker, the
 * toggles, the slot filter, the sort and the search, what the grid does as each
 * is worked, and what the browser remembers of them next visit.
 *
 * The rules themselves are covered in `browsing.test.ts`, driven directly. What
 * is asserted here is the surface: that each control is labelled, reachable from
 * the keyboard, and wired to the rule it claims to be.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { fixtureBasis, fixtureCosmetics, fixtureKeyRate, fixtureSnapshotTakenAt } from "./fixtures.ts";

import { CatalogueBrowser } from "@/components/catalogue-browser";
import { EMPTY_MANIFEST } from "@/renders/manifest";
import { CONTROLS_STORAGE_KEY } from "@/browser/remembered-controls";
import { PRICE_STEPS, priceCeiling, priceScale, stepForScrap } from "@/browsing/price-scale";

afterEach(() => {
  localStorage.clear();
});

function renderBrowser() {
  render(
    // What these controls do is the same whether a card has a picture or an
    // icon; the Class View deciding which Class a picture shows is in
    // `worn-renders.test.tsx`.
    <CatalogueBrowser
      cosmetics={fixtureCosmetics()}
      manifest={EMPTY_MANIFEST}
      keyRate={fixtureKeyRate()}
      basis={fixtureBasis()}
      snapshotTakenAt={fixtureSnapshotTakenAt()}
    />,
  );
  return userEvent.setup();
}

/** The Cosmetic names on screen, in the order the grid draws them. */
function namesShown(): string[] {
  return screen
    .queryAllByRole("listitem")
    .filter((card) => card.dataset["slug"] !== undefined)
    .map((card) => within(card).getByRole("button").textContent?.trim() ?? "");
}

const CLASS_PICKER = { name: "Class" };
const SLOT_PICKER = { name: "Slot" };
const SORT_PICKER = { name: "Sort by" };
const SEARCH_BOX = { name: "Search by name" };
const HIDE_ALL_CLASS = { name: "Hide All-Class Cosmetics" };
const HIDE_UNPRICED = { name: "Hide Unpriced" };
const HIDE_EVENT_ONLY = { name: "Hide Event-Only" };
const MINIMUM_PRICE = { name: "Minimum" };
const MAXIMUM_PRICE = { name: "Maximum" };

describe("the Class View picker", () => {
  it("starts on the whole catalogue bar its Event-Only Cosmetics", async () => {
    renderBrowser();
    expect(screen.getByRole("combobox", CLASS_PICKER)).toHaveValue("");
    await waitFor(() => expect(namesShown()).toHaveLength(7));
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

  it("offers all nine Classes, the two kinds, and a way back to the whole catalogue", () => {
    renderBrowser();
    const options = within(screen.getByRole("combobox", CLASS_PICKER))
      .getAllByRole("option")
      .map((option) => option.textContent?.trim());
    expect(options).toEqual([
      "Every Cosmetic",
      "Scout",
      "Soldier",
      "Pyro",
      "Demoman",
      "Heavy",
      "Engineer",
      "Medic",
      "Sniper",
      "Spy",
      "All-Class only",
      "Multi-Class only",
    ]);
  });

  it("narrows to one kind, and shows each of those Cosmetics on its own first Class", async () => {
    const user = renderBrowser();
    await user.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "multi-class");
    expect(namesShown()).toEqual(["Team Captain"]);
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

  it("cannot be worked under a kind either, which is a filter and not a Class View", async () => {
    const user = renderBrowser();
    await user.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "soldier");
    await user.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "all-class");
    expect(screen.getByRole("checkbox", HIDE_ALL_CLASS)).toBeDisabled();
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
    expect(namesShown()).toHaveLength(5);
  });
});

describe("the hide Unpriced toggle", () => {
  it("drops the Cosmetic with no price", async () => {
    const user = renderBrowser();
    await user.click(screen.getByRole("checkbox", HIDE_UNPRICED));
    expect(namesShown()).not.toContain("Dead of Night");
  });
});

describe("the hide Event-Only toggle", () => {
  it("is ticked when the page opens, so the gated Cosmetics start out of the way", async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByRole("checkbox", HIDE_EVENT_ONLY)).toBeChecked());
    expect(namesShown()).not.toContain("Crocodile Smile");
  });

  it("brings them back when a viewer unticks it", async () => {
    const user = renderBrowser();
    await user.click(screen.getByRole("checkbox", HIDE_EVENT_ONLY));
    expect(namesShown()).toContain("Crocodile Smile");
  });
});

describe("an Unpriced card", () => {
  it("says why there is no price rather than leaving a blank", () => {
    renderBrowser();
    const card = screen.getAllByRole("listitem").find((one) => one.dataset["slug"] === "dead-of-night");
    expect(card).toBeDefined();
    expect(card!.textContent).toContain("Unpriced");
    // The fixture's Dead of Night is missing from the price source's list.
    expect(card!.textContent).toContain("not listed");
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
    await waitFor(() => expect(namesShown()).toHaveLength(7));
    expect(screen.getByRole("searchbox", SEARCH_BOX)).toHaveValue("");
  });

  it("returns to the defaults once the storage is cleared", async () => {
    const first = renderBrowser();
    await first.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "medic");
    await waitFor(() => expect(localStorage.getItem(CONTROLS_STORAGE_KEY)).toContain("medic"));

    localStorage.clear();
    cleanup();
    renderBrowser();

    await waitFor(() => expect(namesShown()).toHaveLength(7));
    expect(screen.getByRole("combobox", CLASS_PICKER)).toHaveValue("");
  });
});

describe("the price sliders", () => {
  /** The notches these sliders have, which are the ones the panel was handed. */
  const scale = priceScale(priceCeiling(fixtureCosmetics()));

  /** Drag a slider to the notch worth this many scrap. */
  function dragTo(slider: HTMLElement, scrap: number): void {
    fireEvent.change(slider, { target: { value: String(stepForScrap(scale, scrap)) } });
  }

  function minimum(): HTMLElement {
    return screen.getByRole("slider", MINIMUM_PRICE);
  }

  function maximum(): HTMLElement {
    return screen.getByRole("slider", MAXIMUM_PRICE);
  }

  it("starts at either end of the track, filtering nothing", async () => {
    renderBrowser();
    expect(minimum()).toHaveValue("0");
    expect(maximum()).toHaveValue(String(PRICE_STEPS));
    expect(screen.getByText("Any price")).toBeInTheDocument();
    await waitFor(() => expect(namesShown()).toHaveLength(7));
  });

  it("drops the Cosmetics dearer than the ceiling the viewer drags to", () => {
    renderBrowser();
    // The Tin Pot is 174 scrap and the Team Captain 1593.
    dragTo(maximum(), 174);
    expect(namesShown()).toContain("Tin Pot");
    expect(namesShown()).not.toContain("Team Captain");
  });

  it("drops the Cosmetics cheaper than the floor the viewer drags to", () => {
    renderBrowser();
    // The notch worth 151 scrap, which is under the Tin Pot and over the
    // Baronial Badge at 55.
    dragTo(minimum(), 151);
    expect(namesShown().toSorted()).toEqual(["Team Captain", "Tin Pot"]);
  });

  it("says what the range it is on means, in the words the cards use", () => {
    renderBrowser();
    dragTo(minimum(), 151);
    // 151 scrap, which the fixture's Key Rate of 78.66 ref leaves in Refined.
    expect(screen.getByText("16.77 ref to any")).toBeInTheDocument();
  });

  it("carries the ceiling along rather than letting the floor cross it", () => {
    renderBrowser();
    dragTo(maximum(), 13);
    fireEvent.change(minimum(), { target: { value: String(PRICE_STEPS) } });
    expect(Number((minimum() as HTMLInputElement).value)).toBeLessThanOrEqual(
      Number((maximum() as HTMLInputElement).value),
    );
    // And the range still means something: the floor's own Cosmetic, the
    // dearest there is, rather than nothing at all.
    expect(namesShown()).toEqual(["Team Captain"]);
  });

  it("carries the floor along rather than letting the ceiling cross it", () => {
    renderBrowser();
    dragTo(minimum(), 151);
    dragTo(maximum(), 13);
    expect(Number((minimum() as HTMLInputElement).value)).toBeLessThanOrEqual(
      Number((maximum() as HTMLInputElement).value),
    );
    expect(namesShown()).toEqual(["Bolt Boy"]);
  });

  it("filters nothing again once it is dragged back to the end of its track", () => {
    renderBrowser();
    dragTo(minimum(), 174);
    fireEvent.change(minimum(), { target: { value: "0" } });
    expect(screen.getByText("Any price")).toBeInTheDocument();
    expect(namesShown()).toHaveLength(7);
  });

  it("is where the viewer left it next visit", async () => {
    renderBrowser();
    dragTo(maximum(), 174);
    await waitFor(() => expect(localStorage.getItem(CONTROLS_STORAGE_KEY)).toContain("maxScrap"));
    cleanup();

    renderBrowser();
    await waitFor(() => expect(namesShown()).not.toContain("Team Captain"));
    expect(maximum()).toHaveValue(String(stepForScrap(scale, 174)));
  });
});

describe("working the controls from the keyboard", () => {
  it("reaches every one of them by tabbing, in the order they are read", async () => {
    const user = renderBrowser();
    // In a Class View, where all nine are live.
    await user.selectOptions(screen.getByRole("combobox", CLASS_PICKER), "soldier");
    (document.activeElement as HTMLElement | null)?.blur();
    const inTabOrder = [
      screen.getByRole("searchbox", SEARCH_BOX),
      screen.getByRole("combobox", CLASS_PICKER),
      screen.getByRole("combobox", SLOT_PICKER),
      screen.getByRole("slider", MINIMUM_PRICE),
      screen.getByRole("slider", MAXIMUM_PRICE),
      screen.getByRole("combobox", SORT_PICKER),
      screen.getByRole("checkbox", HIDE_ALL_CLASS),
      screen.getByRole("checkbox", HIDE_UNPRICED),
      screen.getByRole("checkbox", HIDE_EVENT_ONLY),
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
