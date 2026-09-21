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
 * that CDN (ADR-0002), and this is the one place that can actually check it.
 */
import { expect, test as base, type Page, type Request } from "@playwright/test";

import { PLACEHOLDER_PNG } from "./fixture-site.mjs";

/** Valve's icon CDN, the page's only legitimate outside request. */
const ICON_HOST = "steamcdn-a.akamaihd.net";

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

export const test = base.extend<{ catalogue: { page: Page; faults: PageFaults } }>({
  catalogue: async ({ page }, use) => {
    const faults: PageFaults = { consoleErrors: [], failedRequests: [], offSiteRequests: [] };

    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (isLocal(url)) {
        await route.continue();
        return;
      }
      if (new URL(url).hostname === ICON_HOST) {
        await route.fulfill({ status: 200, contentType: "image/png", body: PLACEHOLDER_PNG });
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

    await use({ page, faults });
  },
});

export { expect };

/** Nothing went wrong that the page itself is responsible for. */
export function expectClean(faults: PageFaults): void {
  expect(faults.consoleErrors).toEqual([]);
  expect(faults.failedRequests).toEqual([]);
  expect(faults.offSiteRequests).toEqual([]);
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
