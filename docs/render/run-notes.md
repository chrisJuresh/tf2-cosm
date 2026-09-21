# Render run notes

How a Worn Render is actually made on this machine, and every workaround the job carries.
The spike that established these facts is gone; this is what replaced it.

## Running it

Four commands are the whole job: resolve, render, derive, publish.

```bash
./.venv/Scripts/python.exe -m render.resolve --out jobs.json
```

```bash
./.venv/Scripts/python.exe -m render.batch --jobs jobs.json
```

```bash
./.venv/Scripts/python.exe -m render.derive
```

```bash
./.venv/Scripts/python.exe -m render.publish
```

The second one renders everything the manifest does not already have, a batch of jobs per
Blender process, and prints progress and an estimate of time remaining as it goes. Run it
again and it renders only what is still missing, so stopping it with ctrl-c, a crash or a
power cut costs the batch that was in flight and nothing more. A run over work that is
already done opens Blender not at all.

Useful arguments to the batch runner (all optional):

- `--dry-run` — list what would be rendered and open nothing. Check the counts after a game
  update.
- `--slug`, `--class`, `--team`, `--style` — render a subset while fixing one item.
- `--batch-size` — images per Blender process (default 40). Smaller loses less to a crash;
  larger amortises the mount and the Class import over more frames.
- `--workers` — Blender processes at once (default 1). See below.
- `--retry-failed` — render the jobs that failed on an earlier run. Without it they are left
  alone, because a second run that repeats yesterday's failures has done nothing.
- `--trust-manifest` — skip the check that every recorded master is still on disk. The check
  costs one `stat` an image and is what makes a deleted or moved image come back.
- `--blender` when Blender is not at the documented path, `--tf`, `--cache`, `--size`,
  `--samples`, and the layout arguments below.
- `--site-packages` when the venv is not at `.venv/` beside the script — a worktree, for
  instance, where it is the main checkout's.

Exit codes: 0 when every image planned was either rendered or recorded as a failure, 1 when
a Blender process died and took some with it (run it again; it picks up where it stopped),
2 when the command itself is wrong — no Blender, or a selection that matches no job — and
130 when ctrl-c stopped it, which is the same "run it again" as 1.

`--root`, `--masters-dir` and `--manifest` override the layout (`render.output`), and mean
the same thing to every command that takes them — `render.batch` passes them on to the
render step as settled paths, so the child never resolves the layout a second time.
`render.derive` also takes `--derivatives-dir`, plus `--dry-run`, `--force` and `--sizes`.

The last one uploads the web sizes to the bucket the deployed site reads them from, and is
the only step that needs credentials — four settings in `.env`, and the deployment's image
base pointed at the same bucket. It is resumable the way the others are: an object already
there at the same number of bytes is skipped. `docs/render/publishing.md` is the whole of
it, including what a deployment looks like when the two sides disagree (a page of Backpack
Icons and a green build).

