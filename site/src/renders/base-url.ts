/**
 * Where the Worn Render images are served from.
 *
 * The manifest records every path relative to the render job's output root
 * (`render.output`), which is configuration on that side precisely so the folder
 * can become a bucket without the manifest changing. This is the same seam on
 * this side: the base is `NEXT_PUBLIC_RENDER_BASE_URL`, read at build time and
 * baked into the static export, and the default is the folder the site serves
 * itself.
 *
 *     NEXT_PUBLIC_RENDER_BASE_URL=https://images.example.com/renders
 *
 * In development the default wins and `site/public/renders` is where the images
 * are, which `pnpm dev` links to the repository's own `renders/` folder — see
 * `site/scripts/link-renders.mjs`. Images are never committed (ADR-0001), so
 * that folder is whatever the last local render run produced, and a Cosmetic it
 * has no picture for falls back to its Backpack Icon exactly as it would in
 * production.
 */

/** The default base: the folder a locally built site serves the renders from. */
export const DEFAULT_RENDER_BASE_URL = "/renders";

/**
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time, so this is a constant
 * in the shipped bundle rather than a lookup in the browser.
 */
export const RENDER_BASE_URL = process.env.NEXT_PUBLIC_RENDER_BASE_URL?.trim() || DEFAULT_RENDER_BASE_URL;

/**
 * A token standing for one render run, taken from when that render was made.
 *
 * The images are served with a week of `Cache-Control`, and a re-rendered image
 * keeps the path it had: same Cosmetic, same Class, same Team, same Style, same
 * file name. So a CDN holding the old bytes goes on serving them, and it expires
 * each object at its own moment — which is how the SpaceChem Pin came to show
 * the old framing at 256 and the new framing at 512 on one page, the two sizes
 * having been cached a few hours apart.
 *
 * Carrying the render's own timestamp in the URL makes a re-render a different
 * URL and so a miss by construction, while an image nothing re-rendered keeps
 * its URL and its week. Whole seconds rather than the ISO string because it is
 * short, opaque and ordered; a timestamp that will not parse yields no token at
 * all, which is the URL this function used to return rather than a broken one.
 */
export function renderVersion(renderedAt: string): string | null {
  const at = Date.parse(renderedAt);
  if (Number.isNaN(at)) return null;
  return String(Math.floor(at / 1000));
}

/**
 * One manifest path under a base, as a URL the page can load. Kept pure and
 * separate from the setting itself so the joining is testable without a build:
 * a base with a trailing slash and one without have to come out the same, or a
 * deployment ends up serving every image from a doubled slash.
 *
 * The version, where there is one, is a query the object store ignores when it
 * serves the file and a CDN keys its cache on when it stores it.
 */
export function joinRenderUrl(base: string, path: string, version?: string | null): string {
  const url = `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  if (version === undefined || version === null) return url;
  return `${url}?v=${encodeURIComponent(version)}`;
}

/**
 * Where one manifest path is served from under the configured base, stamped with
 * when the render behind it was made.
 */
export function renderUrl(path: string, renderedAt?: string): string {
  return joinRenderUrl(RENDER_BASE_URL, path, renderedAt === undefined ? null : renderVersion(renderedAt));
}
