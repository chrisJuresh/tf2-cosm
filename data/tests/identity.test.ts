import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { displayName, slugify } from "../src/catalogue/identity.ts";

/**
 * The shared slug oracle. The render job derives the same slug from the same name, and
 * the site looks its render manifest up by it, so the two rules are one rule. Its half of
 * this table is `tests/test_cosmetic_identity.py`; the reasoning is
 * `docs/fixtures/cosmetic-oracle.md`.
 */
const ORACLE = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../tests/fixtures/slugs.json", import.meta.url)), "utf8"),
) as { slugs: Record<string, string>; unsluggable: string[] };

describe("displayName", () => {
  it("strips a leading The, whatever its case", () => {
    expect(displayName("The Team Captain")).toBe("Team Captain");
    expect(displayName("the Tin Pot")).toBe("Tin Pot");
  });

  it("leaves a name that only starts with those letters alone", () => {
    expect(displayName("Thermal Tracker")).toBe("Thermal Tracker");
  });

  it("is idempotent", () => {
    expect(displayName(displayName("The Triad Trinket"))).toBe("Triad Trinket");
  });
});

describe("slugify", () => {
  it.each(Object.entries(ORACLE.slugs))("slugs %j to %j, as the render job does", (name, expected) => {
    expect(slugify(name)).toBe(expected);
  });

  it.each(ORACLE.unsluggable)("refuses %j, which has nothing to slug", (name) => {
    expect(() => slugify(name)).toThrow();
  });

  it("is idempotent, so re-slugging a stored identifier cannot drift", () => {
    for (const expected of Object.values(ORACLE.slugs)) expect(slugify(expected)).toBe(expected);
  });
});