To drive one Blender process yourself — debugging an import, mostly — the render step is
still a command of its own, and takes the same filters:

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python render/blender_job.py -- --jobs jobs.json --slug team-captain --teams red blu
```

The render step extracts each job's models into the assets cache itself; `render.extract`
stays a command for filling the cache ahead of time.

Failures never stop a run. Each one lands in the manifest as `{reason, detail}` —
`model-missing`, `import-error`, `no-skeleton`, `render-error` or `derive-error` — and the
site falls back to the Backpack Icon for it (ADR-0001). The batch runner prints the failure
list, grouped by reason, when it finishes — for everything the run selected, not just what
this invocation rendered, so a resumed run still ends on the whole picture.

## What resuming is decided from

`render.plan` decides, from the job list and the manifest alone, what a run still owes:

- An image is **done** when the manifest has an entry for it whose `job_version` is the
  current `JOB_LIST_VERSION` and — unless `--trust-manifest` — the master it names is on
  disk. Bumping `JOB_LIST_VERSION` therefore re-renders everything, which is the point of it.
- An image that **failed** before is left alone until `--retry-failed`. A failure records the
  `job_version` it happened under, so a bump retries failures too: the bump is what says the
  job's definition has changed, and a model that resolves differently now is exactly the
  thing that might succeed this time.
- Everything else is work, and the unit of work is one image: a job whose RED is rendered and
  whose BLU is not goes back to Blender for BLU only.

Jobs wanting different Teams are never batched together, because a Blender process renders
every job in its batch on every Team it is given.

A batch is what one Blender process takes on and what a crash costs, so its size is counted
in images. The child writes the manifest once per job, so a batch boundary is a floor on what
a crash can cost, not the only save point.

## Where the output goes

`render/output.py` is the only place a path is decided, and the storage seam the spec asks
for (user story 22). Everything the manifest records is *relative to the output root*:

```
<root>/<masters_dir>/<slug>/<class>-<team>-<style>.png            1024 PNG, kept locally
<root>/<derivatives_dir>/<slug>/<class>-<team>-<style>@<size>.webp  a web size
```

An image folder may be nested (`images/masters`); what it may not be is absolute or a path
that climbs out of the root. The root, both image folders and the manifest's own path are
configuration —
`RENDER_OUTPUT_ROOT`, `RENDER_MASTERS_DIR`, `RENDER_DERIVATIVES_DIR`, `RENDER_MANIFEST` in
the environment, each beaten by the matching command-line argument. The day the folder
becomes a bucket, an uploader walks the manifest and pushes each relative path; nothing else
in the job changes. The manifest and its JSON Schema are committed under `catalogue/`; the
images never are — `renders/` is ignored, and a root pointed anywhere else inside the
repository has to be ignored too.

A manifest from an older version of the job is not migrated. It is a record of images on
this disk, every one of which can be rendered again, so the job says so and stops rather
than carrying a converter for every past shape.

## Running several Blenders at once

`--workers N` hands N batches to N Blender processes at a time. A frame is not what a run
spends its time on — at 1024 square and 32 EEVEE samples a frame is about a third of a
second, and the mount, the add-on start-up, the model import and the texture decode around
it are the rest. Those are single-threaded Python, so on a machine with cores to spare they
are what another process buys back.

Measured on the full run (12,370 images, 16 logical cores): **0.9s an image at `--workers 1`,
0.45s at `--workers 6`.** Not six times faster, because the workers contend on disk and each
starts with a cold texture cache; the gain flattens well before the core count, so there is
little point going much past six here.

Two things are shared state, and both had to be dealt with before a second process was safe:

- **The manifest.** Each Blender rewrites it whole after every job, so two of them sharing a
  file means the last writer drops the other's work. Each batch therefore writes a **shard**
  of its own — a manifest holding only that batch — and the runner merges the shard into the
  run's manifest when the batch comes back (`Manifest.merge`). This is how it works at one
  worker too, and it is faster there as well: the child rewrites a file holding forty images
  rather than one holding twelve thousand, which is a cost that used to grow all run long.
- **The texture cache.** SourceIO writes each decoded texture in place, so a second process
  can read one that is half written. Each worker gets its own `texture-cache-w<N>` beside
  the assets cache; a single-worker run keeps the one shared `texture-cache` it always used.
  They are caches, so the duplication costs disk and a cold start and nothing else.

The model cache is shared, and safe to share: `render.extract` writes each file to a
pid-suffixed temporary name and `os.replace`s it into place, so a reader sees a whole model
or no model. It did not used to, and two workers extracting the same model would have had
one of them importing a truncated `.mdl`.

What a crash costs is still one batch: the shard is written job by job and merged whatever
the exit code. What a crash of the *runner* costs is the batches in flight — up to `N` of
them — which is why the merge happens as each batch lands rather than at the end.

## Why deriving is a step of its own

Pillow is a compiled package and Blender's Python is not the project venv, so the render
step cannot make the web sizes itself — it appends the venv's `site-packages` for `vdf` and
`vpk`, which are pure Python, and that trick does not work twice. It is the better seam
anyway: derivatives come from masters, so the rule in `render/derivatives.py` can change and
every image can be remade without re-rendering a frame.

A derivative is the master on a **consistent trimmed canvas**: the transparent margin is cut
away, what is left is centred on a square with a 4 % margin, and that square is resized to
512 and to 256 as WebP with alpha. The trade-off is deliberate — trimming normalises each
item to its own silhouette, so a pin and a top hat fill their thumbnails equally rather than
at true relative scale. The master keeps the true scale for a detail view.

The WebP encoder's `method` is 4, not the maximum 6: measured on these images 6 costs about
fifty times as long and saves nothing.

## What one render is

- SourceIO decodes each texture once and caches the PNG under
  `assets-cache/texture-cache/`, keyed by the texture's path in the game. It is a cache and
  nothing reads it but SourceIO: delete the folder to force a re-decode after a game update.
  It is inside `assets-cache/`, so it is already gitignored. A parallel run gives each worker
  its own (`texture-cache-w<N>`), because the add-on writes each file in place.
- The game folder is mounted once per process and SourceIO is patched once, so a selection
  of jobs costs one mount and one add-on start-up.
- The class model and the Cosmetic's model are imported with SourceIO's
  `BlenderVertexLitGeneric` shader (`use_bvlg`). This is what makes a paintable item render
  in its unpainted colour: the Killer Exclusive comes out tan, not white.
- Default bodygroup visibility is read from the class `.mdl`'s bodypart table
  (`render.mdlinfo`), because SourceIO imports only submodels that have geometry and the
  ones that are off in the game (the Soldier's medal, the rocket) simply never arrive.
  On top of that the job hides what the Cosmetic hides.
- The Cosmetic's armature is moved onto the class skeleton. Hats are authored in head-bone
  space with a single `bip_head` bone at the origin, so without this step a hat renders at
  the class's feet.
- The Team is a material swap through each mesh's `skin_groups`. **The Class and the
  Cosmetic are swapped separately**: an item with no BLU skin — the Killer Exclusive, the
  Heavy's Team Captain — renders RED on a BLU class, and the manifest entry says
  `team_fallback: true`.
- Framing comes from the item's equip regions: head regions get the bust, everything else
  (and anything unrecognised) gets the full body, which is fixed to the ground so every
  class is at the same scale.
- EEVEE, Standard view transform, transparent film, the fixed three-light rig, 1024×1024.
  About 0.4 s a frame here once the class is imported; a class import is about 1 s.

## Workarounds we carry (the add-on is never edited)

`render/sourceio_patch.py`, applied at start-up. SourceIO 5.5.4 is installed as a legacy
add-on and must stay replaceable, so nothing is changed inside it.

1. **Doubled slashes in content lookups.** Some items spell their material directory with a
   leading slash, so SourceIO asks for `materials//models/...`, finds nothing, and the
   team-colour material is silently missing. We collapse repeated slashes on
   `ContentManager.find_file` and `.check`.
