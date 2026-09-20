"""The arguments the batch runner and the render step both take.

Two commands reach the render step — `render.batch`, which drives it a batch at a time, and
`render.blender_job` itself, run by hand to debug one import — and the runner builds the
child's command line out of its own arguments. So the two parsers are not merely similar:
every argument here has to mean the same thing on both sides or a batch run and a hand run
quietly do different things. Declaring them once is what keeps that true.

`--site-packages` is here for its help text and its default only. `blender_job` has to read
it out of `sys.argv` by hand long before argparse runs, because it is what makes `render`
importable inside Blender's Python in the first place.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from render.extract import DEFAULT_TF

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CACHE = REPO_ROOT / "assets-cache"
DEFAULT_OUT = REPO_ROOT / "renders" / "masters"
DEFAULT_MANIFEST = REPO_ROOT / "catalogue" / "renders.json"
DEFAULT_SITE_PACKAGES = REPO_ROOT / ".venv" / "Lib" / "site-packages"
DEFAULT_SIZE = 1024
DEFAULT_SAMPLES = 32


def add_job_filters(parser: argparse.ArgumentParser, *, teams_flag: str) -> None:
    """Which jobs to render, and on which Teams.

    `nargs="+"` throughout: a filter with no values after it is a typo, and read as an empty
    list it would mean "everything" for a job filter and "no Teams" for the Team one — the
    second of which renders nothing and reports success.
    """
    parser.add_argument("--jobs", type=Path, required=True, help="the job list from render.resolve")
    parser.add_argument("--slug", nargs="+", default=None, help="Cosmetic slugs to render")
    parser.add_argument("--class", dest="classes", nargs="+", default=None, help="Classes to render")
    parser.add_argument("--style", dest="styles", nargs="+", type=int, default=None, help="Style indices")
    parser.add_argument(teams_flag, dest="teams", nargs="+", help="Teams to render")


def add_render_paths(parser: argparse.ArgumentParser) -> None:
    """Where the game, the cache, the images and the manifest live, and how big a render is."""
    parser.add_argument("--tf", type=Path, default=DEFAULT_TF, help="the game's tf folder")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE, help="the assets cache")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="the output root for masters")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST, help="the manifest to write")
    parser.add_argument("--size", type=int, default=DEFAULT_SIZE, help="pixels square")
    parser.add_argument("--samples", type=int, default=DEFAULT_SAMPLES, help="EEVEE render samples")
    parser.add_argument(
        "--site-packages",
        type=Path,
        default=DEFAULT_SITE_PACKAGES,
        help="where vdf and vpk live; Blender's Python has its own site-packages",
    )
