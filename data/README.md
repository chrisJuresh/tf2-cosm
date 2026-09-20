# Catalogue data job

Builds the catalogue file the site reads: every Cosmetic, with identity, Classes,
slot, paintable flag, Styles and Backpack Icons. Prices (#10) and the Dollar Basis
header (#11) come later; the catalogue's schema is versioned so they can.

## Running it

```bash
pnpm install
pnpm build-catalogue
```

Configuration comes from the environment only — copy `.env.example` to `.env` at
the repo root and fill in `STEAM_WEB_API_KEY`.

| flag | what it does |
| --- | --- |
| `--tf <path>` | read item definitions from a local TF2 `tf` directory (default: `TF2_INSTALL_PATH`) |
| `--mirror` | read them from the community daily mirror instead — no game install needed |
| `--skip-web-api` | skip Valve's Web API and report the Cosmetic list from the local install alone, writing nothing. For checking the Cosmetic count without a key |
| `--out <path>` | where to write (default `catalogue/catalogue.json`) |
| `--dry-run` | build and report, write nothing |

The run prints the counts, the exclusions by reason, and the Cosmetic defindex
count next to the render job's own, which must agree.

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
- `src/sources/` — the adapters: item definitions (local install or mirror),
  Valve's Web API, and the KeyValues reader they share.

## Tests

```bash
pnpm test
pnpm typecheck
```

`tests/golden/catalogue.json` is the whole document built from the shared oracle
fixture, so any change to the catalogue's shape shows up as a diff. Rewrite it
deliberately with `UPDATE_GOLDEN=1 pnpm test` and read what changed.
