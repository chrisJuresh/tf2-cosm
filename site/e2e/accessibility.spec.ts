/**
 * The page, read by something that is not a pair of eyes.
 *
 * Two different questions are asked here, and an automated checker only answers
 * the first. axe finds the faults that are mechanical — an unlabelled control,
 * an image with no alt text, a contrast ratio below the threshold, a role used
 * where its required children are missing — and it is run over the grid and
 * over an open Cosmetic, because the modal is markup that does not exist until
 * a viewer asks for it and so is exactly the markup nobody looks at.
 *
 * The second question is the one axe cannot answer: whether the page can be
 * *worked* without a mouse. That is asked directly — every control in the bar
 * named, reachable by Tab, and visibly focused when it gets there, and a
 * Cosmetic that opens, closes and hands the focus back from the keyboard
 * alone.
 *
 * Like the smoke suite, this runs on a desktop and on a phone.
 */
import AxeBuilder from "@axe-core/playwright";

import { expect, expectClean, modal, openCard, card, test } from "./catalogue-page";

/** Two Styles, both Teams: the open Cosmetic with the most in it to get wrong. */
const STYLED = "tin-pot";

/**
 * The bar's controls, by the accessible name each one has to have. A control
 * that loses its label fails here by name rather than as a count.
 */
const CONTROLS = [
  "Search by name",
  "Class",
  "Slot",
  "Sort by",
  "Hide All-Class Cosmetics",
  "Hide Unpriced",
] as const;

test("the grid has no automatically detectable accessibility faults", async ({ catalogue: { page, faults } }) => {
  expect(await axeFaults(page)).toEqual([]);
  expectClean(faults);
});

test("an open Cosmetic has none either", async ({ catalogue: { page, faults } }) => {
  await openCard(page, STYLED);
  expect(await axeFaults(page)).toEqual([]);
  expectClean(faults);
});

test("nor does either of them in dark mode", async ({ catalogue: { page, faults } }) => {
  // The page has no switch: it follows the system, and half its colours are the
  // `dark:` half. Contrast is the whole reason this is worth a second run — a
  // muted grey that reads on white is a different ratio entirely on #101214.
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axeFaults(page)).toEqual([]);

  await openCard(page, STYLED);
  expect(await axeFaults(page)).toEqual([]);
  expectClean(faults);
});

test("every browsing control is named, and says so to a screen reader", async ({ catalogue: { page } }) => {
  const bar = page.getByRole("region", { name: "Browsing controls" });
  await expect(bar).toBeVisible();
  for (const name of CONTROLS) {
    await expect(bar.getByLabel(name, { exact: true })).toBeVisible();
  }
});

test("the controls are reachable from the keyboard, and visible once focused", async ({ catalogue: { page } }) => {
  // The All-Class toggle focuses a Class View, so outside one it is disabled and
  // a keyboard walks past it — correctly, since there is nothing for it to do.
  // A Class is picked first so that every control in the bar is a live one.
  await page.getByLabel("Class", { exact: true }).selectOption("soldier");

  const search = page.getByLabel("Search by name", { exact: true });
  await search.focus();

  // Tab walks the bar in the order it is written: search, Class, slot, sort,
  // then the two toggles. Anything that cannot be tabbed to is a control a
  // keyboard viewer does not have.
  const reached: string[] = [];
  for (let step = 0; step < CONTROLS.length; step += 1) {
    reached.push(await focusedName(page));
    await page.keyboard.press("Tab");
  }
  expect(reached).toEqual([...CONTROLS]);

  // And focus is something you can see, on every control the page has and not
  // only on the bar: the Dollar Basis switch, the card itself, and the ones the
  // modal brings with it. Tailwind draws it as an outline; what matters is that
  // the browser computes one rather than `none`. The Dollar Basis radios are
  // `sr-only` and their label carries the outline, which is why the check walks
  // up from whatever has the focus rather than reading only that element.
  await checkFocusIsVisible(page, [
    page.getByLabel("Search by name", { exact: true }),
    page.getByLabel("Sort by", { exact: true }),
    page.getByRole("radiogroup", { name: "Dollar Basis" }).getByRole("radio").first(),
    card(page, STYLED).getByRole("button"),
  ]);

  // The modal's own, which exist only while it is open — and which are all a
  // keyboard can reach at that point, since the modal keeps the Tab inside it.
  await openCard(page, STYLED);
  await checkFocusIsVisible(page, [
    // Exactly "Close": this Cosmetic's own Styles are Closed and Open.
    modal(page).getByRole("button", { name: "Close", exact: true }),
    page.getByRole("group", { name: "Style" }).getByRole("button", { name: "Open" }),
    page.getByRole("group", { name: "Team" }).getByRole("button", { name: "BLU" }),
  ]);
});

/**
 * Each control arrived at *as a keyboard viewer arrives at it*, because that is
 * the whole distinction `:focus-visible` draws: a programmatic focus on a radio
 * or a button does not match it, and the outline a mouse user is spared is
 * exactly the outline this is here to find. Tabbing away and back is the
 * shortest way to reach an arbitrary control by keyboard.
 */
async function checkFocusIsVisible(
  page: import("@playwright/test").Page,
  controls: readonly import("@playwright/test").Locator[],
): Promise<void> {
  for (const control of controls) {
    await control.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(control).toBeFocused();
    expect(await visibleFocus(page), await control.evaluate((element) => element.outerHTML)).toBe(true);
  }
}

/**
 * Whether the focus can be seen: an outline the browser actually computes, on
 * whatever has the focus or on the element drawing it on that thing's behalf.
 * Two levels up is enough for `has-focus-visible:` on a label wrapping an
 * `sr-only` input, which is the only place the page does that.
 */
async function visibleFocus(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    let element: Element | null = document.activeElement;
    for (let up = 0; up < 3 && element !== null; up += 1) {
      const style = getComputedStyle(element);
      if (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) return true;
      element = element.parentElement;
    }
    return false;
  });
}

test("a Cosmetic opens, closes and gives the focus back, without a mouse", async ({ catalogue: { page } }) => {
  const control = card(page, STYLED).getByRole("button");
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(modal(page)).toBeVisible();
  // The modal takes the focus, so the keys that work it land on it rather than
  // on the grid behind it.
  await expect(modal(page)).toBeFocused();

  // Escape closes it from wherever inside it the focus has got to, and the
  // focus comes back to the card that was opened rather than to the body.
  await page.keyboard.press("Escape");
  await expect(modal(page)).toHaveCount(0);
  await expect(control).toBeFocused();
});

/**
 * Every fault axe finds, one line per offending element rather than one per
 * rule. A rule name on its own sends a reader to the axe documentation; the
 * element and axe's own summary of what is wrong with it send them to the
 * component.
 */
async function axeFaults(page: import("@playwright/test").Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id} at ${node.target.join(" ")}: ${node.failureSummary ?? violation.help}`),
  );
}

/** What a screen reader would call whatever currently has the focus. */
async function focusedName(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null) return "(nothing)";
    const labelled = active.id === "" ? null : document.querySelector(`label[for="${CSS.escape(active.id)}"]`);
    return (labelled?.textContent ?? active.getAttribute("aria-label") ?? active.textContent ?? "").trim();
  });
}
