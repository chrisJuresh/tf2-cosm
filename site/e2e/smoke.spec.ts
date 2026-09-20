/**
 * The built site, in a browser, doing the things the page exists to do.
 *
 * Every rule the page follows is already covered by a component test against
 * the same fixtures; none of that is repeated here. What a component test
 * cannot see is whether the exported HTML, the hydrated JavaScript, the
 * stylesheet and the images are one working page — so these tests do the four
 * things a viewer does, and each of them also asserts that the browser logged
 * nothing and that nothing the page asked for failed to arrive.
 *
 * They run twice: on a desktop, and on an emulated phone. The phone is not a
 * formality — the list lays itself out differently below `sm`, and jsdom applies
 * no stylesheet at all, so this is the only place that layout is ever exercised.
 */
import { expect, expectClean, openRow, row, rows, slugs, test } from "./catalogue-page";

/** From the golden catalogue: the Demoman's own hat, and one he shares. */
const DEMOMAN_ONLY = "scotsman-s-stove-pipe";
const MULTI_CLASS = "team-captain";
const ALL_CLASS = "ghastly-gibus";
/** Two Styles, both Teams, and a render for each — the one row that exercises every control. */
const STYLED = "tin-pot";

test("the page loads and lists every Cosmetic in the catalogue", async ({ catalogue: { page, faults } }) => {
  await expect(page.getByRole("table", { name: "Cosmetics" })).toBeVisible();

  // Eight, because that is what the fixture catalogue's own header says it has.
  await expect(rows(page)).toHaveCount(8);
  await expect(page.getByRole("status")).toHaveText("8 Cosmetics");

  // Sorted by Metal Value, high to low, which is the default.
  const figures = await rows(page).evaluateAll((elements) =>
    elements.map((element) => element.textContent ?? ""),
  );
  expect(figures[0]).toContain("Team Captain");

  // The header states what the figures below it mean and how fresh they are.
  await expect(page.getByRole("banner")).toContainText("a Key is 78.66 ref");
  await expect(page.getByRole("banner")).toContainText("Snapshot taken");

  // And it fits the screen it is on. Only the list scrolls, and only downwards:
  // a page a phone has to be dragged sideways to read is the failure this whole
  // project's phone layout exists to avoid, and jsdom could never see it.
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow).toEqual({ document: 0, body: 0 });

  expectClean(faults);
});

test("the Class filter narrows the list to what that Class can wear", async ({ catalogue: { page, faults } }) => {
  await page.getByLabel("Class", { exact: true }).selectOption("demoman");

  // The Class View's three rules at once: the Demoman's own hat, the hat he
  // shares with the Soldier, and the All-Class hat everybody has.
  await expect(row(page, DEMOMAN_ONLY)).toBeVisible();
  await expect(row(page, MULTI_CLASS)).toBeVisible();
  await expect(row(page, ALL_CLASS)).toBeVisible();
  // The Scout's Bolt Boy is not one of them.
  await expect(row(page, "bolt-boy")).toHaveCount(0);

  // Hiding All-Class Cosmetics leaves the one he shares, which is the whole
  // point of the toggle.
  await page.getByLabel("Hide All-Class Cosmetics").check();
  await expect(row(page, ALL_CLASS)).toHaveCount(0);
  await expect(row(page, MULTI_CLASS)).toBeVisible();

  expectClean(faults);
});

test("the search narrows the list as it is typed", async ({ catalogue: { page, faults } }) => {
  await page.getByLabel("Search by name").fill("gib");
  await expect(rows(page)).toHaveCount(1);
  expect(await slugs(page)).toEqual([ALL_CLASS]);

  await page.getByLabel("Search by name").fill("nothing is called this");
  await expect(page.getByText("No Cosmetic matches these controls.")).toBeVisible();

  expectClean(faults);
});

test("an expanded row shows the Worn Render, its Styles and both Teams", async ({
  catalogue: { page, faults },
}) => {
  const detail = await openRow(page, STYLED);

  // The picture is a render served by the site, not the Backpack Icon: the
  // larger derivative, which is what an open row asks for.
  const picture = detail.locator("img");
  await expect(picture).toHaveAttribute("src", /\/renders\/web\/tin-pot\/soldier-red-0@512\.webp$/);

  // Both controls, because this Cosmetic has something to offer each of them.
  await detail.getByRole("group", { name: "Style" }).getByRole("button", { name: "Open" }).click();
  await expect(picture).toHaveAttribute("src", /soldier-red-1@512\.webp$/);

  await detail.getByRole("group", { name: "Team" }).getByRole("button", { name: "BLU" }).click();
  await expect(picture).toHaveAttribute("src", /soldier-blu-0@512\.webp$/);

  // The context the figure needed, which is why the row opens at all.
  await expect(detail).toContainText("Price Spread");
  await expect(detail).toContainText("Reference Variant");

  // Opened rows are linkable: the slug is the hash (ADR-0003).
  expect(new URL(page.url()).hash).toBe(`#${STYLED}`);

  expectClean(faults);
});

test("every picture on the page actually loads", async ({ catalogue: { page, faults } }) => {
  // A render that fails to load falls back to the Backpack Icon and leaves no
  // trace in the DOM, so the DOM cannot be asked. The browser can: an image
  // that decoded has a natural size, and one that did not has none.
  const undecoded = await page.locator('[role="table"] img').evaluateAll((images) =>
    images
      .filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0)
      .map((image) => (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src),
  );
  expect(undecoded).toEqual([]);

  // And the list is showing renders rather than eight icons.
  const sources = await page.locator('[role="table"] img').evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).src),
  );
  expect(sources.filter((src) => src.includes("/renders/")).length).toBeGreaterThan(0);

  expectClean(faults);
});
