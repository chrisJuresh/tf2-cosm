# Render run notes

How a Worn Render is actually made on this machine, and every workaround the job carries.
The spike that established these facts is gone; this is what replaced it.

## Running it

Resolve first, then render the jobs you want:

```bash
./.venv/Scripts/python.exe -m render.resolve --out jobs.json
```

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python render/blender_job.py -- --jobs jobs.json --slug team-captain --teams red blu
```

Useful arguments (all optional): `--class`, `--style` to narrow further; `--out` for the
output root (default `renders/`); `--masters-dir`; `--manifest` (default
`catalogue/renders.json`); `--tf`, `--cache`, `--size`, `--samples`; `--site-packages` when
the venv is not at `.venv/` beside the script — a worktree, for instance, where it is the
main checkout's.

Then make the web sizes, which finishes the manifest:

```bash
./.venv/Scripts/python.exe -m render.derive
```

`--dry-run` reports what it would make and writes nothing, `--force` remakes derivatives
that are already there, `--sizes` asks for a different set, and `--root`, `--masters-dir`,
`--derivatives-dir` and `--manifest` override the layout.

The render step extracts each job's models into the assets cache itself; `render.extract`
stays a command for filling the cache ahead of time.

Failures never stop a run. Each one lands in the manifest as `{reason, detail}` —
`model-missing`, `import-error`, `no-skeleton`, `render-error` or `derive-error` — and the
site falls back to the Backpack Icon for it (ADR-0001).

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

Neither of these is ours to fix upstream from here; both are worth reporting.

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
