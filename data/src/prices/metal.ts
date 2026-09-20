/**
 * Metal arithmetic and Trader Notation.
 *
 * Every TF2 price lands on a ninth of a Refined, so Metal is counted here as a
 * whole number of scrap and never as a float: nine scrap to the Refined, three
 * to the Reclaimed. A price that arrives as `1.33` is twelve scrap, and twelve
 * scrap is written back as `1.33` — the two-decimal truncation traders use, not
 * a rounding of 1.333...
 *
 * Nothing in here knows where a price came from; it is pure arithmetic over
 * scrap counts and a Key Rate, also in scrap.
 */

/** Nine scrap to the Refined. The whole module's reason for existing. */
export const SCRAP_PER_REFINED = 9;

/** How traders write each ninth of a Refined. Truncated, never rounded: 8/9 is "0.88". */
const NINTHS = ["", ".11", ".22", ".33", ".44", ".55", ".66", ".77", ".88"] as const;

function assertScrap(scrap: number, what: string): void {
  if (!Number.isInteger(scrap) || scrap < 0) {
    throw new Error(`${what} must be a whole scrap count, got ${scrap}`);
  }
}

function assertKeyRate(scrapPerKey: number): void {
  if (!Number.isInteger(scrapPerKey) || scrapPerKey <= 0) {
    throw new Error(`Key Rate must be a positive whole scrap count, got ${scrapPerKey}`);
  }
}

/** Refined to scrap, snapped to the nearest ninth. Sources quote `1.33`, not `1.3333`. */
export function refinedToScrap(refined: number): number {
  if (!Number.isFinite(refined) || refined < 0) {
    throw new Error(`a price in Refined must be a non-negative number, got ${refined}`);
  }
  return Math.round(refined * SCRAP_PER_REFINED);
}

/** The Metal Value: scrap expressed in Refined, for sorting and for display in dollars. */
export function scrapToRefined(scrap: number): number {
  assertScrap(scrap, "a Metal Value");
  return scrap / SCRAP_PER_REFINED;
}

/** Keys to scrap at the snapshot's Key Rate, snapped to the nearest ninth. */
export function keysToScrap(keys: number, scrapPerKey: number): number {
  assertKeyRate(scrapPerKey);
  if (!Number.isFinite(keys) || keys < 0) {
    throw new Error(`a price in Keys must be a non-negative number, got ${keys}`);
  }
  return Math.round(keys * scrapPerKey);
}

/** A scrap count as traders write Refined: "24.44", "1", "0.11". No unit suffix. */
export function formatRefined(scrap: number): string {
  assertScrap(scrap, "a Metal Value");
  const whole = Math.floor(scrap / SCRAP_PER_REFINED);
  return `${whole}${NINTHS[scrap % SCRAP_PER_REFINED]}`;
}

/**
 * Trader Notation: "3 keys, 1.33 ref", "1 key", "24.44 ref", "0 ref". The Key
 * Rate decides where the split falls, so the same scrap count reads differently
 * under a different snapshot — which is why the Key Rate is in the header.
 */
export function traderNotation(scrap: number, scrapPerKey: number): string {
  assertScrap(scrap, "a Metal Value");
  assertKeyRate(scrapPerKey);
  const keys = Math.floor(scrap / scrapPerKey);
  const remainder = scrap % scrapPerKey;
  const parts: string[] = [];
  if (keys > 0) parts.push(`${keys} key${keys === 1 ? "" : "s"}`);
  if (remainder > 0 || keys === 0) parts.push(`${formatRefined(remainder)} ref`);
  return parts.join(", ");
}
