/**
 * The page, read by something that is not a pair of eyes.
 *
 * Two different questions are asked here, and an automated checker only answers
 * the first. axe finds the faults that are mechanical — an unlabelled control,
 * an image with no alt text, a contrast ratio below the threshold, a role used
 * where its required children are missing — and it is run over the list and
 * over an open row, because the open row is markup that does not exist until a
 * viewer asks for it and so is exactly the markup nobody looks at.
 *
 * The second question is the one axe cannot answer: whether the page can be
 * *worked* without a mouse. That is asked directly — every control in the bar
 * named, reachable by Tab, and visibly focused when it gets there, and a row
 * that opens, closes and hands the focus back from the keyboard alone.
 *
 * Like the smoke suite, this runs on a desktop and on a phone.
 */
import AxeBuilder from "@axe-core/playwright";

import { expect, expectClean, openRow, row, test } from "./catalogue-page";

/** Two Styles, both Teams: the open row with the most in it to get wrong. */
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

test("the list has no automatically detectable accessibility faults", async ({ catalogue: { page, faults } }) => {
  expect(await axeFaults(page)).toEqual([]);
  expectClean(faults);
});

test("an open row has none either", async ({ catalogue: { page, faults } }) => {
  await openRow(page, STYLED);
  expect(await axeFaults(page)).toEqual([]);
  expectClean(faults);
});

test("nor does either of them in dark mode", async ({ catalogue: { page, faults } }) => {
  // The page has no switch: it follows the system, and half its colours are the
  // `dark:` half. Contrast is the whole reason this is worth a second run — a
  // muted grey that reads on white is a different ratio entirely on #101214.
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axeFaults(page)).toEqual([]);

  await openRow(page, STYLED);
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

  // And focus is something you can see. Tailwind draws it as an outline; what
  // matters is that the browser computes one rather than `none`.
  await search.focus();
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline.style).not.toBe("none");
  expect(Number.parseFloat(outline.width)).toBeGreaterThan(0);
});

test("a row opens, closes and gives the focus back, without a mouse", async ({ catalogue: { page } }) => {
  const toggle = row(page, STYLED).getByRole("button");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(`#cosmetic-detail-${STYLED}`)).toBeVisible();

  // Escape closes it from wherever inside it the focus has got to, and the
  // focus comes back to the row that was opened rather than to the body.
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
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
