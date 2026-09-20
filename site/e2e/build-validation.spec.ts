/**
 * The build refuses bad input.
 *
 * `tests/source.test.ts` says the loader throws and what it says while
 * throwing; this says the thing that matters operationally — that a `next
 * build` handed a catalogue or a manifest that violates its schema exits
 * non-zero and prints which file and which field, rather than exporting a page
 * of wrong numbers or missing pictures. Nothing but a real build can say that,
 * so these run one.
 *
 * They are slow and they are two, and both are worth it: the two documents come
 * out of two different jobs, validate through two different schemas, and a
 * regression in either one would deploy quietly.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { FIXTURE_MANIFEST, GOLDEN_CATALOGUE, nextBuild, WORK_DIR } from "./fixture-site.mjs";

/** A data folder of this test's own, so the fixture site's is left alone. */
const BROKEN_DIR = join(WORK_DIR, "broken");

function dataDir(catalogue: unknown, manifest: unknown): string {
  rmSync(BROKEN_DIR, { recursive: true, force: true });
  mkdirSync(BROKEN_DIR, { recursive: true });
  writeFileSync(join(BROKEN_DIR, "catalogue.json"), JSON.stringify(catalogue));
  writeFileSync(join(BROKEN_DIR, "renders.json"), JSON.stringify(manifest));
  return BROKEN_DIR;
}

function goldenCatalogue(): { cosmetics: { slug: string }[] } {
  return JSON.parse(readFileSync(GOLDEN_CATALOGUE, "utf8")) as { cosmetics: { slug: string }[] };
}

function fixtureManifest(): { version: number } {
  return JSON.parse(readFileSync(FIXTURE_MANIFEST, "utf8")) as { version: number };
}

test.afterAll(() => {
  rmSync(BROKEN_DIR, { recursive: true, force: true });
});

test("a catalogue that violates its schema fails the build, naming the file and the field", () => {
  const catalogue = goldenCatalogue();
  catalogue.cosmetics[0]!.slug = "Not A Slug";

  const { ok, output } = nextBuild(dataDir(catalogue, fixtureManifest()));

  expect(ok).toBe(false);
  expect(output).toContain("the site will not build from");
  expect(output).toContain("catalogue.json");
  expect(output).toContain("does not match its schema");
  expect(output).toContain("cosmetics.0.slug");
});

test("a manifest that violates its contract fails the build the same way", () => {
  const manifest = fixtureManifest();
  manifest.version = 999;

  const { ok, output } = nextBuild(dataDir(goldenCatalogue(), manifest));

  expect(ok).toBe(false);
  expect(output).toContain("the site will not build from");
  expect(output).toContain("renders.json");
  expect(output).toContain("does not match its schema");
  expect(output).toContain("version");
});
