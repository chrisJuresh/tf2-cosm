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

from render.cosmetics import ALL_CLASSES, model_class_token
from render.jobs import validate_job_list

DEFAULT_TF = Path("C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf")
CLASS_MODELS = {
    cls: f"models/player/{model_class_token(cls)}.mdl"
    for cls in ALL_CLASSES
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


class ModelNotInArchive(Exception):
    """The game archive holds no such model, so no render can be made from it."""


class ModelCache:
    """The assets cache, filled one model at a time as the render step asks for them.

    The render step runs inside Blender and cannot know up front which models a run will
    touch, so it asks for each job's models as it reaches them; a model already on disk costs
    nothing. The archive is read through the same path list the resolve step matched against,
    so a job's spelling is mapped to the archive's own before anything is written.
    """

    def __init__(self, cache: Path, *, archive) -> None:
        self.cache = Path(cache)
        self.archive = archive
        self._index = {self._key(path): path for path in archive}
        self._extracted: set[str] = set()

    @classmethod
    def for_game(cls, tf: Path, cache: Path) -> "ModelCache":
        return cls(cache, archive=vpk.open(str(Path(tf) / "tf2_misc_dir.vpk")))

    @staticmethod
    def _key(path: str) -> str:
        """Source is case-insensitive and treats both slashes alike (see render.model_index)."""
        return path.lower().replace("\\", "/")

    def ensure(self, model_path: str) -> Path:
        """The cached .mdl for `model_path`, extracting it and its siblings on first ask."""
        found = self._index.get(self._key(model_path))
        if found is None:
            raise ModelNotInArchive(f"the game archive has no {model_path}")
        if found not in self._extracted:
            if not extract(self.archive, self._index, found, self.cache):
                raise ModelNotInArchive(f"the game archive has no files for {model_path}")
            self._extracted.add(found)
        return self.cache / "tf" / found


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
        document = json.loads(args.jobs.read_text(encoding="utf-8"))
        validate_job_list(document)
        wanted += sorted({job["model"] for job in document["jobs"]})
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
