/**
 * The two calls this Worker makes to Steam, and what each failure means.
 *
 * Both are unauthenticated. Resolving a vanity name has an official Web API
 * endpoint, `ISteamUser/ResolveVanityURL`, and it wants a Steam Web API key;
 * the community profile's own `?xml=1` answers the same question without one,
 * so this Worker holds no secret at all. That is worth more than the tidier
 * endpoint: a deployed, public, keyless proxy is one that cannot leak a key, and
 * one anybody can stand up from this repository without being given anything.
 *
 * Steam's failures are the whole user experience here, so each one is turned
 * into a code the site can write a sentence for. "Your inventory is private" is
 * the common case and it is not an error in any sense the viewer cares about.
 */
import { type Profile } from "./profile.ts";
import type { SteamInventory } from "./inventory.ts";

const COMMUNITY = "https://steamcommunity.com";

/** The TF2 backpack: app 440, context 2. Nothing else is ever asked for. */
const APP_ID = 440;
const CONTEXT_ID = 2;

/** Steam's own ceiling on one inventory request. A bigger backpack takes more pages. */
const PAGE_SIZE = 2000;

/**
 * How many pages will be walked before giving up. Ten pages is twenty thousand
 * items, which is far past any real backpack; the bound exists because this is a
 * public endpoint and a request that walks forever is a request somebody can aim
 * at us.
 */
const MAX_PAGES = 10;

export type FailureCode =
  | "bad-request"
  | "no-such-profile"
  | "private-inventory"
  | "rate-limited"
  | "steam-unavailable"
  | "too-many-items";

export class SteamFailure extends Error {
  constructor(readonly code: FailureCode, message: string) {
    super(message);
    this.name = "SteamFailure";
  }
}

/** Every outbound call, with the timeout and the error handling in one place. */
async function get(url: string, accept: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept, "user-agent": "tf2-cosm inventory proxy (https://github.com/chrisJuresh/tf2-cosm)" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SteamFailure("steam-unavailable", "Steam did not answer. It may be down; try again in a minute.");
  }
  if (response.status === 429) {
    throw new SteamFailure(
      "rate-limited",
      "Steam is rate-limiting us. Everybody using this page shares one address with Steam, so this passes; try again in a few minutes.",
    );
  }
  return response;
}

/**
 * The SteamID64 behind whatever the viewer pasted.
 *
 * A pasted SteamID64 is taken at its word and not looked up: the lookup would
 * only tell us it exists, which the inventory call is about to find out anyway,
 * and it would double the requests this Worker makes for no answer it acts on.
 */
export async function resolveSteamId(profile: Profile): Promise<string> {
  if (profile.kind === "steam-id") return profile.steamId;

  const url = `${COMMUNITY}/id/${encodeURIComponent(profile.vanity)}/?xml=1`;
  const response = await get(url, "text/xml");
  if (!response.ok) {
    throw new SteamFailure("steam-unavailable", `Steam answered ${response.status} looking up that profile.`);
  }
  const xml = await response.text();
  const steamId = /<steamID64>(\d+)<\/steamID64>/.exec(xml)?.[1];
  if (steamId === undefined) {
    // Steam answers 200 with an <error> element for a name nobody has claimed,
    // so the absence of the id is the signal, not the status.
    throw new SteamFailure("no-such-profile", `Steam has no profile at steamcommunity.com/id/${profile.vanity}.`);
  }
  return steamId;
}

/**
 * Every page of a SteamID64's TF2 backpack.
 *
 * Steam pages by the last asset id rather than by an offset, and says
 * `more_items` when there is another page. A backpack past `MAX_PAGES` is
 * refused rather than truncated: a total that quietly leaves out a viewer's
 * most valuable six hats is worse than being told the backpack is too big.
 */
export async function fetchInventory(steamId: string): Promise<SteamInventory[]> {
  const pages: SteamInventory[] = [];
  let startAssetId: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${COMMUNITY}/inventory/${steamId}/${APP_ID}/${CONTEXT_ID}`);
    // English, always: the craftability flag is a sentence in the item's own
    // description text, so the language this is asked in is load-bearing.
    url.searchParams.set("l", "english");
    url.searchParams.set("count", String(PAGE_SIZE));
    if (startAssetId !== undefined) url.searchParams.set("start_assetid", startAssetId);

    const response = await get(url.toString(), "application/json");
    if (response.status === 401 || response.status === 403) {
      throw new SteamFailure(
        "private-inventory",
        "That backpack is private. Steam only shows an inventory the owner has made public: Profile → Edit Profile → Privacy Settings → Inventory → Public.",
      );
    }
    if (response.status === 404) {
      throw new SteamFailure("no-such-profile", "Steam has no profile with that ID.");
    }
    if (!response.ok) {
      throw new SteamFailure("steam-unavailable", `Steam answered ${response.status} for that backpack.`);
    }

    let body: SteamInventory | null;
    try {
      body = (await response.json()) as SteamInventory | null;
    } catch {
      throw new SteamFailure("steam-unavailable", "Steam answered with something that was not an inventory.");
    }
    // A public profile with an empty TF2 backpack answers `null` rather than an
    // empty inventory, which is an empty backpack and not a failure.
    if (body === null) return pages;
    pages.push(body);

    if (body.more_items !== 1) return pages;
    startAssetId = body.last_assetid;
    if (startAssetId === undefined) return pages;
  }

  throw new SteamFailure(
    "too-many-items",
    `That backpack has more than ${MAX_PAGES * PAGE_SIZE} items, which is more than this page will read.`,
  );
}
