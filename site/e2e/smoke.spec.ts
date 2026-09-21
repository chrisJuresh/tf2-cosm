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
 * formality — how many cards the grid puts across is the width divided, and
 * jsdom lays nothing out at all, so this is the only place that layout, or the
 * click target stretched over a whole card, is ever exercised.
 */
import { expect, expectClean, openCard, card, cards, slugs, test } from "./catalogue-page";

/** From the golden catalogue: one Cosmetic of each of the three kinds. */
const DEMOMAN_ONLY = "scotsman-s-stove-pipe";
const MULTI_CLASS = "team-captain";
const ALL_CLASS = "ghastly-gibus";
/** Two Styles, both Teams, and a render for each — the one row that exercises every control. */
const STYLED = "tin-pot";
/** The fixture's Event-Only Cosmetic, which the page opens with hidden. */
const EVENT_ONLY = "crocodile-smile";

test("the page loads and lists the catalogue bar its Event-Only Cosmetics", async ({
  catalogue: { page, faults },
}) => {
  await expect(page.getByRole("list", { name: "Cosmetics" })).toBeVisible();

  // Seven of the fixture's eight: the eighth is Event-Only, and the toggle that
  // hides it is ticked when the page opens.
  await expect(cards(page)).toHaveCount(7);
  await expect(page.getByRole("status")).toHaveText("7 of 8 Cosmetics");
  await expect(card(page, EVENT_ONLY)).toHaveCount(0);

  // Sorted by Metal Value, high to low, which is the default.
  const figures = await cards(page).evaluateAll((elements) =>
    elements.map((element) => element.textContent ?? ""),
  );
  expect(figures[0]).toContain("Team Captain");

  // The header states what the figures below it mean; the footer, how fresh
  // they are.
  await expect(page.getByRole("banner")).toContainText("a Key is 78.66 ref");
  await expect(page.getByRole("contentinfo")).toContainText("Snapshot taken");

  // And it fits the screen it is on. Only the grid scrolls, and only downwards:
  // a page a phone has to be dragged sideways to read is the failure this whole
  // project's phone layout exists to avoid, and jsdom could never see it.
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow).toEqual({ document: 0, body: 0 });

  expectClean(faults);
});

test("the Class filter narrows the grid to what that Class can wear", async ({ catalogue: { page, faults } }) => {
  await page.getByLabel("Class", { exact: true }).selectOption("demoman");

  // The Class View's three rules at once: the Demoman's own Cosmetic, the
  // Multi-Class one he shares with the Soldier, and the All-Class one.
  await expect(card(page, DEMOMAN_ONLY)).toBeVisible();
  await expect(card(page, MULTI_CLASS)).toBeVisible();
  await expect(card(page, ALL_CLASS)).toBeVisible();
  // The Scout's Bolt Boy is not one of them.
  await expect(card(page, "bolt-boy")).toHaveCount(0);

  // Hiding All-Class Cosmetics leaves the one he shares, which is the whole
  // point of the toggle.
  await page.getByLabel("Hide All-Class Cosmetics").check();
  await expect(card(page, ALL_CLASS)).toHaveCount(0);
  await expect(card(page, MULTI_CLASS)).toBeVisible();

  // And the Event-Only Cosmetics are there to be had, once asked for.
  await page.getByLabel("Class", { exact: true }).selectOption("");
  await page.getByLabel("Hide Event-Only").uncheck();
  await expect(card(page, EVENT_ONLY)).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("8 Cosmetics");

  expectClean(faults);
});

test("a click anywhere on a card opens it, and puts the focus on its control", async ({
  catalogue: { page, faults },
}) => {
  // The whole card is the control: a viewer aims at the picture, not at the
  // name under it. It is a pseudo-element stretched over the card, so this is
  // the only suite that can see it at all — and the focus landing on the
  // control is what leaves the viewer something to press Escape on.
  // The middle of the card, which is the middle of the picture. Playwright
  // clicks what is actually painted there, so a card whose overlay had not
  // taken would open nothing, and one with the header spilling over it would
  // refuse the click outright.
  await card(page, STYLED).click();
  await expect(page.locator(`#cosmetic-detail-${STYLED}`)).toBeVisible();
  await expect(card(page, STYLED).getByRole("button")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator(`#cosmetic-detail-${STYLED}`)).toHaveCount(0);

  expectClean(faults);
});

test("the grid puts as many Cosmetics across as the width allows", async ({ catalogue: { page, faults } }) => {
  // The point of the grid: the cards sit side by side rather than one to a
  // line. How many is the width divided, so a desktop has more of them across
  // than a phone — what is asserted is only that the width is being used.
  const lefts = await cards(page).evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().left)),
  );
  expect(new Set(lefts).size).toBeGreaterThan(1);

  expectClean(faults);
});

test("the search narrows the grid as it is typed", async ({ catalogue: { page, faults } }) => {
  await page.getByLabel("Search by name").fill("gib");
  await expect(cards(page)).toHaveCount(1);
  expect(await slugs(page)).toEqual([ALL_CLASS]);

  await page.getByLabel("Search by name").fill("nothing is called this");
  await expect(page.getByText("No Cosmetic matches these controls.")).toBeVisible();

  expectClean(faults);
});

test("an expanded card shows the Worn Render, its Styles and both Teams", async ({
  catalogue: { page, faults },
}) => {
  const detail = await openCard(page, STYLED);

  // The picture is a render served by the site, not the Backpack Icon: the
  // larger derivative, which is what an open card asks for.
  const picture = detail.locator("img");
  await expect(picture).toHaveAttribute("src", /\/renders\/web\/tin-pot\/soldier-red-0@512\.webp$/);

  // Both controls, because this Cosmetic has something to offer each of them.
  await detail.getByRole("group", { name: "Style" }).getByRole("button", { name: "Open" }).click();
  await expect(picture).toHaveAttribute("src", /soldier-red-1@512\.webp$/);

  await detail.getByRole("group", { name: "Team" }).getByRole("button", { name: "BLU" }).click();
  await expect(picture).toHaveAttribute("src", /soldier-blu-0@512\.webp$/);

  // The context the figure needed, which is why the card opens at all.
  await expect(detail).toContainText("Price Spread");
  await expect(detail).toContainText("Reference Variant");

  // Opened cards are linkable: the slug is the hash (ADR-0003).
  expect(new URL(page.url()).hash).toBe(`#${STYLED}`);

  expectClean(faults);
});

test("every picture on the page actually loads", async ({ catalogue: { page, faults } }) => {
  // A render that fails to load falls back to the Backpack Icon and leaves no
  // trace in the DOM, so the DOM cannot be asked. The browser can: an image
  // that decoded has a natural size, and one that did not has none.
  const undecoded = await page.locator('[role="list"] img').evaluateAll((images) =>
    images
      .filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0)
      .map((image) => (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src),
  );
  expect(undecoded).toEqual([]);

  // And the grid is showing renders rather than eight icons.
  const sources = await page.locator('[role="list"] img').evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).src),
  );
  expect(sources.filter((src) => src.includes("/renders/")).length).toBeGreaterThan(0);

  expectClean(faults);
});
