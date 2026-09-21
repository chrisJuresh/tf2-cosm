# A viewer's Inventory is read live, through a keyless proxy of our own

Showing somebody the Cosmetics they own means reading their Steam backpack. That is the
one thing on this site that cannot come out of a committed file: an Inventory is one
viewer's own, it changes when they trade, and there are a hundred million of them.

Steam answers `steamcommunity.com/inventory/<id64>/440/2` with JSON and no
`Access-Control-Allow-Origin` header, so a static page cannot read it. Something has to sit
in between. It is a Cloudflare Worker in this repository, `worker/`, deployed by hand, and
it holds no secret: resolving a custom URL has an official Web API endpoint that wants a
Steam Web API key, and the community profile's own `?xml=1` answers the same question
without one.

## Why not the alternatives

A serverless function on the site's own deployment would end the property that the site is
a static export with no server, for one route. A public CORS proxy would put somebody
else's machine between a viewer and their Steam profile. Asking the viewer to paste their
own inventory JSON keeps the site static and is unusable.

## What this does not change

ADR-0002 stands untouched. Every price the site shows still comes out of the committed
snapshot, and nothing that crosses this Worker is a price — a viewer's Inventory is a list
of defindexes and Qualities, which the site prices from the files it already has. "The site
reads these files and never calls an API" was always a statement about prices and the
Cosmetic list, and it still holds for both.

## Consequences

- The Worker is a deployed, public, unauthenticated endpoint that will read any Steam ID it
  is given. That is Steam's own publication rule rather than ours — it can see exactly what
  anybody with a browser can see — but it is bounded anyway: one route, one app, one
  context, ten pages, a ten-second timeout, and a host check so a profile-shaped path on
  another domain is refused rather than fetched.
- Steam rate-limits the inventory endpoint by address and a Worker is one address for
  everybody, so answers are cached at the edge for five minutes. Without that, one person
  refreshing spends everybody's budget. `rate-limited` is a reported failure with a
  sentence about what it means, not a silent empty backpack.
- Only what is asked for crosses back. An Owned Copy is a defindex, a Quality, a
  craftability, whether it can be traded, and a count; Steam's icon URLs, market names,
  asset ids and inspect links — which carry the owner's own id — are dropped at the edge.
- The Worker decides nothing about what a Cosmetic is. The catalogue is the Cosmetic rule,
  so a weapon or a crate is excluded by its defindex failing to match and not by a second
  rule in a second language over a different source.
- Steam's Quality names are translated at the edge (`rarity1` is Genuine, `rarity4` is
  Unusual), so the catalogue's vocabulary is the only one anything past the Worker sees.
  The table is held against the data job's own list by a test.
- The site's `NEXT_PUBLIC_INVENTORY_API_URL` and the deployed Worker's URL have to agree.
  Unset, the site does not offer the feature at all rather than offering it broken — the
  same rule `NEXT_PUBLIC_RENDER_BASE_URL` already follows.
