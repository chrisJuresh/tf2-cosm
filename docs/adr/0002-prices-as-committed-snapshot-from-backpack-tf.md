# Prices come from backpack.tf through a single source seam and are committed as a snapshot

backpack.tf is the origin of every community price in the TF2 ecosystem: pricedb.io mirrors it, and prices.tf has shut down. A data job pulls backpack.tf's price list and currency rates with a free API key, reduces them to the catalogue's Reference Prices, Price Spreads and Key Rate, and writes one trimmed catalogue JSON into the repository. The site build reads only that file and never calls an external API, and the price source sits behind one interface so pricedb.io or another mirror can replace it without touching anything else.

## Consequences

- Freshness equals job cadence. The job is run by hand for now and scheduled later; the site shows the snapshot's timestamp.
- Git history of the snapshot doubles as free price history.
- The API key lives only where the job runs, never in the site.
- Steam Community Market is used only for the key's dollar price, not for item prices, because classic Unique cosmetics are not marketable there.
