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
- `render/` — Python render job. `resolve.py` (schema → jobs, a command), `cosmetics.py` (the Cosmetic rule and identity), `items_game.py` (schema reading), `model_index.py` (does the archive have this model), `jobs.py` (the versioned job list shape), `extract.py` (archive → cache, and the on-demand `ModelCache`), `mdlinfo.py` (model bodygroups/skins), `selection.py` (which jobs a run renders), `scene.py` (framing, camera, lights, bodygroups, Team skin, attachment — all pure), `geometry.py` (the 4x4 layer those decisions are written in), `manifest.py` (what was rendered and what failed), `sourceio_patch.py` (our SourceIO workarounds), `blender_job.py` (the Blender adapter: the render step itself). See `docs/render/run-notes.md`.
- `data/` — TypeScript catalogue data job (pnpm workspace). `src/catalogue/build.ts` is the pure builder every test drives; `src/prices/` holds the price rules (Metal in ninths, Reference Variant, Price Spread) and the one `PriceSource` interface every price crosses (ADR-0002); `src/sources/` holds the thin adapters. See `data/README.md`.
- `tests/` — pytest suite; `tests/fixtures/` holds the items_game excerpt that is the shared Cosmetic oracle (`docs/fixtures/cosmetic-oracle.md`). The render job and the catalogue data job both resolve it and must agree; the catalogue's half is `data/tests/build-catalogue.test.ts`.
- `catalogue/` — the built catalogue file and its JSON Schema.
- `assets-cache/`, `renders/` — extracted game files and rendered images; gitignored, never commit.
- Specs live as GitHub issues labelled `spec`; tickets hang off them.

## Running things locally

- Node env: pnpm workspace at the repo root, package `data`. Secrets come from `.env` at the root (copy `.env.example`); never commit it.
- Build the catalogue: `pnpm build-catalogue` (add `--dry-run` to write nothing, `--skip-web-api` to check the Cosmetic count without a Steam Web API key, `--skip-prices` to build the list without a backpack.tf key, `--skip-market` to leave out the Steam Market Dollar Basis). A run refuses to overwrite the committed catalogue when it loses more than 2% of its Cosmetics or prices too few of them; `--max-drop <fraction>` raises the first allowance. Tests: `pnpm test`; types: `pnpm typecheck`.
- Python env: `.venv` (Python 3.14) with `vdf`, `vpk`, `pillow`, `pytest` (`render/requirements.txt`). Use `./.venv/Scripts/python.exe`. Run the render modules as modules (`-m render.resolve`), not as file paths, so the package imports resolve.
- Tests: `./.venv/Scripts/python.exe -m pytest`. Everything but the render smoke test runs without the game or Blender.
- Blender 5.2 at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` (bundled Python 3.13). SourceIO 5.5.4 is installed as a legacy add-on at `%APPDATA%/Blender Foundation/Blender/5.2/scripts/addons/SourceIO` and enabled per run by the script.
- TF2 install: `C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf` (items_game.txt and tf_english.txt loose; models in `tf2_misc_dir.vpk`, textures in `tf2_textures_dir.vpk`).
- Resolve every Cosmetic to render jobs, or report what a run would do without writing anything:
  `./.venv/Scripts/python.exe -m render.resolve --out jobs.json`
  `./.venv/Scripts/python.exe -m render.resolve --dry-run`
- Render the jobs from a job list (the render step extracts the models it needs itself):
  `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python render/blender_job.py -- --jobs jobs.json --slug team-captain --teams red blu`
  Narrow with `--slug`, `--class`, `--style`; `--out` is the master images, `--manifest` the record. From a worktree, add `--site-packages <main checkout>/.venv/Lib/site-packages`, because Blender's Python is not the venv and the worktree has none.
- Fill the assets cache ahead of time (optional): `./.venv/Scripts/python.exe -m render.extract --cache assets-cache --jobs jobs.json --classes`
- The render smoke test really runs Blender and skips itself when Blender or the game is absent: `./.venv/Scripts/python.exe -m pytest tests/test_render_smoke.py`
- SourceIO facts and every workaround we carry are in `docs/render/run-notes.md`. Read it before touching `render/blender_job.py`: models import Y-up facing +Z, collection names collide and get a `_1` suffix, `obj['skin_groups']` holds per-skin material lists, hats have a single `bip_head` bone at the origin, and the add-on itself is never edited.
