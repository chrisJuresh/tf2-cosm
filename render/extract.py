"""Copy the files a model needs out of the game's VPK archives into a local cache.

Source models are split across several files that share a stem (.mdl, .vvd, .dx90.vtx,
.phy, ...). SourceIO imports from a filesystem path, so before rendering we mirror each
needed model's files into an assets cache that reproduces the game's directory layout.
Textures and materials are NOT extracted: SourceIO resolves those from the mounted game
folder at import time. The cache is disposable and never committed.

Usage:
    python render/extract.py --cache assets-cache models/player/soldier.mdl models/player/items/soldier/soldier_officer.mdl
    python render/extract.py --cache assets-cache --jobs jobs.json [--classes]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import vpk

DEFAULT_TF = Path("C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf")
CLASS_MODELS = {
    cls: f"models/player/{'demo' if cls == 'demoman' else cls}.mdl"
    for cls in ("scout", "soldier", "pyro", "demoman", "heavy", "engineer", "medic", "sniper", "spy")
}


def siblings(index: dict[str, str], model_path: str) -> list[str]:
    """Every archive entry in the same directory sharing the model's stem, e.g. .mdl/.vvd/.dx90.vtx/.phy."""
    lower = model_path.lower()
    stem = lower[: -len(".mdl")] if lower.endswith(".mdl") else lower
    return [orig for key, orig in index.items() if key == stem + ".mdl" or key.startswith(stem + ".") and key.rsplit("/", 1)[0] == stem.rsplit("/", 1)[0]]


def extract(archive: vpk.VPK, index: dict[str, str], model_path: str, cache: Path) -> list[Path]:
    written = []
    for entry in siblings(index, model_path):
        target = cache / "tf" / entry
        if target.exists():
            written.append(target)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.get_file(entry) as src:
            target.write_bytes(src.read())
        written.append(target)
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("models", nargs="*", help="archive-relative model paths, e.g. models/player/soldier.mdl")
    ap.add_argument("--tf", type=Path, default=DEFAULT_TF)
    ap.add_argument("--cache", type=Path, default=Path("assets-cache"))
    ap.add_argument("--jobs", type=Path, help="jobs.json from resolve.py; extracts every model it references")
    ap.add_argument("--classes", action="store_true", help="also extract the nine class models")
    args = ap.parse_args()

    wanted = list(args.models)
    if args.jobs:
        wanted += sorted({j["model"] for j in json.loads(args.jobs.read_text(encoding="utf-8"))})
    if args.classes:
        wanted += list(CLASS_MODELS.values())
    if not wanted:
        ap.error("nothing to extract")

    archive = vpk.open(str(args.tf / "tf2_misc_dir.vpk"))
    index = {p.lower(): p for p in archive}
    total = 0
    for model in wanted:
        files = extract(archive, index, model, args.cache)
        if not files:
            print(f"MISSING {model}", file=sys.stderr)
            continue
        total += len(files)
    print(f"{len(wanted)} models, {total} files in {args.cache.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
