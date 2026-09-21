/**
 * The page under test, and the two things every test of it wants to be able to
 * say afterwards: that the browser logged no errors, and that nothing the page
 * asked for failed to arrive.
 *
 * Both are collected for the whole test rather than asserted where they happen,
 * because neither is something a test *does* — a hydration mismatch or a
 * four-oh-four on a chunk is a fault in the page whichever test happened to be
 * running. `expectClean` is how a test says it cares.
 *
 * Every request that would leave the machine is intercepted. Valve's Backpack
 * Icon CDN is answered with a placeholder: the fixture catalogue's icon URLs are
 * made-up hashes, so a real fetch would 404 every time, and a suite that needs
 * the internet to pass is a suite that fails for reasons that are nobody's
 * fault. Anything else leaving the page is recorded as a fault in its own right
 * — the site is meant to have no server, no analytics and no third party but
 * that CDN and the inventory proxy (ADR-0002, ADR-0006), and this is the one
 * place that can actually check it.
 *
 * The proxy is the second allowed destination and it is *not* blanket-allowed:
 * a test asks for a backpack with `serveInventory`, and until it does, a request
 * to the proxy is a fault like any other. The page is meant to talk to it when
 * the viewer asks and at no other moment, and a rule that let it through
 * whenever could not tell the difference.
 */
import { expect, test as base, type Page, type Request } from "@playwright/test";

import { INVENTORY_API_URL, PLACEHOLDER_PNG } from "./fixture-site.mjs";

/** Valve's icon CDN, the page's only legitimate outside request. */
const ICON_HOST = "steamcdn-a.akamaihd.net";

/** The inventory proxy, as the fixture site was built to reach it. */
const INVENTORY_HOST = new URL(INVENTORY_API_URL).hostname;

/** What the proxy is to answer with, once a test has said so. */
export interface InventoryAnswer {
  readonly status: number;
  readonly body: unknown;
}

export interface CataloguePage {
  readonly page: Page;
  readonly faults: PageFaults;
  /**
   * Answer the inventory proxy with this, from now on. Until a test calls it,
   * the proxy is not an allowed destination and a request to it is a fault.
   */
  serveInventory(answer: InventoryAnswer): void;
}

export interface PageFaults {
  readonly consoleErrors: string[];
  readonly failedRequests: string[];
  readonly offSiteRequests: string[];
}

function isLocal(url: string): boolean {
  return url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:");
}

function describeRequest(request: Request, why: string): string {
  return `${request.method()} ${request.url()} — ${why}`;
}

export const test = base.extend<{ catalogue: CataloguePage }>({
  catalogue: async ({ page }, use) => {
    const faults: PageFaults = { consoleErrors: [], failedRequests: [], offSiteRequests: [] };
    let inventoryAnswer: InventoryAnswer | null = null;

    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (isLocal(url)) {
        await route.continue();
        return;
      }
      const { hostname } = new URL(url);
      if (hostname === ICON_HOST) {
        await route.fulfill({ status: 200, contentType: "image/png", body: PLACEHOLDER_PNG });
        return;
      }
      if (hostname === INVENTORY_HOST && inventoryAnswer !== null) {
        await route.fulfill({
          status: inventoryAnswer.status,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(inventoryAnswer.body),
        });
        return;
      }
      faults.offSiteRequests.push(describeRequest(route.request(), "the page should talk to nobody but the icon CDN"));
      await route.abort();
    });

    page.on("console", (message) => {
      if (message.type() === "error") faults.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => faults.consoleErrors.push(`uncaught: ${error.message}`));
    page.on("requestfailed", (request) => {
      // An abort of ours is already recorded, and more usefully.
      if (isLocal(request.url()) || new URL(request.url()).hostname === ICON_HOST) {
        faults.failedRequests.push(describeRequest(request, request.failure()?.errorText ?? "failed"));
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400) faults.failedRequests.push(`${response.status()} ${response.url()}`);
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TF2 Cosmetics Catalogue" })).toBeVisible();

    await use({
      page,
      faults,
      serveInventory(answer: InventoryAnswer) {
        inventoryAnswer = answer;
      },
    });
  },
});

export { expect };

/** Nothing went wrong that the page itself is responsible for. */
export function expectClean(faults: PageFaults): void {
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.offSiteRequests).toEqual([]);
}

/**
 * The count the control bar announces: "8 Cosmetics", "7 of 8 Cosmetics".
 *
 * Scoped to the bar rather than found by its role, because the Inventory has a
 * live region of its own. That one is mounted empty and stays mounted: a
 * screen reader announces content added to a region that was already there, and
 * a region that appears along with its text is announced unreliably or not at
 * all — so "there is only one status on the page" was never something to hold
 * the page to.
 */
export function shownCount(page: Page) {
  return page.getByRole("region", { name: "Browsing controls" }).getByRole("status");
}

/** Every Cosmetic card currently drawn, by its slug — the hook ADR-0003 put there. */
export function cards(page: Page) {
  return page.locator("[data-slug]");
}

export function card(page: Page, slug: string) {
  return page.locator(`[data-slug="${slug}"]`);
}

/** The slugs on the page, in the order the grid draws them. */
export async function slugs(page: Page): Promise<string[]> {
  return cards(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-slug") ?? ""));
}

/** Open a Cosmetic from the keyboard's point of view — by pressing its control. */
export async function openCard(page: Page, slug: string) {
  await card(page, slug).getByRole("button").click();
  const detail = page.locator(`#cosmetic-detail-${slug}`);
  await expect(detail).toBeVisible();
  return detail;
}

/** The modal a Cosmetic opens in, whichever Cosmetic that is. */
export function modal(page: Page) {
  return page.getByRole("dialog");
}
