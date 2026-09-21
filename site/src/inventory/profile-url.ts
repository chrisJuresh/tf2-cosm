/**
 * The profile in the address bar: the one thing on this page that is worth
 * sharing as a link.
 *
 * A viewer who has looked up a backpack has made the page about somebody — and
 * a page about somebody that cannot be sent to anybody is half a feature. So the
 * profile rides in the query string, and the address bar is the share button.
 *
 * What rides there is the viewer's own text, not something parsed out of it. The
 * proxy is the side that knows what names a Steam profile (`worker/src/profile.ts`
 * turns a pasted URL, a vanity name or a SteamID64 into one thing), and a second
 * copy of that rule here would be a second copy to keep in step for the sake of
 * a prettier link. A pasted profile URL therefore arrives percent-encoded, which
 * is ugly and correct; a typed vanity name arrives as itself.
 *
 * Everything here is pure and takes a query string rather than reading the
 * browser's, so the rules are driven by tests and the hook is a surface over
 * them.
 */

/** The parameter a profile rides in. Named for what a viewer would guess. */
export const PROFILE_PARAM = "profile";

/**
 * The profile a link names, or null when it names none. Blank is none: a bare
 * `?profile=` is somebody who trimmed the value out of the link, not a request
 * to look up nobody.
 */
export function profileFromSearch(search: string): string | null {
  const asked = new URLSearchParams(search).get(PROFILE_PARAM)?.trim() ?? "";
  return asked === "" ? null : asked;
}

/**
 * The same query string with this profile in it, or without it when there is
 * none. Every other parameter is left exactly as it was: the profile is one
 * thing the page is about, not the only thing a link may carry.
 */
export function searchWithProfile(search: string, profile: string | null): string {
  const params = new URLSearchParams(search);
  const trimmed = profile?.trim() ?? "";
  if (trimmed === "") params.delete(PROFILE_PARAM);
  else params.set(PROFILE_PARAM, trimmed);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}
