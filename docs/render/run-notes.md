# Render run notes

How a Worn Render is actually made on this machine, and every workaround the job carries.
The spike that established these facts is gone; this is what replaced it.

## Running it

Resolve first, then run the batch runner. These two commands are the whole job:

```bash
./.venv/Scripts/python.exe -m render.resolve --out jobs.json
```

```bash
./.venv/Scripts/python.exe -m render.batch --jobs jobs.json
```

The second one renders everything the manifest does not already have, a batch of jobs per
Blender process, and prints progress and an estimate of time remaining as it goes. Run it
again and it renders only what is still missing, so stopping it with ctrl-c, a crash or a
power cut costs the batch that was in flight and nothing more. A run over work that is
already done opens Blender not at all.

Useful arguments (all optional):

- `--dry-run` — list what would be rendered and open nothing. Check the counts after a game
  update.
- `--slug`, `--class`, `--team`, `--style` — render a subset while fixing one item.
- `--batch-size` — images per Blender process (default 40). Smaller loses less to a crash;
  larger amortises the mount and the class import over more frames.
- `--retry-failed` — render the jobs that failed on an earlier run. Without it they are left
  alone, because a second run that repeats yesterday's failures has done nothing.
- `--trust-manifest` — skip the check that every recorded image is still on disk. The check
  costs one `stat` an image and is what makes a deleted or moved image come back.
- `--out` (masters, default `renders/masters`), `--manifest` (default
  `catalogue/renders.json`), `--blender`, `--tf`, `--cache`, `--size`, `--samples`.
- `--site-packages` when the venv is not at `.venv/` beside the script — a worktree, for
  instance, where it is the main checkout's.

Exit codes: 0 when every image planned was either rendered or recorded as a failure, 1 when
a Blender process died and took some with it (run it again; it picks up where it stopped),
2 when the command itself is wrong — no Blender, or a selection that matches no job — and
130 when ctrl-c stopped it, which is the same "run it again" as 1.

To drive one Blender process yourself — debugging an import, mostly — the render step is
still a command of its own, and takes the same filters:

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python render/blender_job.py -- --jobs jobs.json --slug team-captain --teams red blu
```

The render step extracts each job's models into the assets cache itself; `render.extract`
stays a command for filling the cache ahead of time.

Failures never stop a run. Each one lands in the manifest as `{reason, detail}` —
`model-missing`, `import-error`, `no-skeleton` or `render-error` — and the site falls back
to the Backpack Icon for it (ADR-0001). The runner prints the whole failure list, grouped by
reason, when it finishes.

## What resuming is decided from

`render.plan` decides, from the job list and the manifest alone, what a run still owes:

- An image is **done** when the manifest has an entry for it whose `job_version` is the
  current `JOB_LIST_VERSION` and — unless `--trust-manifest` — the file it names is on disk.
  Bumping `JOB_LIST_VERSION` therefore re-renders everything, which is the point of it.
- An image that **failed** before is left alone until `--retry-failed`.
- Everything else is work, and the unit of work is one image: a job whose RED is rendered and
  whose BLU is not goes back to Blender for BLU only.

Jobs wanting different Teams are never batched together, because a Blender process renders
every job in its batch on every Team it is given.

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
