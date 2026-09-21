# Catalogue data job

Builds the two price documents the site reads.

`catalogue/catalogue.json` is every Cosmetic, with identity, Classes, slot,
paintable flag, event restriction, Styles, Backpack Icons and its Reference
Price, under a header that records the snapshot time, the Key Rate, the three
Dollar Bases and the counts. The catalogue's schema is versioned; this is
version 5.

`catalogue/variant-prices.json` is the same price list reduced the other way:
every Quality-and-craftability pair the source priced, for every Cosmetic, keyed
by slug. The catalogue answers what a Cosmetic costs; this answers what the copy
in somebody's own backpack is worth, which is a different question — a Genuine
copy is worth the Genuine figure. It is a second document rather than a field on
the Cosmetic because it is four thousand small records against eighteen hundred
large ones, and the site hands the catalogue to the browser whole (ADR-0005). Its
schema is versioned separately; this is version 1.

Both come out of one run, from one price list, at one Key Rate, and the second
repeats the first's snapshot time and Key Rate so a reader holding both can see
that.

## Running it

```bash
pnpm install
pnpm build-catalogue
```

Configuration comes from the environment only — copy `.env.example` to `.env` at
the repo root and fill in `STEAM_WEB_API_KEY` and `BPTF_API_KEY`.

| flag | what it does |
| --- | --- |
| `--tf <path>` | read item definitions from a local TF2 `tf` directory (default: `TF2_INSTALL_PATH`) |
| `--mirror` | read them from the community daily mirror instead — no game install needed |
| `--skip-web-api` | skip Valve's Web API and report the Cosmetic list from the local install alone, writing nothing. For checking the Cosmetic count without a key |
| `--skip-prices` | build the Cosmetic list with no prices in it at all. For working on the list without a backpack.tf key |
| `--skip-market` | skip the Steam Community Market key price; that Dollar Basis is recorded as missing |
| `--max-drop <f>` | the fraction of the committed Cosmetic count a run may lose before it refuses to write (default `0.02`) |
| `--out <path>` | where to write (default `catalogue/catalogue.json`) |
| `--dry-run` | build and report, write nothing |

`--out` names the catalogue; the Variant Prices and both JSON Schemas are written
beside it, so a run into a scratch folder puts the whole set there together.

The run prints the counts, the exclusions by reason, the Cosmetic defindex count
next to the render job's own, which must agree, what every Cosmetic's Reference
Variant turned out to be, how many took a fallback, how many Variant Prices came
out and in which Qualities, the three Dollar Bases and the warnings.

Two things stop it writing, both in `src/catalogue/write-guard.ts`, and they
cover both documents because the guard runs before either is written: a run that
prices fewer than 1,780 Cosmetics, which means the price list came back partial
or the names stopped matching, and a run that finds more than 2% fewer Cosmetics
than the committed file already holds. Either would read as most of the site
breaking at once, so the good snapshot stays in place and the run explains
itself.

## Shape

`src/catalogue/build.ts` is the whole job in one pure function: fetched payloads
in, catalogue out. It touches no network, clock or filesystem, so the tests drive
it directly and every adapter around it stays thin.

- `src/catalogue/cosmetic-rule.ts` — which items are Cosmetics. The render job
  decides the same thing in `render/cosmetics.py`; the two are pinned to one
  fixture, `docs/fixtures/cosmetic-oracle.md`.
- `src/catalogue/identity.ts` — name and slug, per ADR-0003.
- `src/catalogue/schema.ts` — the versioned catalogue shape. Nothing is written
  without passing it.
- `src/catalogue/variant-prices.ts` — the second document's shape, versioned on
  its own, and the reasoning for it being a second document at all. Nothing is
  written without passing this either.
- `src/prices/` — the price half of the job, all pure. `metal.ts` is Metal
  arithmetic in ninths and Trader Notation; `reference-variant.ts` picks the
  Reference Variant; `price-spread.ts` turns it into a Price Spread and its Metal
  Values, and turns every other priced variant into a Variant Price over the same
  arithmetic; `price-source.ts` is the one interface every price crosses (ADR-0002),
  so swapping backpack.tf for pricedb.io means writing one adapter and nothing
  else.

  Two rules in there are worth knowing before reading the code. A price entry is
  joined to a Cosmetic **by defindex first** — the source asserts its defindex
  list, where a name only has to survive both sides spelling it the same way —
  and by name when the entry claims no defindex. And when no Unique copy is
  priced, the fallback runs down the Native Qualities in a fixed order (Genuine,
  Vintage, Haunted, Strange, Collector's) whether or not Valve's schema marked
  the item — because it never does. `GetSchemaItems` reports quality 6 (Unique)
  for every cosmetic and never once reports Genuine, so the chain, not the
  declared Native Quality, is what finds a Genuine-only promo's price.

  Prices arrive in four currencies, not two: backpack.tf quotes a cheap cosmetic
  in Random Craft Hats and an expensive one in Earbuds. Every currency's rate
  comes from the same `IGetCurrencies` call as the Key Rate, and a currency with
  no rate (a price in dollars) leaves the Cosmetic Unpriced rather than converted
  on a guess.

  The Random Craft Hat is also the one currency that call marks as a *blanket*: a
  figure applied to every cheap hat rather than observed for one. It stands as a
  Reference Price everywhere but for a Promo-Only Cosmetic, where it prices a
  Unique copy Valve never issued — `src/catalogue/issued-in-play.ts` is the half
  of that test the game files answer, and ADR-0004 is the whole rule.
- `src/prices/dollar-basis.ts` — the Dollar Bases the header carries: the Steam
  Market's key price (lowest and median), the price source's own refined-to-dollar
  estimate, and the Mann Co. Store constant. The header names that middle one
  `priceSource`, not the vendor, so swapping backpack.tf for pricedb.io (ADR-0002)
  leaves the file's shape alone. Each is recorded both per Key and
  per Refined, converted at the snapshot's own Key Rate like every other figure in
  the file, so a site never needs the Key Rate to show a price in dollars. No
  dollar figure is stored per Cosmetic: the site multiplies a Metal Value by the
  basis it is showing.
- `src/sources/` — the adapters: item definitions (local install or mirror),
  Valve's Web API, backpack.tf, the Steam Market price overview (the Key's dollar
  price and nothing else, per ADR-0002), and the KeyValues reader they share.

## Tests

```bash
pnpm test
pnpm typecheck
```

`tests/golden/catalogue.json` and `tests/golden/variant-prices.json` are the two
whole documents built from the shared oracle fixture and a recorded backpack.tf
payload, so any change to either shape shows up as a diff. Rewrite them
deliberately with `UPDATE_GOLDEN=1 pnpm test` and read what changed.

The price fixtures (`tests/fixtures/backpack-tf-*.json`) are read through the real
adapter, not around it, and between them cover the eight cases the price rules have
to get right: a Cosmetic priced in Keys, one priced in Metal, a Genuine-only promo
taking the Native Quality fallback, a Unique priced only non-craftable, one the
price list does not mention at all, and three quoted at one Random Craft Hat — one
that drops, one a loot list hands out, and one Promo-Only, which is the only one of
the three whose blanket figure is passed over.
