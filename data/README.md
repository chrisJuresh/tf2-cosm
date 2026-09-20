# Catalogue data job

Builds the catalogue file the site reads: every Cosmetic, with identity, Classes,
slot, paintable flag, Styles, Backpack Icons and its Reference Price. The Dollar
Basis header (#11) comes later; the catalogue's schema is versioned so it can.

## Running it

```bash
pnpm install
pnpm build-catalogue
```

Configuration comes from the environment only — copy `.env.example` to `.env` at
the repo root and fill in `STEAM_WEB_API_KEY` and `BACKPACK_TF_API_KEY`.

| flag | what it does |
| --- | --- |
| `--tf <path>` | read item definitions from a local TF2 `tf` directory (default: `TF2_INSTALL_PATH`) |
| `--mirror` | read them from the community daily mirror instead — no game install needed |
| `--skip-web-api` | skip Valve's Web API and report the Cosmetic list from the local install alone, writing nothing. For checking the Cosmetic count without a key |
| `--skip-prices` | build the Cosmetic list with no prices in it at all. For working on the list without a backpack.tf key |
| `--out <path>` | where to write (default `catalogue/catalogue.json`) |
| `--dry-run` | build and report, write nothing |

The run prints the counts, the exclusions by reason, the Cosmetic defindex count
next to the render job's own, which must agree, and what every Cosmetic's
Reference Variant turned out to be. A run that prices fewer than 1,780 Cosmetics
writes nothing: that means the price list came back partial or the names stopped
matching, and committing it would read as thousands of Cosmetics going Unpriced.

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
- `src/prices/` — the price half of the job, all pure. `metal.ts` is Metal
  arithmetic in ninths and Trader Notation; `reference-variant.ts` picks the
  Reference Variant; `price-spread.ts` turns it into a Price Spread and its Metal
  Values; `price-source.ts` is the one interface every price crosses (ADR-0002),
  so swapping backpack.tf for pricedb.io means writing one adapter and nothing
  else.
- `src/sources/` — the adapters: item definitions (local install or mirror),
  Valve's Web API, backpack.tf, and the KeyValues reader they share.

## Tests

```bash
pnpm test
pnpm typecheck
```

`tests/golden/catalogue.json` is the whole document built from the shared oracle
fixture and a recorded backpack.tf payload, so any change to the catalogue's
shape shows up as a diff. Rewrite it deliberately with `UPDATE_GOLDEN=1 pnpm test`
and read what changed.

The price fixtures (`tests/fixtures/backpack-tf-*.json`) are read through the real
adapter, not around it, and between them cover the five cases the price rules have
to get right: a Cosmetic priced in Keys, one priced in Metal, a Genuine-only promo
taking the Native Quality fallback, a Unique priced only non-craftable, and one the
price list does not mention at all.
