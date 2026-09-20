/**
 * Serve the local render folder in development.
 *
 * The render job writes its images to `renders/` at the repository root, and
 * they are never committed (ADR-0001). The site serves `site/public`, and the
 * default image base is `/renders`. This links the one to the other — a
 * directory junction on Windows, a symlink everywhere else — so a local render
 * run shows up on the page with no copying and nothing to keep in step.
 *
 * It runs before `dev` and before `build`, and it never fails the command that
 * called it: no renders yet, or a link that cannot be made on this machine, both
 * just mean the page falls back to Backpack Icons, which is what it does in
 * production for an unrendered Cosmetic anyway. A real `RENDER_OUTPUT_ROOT`
 * elsewhere, or a `NEXT_PUBLIC_RENDER_BASE_URL` pointing at a bucket, makes this
 * irrelevant rather than wrong.
 */
import { lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.env.RENDER_OUTPUT_ROOT
  ? resolve(process.env.RENDER_OUTPUT_ROOT)
  : resolve(siteRoot, "..", "renders");
const link = resolve(siteRoot, "public", "renders");

function say(what) {
  process.stdout.write(`link-renders: ${what}\n`);
}

function existingLink() {
  try {
    return lstatSync(link).isSymbolicLink() ? readlinkSync(link) : null;
  } catch {
    return null;
  }
}

try {
  if (!lstatSync(target).isDirectory()) {
    say(`${target} is not a folder; the page will show Backpack Icons`);
    process.exit(0);
  }
} catch {
  say(`no renders at ${target} yet; the page will show Backpack Icons`);
  process.exit(0);
}

const already = existingLink();
if (already !== null && resolve(already) === target) {
  process.exit(0);
}

try {
  if (already !== null) unlinkSync(link);
  mkdirSync(dirname(link), { recursive: true });
  // "junction" is what lets this work on Windows without administrator rights;
  // every other platform ignores the argument and makes a plain symlink.
  symlinkSync(target, link, "junction");
  say(`serving ${target} at /renders`);
} catch (error) {
  say(`could not link ${target} to public/renders (${error.message}); the page will show Backpack Icons`);
}
