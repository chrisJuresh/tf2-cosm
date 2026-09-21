import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { buildCatalogue } from "../src/catalogue/build.ts";
import { fixtureMarketKeyPrice, fixturePricedInputs } from "./fixtures.ts";

const GOLDEN = fileURLToPath(new URL("./golden/variant-prices.json", import.meta.url));

/**
 * The whole second document, on the same terms as the catalogue's golden file,
 * so that any change to its shape is deliberate. The site reads this one too.
 *
 * Run with UPDATE_GOLDEN=1 to rewrite it, then read the diff before committing.
 */
it("builds the Variant Prices the golden file records", async () => {
  const inputs = await fixturePricedInputs({ marketKeyPrice: await fixtureMarketKeyPrice() });
  const built = `${JSON.stringify(buildCatalogue(inputs).variantPrices, null, 2)}\n`;
  if (process.env["UPDATE_GOLDEN"] === "1") writeFileSync(GOLDEN, built, "utf8");
  // `.gitattributes` pins this file to LF; the normalisation is for a checkout
  // made before that line existed, where the shape is still what is under test.
  expect(built).toBe(readFileSync(GOLDEN, "utf8").replaceAll("\r\n", "\n"));
});
