/**
 * Backpack Icon URLs, as the site is allowed to load them.
 *
 * Valve's schema hands the icon out over plain `http`. A page served over
 * `https` will not load a `http` image at all — the browser blocks it as mixed
 * content and the row is left with a hole — so the scheme is upgraded here.
 * Valve serves the same URL over `https` perfectly well.
 */
export function secureIconUrl(url: string): string {
  const insecure = "http://";
  return url.startsWith(insecure) ? `https://${url.slice(insecure.length)}` : url;
}
