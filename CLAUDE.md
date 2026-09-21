# TF2 Cosmetics Catalogue

## `origin/main` is the repository; local `main` is a snapshot

Several sessions work here at once and every change lands as a merged PR on the remote, so local `main` is behind almost always — nothing pulls it. Fetch first, then read the remote-tracking ref: `git fetch origin main`, then `git log origin/main`, `git diff origin/main...HEAD`, `git show origin/main:<path>`. A bare `main`, a bare `git log`, or a file read from the main checkout (rather than from your worktree, which was cut from the fetched tip) answers from whenever this disk last caught up, and nothing about the answer says it is old. Worktrees are cut from `origin/main` for the same reason; the guard says so at the start of every session.

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
- `render/` — Python render job. `resolve.py` (schema → jobs, a command), `cosmetics.py` (the Cosmetic rule and identity), `items_game.py` (schema reading), `model_index.py` (does the archive have this model), `jobs.py` (the versioned job list shape), `extract.py` (archive → cache, and the on-demand `ModelCache`), `mdlinfo.py` (model bodygroups/skins), `selection.py` (which jobs a run renders), `scene.py` (framing — of the Class as worn and of the item alone — camera, lights, bodygroups, Team skin, attachment: all pure), `geometry.py` (the 4x4 layer those decisions are written in), `manifest.py` (what was rendered and what failed — each job in up to two pictures, `worn` and `alone` — the JSON Schema the site reads it by, and the merge a parallel run folds its shards in with), `plan.py` (what a run still owes, from the job list and the manifest), `progress.py` (the progress line and its estimate), `batch.py` (the batch runner, the one command a full run is), `cli.py` (the arguments the runner and the render step both take), `output.py` (where images and the manifest live — the storage seam, and the only place a path is decided), `derivatives.py` (master PNG → web sizes, Pillow only), `derive.py` (the derive step, a command), `bucket.py` (the S3-compatible bucket and its settings — the one place boto3 is imported), `publish.py` (the publish step: manifest → bucket, a command), `sourceio_patch.py` (our SourceIO workarounds), `blender_job.py` (the Blender adapter: the render step itself). See `docs/render/run-notes.md`.
- `data/` — TypeScript catalogue data job (pnpm workspace). `src/catalogue/build.ts` is the pure builder every test drives, and it writes two documents from one price list: the catalogue and the Variant Prices (`src/catalogue/variant-prices.ts`, ADR-0005 — what a copy somebody owns is worth, kept apart so the page's payload does not carry it). `src/prices/` holds the price rules (Metal in ninths, Reference Variant, Price Spread, Variant Price) and the one `PriceSource` interface every price crosses (ADR-0002); `src/sources/` holds the thin adapters. `src/catalogue/issued-in-play.ts` sits on the catalogue side although only a price rule asks it, because what it reads is the game's item definitions and `src/prices/` never touches those. See `data/README.md`.
- `tests/` — pytest suite; `tests/fixtures/` holds the items_game excerpt that is the shared Cosmetic oracle (`docs/fixtures/cosmetic-oracle.md`). The render job and the catalogue data job both resolve it and must agree; the catalogue's half is `data/tests/build-catalogue.test.ts`.
- `site/` — the static Next.js site (pnpm workspace). `src/prices/format.ts` is the pure price module every component and test formats through; `src/catalogue/source.ts` is the seam both committed documents are read and validated through (`CATALOGUE_DIR` chooses the folder; the default is `catalogue/`); `src/renders/` is the manifest's other contract (`manifest.ts`), the fallback chain that picks a picture — Worn Render or Item Render — (`select.ts`) and the image base URL (`base-url.ts`); `src/components/cosmetic-grid.tsx` is the virtualised grid of cards. See `site/README.md`.
- `worker/` — the inventory proxy (pnpm workspace), the one piece of server this project has. Steam's inventory endpoint sends no CORS headers, so a static page cannot read a backpack; this reads it and answers with CORS. It holds no secret — a custom URL resolves through `steamcommunity.com/id/<name>/?xml=1`, which needs no Steam Web API key. `src/profile.ts` (what a viewer may paste), `src/quality.ts` (Steam's Quality names against the catalogue's), `src/inventory.ts` (Steam's payload → Owned Copies, pure), `src/steam.ts` (the two calls and what each failure means), `src/index.ts` (the handler). It decides nothing about what a Cosmetic is — the catalogue does that, by a defindex failing to match. See `worker/README.md`.
- `catalogue/` — the built catalogue file, the Variant Prices (`variant-prices.json`, ADR-0005), the render manifest (`renders.json`) and their JSON Schemas. Committed; the images they point at never are. The site reads these files and never calls an API (ADR-0002); the one thing it cannot read from a file is a viewer's own Inventory, which is what `worker/` is for.
- `assets-cache/`, `renders/` — extracted game files and rendered images (`renders/masters` the 1024 PNGs, `renders/web` the derivatives); gitignored, never commit.
- Specs live as GitHub issues labelled `spec`; tickets hang off them.

