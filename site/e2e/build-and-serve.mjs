/**
 * Build the fixture site, then serve it. One command, because Playwright's
 * `webServer` is one command, and a server that started before the build had
 * finished would serve whatever the last run left behind.
 */
import { buildFixtureSite } from "./fixture-site.mjs";

buildFixtureSite();
await import("./serve.mjs");
