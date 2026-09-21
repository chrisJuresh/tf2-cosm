/**
 * The inventory proxy: the one piece of server this project has.
 *
 * Steam answers `steamcommunity.com/inventory/<id64>/440/2` with JSON and no
 * `Access-Control-Allow-Origin` header, so a static page cannot read a backpack
 * itself however much it would like to. This Worker reads it and answers with
 * CORS. That is the whole reason it exists, and it is kept to that: it holds no
 * secret, stores nothing, and answers in the shape the site needs rather than
 * forwarding Steam's.
 *
 * It does not reopen ADR-0002. Every price the site shows still comes out of the
 * committed snapshot and nothing here carries one. An Inventory is one viewer's
 * own, live, and cannot be committed, so it is the one thing the site cannot
 * read from a file — and this is the smallest thing that makes it readable.
 *
 * ## The shape
 *
 *     GET /inventory?q=<whatever the viewer pasted>
 *
 * answers `{ steamId, takenAt, copies: [...], counts: {...} }`, or
 * `{ error: <code>, message }` with a status. The codes are in `steam.ts` and
 * every one of them has a sentence a person can act on, because a proxy's error
 * messages *are* its user interface.
 */
import { readInventory } from "./inventory.ts";
import { readProfile } from "./profile.ts";
import { fetchInventory, resolveSteamId, SteamFailure, type FailureCode } from "./steam.ts";

/**
 * How long an answer is held. Steam rate-limits the inventory endpoint by
 * address, and a Worker is one address for everybody who opens the page, so the
 * cache is not a nicety — it is the thing that keeps one person refreshing from
 * spending everybody's budget. Five minutes is well inside how often a backpack
 * changes and well under how quickly Steam starts refusing.
 */
const CACHE_SECONDS = 300;

/** What a failure comes back as. A private backpack is not the site's fault, nor Steam's. */
const STATUS: Record<FailureCode, number> = {
  "bad-request": 400,
  "no-such-profile": 404,
  "private-inventory": 403,
  "rate-limited": 429,
  "steam-unavailable": 502,
  "too-many-items": 413,
};

/**
 * Who may read this. It is a public, unauthenticated, read-only endpoint over
 * data Steam already publishes to anybody, so the answer is anybody — the header
 * is here because a browser demands it, not because there is a secret behind it.
 * Nothing is credentialed, so `*` cannot be used to ride somebody's session.
 */
function cors(headers: Headers): Headers {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-max-age", "86400");
  return headers;
}

function json(body: unknown, status: number, cacheSeconds: number): Response {
  const headers = cors(new Headers({ "content-type": "application/json; charset=utf-8" }));
  headers.set(
    "cache-control",
    cacheSeconds > 0 ? `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}` : "no-store",
  );
  return new Response(JSON.stringify(body), { status, headers });
}

function failure(code: FailureCode, message: string): Response {
  // A failure is never cached. A private backpack made public, or a Steam outage
  // that passes, should be visible on the viewer's next try rather than five
  // minutes later.
  return json({ error: code, message }, STATUS[code], 0);
}

async function inventory(request: Request, ctx: ExecutionContext): Promise<Response> {
  const asked = new URL(request.url).searchParams.get("q") ?? "";
  const profile = readProfile(asked);
  if (profile === undefined) {
    return failure(
      "bad-request",
      "That does not look like a Steam profile. Paste the address of your profile page, or your custom URL name, or your 17-digit Steam ID.",
    );
  }

  // Cached on what the viewer asked for rather than on the resolved id, so the
  // vanity lookup is cached along with the backpack and a repeat costs Steam
  // nothing at all. One backpack reached both by its custom URL and by its ID is
  // two entries, which is a few hundred wasted bytes against a whole extra
  // request on every cache miss.
  const key = new Request(
    `https://inventory.invalid/${profile.kind === "steam-id" ? profile.steamId : `vanity/${profile.vanity.toLowerCase()}`}`,
  );
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  const steamId = await resolveSteamId(profile);
  const { copies, items, unreadable } = readInventory(await fetchInventory(steamId));

  const response = json(
    {
      steamId,
      takenAt: new Date().toISOString(),
      copies,
      counts: {
        /** Everything in the backpack, of which most is not a Cosmetic. */
        items,
        /** Distinct kinds of copy, which is what `copies` holds. */
        copies: copies.length,
        /**
         * Items whose defindex or Quality could not be read. Reported rather
         * than swallowed: the defindex is read out of a wiki link, and a Steam
         * change there would show up here as a number climbing off zero rather
         * than as a backpack that mysteriously has nothing in it.
         */
        unreadable,
      },
    },
    200,
    CACHE_SECONDS,
  );
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(new Headers()) });
    if (request.method !== "GET") {
      return json({ error: "bad-request", message: "This endpoint only answers GET." }, 405, 0);
    }

    const { pathname } = new URL(request.url);
    if (pathname !== "/inventory") {
      return json({ error: "bad-request", message: "The only route here is GET /inventory?q=<steam profile>." }, 404, 0);
    }

    try {
      return await inventory(request, ctx);
    } catch (error) {
      if (error instanceof SteamFailure) return failure(error.code, error.message);
      // Anything else is ours, and the viewer is told so rather than shown a
      // stack trace or left to read a bare 500.
      console.error(error);
      return json({ error: "steam-unavailable", message: "Something went wrong reading that backpack." }, 500, 0);
    }
  },
} satisfies ExportedHandler;
