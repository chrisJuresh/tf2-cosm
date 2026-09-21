/**
 * The two things the Inventory view fetches at runtime, and everything that can
 * go wrong with either.
 *
 * This is the only code on the site that makes a network call, and it is worth
 * being clear about why it does not contradict ADR-0002. Every price on the page
 * still comes out of the committed snapshot. One of these two fetches is a
 * committed file — the Variant Prices, served as a static asset instead of baked
 * into the page, because a megabyte that only matters to a viewer who asked for
 * their backpack should be paid for by that viewer. The other is the viewer's
 * own Inventory, which is live and personal and is the one thing on this site
 * that cannot be a file at all (ADR-0006).
 *
 * Nothing here is forgiving and nothing here throws into a render. Every failure
 * comes back as a message a person can act on, because "your backpack is
 * private, here is where Steam's setting is" is the common case and is not an
 * error in any sense the viewer cares about.
 */
import { type Inventory, inventoryFailureSchema, inventorySchema } from "@/inventory/copies";
import { readVariantPrices, type VariantPrices, VariantPricesError } from "@/prices/variant-prices";

/**
 * Where the inventory proxy is. Unset, the feature is not offered at all rather
 * than offered broken — the same rule `NEXT_PUBLIC_RENDER_BASE_URL` follows, and
 * for the same reason: a control that cannot work is worse than no control.
 *
 * Next inlines `NEXT_PUBLIC_*` at build time, so this has to be read as a whole
 * property rather than off a dynamic key, and a deployment already built does
 * not pick up a new value. Redeploy.
 */
export function inventoryApiUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_INVENTORY_API_URL?.trim();
  return configured === undefined || configured === "" ? null : configured.replace(/\/+$/, "");
}

/** Where the Variant Prices are served from, beside the page rather than in it. */
export const VARIANT_PRICES_URL = "/variant-prices.json";

/** A failure with a sentence for the viewer, and never a stack trace. */
export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

/**
 * The viewer's backpack, through the proxy.
 *
 * The proxy's own failure messages are passed through rather than replaced: it
 * is the side that knows whether Steam said the profile is private, is missing,
 * or is rate-limiting us, and it already writes each one as a sentence. A body
 * that is not one of its two shapes is this side's problem and says so.
 */
export async function fetchInventory(asked: string, signal?: AbortSignal): Promise<Inventory> {
  const base = inventoryApiUrl();
  if (base === null) throw new InventoryError("This page is not set up to read Steam inventories.");

  let response: Response;
  try {
    response = await fetch(`${base}/inventory?q=${encodeURIComponent(asked)}`, {
      signal: signal ?? null,
      headers: { accept: "application/json" },
    });
  } catch (error) {
    // An abort is the viewer typing on, not a failure, and is re-thrown so the
    // caller can tell the two apart.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new InventoryError("Could not reach the inventory service. Check your connection and try again.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new InventoryError("The inventory service answered with something that was not an inventory.");
  }

  if (!response.ok) {
    const failure = inventoryFailureSchema.safeParse(body);
    throw new InventoryError(
      failure.success ? failure.data.message : `The inventory service answered ${response.status}.`,
    );
  }

  const inventory = inventorySchema.safeParse(body);
  if (!inventory.success) {
    throw new InventoryError("The inventory service answered in a shape this page does not understand.");
  }
  return inventory.data;
}

/**
 * The Variant Prices, fetched once and held.
 *
 * Held in a module-level promise rather than in a component: a viewer who looks
 * up two profiles, or who ticks the Inventory view off and on, should not fetch
 * a megabyte twice. A failed fetch is not held — the next attempt tries again
 * rather than reporting last time's outage forever.
 */
let inFlight: Promise<VariantPrices> | null = null;

export async function loadVariantPrices(catalogueSnapshotTakenAt: string): Promise<VariantPrices> {
  inFlight ??= (async () => {
    let response: Response;
    try {
      response = await fetch(VARIANT_PRICES_URL, { headers: { accept: "application/json" } });
    } catch {
      throw new VariantPricesError("Could not load the prices for each Quality.");
    }
    if (!response.ok) {
      throw new VariantPricesError(`Could not load the prices for each Quality (${response.status}).`);
    }
    return readVariantPrices(await response.json(), catalogueSnapshotTakenAt);
  })().catch((error: unknown) => {
    inFlight = null;
    throw error;
  });
  return inFlight;
}

/** For the tests, which must not carry one test's fetch into the next. */
export function forgetVariantPrices(): void {
  inFlight = null;
}
