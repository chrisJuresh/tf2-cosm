import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { buildCatalogue } from "../src/catalogue/build.ts";
import { fixturePricedInputs } from "./fixtures.ts";

const GOLDEN = fileURLToPath(new URL("./golden/catalogue.json", import.meta.url));

/**
 * The whole document, so that any change to the catalogue's shape is deliberate.
 * Run with UPDATE_GOLDEN=1 to rewrite it, then read the diff before committing.
 */
it("builds the catalogue the golden file records", async () => {
  const built = `${JSON.stringify(buildCatalogue(await fixturePricedInputs()).catalogue, null, 2)}\n`;
  if (process.env["UPDATE_GOLDEN"] === "1") writeFileSync(GOLDEN, built, "utf8");
  // `.gitattributes` pins this file to LF; the normalisation is for a checkout
  // made before that line existed, where the shape is still what is under test.
  expect(built).toBe(readFileSync(GOLDEN, "utf8").replaceAll("\r\n", "\n"));
});
