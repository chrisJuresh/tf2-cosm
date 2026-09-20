/**
 * The end-to-end suite: the built static site, in a real browser, on a desktop
 * and on a phone.
 *
 * What it is built from and how it is served is `e2e/fixture-site.mjs` and
 * `e2e/serve.mjs` — the fixture pair, exported by `next build`, served as plain
 * files. Nothing here talks to the network: the only requests that leave the
 * page are for Valve's Backpack Icons, and the smoke test stubs those, so the
 * suite runs offline and says the same thing every time.
 *
 * Everything runs one worker at a time. The builds are the expensive part and
 * they are CPU-bound, and `build-validation.spec.ts` runs `next build` itself,
 * which would collide with a second build sharing the same `.next`.
 */
import { defineConfig, devices } from "@playwright/test";

import { BASE_URL } from "./e2e/fixture-site.mjs";

/** A build plus an export; generous, because a cold one compiles from scratch. */
const BUILD_TIMEOUT = 5 * 60 * 1000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI === undefined ? "list" : "github",
  timeout: BUILD_TIMEOUT,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    // The build's own behaviour, which needs no browser and no server.
    { name: "build", testMatch: /build-validation\.spec\.ts/ },
    {
      name: "desktop",
      testIgnore: /build-validation\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    // A phone, emulated down to the touch events and the user agent, because
    // the list lays itself out differently below `sm` and that layout has never
    // been exercised anywhere — jsdom applies no stylesheet at all.
    { name: "phone", testIgnore: /build-validation\.spec\.ts/, use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "node e2e/build-and-serve.mjs",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: BUILD_TIMEOUT,
    stdout: "pipe",
    stderr: "pipe",
  },
});
