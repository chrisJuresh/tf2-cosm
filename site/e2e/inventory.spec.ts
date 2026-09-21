/**
 * The Inventory view, in a real browser.
 *
 * What the component suite cannot see is whether the exported HTML, the
 * hydrated JavaScript, the Variant Prices served as a file beside the page and
 * the fetch to the proxy add up to one working feature. Three of those four are
 * only real in a browser: the document is a static asset that has to be *there*
 * at the URL the code asks for, the proxy call has to survive being inlined at
 * build time, and the whole thing runs after hydration or not at all.
 *
 * The proxy is answered by the suite (`e2e/catalogue-page.ts`) rather than
 * reached. Its own tests cover turning Steam's payload into Owned Copies; what
 * matters here is the shape it answers in.
 */
import { card, cards, expect, expectClean, test } from "./catalogue-page";

/** The fixture Stove Pipe, whose Reference Price is the blanket craft-hat figure. */
const STOVE_PIPE = 111;
/** The fixture Team Captain. */
const TEAM_CAPTAIN = 102;

function backpack(copies: { defindex: number; quality?: string; count?: number; effect?: string }[]) {
  return {
    steamId: "76561197960435530",
    takenAt: "2026-09-21T02:51:51.168Z",
    copies: copies.map((one) => ({
      defindex: one.defindex,
      quality: one.quality ?? "unique",
      craftable: true,
      tradable: true,
      count: one.count ?? 1,
      ...(one.effect === undefined ? {} : { effect: one.effect }),
    })),
    counts: { items: copies.length, copies: copies.length, unreadable: 0 },
  };
}

test("reads a backpack, marks what is owned and narrows the catalogue to it", async ({ catalogue }) => {
  const { page, faults, serveInventory } = catalogue;
  serveInventory({
    status: 200,
    body: backpack([{ defindex: TEAM_CAPTAIN, count: 2 }, { defindex: STOVE_PIPE, quality: "genuine" }]),
  });

  const everything = await cards(page).count();
  expect(everything).toBeGreaterThan(2);

  await page.getByLabel("Your Steam profile").fill("robinwalker");
  await page.getByRole("button", { name: "Show what I own" }).click();

  // The mark lands on the card, which means the fetch landed and the page
  // re-rendered off it.
  await expect(card(page, "team-captain").getByText("Owned ×2")).toBeVisible();
  await expect(card(page, "scotsmans-stove-pipe").getByText("Owned")).toBeVisible();

  // The Variant Prices arrived as a file beside the page, so the Stove Pipe's
  // Genuine copy is priced as Genuine rather than as a craft hat.
  await expect(card(page, "scotsmans-stove-pipe").getByText("Genuine")).toBeVisible();

  // And the toggle, which had nothing to narrow to before the backpack arrived.
  const onlyOwned = page.getByLabel("Only what I own");
  await expect(onlyOwned).toBeEnabled();
  await onlyOwned.check();
  await expect(cards(page)).toHaveCount(2);

  expectClean(faults);
});

test("says an Unusual is priced by its effect rather than showing a figure for it", async ({ catalogue }) => {
  const { page, faults, serveInventory } = catalogue;
  serveInventory({
    status: 200,
    body: backpack([{ defindex: TEAM_CAPTAIN, quality: "unusual", effect: "Burning Flames" }]),
  });

  await page.getByLabel("Your Steam profile").fill("robinwalker");
  await page.getByRole("button", { name: "Show what I own" }).click();

  await expect(card(page, "team-captain").getByText("Priced by its effect")).toBeVisible();
  await expect(card(page, "team-captain").getByText(/Burning Flames/)).toBeVisible();
  // And the total says out loud that it left the Unusual out, rather than
  // quietly reporting a backpack worth nothing.
  await expect(page.getByText(/leaving out 1 Unusual priced by its effect/)).toBeVisible();

  expectClean(faults);
});

test("tells a viewer their backpack is private, in words they can act on", async ({ catalogue }) => {
  const { page, serveInventory } = catalogue;
  serveInventory({
    status: 403,
    body: {
      error: "private-inventory",
      message:
        "That backpack is private. Steam only shows an inventory the owner has made public: Profile → Edit Profile → Privacy Settings → Inventory → Public.",
    },
  });

  await page.getByLabel("Your Steam profile").fill("someone");
  await page.getByRole("button", { name: "Show what I own" }).click();

  await expect(page.getByText(/That backpack is private/)).toBeVisible();
  // Announced, not only drawn.
  await expect(
    page.getByRole("region", { name: "Your Steam inventory" }).getByRole("status"),
  ).toContainText("That backpack is private");
  // And the catalogue is left exactly as it was.
  await expect(page.getByLabel("Only what I own")).toBeDisabled();
});

test("talks to the inventory proxy only when the viewer asks it to", async ({ catalogue }) => {
  // The suite records any request to the proxy as a fault until a test asks for
  // a backpack, so simply loading the page and working the other controls is
  // what proves the page does not reach for one on its own.
  const { page, faults } = catalogue;
  await page.getByLabel("Search by name").fill("tin");
  await expect(cards(page)).toHaveCount(1);
  expectClean(faults);
});

test("the Steam profile box can be worked from the keyboard, and is named", async ({ catalogue }) => {
  const { page, faults, serveInventory } = catalogue;
  serveInventory({ status: 200, body: backpack([{ defindex: TEAM_CAPTAIN }]) });

  const box = page.getByLabel("Your Steam profile");
  await box.focus();
  await expect(box).toBeFocused();
  await box.type("robinwalker");
  // Enter submits, because it is a real form with a real submit button.
  await box.press("Enter");

  await expect(card(page, "team-captain").getByText("Owned")).toBeVisible();
  expectClean(faults);
});

test("a backpack is a link: the profile lands in the URL, and the URL reads the backpack", async ({ catalogue }) => {
  // The whole point of the query parameter is that it survives being typed into
  // a different browser, which only a real one can show: the static export has
  // to serve `/?profile=...`, and the hydrated page has to pick the profile back
  // up out of the address bar and make the request off it.
  const { page, faults, serveInventory } = catalogue;
  serveInventory({ status: 200, body: backpack([{ defindex: TEAM_CAPTAIN }]) });

  await page.getByLabel("Your Steam profile").fill("robinwalker");
  await page.getByRole("button", { name: "Show what I own" }).click();
  await expect(card(page, "team-captain").getByText("Owned")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("profile")).toBe("robinwalker");

  const shared = page.url();
  // The page without the parameter is the catalogue, remembered box and all,
  // and reaches for nobody's backpack.
  await page.goto("/");
  await expect(page.getByLabel("Your Steam profile")).toHaveValue("robinwalker");
  await expect(card(page, "team-captain").getByText("Owned")).toBeHidden();

  await page.goto(shared);
  await expect(card(page, "team-captain").getByText("Owned")).toBeVisible();

  expectClean(faults);
});
