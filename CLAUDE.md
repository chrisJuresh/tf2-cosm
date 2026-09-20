# TF2 Cosmetics Catalogue

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `chrisJuresh/tf2-cosm`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles are used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Repository layout

- `CONTEXT.md` — glossary (the ubiquitous language). `docs/adr/` — decision records. Read both before changing the model.
- `render/` — Python render job (spike stage). `resolve.py` (schema → jobs), `extract.py` (archive → cache), `mdlinfo.py` (model bodygroups/skins), `spike_import.py` (Blender: import, attach, skin, frame, render).
- `assets-cache/`, `renders/` — extracted game files and rendered images; gitignored, never commit.
- Specs live as GitHub issues labelled `spec`; tickets hang off them.

## Running things locally

- Python env: `.venv` (Python 3.14) with `vdf`, `vpk`, `pillow` (`render/requirements.txt`). Use `./.venv/Scripts/python.exe`.
- Blender 5.2 at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` (bundled Python 3.13). SourceIO 5.5.4 is installed as a legacy add-on at `%APPDATA%/Blender Foundation/Blender/5.2/scripts/addons/SourceIO` and enabled per run by the script.
- TF2 install: `C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf` (items_game.txt and tf_english.txt loose; models in `tf2_misc_dir.vpk`, textures in `tf2_textures_dir.vpk`).
- Resolve every cosmetic to render jobs:
  `./.venv/Scripts/python.exe render/resolve.py --out jobs.json`
- Extract models for the spike, then render one case:
  `./.venv/Scripts/python.exe render/extract.py --cache assets-cache models/player/soldier.mdl models/player/items/soldier/soldier_officer.mdl`
  `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python render/spike_import.py -- --cache assets-cache --bvlg --class-model models/player/soldier.mdl --item-model models/player/items/soldier/soldier_officer.mdl --hide hat --team red --out renders/spike/team_captain_soldier_red.png`
- SourceIO facts learned in the spike: models import Y-up facing +Z; bodygroup submodels become collections named after the bodygroup; `obj['skin_groups']` holds per-skin material lists; hats have a single `bip_head` bone at the origin and must be aligned to the class skeleton; use `--bvlg` for game-accurate materials; the script patches SourceIO's `//` material-path bug at start-up.
