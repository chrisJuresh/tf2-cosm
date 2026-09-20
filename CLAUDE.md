# TF2 Cosmetics Catalogue

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `chrisJuresh/tf2-cosm`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

Every pull request closes its issue from its **body** — `Closes #<n>.` on the first line, or `No issue: <why>` when it genuinely closes none. An issue number in the title closes nothing. A hook denies `gh pr create` and `land.py` otherwise.

### Triage labels

The five canonical triage roles are used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Repository layout

- `CONTEXT.md` — glossary (the ubiquitous language). `docs/adr/` — decision records. Read both before changing the model.
- `render/` — Python render job. `resolve.py` (schema → jobs, a command), `cosmetics.py` (the Cosmetic rule and identity), `items_game.py` (schema reading), `model_index.py` (does the archive have this model), `jobs.py` (the versioned job list shape), `extract.py` (archive → cache), `mdlinfo.py` (model bodygroups/skins), `spike_import.py` (Blender spike: import, attach, skin, frame, render).
- `data/` — TypeScript catalogue data job (pnpm workspace). `src/catalogue/build.ts` is the pure builder every test drives; `src/prices/` holds the price rules (Metal in ninths, Reference Variant, Price Spread) and the one `PriceSource` interface every price crosses (ADR-0002); `src/sources/` holds the thin adapters. See `data/README.md`.
- `tests/` — pytest suite; `tests/fixtures/` holds the items_game excerpt that is the shared Cosmetic oracle (`docs/fixtures/cosmetic-oracle.md`). The render job and the catalogue data job both resolve it and must agree; the catalogue's half is `data/tests/build-catalogue.test.ts`.
- `site/` — the static Next.js site (pnpm workspace). `src/prices/format.ts` is the pure price module every component and test formats through; `src/catalogue/load.ts` reads and validates the committed catalogue at build time; `src/components/cosmetic-list.tsx` is the virtualised list. See `site/README.md`.
- `catalogue/` — the built catalogue file and its JSON Schema, committed: the site reads this file and never calls an API (ADR-0002).
- `assets-cache/`, `renders/` — extracted game files and rendered images; gitignored, never commit.
- Specs live as GitHub issues labelled `spec`; tickets hang off them.

## Running things locally

- Node env: pnpm workspace at the repo root, packages `data` and `site`. Secrets come from `.env` at the root (copy `.env.example`); never commit it. `data` is on TypeScript 7 and `site` pins TypeScript 5, which is the compiler API Next.js drives.
- Build the catalogue: `pnpm build-catalogue` (add `--dry-run` to write nothing, `--skip-web-api` to check the Cosmetic count without a Steam Web API key, `--skip-prices` to build the list without a backpack.tf key).
- Run the site: `pnpm dev`. Build it: `pnpm build-site` (static export into `site/out`; it fails on a catalogue that violates the schema).
- Tests: `pnpm test`; types: `pnpm typecheck`. Both run every package.
- Python env: `.venv` (Python 3.14) with `vdf`, `vpk`, `pillow`, `pytest` (`render/requirements.txt`). Use `./.venv/Scripts/python.exe`. Run the render modules as modules (`-m render.resolve`), not as file paths, so the package imports resolve.
- Tests: `./.venv/Scripts/python.exe -m pytest`. They need neither the game nor Blender.
- Blender 5.2 at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` (bundled Python 3.13). SourceIO 5.5.4 is installed as a legacy add-on at `%APPDATA%/Blender Foundation/Blender/5.2/scripts/addons/SourceIO` and enabled per run by the script.
- TF2 install: `C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf` (items_game.txt and tf_english.txt loose; models in `tf2_misc_dir.vpk`, textures in `tf2_textures_dir.vpk`).
- Resolve every Cosmetic to render jobs, or report what a run would do without writing anything:
  `./.venv/Scripts/python.exe -m render.resolve --out jobs.json`
  `./.venv/Scripts/python.exe -m render.resolve --dry-run`
- Extract models for the spike, then render one case:
  `./.venv/Scripts/python.exe -m render.extract --cache assets-cache models/player/soldier.mdl models/player/items/soldier/soldier_officer.mdl`
  `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python render/spike_import.py -- --cache assets-cache --bvlg --class-model models/player/soldier.mdl --item-model models/player/items/soldier/soldier_officer.mdl --hide hat --team red --out renders/spike/team_captain_soldier_red.png`
- SourceIO facts learned in the spike: models import Y-up facing +Z; bodygroup submodels become collections named after the bodygroup; `obj['skin_groups']` holds per-skin material lists; hats have a single `bip_head` bone at the origin and must be aligned to the class skeleton; use `--bvlg` for game-accurate materials; the script patches SourceIO's `//` material-path bug at start-up.
