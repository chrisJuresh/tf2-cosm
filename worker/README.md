# Inventory proxy

The one piece of server this project has, and the smallest thing that could be.

Steam answers `steamcommunity.com/inventory/<id64>/440/2` with JSON and no
`Access-Control-Allow-Origin` header, so a static page cannot read a backpack
however much it would like to. This Worker reads it and answers with CORS.

It holds **no secret**. Resolving a custom URL has an official Web API endpoint
that wants a Steam Web API key; the community profile's own `?xml=1` answers the
same question without one, so there is nothing here to leak and nothing anybody
needs to be given to stand this up from a clone. If a `vars` or `secrets` block
ever appears in `wrangler.jsonc`, something has gone wrong with the idea.

It does not reopen ADR-0002. Every price the site shows still comes out of the
committed snapshot, and nothing that crosses this Worker is a price. An Inventory
is one viewer's own, live, and cannot be committed, which is why it is the one
thing the site cannot read from a file.

## The shape

```
GET /inventory?q=<whatever the viewer pasted>
```

`q` is a profile URL of either form, a bare custom URL name, or a SteamID64.
`src/profile.ts` has the whole table of what that accepts and what it refuses.

```json
{
  "steamId": "7656119...",
  "takenAt": "2026-09-21T02:51:51.168Z",
  "copies": [
    { "defindex": 378, "quality": "unique", "craftable": true, "tradable": true, "count": 2 },
    { "defindex": 378, "quality": "unusual", "craftable": true, "tradable": true, "count": 1,
      "effect": "Burning Flames" }
  ],
  "counts": { "items": 1071, "copies": 1039, "unreadable": 0 }
}
```

A failure is `{ "error": "<code>", "message": "..." }` with a status:

| code | status | what happened |
| --- | --- | --- |
| `bad-request` | 400 | `q` names no profile |
| `no-such-profile` | 404 | Steam has nobody there |
| `private-inventory` | 403 | the owner has not made their backpack public |
| `rate-limited` | 429 | Steam is throttling us |
| `steam-unavailable` | 502 | Steam did not answer, or answered with something else |
| `too-many-items` | 413 | past twenty thousand items, which this will not read |

Every message is a sentence a person can act on, because a proxy's error
messages *are* its user interface. The common one is `private-inventory`, and it
is not an error in any sense the viewer cares about — it tells them where Steam's
setting is.

## What it drops, and what it does not decide

An Owned Copy is a defindex, a Quality, a craftability, whether it can be traded
and how many. Everything else Steam sends — icon URLs, market names, asset ids,
the owner's own id on every inspect link, the item's description text — is
dropped at the edge. A proxy that forwards a whole inventory payload passes on
more about a person than it was asked for.

It does **not** decide what is a Cosmetic. Weapons, taunts, tools, crates and
Medals come through, and the site drops them by failing to find their defindex in
the catalogue. The catalogue is the Cosmetic rule; deciding it twice, in two
places, from two different sources, is how two answers come to disagree.

Two things are read out of places Steam does not really mean them to be read
from, and both are commented at the point they happen:

- **The defindex** comes out of the wiki link Steam hangs off every item
  (`itemredirect.php?id=`). The trade-offer and `IEconItems` payloads carry an
  `app_data.def_index`; this one does not. An item whose link cannot be read is
  counted in `counts.unreadable` rather than guessed at, so a Steam change there
  shows up as a number climbing off zero instead of as a backpack that suddenly
  reads as empty.
- **Craftability** is a sentence in the item's description text. The inventory is
  always asked for with `l=english` so the language cannot move underneath it,
  and a false negative only ever prices a copy as the craftable one, which is the
  common case and the Reference Variant anyway.

## Running it

```bash
pnpm --filter @tf2-cosm/inventory-proxy dev     # wrangler dev, on http://127.0.0.1:8787
pnpm --filter @tf2-cosm/inventory-proxy test
```

`pnpm test` and `pnpm typecheck` at the repo root cover this package with the
others. The suite drives the pure modules — what a viewer may paste, Steam's
Quality names against the catalogue's, and a recorded inventory payload — and
makes no network call. `tests/quality.test.ts` imports the Quality list from
`@tf2-cosm/data`, so a Quality renamed in the data job fails here rather than
turning into a Variant Price lookup that silently finds nothing.

Driving it against the real Steam is `wrangler dev` and a public backpack:

```bash
curl "http://127.0.0.1:8787/inventory?q=https://steamcommunity.com/id/robinwalker/"
```

## Deploying it

Nothing is deployed automatically and there is nothing to configure.

```bash
pnpm --filter @tf2-cosm/inventory-proxy exec wrangler login
pnpm --filter @tf2-cosm/inventory-proxy run deploy
```

`run` is not optional there. `deploy` is a pnpm builtin of its own — it copies a
workspace package into a directory — so `pnpm --filter ... deploy` never reaches
this package's `deploy` script and stops at
`[ERR_PNPM_INVALID_DEPLOY_TARGET] This command requires one parameter`.

That puts it at `https://tf2-cosm-inventory.<your-subdomain>.workers.dev`. A
custom domain is a route in the Cloudflare dashboard, the same account the render
bucket is already on; `docs/render/publishing.md` covers how that account is set
up.

A subdomain created for the first deploy resolves in DNS a few minutes before its
TLS certificate exists. In that gap `curl` fails the handshake and exits 35; it is
not a 404 and not a bad URL, and the only fix is to wait and try again.

Whatever URL it ends at is the site's `NEXT_PUBLIC_INVENTORY_API_URL`. Today that
is `https://tf2-cosm-inventory.tf2-cosm-inventory-proxy.workers.dev`, which is
what the variable holds in Vercel for Production and Preview. Next inlines
`NEXT_PUBLIC_*` at build time, so a deployment already built does not pick up a
new value — redeploy. Unset, the site does not offer the feature at all, rather
than offering it broken.

## What it costs

Cloudflare's free tier is 100,000 requests a day. A viewer's whole visit is one
request, and the answer is held at the edge for five minutes, so a page somebody
refreshes is one request every five minutes rather than one a refresh.

The cache is not a nicety. Steam rate-limits the inventory endpoint by address,
and a Worker is one address for everybody who opens the page, so without it one
person hammering reload spends everybody's budget. `rate-limited` is what that
looks like if it happens anyway, and the message says so rather than blaming the
viewer.
