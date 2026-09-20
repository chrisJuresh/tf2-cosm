import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { buildCatalogue } from "../src/catalogue/build.ts";
import { fixtureInputs } from "./fixtures.ts";

const GOLDEN = fileURLToPath(new URL("./golden/catalogue.json", import.meta.url));

/**
 * The whole document, so that any change to the catalogue's shape is deliberate.
 * Run with UPDATE_GOLDEN=1 to rewrite it, then read the diff before committing.
 */
it("builds the catalogue the golden file records", () => {
  const built = `${JSON.stringify(buildCatalogue(fixtureInputs()).catalogue, null, 2)}\n`;
  if (process.env["UPDATE_GOLDEN"] === "1") writeFileSync(GOLDEN, built, "utf8");
  expect(built).toBe(readFileSync(GOLDEN, "utf8"));
});
