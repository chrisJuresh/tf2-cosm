/**
 * The seam both documents are read through: which folder they come from, and
 * what a build is told when one of them is wrong.
 *
 * The message matters as much as the throw. A build that stops with a stack
 * trace from inside a validator has failed safely but told nobody which file to
 * go and look at, so each of the three ways a document can be unusable — absent,
 * not JSON, not its schema — is checked for naming the path and saying which of
 * the three it was. `e2e/build-validation.spec.ts` is the other half of this:
 * these tests say the loader refuses, that one says `next build` does.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { fixtureCatalogue, fixtureManifest } from "./fixtures.ts";

import { loadCatalogue } from "@/catalogue/load";
import { catalogueDir, DEFAULT_CATALOGUE_DIR } from "@/catalogue/source";
import { loadRenderManifest } from "@/renders/load";

/** A data folder of this test's own, with whatever contents the test wants in it. */
function dataDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tf2-cosm-data-"));
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(dir, name), contents);
  made.push(dir);
  process.env.CATALOGUE_DIR = dir;
  return dir;
}

const made: string[] = [];

afterEach(() => {
  delete process.env.CATALOGUE_DIR;
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("where the two documents are read from", () => {
  it("is the committed folder when nothing says otherwise", () => {
    expect(catalogueDir()).toBe(DEFAULT_CATALOGUE_DIR);
  });

  it("is CATALOGUE_DIR when one is set, so a build can be driven by a fixture pair", () => {
    const dir = dataDir({
      "catalogue.json": JSON.stringify(fixtureCatalogue()),
      "renders.json": JSON.stringify(fixtureManifest()),
    });
    expect(catalogueDir()).toBe(dir);
    expect(loadCatalogue().cosmetics).toHaveLength(fixtureCatalogue().cosmetics.length);
    expect(loadRenderManifest()).toEqual(fixtureManifest());
  });
});

describe("a document the site cannot build from", () => {
  it("names the file and the field when the catalogue violates its schema", () => {
    const broken = fixtureCatalogue() as unknown as { cosmetics: { slug: unknown }[] };
    broken.cosmetics[0]!.slug = "Not A Slug";
    const dir = dataDir({ "catalogue.json": JSON.stringify(broken) });

    expect(() => loadCatalogue()).toThrow(join(dir, "catalogue.json"));
    expect(() => loadCatalogue()).toThrow(/does not match its schema/);
    expect(() => loadCatalogue()).toThrow(/cosmetics\.0\.slug/);
  });

  it("names the file and the field when the manifest violates its contract", () => {
    const broken = fixtureManifest() as unknown as { version: unknown };
    broken.version = 999;
    const dir = dataDir({ "renders.json": JSON.stringify(broken) });

    expect(() => loadRenderManifest()).toThrow(join(dir, "renders.json"));
    expect(() => loadRenderManifest()).toThrow(/does not match its schema/);
    expect(() => loadRenderManifest()).toThrow(/version/);
  });

  it("says so plainly when the file is not JSON at all", () => {
    dataDir({ "catalogue.json": "{ not json" });
    expect(() => loadCatalogue()).toThrow(/is not valid JSON/);
  });

  it("says so plainly when the file is not there", () => {
    dataDir({});
    expect(() => loadCatalogue()).toThrow(/there is no such file/);
    expect(() => loadRenderManifest()).toThrow(/there is no such file/);
  });
});
