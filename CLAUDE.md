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
- `render/` — Python render job. `resolve.py` (schema → jobs, a command), `cosmetics.py` (the Cosmetic rule and identity), `items_game.py` (schema reading), `model_index.py` (does the archive have this model), `jobs.py` (the versioned job list shape), `extract.py` (archive → cache, and the on-demand `ModelCache`), `mdlinfo.py` (model bodygroups/skins), `selection.py` (which jobs a run renders), `scene.py` (framing, camera, lights, bodygroups, Team skin, attachment — all pure), `geometry.py` (the 4x4 layer those decisions are written in), `manifest.py` (what was rendered and what failed, and the JSON Schema the site reads it by), `plan.py` (what a run still owes, from the job list and the manifest), `progress.py` (the progress line and its estimate), `batch.py` (the batch runner, the one command a full run is), `cli.py` (the arguments the runner and the render step both take), `output.py` (where images and the manifest live — the storage seam, and the only place a path is decided), `derivatives.py` (master PNG → web sizes, Pillow only), `derive.py` (the derive step, a command), `sourceio_patch.py` (our SourceIO workarounds), `blender_job.py` (the Blender adapter: the render step itself). See `docs/render/run-notes.md`.
- `data/` — TypeScript catalogue data job (pnpm workspace). `src/catalogue/build.ts` is the pure builder every test drives; `src/prices/` holds the price rules (Metal in ninths, Reference Variant, Price Spread) and the one `PriceSource` interface every price crosses (ADR-0002); `src/sources/` holds the thin adapters. `src/catalogue/issued-in-play.ts` sits on the catalogue side although only a price rule asks it, because what it reads is the game's item definitions and `src/prices/` never touches those. See `data/README.md`.
- `tests/` — pytest suite; `tests/fixtures/` holds the items_game excerpt that is the shared Cosmetic oracle (`docs/fixtures/cosmetic-oracle.md`). The render job and the catalogue data job both resolve it and must agree; the catalogue's half is `data/tests/build-catalogue.test.ts`.
- `site/` — the static Next.js site (pnpm workspace). `src/prices/format.ts` is the pure price module every component and test formats through; `src/catalogue/source.ts` is the seam both committed documents are read and validated through (`CATALOGUE_DIR` chooses the folder; the default is `catalogue/`); `src/renders/` is the manifest's other contract (`manifest.ts`), the Worn Render fallback chain (`select.ts`) and the image base URL (`base-url.ts`); `src/components/cosmetic-list.tsx` is the virtualised list. See `site/README.md`.
- `catalogue/` — the built catalogue file, the render manifest (`renders.json`) and their JSON Schemas. Committed; the images they point at never are. The site reads these files and never calls an API (ADR-0002).
- `assets-cache/`, `renders/` — extracted game files and rendered images (`renders/masters` the 1024 PNGs, `renders/web` the derivatives); gitignored, never commit.
- Specs live as GitHub issues labelled `spec`; tickets hang off them.

## Running things locally

- Node env: pnpm workspace at the repo root, packages `data` and `site`. Secrets come from `.env` at the root (copy `.env.example`); never commit it. `data` is on TypeScript 7 and `site` pins TypeScript 5, which is the compiler API Next.js drives.
- Build the catalogue: `pnpm build-catalogue` (add `--dry-run` to write nothing, `--skip-web-api` to check the Cosmetic count without a Steam Web API key, `--skip-prices` to build the list without a backpack.tf key, `--skip-market` to leave out the Steam Market Dollar Basis). A run refuses to overwrite the committed catalogue when it loses more than 2% of its Cosmetics or prices too few of them; `--max-drop <fraction>` raises the first allowance.
- Run the site: `pnpm dev`. Build it: `pnpm build-site` (static export into `site/out`; it fails on a catalogue or a render manifest that violates its schema). Both first link `renders/` to `site/public/renders` so a local render run is served at the default image base; `NEXT_PUBLIC_RENDER_BASE_URL` points the images at a bucket instead.
- End to end: `pnpm test-e2e` builds the site from the fixture catalogue and manifest and drives it in Chromium on a desktop and a phone, with an axe pass and a check that a broken document fails the build. It needs a browser once per machine: `pnpm --filter @tf2-cosm/site exec playwright install chromium`.
- Tests: `pnpm test`; types: `pnpm typecheck`. Both run every package.
- Python env: `.venv` (Python 3.14) with `vdf`, `vpk`, `pillow`, `pytest` (`render/requirements.txt`). Use `./.venv/Scripts/python.exe`. Run the render modules as modules (`-m render.resolve`), not as file paths, so the package imports resolve.
- Tests: `./.venv/Scripts/python.exe -m pytest`. Everything but the render smoke test runs without the game or Blender.
- Blender 5.2 at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` (bundled Python 3.13). SourceIO 5.5.4 is installed as a legacy add-on at `%APPDATA%/Blender Foundation/Blender/5.2/scripts/addons/SourceIO` and enabled per run by the script.
- TF2 install: `C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf` (items_game.txt and tf_english.txt loose; models in `tf2_misc_dir.vpk`, textures in `tf2_textures_dir.vpk`).
- Resolve every Cosmetic to render jobs, or report what a run would do without writing anything:
  `./.venv/Scripts/python.exe -m render.resolve --out jobs.json`
  `./.venv/Scripts/python.exe -m render.resolve --dry-run`
- Render everything still missing (the one command a full run is; it extracts the models it needs itself):
  `./.venv/Scripts/python.exe -m render.batch --jobs jobs.json`
  `./.venv/Scripts/python.exe -m render.batch --jobs jobs.json --dry-run`
  It renders what the manifest does not already have, a batch of jobs per Blender process, and can be stopped and re-run: a second run over finished work opens Blender not at all. Narrow with `--slug`, `--class`, `--team`, `--style`; `--batch-size` is images per process, `--retry-failed` re-runs yesterday's failures, `--trust-manifest` skips the check that each recorded master is still on disk.
- Drive one Blender process yourself (debugging an import):
  `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python render/blender_job.py -- --jobs jobs.json --slug team-captain --teams red blu`
  It and the batch runner share their arguments (`render/cli.py`), so a flag means the same thing to both. From a worktree, add `--site-packages <main checkout>/.venv/Lib/site-packages`, because Blender's Python is not the venv and the worktree has none.
- Then make the web sizes and finish the manifest (a separate step: Pillow is compiled and Blender's Python is not the venv):
  `./.venv/Scripts/python.exe -m render.derive`
  `./.venv/Scripts/python.exe -m render.derive --dry-run`
  It is resumable — a master whose derivatives are already there is skipped — and `--force` remakes them. The output root and the image folders inside it are configuration: `RENDER_OUTPUT_ROOT`, `RENDER_MASTERS_DIR`, `RENDER_DERIVATIVES_DIR` and `RENDER_MANIFEST` in the environment, each overridable on the command line (`render/output.py`). Every path the manifest records is relative to the root, so a bucket can replace the folder without touching the job.
- Fill the assets cache ahead of time (optional): `./.venv/Scripts/python.exe -m render.extract --cache assets-cache --jobs jobs.json --classes`
- The render smoke test really runs Blender and skips itself when Blender or the game is absent: `./.venv/Scripts/python.exe -m pytest tests/test_render_smoke.py`
- SourceIO facts and every workaround we carry are in `docs/render/run-notes.md`. Read it before touching `render/blender_job.py`: models import Y-up facing +Z, collection names collide and get a `_1` suffix, `obj['skin_groups']` holds per-skin material lists, hats have a single `bip_head` bone at the origin, and the add-on itself is never edited.