## Running things locally

- Node env: pnpm workspace at the repo root, packages `data`, `site` and `worker`. Secrets come from `.env` at the root (copy `.env.example`); never commit it. `data` and `worker` are on TypeScript 7 and `site` pins TypeScript 5, which is the compiler API Next.js drives.
- Run the inventory proxy locally: `pnpm --filter @tf2-cosm/inventory-proxy dev` (wrangler on :8787). Deploying it is by hand and needs no secret at all: `pnpm --filter @tf2-cosm/inventory-proxy exec wrangler login`, then `pnpm --filter @tf2-cosm/inventory-proxy deploy`. Whatever URL it lands on is the site's `NEXT_PUBLIC_INVENTORY_API_URL`, unset meaning the feature is not offered rather than offered broken. See `worker/README.md`.
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
  It renders what the manifest does not already have, a batch of jobs per Blender process, and can be stopped and re-run: a second run over finished work opens Blender not at all. Every job makes two pictures from its one import — the Worn Render and the Item Render of the Cosmetic alone — and `--variant worn` or `--variant alone` narrows that. Narrow the jobs with `--slug`, `--class`, `--team`, `--style`; `--batch-size` is images per process, `--workers` is processes at once (0.9s an image at 1, 0.45s at 6 — the import, not the frame, is what a core buys back), `--retry-failed` re-runs yesterday's failures, `--trust-manifest` skips the check that each recorded master is still on disk.
- Drive one Blender process yourself (debugging an import):
  `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python render/blender_job.py -- --jobs jobs.json --slug team-captain --teams red blu`
  It and the batch runner share their arguments (`render/cli.py`), so a flag means the same thing to both. From a worktree, add `--site-packages <main checkout>/.venv/Lib/site-packages`, because Blender's Python is not the venv and the worktree has none.
- Then make the web sizes and finish the manifest (a separate step: Pillow is compiled and Blender's Python is not the venv):
  `./.venv/Scripts/python.exe -m render.derive`
  `./.venv/Scripts/python.exe -m render.derive --dry-run`
  It is resumable — a master whose derivatives are already there is skipped — and `--force` remakes them. The output root and the image folders inside it are configuration: `RENDER_OUTPUT_ROOT`, `RENDER_MASTERS_DIR`, `RENDER_DERIVATIVES_DIR` and `RENDER_MANIFEST` in the environment, each overridable on the command line (`render/output.py`). Every path the manifest records is relative to the root, so a bucket can replace the folder without touching the job.
- Then publish the web sizes to the bucket the deployed site reads them from (the last step in the chain; masters stay local):
  `./.venv/Scripts/python.exe -m render.publish --dry-run`
  `./.venv/Scripts/python.exe -m render.publish`
  It walks the manifest, not the folder, and is resumable: an object already in the bucket at the same number of bytes is skipped, so a second run uploads nothing. A run that would leave the bucket bigger than `--max-bucket-bytes` (9 GB, under R2's 10 GB free tier) refuses before it uploads anything — the guard against publishing the 8 GB of masters by mistake. The bucket is four settings in `.env` (`RENDER_BUCKET`, `RENDER_BUCKET_ENDPOINT`, `RENDER_BUCKET_KEY_ID`, `RENDER_BUCKET_SECRET`, plus an optional `RENDER_BUCKET_PREFIX`), and the deployment's `NEXT_PUBLIC_RENDER_BASE_URL` has to be the same bucket's public URL, or the page 404s every image and falls back to Backpack Icons. Both sides, and the Cloudflare R2 setup, are in `docs/render/publishing.md`.
- Fill the assets cache ahead of time (optional): `./.venv/Scripts/python.exe -m render.extract --cache assets-cache --jobs jobs.json --classes`
- The render smoke test really runs Blender and skips itself when Blender or the game is absent: `./.venv/Scripts/python.exe -m pytest tests/test_render_smoke.py`
- SourceIO facts and every workaround we carry are in `docs/render/run-notes.md`. Read it before touching `render/blender_job.py`: models import Y-up facing +Z, collection names collide and get a `_1` suffix, `obj['skin_groups']` holds per-skin material lists, hats have a single `bip_head` bone at the origin, and the add-on itself is never edited.
