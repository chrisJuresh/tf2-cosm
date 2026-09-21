/**
 * Where the end-to-end suite's built site comes from, and what it is built out
 * of.
 *
 * The committed catalogue would make a poor subject. It is today's snapshot —
 * eighteen hundred Cosmetics whose prices move every run — and the manifest
 * beside it is empty until somebody has rendered something locally, so a suite
 * driven by it could assert almost nothing and would assert it differently
 * tomorrow. So the built site under test is built from the fixture pair
 * instead: the data job's golden catalogue, which is the shared Cosmetic oracle
 * the whole repository agrees on, and the render job's own fixture manifest.
 * Between them they cover a price in Metal and one in Keys, an Unpriced item,
 * Styles, both Teams, and all three of Class-Exclusive, Multi-Class and
 * All-Class.
 *
 * The images the manifest names are placeholders written here. The manifest
 * records that an image was produced and how big it is; what is actually in the
 * file is the render job's business, and a suite that needed real renders could
 * not run without Blender and the game installed.
 *
 * Everything this writes lives under `site/.e2e/`, which is ignored, and the
 * built site is copied there rather than served out of `out/` — so the tree
 * under test cannot be pulled out from under a running suite by a `next build`
 * elsewhere, which `build-validation.spec.ts` does twice. Note what that does
 * *not* protect: `next build` writes `site/out` whatever else happens, so a run
 * of this suite leaves a developer's own export replaced by an eight-Cosmetic
 * one, and a failed build leaves `.next` mid-failure. Both are rebuilt by the
 * next `pnpm build-site`.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(siteRoot, "..");

/** Everything the suite builds, all of it disposable. */
export const WORK_DIR = join(siteRoot, ".e2e");
/** The data folder `CATALOGUE_DIR` points the build at. */
export const DATA_DIR = join(WORK_DIR, "data");
/** The placeholder images, served at `/renders`. */
export const RENDERS_DIR = join(WORK_DIR, "renders");
/** The built static site, as the suite serves it. */
export const SITE_DIR = join(WORK_DIR, "site");

/** Where the suite serves it. Loopback only: nothing here is meant to be reachable. */
export const PORT = 4173;
export const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * The inventory proxy the fixture site is built against (ADR-0006).
 *
 * A name that resolves to nothing, deliberately. `NEXT_PUBLIC_*` is inlined at
 * build time, so this is baked into the exported JavaScript and is what the page
 * will actually try to reach; `e2e/catalogue-page.ts` intercepts it and answers
 * with a fixture backpack. If that interception were ever removed the requests
 * would fail rather than reach anybody, which is the right way round.
 */
export const INVENTORY_API_URL = "https://inventory.invalid.test";

/** The golden catalogue, read where it lives rather than copied into a fixture of our own. */
export const GOLDEN_CATALOGUE = join(repoRoot, "data", "tests", "golden", "catalogue.json");
/** Its other half: the same run's Variant Prices, which the Inventory view fetches. */
export const GOLDEN_VARIANT_PRICES = join(repoRoot, "data", "tests", "golden", "variant-prices.json");
/** The render job's own fixture manifest, the one `tests/test_site_render_manifest.py` validates. */
export const FIXTURE_MANIFEST = join(siteRoot, "tests", "fixtures", "renders.json");

/**
 * A 1×1 image in each of the two formats the render job writes: a PNG master
 * and a WebP derivative. A real render is a 1024px bust; nothing in the site
 * reads a pixel of one, because every width and height on the page comes out of
 * the manifest.
 *
 * The PNG stands in for a Backpack Icon as well — see `e2e/catalogue-page.ts`,
 * which answers Valve's CDN with it. One blob, so a reader meeting it in either
 * place finds the same explanation.
 */
export const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const PLACEHOLDER = {
  ".png": PLACEHOLDER_PNG,
  ".webp": Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64"),
};

/**
 * The two fixture documents as plain JSON.
 *
 * `tests/fixtures.ts` reads the same two files and validates them on the way
 * out, which is right for a suite testing what the site does with a *valid*
 * pair. These are for the suites that are about the files themselves — the one
 * that breaks a copy on purpose most of all — so they parse and hand back, and
 * they live here because this is the module that knows where the two files are.
 */
export function readGoldenCatalogue() {
  return JSON.parse(readFileSync(GOLDEN_CATALOGUE, "utf8"));
}

export function readFixtureManifest() {
  return JSON.parse(readFileSync(FIXTURE_MANIFEST, "utf8"));
}

/** Every image path the manifest names, master and derivative alike. */
function imagePaths(manifest) {
  const paths = [];
  for (const byClass of Object.values(manifest.renders)) {
    for (const byTeam of Object.values(byClass)) {
      for (const byStyle of Object.values(byTeam)) {
        for (const entry of Object.values(byStyle)) {
          for (const picture of [entry.worn, entry.alone]) {
            if (picture === null) continue;
            paths.push(picture.master.path, ...Object.values(picture.derivatives).map((i) => i.path));
          }
        }
      }
    }
  }
  return paths;
}

function writePlaceholders(manifest) {
  for (const path of imagePaths(manifest)) {
    const file = join(RENDERS_DIR, path);
    const bytes = PLACEHOLDER[path.endsWith(".webp") ? ".webp" : ".png"];
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
}

/**
 * Build the site the suite runs against, and return where it is.
 *
 * `next build` is run directly rather than through `pnpm build`, because the
 * package's own `prebuild` links the repository's `renders/` folder into
 * `public/` for development and this build serves its placeholders from
 * somewhere else entirely — see `e2e/serve.mjs`.
 */
export function buildFixtureSite() {
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });

  cpSync(GOLDEN_CATALOGUE, join(DATA_DIR, "catalogue.json"));
  cpSync(FIXTURE_MANIFEST, join(DATA_DIR, "renders.json"));
  cpSync(GOLDEN_VARIANT_PRICES, join(DATA_DIR, "variant-prices.json"));
  // The Variant Prices are served beside the page rather than baked into it
  // (ADR-0005), which `scripts/copy-variant-prices.mjs` does before a real
  // build. This build runs `next build` directly, so the copy is made here —
  // and it has to be the same run's document as the catalogue above, because
  // the site refuses a mismatched pair.
  mkdirSync(join(siteRoot, "public"), { recursive: true });
  cpSync(GOLDEN_VARIANT_PRICES, join(siteRoot, "public", "variant-prices.json"));
  writePlaceholders(readFixtureManifest());

  const built = nextBuild(DATA_DIR);
  if (!built.ok) throw new Error(`the fixture site would not build:\n${built.output}`);
  cpSync(join(siteRoot, "out"), SITE_DIR, { recursive: true });
  return SITE_DIR;
}

/**
 * One `next build`, reading its two documents from `catalogueDir`.
 *
 * Returns whether the build succeeded together with everything it printed,
 * rather than throwing on a non-zero exit, because a build that is *meant* to
 * fail is the subject of `e2e/build-validation.spec.ts` and what it said while
 * failing is the thing that test is about.
 */
export function nextBuild(catalogueDir) {
  try {
    const output = execFileSync("node", [nextCli(), "build"], {
      cwd: siteRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CATALOGUE_DIR: catalogueDir,
        NEXT_PUBLIC_INVENTORY_API_URL: INVENTORY_API_URL,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    });
    return { ok: true, output };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` || String(error.message) };
  }
}

/** Next's own CLI entry point, wherever pnpm happened to put it. */
function nextCli() {
  const packageJson = createRequire(import.meta.url).resolve("next/package.json");
  return join(dirname(packageJson), "dist", "bin", "next");
}
