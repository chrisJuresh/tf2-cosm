/**
 * What the viewer pasted, turned into something Steam can be asked about.
 *
 * People paste whatever is in their address bar. Steam has two kinds of profile
 * URL — `/profiles/<id64>` for everybody and `/id/<vanity>` for anybody who has
 * claimed a custom URL — and both come with and without the scheme, the `www.`,
 * the trailing slash and a page underneath (`/inventory`, `/games`). Some people
 * paste neither and type the vanity name, or the seventeen-digit number itself.
 *
 * All of it reduces to one of two things: a SteamID64, which needs no lookup, or
 * a vanity name, which needs one. Everything here is pure, so the whole surface
 * of what a viewer may type is a table in a test rather than a thing to find out
 * in production.
 */

/** A SteamID64 is seventeen digits and begins 7656119, which is the individual-account range. */
const STEAM_ID_64 = /^7656119\d{10}$/;

/**
 * What Steam accepts as a custom URL: three to thirty-two of letters, digits,
 * underscore and hyphen. Anything else was not a vanity name and asking Steam
 * about it only spends a request to be told so.
 */
const VANITY = /^[A-Za-z0-9_-]{3,32}$/;

/**
 * A run of digits long enough that somebody meant it as a SteamID64.
 *
 * It matters because an all-digit string is also a legal custom URL, so a
 * mistyped ID — one digit short, or a digit wrong in the account range — would
 * otherwise be taken as a vanity name and looked up as one. The viewer would
 * then be told there is no profile at `steamcommunity.com/id/76561297960435530`,
 * which is true and no help at all to somebody who was typing an ID.
 *
 * Short numbers are left alone: "1234567890" really could be a custom URL
 * somebody claimed, and a lookup that finds nothing tells them so honestly.
 */
const ATTEMPTED_STEAM_ID = /^\d{15,20}$/;

export type Profile =
  | { readonly kind: "steam-id"; readonly steamId: string }
  | { readonly kind: "vanity"; readonly vanity: string };

/**
 * The profile a viewer's text names, or undefined when it names none.
 *
 * Undefined is a real answer and not a failure to try harder: it is what the
 * viewer is told when they have pasted a Steam *store* link, someone's screen
 * name with a space in it, or an empty box. Guessing past it would turn a
 * mistyped name into a lookup of somebody else's profile.
 */
export function readProfile(text: string): Profile | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;

  const fromUrl = fromProfileUrl(trimmed);
  if (fromUrl !== undefined) return fromUrl;

  if (STEAM_ID_64.test(trimmed)) return { kind: "steam-id", steamId: trimmed };
  // Checked before the vanity rule, which digits would otherwise satisfy.
  if (ATTEMPTED_STEAM_ID.test(trimmed)) return undefined;
  if (VANITY.test(trimmed)) return { kind: "vanity", vanity: trimmed };
  return undefined;
}

/**
 * The two path shapes, from anything URL-like. A path deeper than the profile —
 * `/id/someone/inventory/` is what somebody looking at their own backpack has in
 * the address bar — names the same profile, so the segment after the id is
 * ignored rather than refused.
 *
 * The host is checked. `steamcommunity.com` is the only place these paths mean
 * anything, and honouring the shape on any host would make this a proxy for
 * fetching whatever a caller names.
 */
function fromProfileUrl(text: string): Profile | undefined {
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "steamcommunity.com") return undefined;

  const [kind, value] = url.pathname.split("/").filter((part) => part !== "");
  if (value === undefined) return undefined;
  const decoded = safeDecode(value);
  if (kind === "profiles" && STEAM_ID_64.test(decoded)) return { kind: "steam-id", steamId: decoded };
  if (kind === "id" && VANITY.test(decoded)) return { kind: "vanity", vanity: decoded };
  return undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
