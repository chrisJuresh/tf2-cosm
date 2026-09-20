"""Where the job's output lives: the storage seam, and the only place paths are decided.

Every path the manifest records is *relative to the output root*, and the root is
configuration. Today it is a folder on this machine; the day it becomes a bucket, an
uploader walks the manifest, pushes each relative path, and nothing else in the job changes
(user story 22 of the Worn Render spec).

    <root>/<masters_dir>/<slug>/<class>-<team>-<style>.png      the 1024 master
    <root>/<derivatives_dir>/<slug>/<class>-<team>-<style>@<size>.webp   a web derivative

The manifest itself is not under the root: it is committed to the repository and the images
never are (ADR-0001), so it has its own setting.

Settings, all optional, read from the environment:

    RENDER_OUTPUT_ROOT       the folder (or, later, the mount) images are written under
    RENDER_MASTERS_DIR       the image folder for masters, relative to the root
    RENDER_DERIVATIVES_DIR   the image folder for web derivatives, relative to the root
    RENDER_MANIFEST          where the manifest file is written
"""
from __future__ import annotations

import os
from dataclasses import dataclass, replace
from pathlib import Path, PurePosixPath
from typing import Mapping

REPO_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_OUTPUT_ROOT = "renders"
DEFAULT_MASTERS_DIR = "masters"
DEFAULT_DERIVATIVES_DIR = "web"
DEFAULT_MANIFEST = "catalogue/renders.json"

MASTER_FORMAT = "png"
DERIVATIVE_FORMAT = "webp"

# Nothing here imports Pillow, on purpose: the render step runs inside Blender's Python,
# which has no compiled packages, and it needs to know where a master goes.


def _image_folder(name: str, setting: str) -> str:
    """An image folder is a plain relative name: nothing that could point out of the root."""
    folder = PurePosixPath(name.replace("\\", "/"))
    if folder.is_absolute() or ".." in folder.parts or not folder.parts:
        raise ValueError(f"{setting} must be an image folder inside the output root, got {name!r}")
    return str(folder)


@dataclass(frozen=True)
class OutputLayout:
    """The output root, the image folders inside it, and where the manifest is written."""

    root: Path
    masters_dir: str
    derivatives_dir: str
    manifest: Path

    @classmethod
    def from_env(
        cls, env: Mapping[str, str] | None = None, *, repo_root: Path = REPO_ROOT
    ) -> "OutputLayout":
        env = os.environ if env is None else env
        return cls(
            root=Path(env.get("RENDER_OUTPUT_ROOT") or repo_root / DEFAULT_OUTPUT_ROOT),
            masters_dir=_image_folder(
                env.get("RENDER_MASTERS_DIR") or DEFAULT_MASTERS_DIR, "RENDER_MASTERS_DIR"
            ),
            derivatives_dir=_image_folder(
                env.get("RENDER_DERIVATIVES_DIR") or DEFAULT_DERIVATIVES_DIR,
                "RENDER_DERIVATIVES_DIR",
            ),
            manifest=Path(env.get("RENDER_MANIFEST") or repo_root / DEFAULT_MANIFEST),
        )

    def overridden(self, **overrides: object) -> "OutputLayout":
        """The same layout with some settings replaced: how a command line beats the environment.

        `None` means "not given", so a caller can pass its parsed arguments straight through.
        """
        given = {name: value for name, value in overrides.items() if value is not None}
        for name in ("masters_dir", "derivatives_dir"):
            if name in given:
                given[name] = _image_folder(str(given[name]), name)
        return replace(self, **given)

    def master_relpath(self, job: dict, team: str) -> str:
        """Where one master lives, relative to the output root."""
        return f"{self.masters_dir}/{job['slug']}/{job['class']}-{team}-{job['style']}.{MASTER_FORMAT}"

    def derivative_relpath(self, master_relpath: str, size: int) -> str:
        """Where one derivative of `master_relpath` lives, relative to the output root."""
        # Compared a segment at a time, not as a string: an image folder may be nested
        # (`images/masters`), and `masters-old/...` must not read as being under `masters`.
        master = PurePosixPath(master_relpath)
        folder = PurePosixPath(self.masters_dir).parts
        if master.parts[: len(folder)] != folder:
            raise ValueError(
                f"{master_relpath!r} is not under the masters folder {self.masters_dir!r}"
            )
        inside = PurePosixPath(*master.parts[len(folder) :])
        return str(
            PurePosixPath(self.derivatives_dir)
            / inside.with_name(f"{inside.stem}@{size}.{DERIVATIVE_FORMAT}")
        )

    def derivative_relpaths(self, master_relpath: str, sizes) -> dict[str, str]:
        """Every derivative path for one master, keyed the way the manifest keys them."""
        return {str(size): self.derivative_relpath(master_relpath, size) for size in sizes}

    def path_for(self, relpath: str) -> Path:
        """The file on disk for a path the manifest records."""
        return self.root / relpath
