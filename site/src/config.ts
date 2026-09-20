/**
 * Site configuration, read at build time only.
 *
 * The Steam Community Market Key price is the one number the site needs that the
 * catalogue does not yet carry: the header gains a rate for each Dollar Basis in
 * #11, and #14 switches between them. Until then it is set here, overridable
 * with `STEAM_MARKET_KEY_PRICE_USD` in the environment, and the page says which
 * basis a dollar figure is quoted at so the number is never unexplained.
 */

/** Roughly what a Key has sold for on the Market; the Store price, for want of a live one. */
const DEFAULT_STEAM_MARKET_KEY_PRICE_USD = 2.49;

export function readKeyPrice(configured = process.env["STEAM_MARKET_KEY_PRICE_USD"]): number {
  if (configured === undefined || configured.trim() === "") return DEFAULT_STEAM_MARKET_KEY_PRICE_USD;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`STEAM_MARKET_KEY_PRICE_USD must be a positive number of dollars, got ${configured}`);
  }
  return parsed;
}

export const STEAM_MARKET_KEY_PRICE_USD = readKeyPrice();
