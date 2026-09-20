import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/**
 * Configuration lives in one `.env` at the repository root, the same file the
 * data job reads, rather than in a second one next to the site. Next only looks
 * beside itself, so the root file is loaded here and the one setting the site
 * takes from it is passed through — it is a published rate, not a secret, and no
 * key is ever read here.
 */
const ROOT_ENV = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);

const keyPrice = process.env["STEAM_MARKET_KEY_PRICE_USD"];

/**
 * Fully static output: `next build` writes `out/` and there is no server at any
 * point. Everything the page shows is baked in from the committed catalogue
 * (ADR-0002), so nothing is fetched at request time.
 */
const nextConfig: NextConfig = {
  output: "export",
  // Every change is developed in a worktree of this repository, inside this
  // repository, so Next finds two lockfiles and has to be told which root is
  // this one's.
  outputFileTracingRoot: fileURLToPath(new URL("../", import.meta.url)),
  // The catalogue contract lives in the data job as TypeScript source, so Next
  // compiles it rather than expecting a published build.
  transpilePackages: ["@tf2-cosm/data"],
  // A static export has no image optimiser; Backpack Icons are plain lazy <img>
  // tags pointed at Valve's CDN, which is what `images.unoptimized` declares.
  images: { unoptimized: true },
  typedRoutes: true,
  ...(keyPrice === undefined || keyPrice.trim() === "" ? {} : { env: { STEAM_MARKET_KEY_PRICE_USD: keyPrice } }),
};

export default nextConfig;
