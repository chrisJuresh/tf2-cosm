import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/**
 * Fully static output: `next build` writes `out/` and there is no server at any
 * point. Everything the page shows is baked in from the committed catalogue
 * (ADR-0002), so nothing is fetched at request time and the site has no
 * configuration of its own — every rate it quotes comes out of the catalogue's
 * own header.
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
};

export default nextConfig;
