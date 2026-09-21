/**
 * Serve the Variant Prices beside the page rather than inside it.
 *
 * The catalogue and the render manifest are read at build time and baked into
 * the exported HTML, because every row on the page shows something out of them.
 * The Variant Prices are a megabyte that only matters to a viewer who has asked
 * to see their own backpack (ADR-0005), so the document is copied into
 * `public/` and fetched when that happens. Baking it in would put a megabyte
 * into every visit for a feature most visits never open.
 *
 * Copied rather than linked, which is what `link-renders.mjs` next door does
 * with the render folder. A link is right there because the images are gigabytes
 * that are never committed; this is one committed file of about a megabyte, and
 * `next build` has to be able to read it through `out/` on a machine where the
 * link could not be made.
 *
 * It runs before `dev` and before `build`, and it never fails the command that
 * called it. A missing document means the Inventory view says it cannot price a
 * viewer's copies, which is what a deployment that has not run the data job
 * would do anyway; failing the build over it would hold the whole site hostage
 * to one feature.
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The same folder `src/catalogue/source.ts` reads the other two documents from,
// and configurable for the same reason: the end-to-end suite builds the whole
// site from the fixture set.
const catalogueDir = process.env.CATALOGUE_DIR
  ? resolve(process.env.CATALOGUE_DIR)
  : resolve(siteRoot, "..", "catalogue");
const source = resolve(catalogueDir, "variant-prices.json");
const destination = resolve(siteRoot, "public", "variant-prices.json");

function say(what) {
  process.stdout.write(`copy-variant-prices: ${what}\n`);
}

let text;
try {
  text = readFileSync(source, "utf8");
} catch {
  say(`no ${source} yet; the Inventory view will not be able to price a viewer's own copies`);
  process.exit(0);
}

// Parsed but not schema-checked. The shape is the reading side's business and
// `src/prices/variant-prices.ts` checks it where it is used; what this can
// usefully catch is a half-written file, which would otherwise be served as a
// perfectly good 200 that fails in the browser.
try {
  JSON.parse(text);
} catch (error) {
  say(`${source} is not valid JSON (${error.message}); it has not been copied`);
  process.exit(0);
}

try {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  say(`serving ${source} at /variant-prices.json`);
} catch (error) {
  say(`could not copy ${source} (${error.message}); the Inventory view will not be able to price copies`);
}