2. **`$detailblendmode 5` raises.** Its detail handler assumes the shader's BSDF output is
   already linked; on TF2's eyeball materials it is not, and the import dies with an
   `IndexError`. We wrap `handle_detail`/`handle_detail2` to load the material without its
   detail layer instead. At TF2's detail strengths the layer is invisible anyway.
   `$detailblendmode 6` — almost every TF2 item, at 1 % — is unsupported upstream and
   correctly ignored; its `[ERROR] unhandled Detail mode, got6` lines are harmless.
3. **`TinyPath.suffix` reads the whole path.** It takes the text after the *last dot
   anywhere in the path*, not the last dot in the final component, so `with_suffix` on any
   path with a dotted directory in it throws the rest of the path away. This broke the
   texture cache: SourceIO saves a decoded texture to
   `TinyPath(TextureCachePath) / texture`, then calls `with_suffix(".png")` on the joined
   path. With the cache under a `.claude/worktrees/...` checkout, every texture was written
   to `<repo root>/.png` — one junk file in the repo root, each texture overwriting the last,
   and a cache that never hit, so every texture was decoded again on every import. We
   replace the `suffix` property with `render.sourceio_patch.suffix_of`, which scopes it to
   the last component the way `pathlib` does; `with_suffix` is built on it and is fixed too.
   The `TextureCachePath` we set was always correct — it is a directory, and the add-on
   reads it as one.
4. **`uv.output` — the one that cost us a fifth of the catalogue.** `VertexLitGeneric.create_nodes`
   writes `uv_out=uv.output[0]` twice, where the attribute is `outputs` and `uv` is `None`
   unless the material carries a `$basetexturetransform`. Either way it raises, the add-on
   catches it a frame up and logs `Failed to load material`, and the half-built material is
   left with its Material Output unconnected — which Blender renders as flat, unlit black.
   The first of the two lines is reached by the commonest TF2 material there is, a
   `$phongexponenttexture` with no `$phongexponent`, so roughly one Cosmetic in five came out
   of the first full run as a black silhouette on a correctly lit class: Smissmas Caribou, Le
   Professionnel, A Rather Festive Tree and about three hundred more. The value the parameter
   wants when there is no transform is `None` — that is what the add-on passes everywhere
   else — so there is nothing to invent. There is no seam inside a three-hundred-line method,
   so we take it as text, correct both lines, and compile it against the add-on's own module
   globals; nothing on disk is touched, and a version that has fixed the typo is left alone.
   The symptom to watch for is `Failed to load material` in a run's log: a material that logs
   it is a material that will render black.

None of these is ours to fix upstream from here; all are worth reporting.

## Things found the hard way

- **Collection names collide.** SourceIO names a bodygroup collection after the bodygroup,
  and renames it `<name>_1` when that name is taken — which happens constantly, because a
  class's own bodygroup shares the model's name and every class has a `hat`. Matching
  collections to bodygroups by exact name silently stopped hiding anything after the first
  job in a process: the Soldier's helmet reappeared inside the Team Captain's cap.
  `render.scene.bodygroup_named` matches the suffixed name back.
- **`Vector.to_track_quat` is Z-up.** SourceIO imports Y-up, so Blender's track-to produces
  sideways renders; `render.geometry.look_at` keeps world +Y up instead.
- **Blender's Python is not the venv.** It has neither `vdf` nor `vpk`; both are pure
  Python, so the render step appends the venv's `site-packages` to `sys.path` before its
  first `render` import.
- **`bpy.ops.render.render` never raises for a path it cannot write.** The step checks the
  file exists afterwards and records a `render-error` if it does not.
