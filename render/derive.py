"""The derive step: masters in, web derivatives out, manifest finished.

    ./.venv/Scripts/python.exe -m render.derive
    ./.venv/Scripts/python.exe -m render.derive --dry-run
    ./.venv/Scripts/python.exe -m render.derive --force --sizes 512 256

A step of its own rather than part of the render step, because Pillow is a compiled package
and the render step runs inside Blender's Python, not the project venv. It is also the
cheaper half of the job: derivatives come from masters, so the rule in `render.derivatives`
can change and every image can be remade without re-rendering a single frame.

It is resumable in the same way the render step is: a master whose derivatives are recorded
and present on disk is skipped, so re-running after a crash or a partial run only does what
is left. A master that cannot be derived is recorded as a `derive-error` failure and the run
carries on, exactly as a failed render is.
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Sequence

from render.derivatives import DERIVATIVE_SIZES, EmptyMaster, write_derivatives
from render.manifest import REASON_DERIVE_ERROR, Manifest, load_manifest
from render.output import OutputLayout


def log(*parts: object) -> None:
    print("[derive]", *parts, flush=True)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Outcome:
    """What one pass over the manifest did."""

    derived: int = 0
    skipped: int = 0
    failed: int = 0


def _is_finished(picture: dict, wanted: dict[str, str], layout: OutputLayout) -> bool:
    """Whether this picture's derivatives are both recorded as asked for and on disk."""
    recorded = picture["derivatives"]
    if set(recorded) != set(wanted):
        return False
    return all(
        record["path"] == wanted[size] and layout.path_for(record["path"]).exists()
        for size, record in recorded.items()
    )


def derive_all(
    manifest: Manifest,
    layout: OutputLayout,
    sizes: Sequence[int] = DERIVATIVE_SIZES,
    *,
    at: str | None = None,
    force: bool = False,
    dry_run: bool = False,
    on_log: Callable[..., None] = log,
) -> Outcome:
    """Give every recorded master the web sizes asked for, recording what could not be done.

    Every master, which since manifest v3 is up to two per job: a Cosmetic's Worn Render and
    its Item Render are two image files and each needs its own web sizes.
    """
    at = at or now()
    outcome = Outcome()
    for slug, cls, team, style, variant, picture in list(manifest.pictures()):
        where = f"{slug}/{cls}/{team}/{style}/{variant}"
        relpath = picture["master"]["path"]
        master = layout.path_for(relpath)
        try:
            # Inside the try with the rest: working out where a derivative goes is itself a
            # step that can refuse a picture — one recorded under a masters folder this run
            # is not configured for — and that must be a recorded failure like any other.
            wanted = layout.derivative_relpaths(relpath, sizes)
            if not force and _is_finished(picture, wanted, layout):
                outcome.skipped += 1
                continue
            if dry_run:
                on_log(f"would derive {where} from {relpath}")
                outcome.derived += 1
                continue
            written = write_derivatives(master, wanted, layout.root)
        except (OSError, EmptyMaster, ValueError) as error:
            on_log(f"FAILED {where}: {error!r}")
            manifest.fail_render(
                slug,
                cls,
                team,
                style,
                model=manifest.entry(slug, cls, team, style)["model"],
                reason=REASON_DERIVE_ERROR,
                detail=f"{relpath}: {error!r}",
                at=at,
                variant=variant,
            )
            outcome.failed += 1
            continue
        manifest.set_derivatives(slug, cls, team, style, written, variant)
        on_log(f"{where}: {', '.join(sorted(written))}")
        outcome.derived += 1
    return outcome


def _sizes(values: list[str]) -> list[int]:
    sizes = []
    for value in values:
        if not value.isdigit() or int(value) < 1:
            raise argparse.ArgumentTypeError(f"a web size is a number of pixels, got {value!r}")
        sizes.append(int(value))
    return sizes


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="render.derive",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--manifest", type=Path, default=None, help="the manifest to finish")
    parser.add_argument("--root", type=Path, default=None, help="the output root images live under")
    parser.add_argument("--masters-dir", default=None, help="the image folder holding masters")
    parser.add_argument("--derivatives-dir", default=None, help="the image folder holding web sizes")
    parser.add_argument(
        "--sizes",
        nargs="+",
        default=[str(size) for size in DERIVATIVE_SIZES],
        help="the web sizes to make, in pixels",
    )
    parser.add_argument("--force", action="store_true", help="remake derivatives that are already there")
    parser.add_argument("--dry-run", action="store_true", help="report what would be made, write nothing")
    args = parser.parse_args(argv)
    try:
        args.sizes = _sizes(args.sizes)
    except argparse.ArgumentTypeError as error:
        parser.error(str(error))
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    layout = OutputLayout.from_env().overridden(
        root=args.root,
        masters_dir=args.masters_dir,
        derivatives_dir=args.derivatives_dir,
        manifest=args.manifest,
    )
    manifest = load_manifest(layout.manifest)
    outcome = derive_all(
        manifest, layout, args.sizes, force=args.force, dry_run=args.dry_run
    )
    if args.dry_run:
        log(f"would derive {outcome.derived}, skip {outcome.skipped}; nothing written")
        return 0
    manifest.write(layout.manifest)
    log(
        f"done: {outcome.derived} derived, {outcome.skipped} already there, "
        f"{outcome.failed} failed; manifest {layout.manifest}"
    )
    return 1 if outcome.failed and not outcome.derived else 0


if __name__ == "__main__":
    sys.exit(main())
