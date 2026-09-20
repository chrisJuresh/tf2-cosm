"""The batch runner: one command that renders every Worn Render still missing.

    python -m render.batch --jobs jobs.json
    python -m render.batch --jobs jobs.json --dry-run
    python -m render.batch --jobs jobs.json --slug team-captain --class soldier --team red

It reads the job list and the manifest, works out what is missing (`render.plan`), and hands
that to Blender a batch at a time. Run it again and it renders only what is still missing, so
a crash, a power cut or a stop with ctrl-c costs the batch that was in flight and nothing more.

Why a batch rather than one long process: a Blender that dies takes with it everything it has
not written, and one that never dies means a ten-hour run with a single point of failure. The
manifest is written by the child, once per job, so a batch boundary is a floor on what a crash
can cost, not the only save point.

Why a batch rather than one process per image: the game mount, the add-on start-up and the
class import all cost more than a frame does, and a batch amortises them.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from render.extract import DEFAULT_TF
from render.jobs import job_list, validate_job_list
from render.manifest import load_manifest
from render.plan import Batch, RunPlan, account_for, batches, plan_run
from render.progress import format_duration, progress_line
from render.scene import TEAMS
from render.selection import NothingSelected

REPO_ROOT = Path(__file__).resolve().parent.parent
BLENDER_SCRIPT = REPO_ROOT / "render" / "blender_job.py"
DEFAULT_BLENDER = Path("C:/Program Files/Blender Foundation/Blender 5.2/blender.exe")
DEFAULT_CACHE = REPO_ROOT / "assets-cache"
DEFAULT_OUT = REPO_ROOT / "renders" / "masters"
DEFAULT_MANIFEST = REPO_ROOT / "catalogue" / "renders.json"
DEFAULT_SITE_PACKAGES = REPO_ROOT / ".venv" / "Lib" / "site-packages"

#: Images per Blender process. Small enough that a crash costs minutes rather than hours,
#: large enough that the mount and add-on start-up (a few seconds) disappear into the run.
DEFAULT_BATCH_SIZE = 40

INSTALL_HINT = (
    "Install Blender 5.2 and the SourceIO 5.5.4 add-on, or pass --blender with the path to it."
)


@dataclass(frozen=True)
class Settings:
    """Everything a run needs; what the command line is parsed into."""

    jobs: Path
    slug: list[str] | None
    classes: list[str] | None
    styles: list[int] | None
    teams: list[str]
    batch_size: int
    dry_run: bool
    retry_failed: bool
    trust_manifest: bool
    blender: Path
    tf: Path
    cache: Path
    out: Path
    manifest: Path
    size: int
    samples: int
    site_packages: Path


def log(*parts: object) -> None:
    print("[batch]", *parts, flush=True)


def parse_args(argv: list[str] | None = None) -> Settings:
    parser = argparse.ArgumentParser(
        prog="render.batch",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--jobs", type=Path, required=True, help="the job list from render.resolve")
    parser.add_argument("--slug", nargs="+", default=None, help="Cosmetic slugs to render")
    parser.add_argument("--class", dest="classes", nargs="+", default=None, help="Classes to render")
    parser.add_argument("--team", dest="teams", nargs="+", default=list(TEAMS), help="Teams to render")
    parser.add_argument("--style", dest="styles", nargs="+", type=int, default=None, help="Style indices")
    parser.add_argument(
        "--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="images per Blender process"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="say what would be rendered, open nothing"
    )
    parser.add_argument(
        "--retry-failed", action="store_true", help="render jobs that failed on an earlier run"
    )
    parser.add_argument(
        "--trust-manifest",
        action="store_true",
        help="skip the check that each recorded image is still on disk",
    )
    parser.add_argument("--blender", type=Path, default=DEFAULT_BLENDER)
    parser.add_argument("--tf", type=Path, default=DEFAULT_TF, help="the game's tf folder")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="the output root for masters")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--site-packages", type=Path, default=DEFAULT_SITE_PACKAGES)
    return Settings(**vars(parser.parse_args(argv)))


def blender_command(settings: Settings, jobs_file: Path, batch: Batch) -> list[str]:
    """The render step, told to render exactly this batch and nothing else.

    The batch is handed over as a job list of its own rather than as filters: the child then
    has one job to do per job in the file, and needs to know nothing about the manifest,
    resuming or what the rest of the run is doing.
    """
    return [
        str(settings.blender),
        "-b",
        "--factory-startup",
        "--python",
        str(BLENDER_SCRIPT),
        "--",
        "--jobs", str(jobs_file),
        "--tf", str(settings.tf),
        "--cache", str(settings.cache),
        "--out", str(settings.out),
        "--manifest", str(settings.manifest),
        "--size", str(settings.size),
        "--samples", str(settings.samples),
        "--site-packages", str(settings.site_packages),
        "--teams", *batch.teams,
    ]


def launch_blender(command: list[str]) -> int:
    """Run one Blender process to completion, its output streaming straight through ours."""
    return subprocess.run(command, check=False).returncode


def check_blender(given: Path) -> str | None:
    """Nothing if `given` is there to run, else what to tell the operator about it.

    The path is taken literally, including the default: silently running a different Blender
    than the one asked for is how a run comes out wrong in a way nobody can see.
    """
    if given.exists():
        return None
    return f"no Blender at {given}. {INSTALL_HINT}"


def describe(plan: RunPlan, settings: Settings, *, job_by_job: bool) -> None:
    """What the run is about to do: by Class, or job by job when that is what was asked for.

    A full run is six thousand jobs, so listing them all is `--dry-run`'s job; a run that is
    about to print progress for an hour opens with a summary instead.
    """
    log(f"{plan.images} images to render in {len(plan.work)} jobs")
    log(f"{plan.up_to_date} already rendered, {plan.known_failures} failed before and not retried")
    if job_by_job:
        for work in plan.work:
            job = work.job
            log(f"  {job['slug']:<40} {job['class']:<9} style {job['style']}  {' '.join(work.teams)}")
    else:
        by_class = Counter()
        for work in plan.work:
            by_class[work.job["class"]] += len(work.teams)
        for cls, images in sorted(by_class.items()):
            log(f"  {cls:<9} {images} images")
    log(f"masters -> {settings.out}; manifest -> {settings.manifest}")


def report_failures(settings: Settings, plan: RunPlan) -> None:
    """The failure list a run leaves behind, so it can be reviewed rather than scrolled back to.

    Scoped to everything the filters selected, not to the batches this run happened to render:
    a resumed run whose failures were all recorded yesterday would otherwise report none, and
    the one thing worth reading at the end of a long run would be the thing it left out. The
    other nine hundred failures in the manifest still stay out of it.
    """
    selected = {
        (job["slug"], job["class"], team, job["style"])
        for job in plan.selected
        for team in plan.teams
    }
    failures = load_manifest(settings.manifest).failures_for(selected)
    if not failures:
        return
    log(f"{len(failures)} failures:")
    for reason, count in sorted(Counter(f["reason"] for f in failures).items()):
        log(f"  {reason:<14} {count}")
    for failure in failures:
        log(
            f"  {failure['slug']:<40} {failure['class']:<9} {failure['team']:<4} "
            f"style {failure['style']}  {failure['reason']}: {failure['detail']}"
        )


def run(settings: Settings, *, launch=launch_blender) -> int:
    """Render what is missing. 0 when everything planned was accounted for, 1 when work was lost."""
    document = json.loads(settings.jobs.read_text(encoding="utf-8"))
    validate_job_list(document)
    manifest = load_manifest(settings.manifest)

    exists = None if settings.trust_manifest else lambda path: (settings.out / path).exists()
    try:
        plan = plan_run(
            document,
            manifest,
            teams=settings.teams,
            slugs=settings.slug,
            classes=settings.classes,
            styles=settings.styles,
            retry_failed=settings.retry_failed,
            image_exists=exists,
        )
    except (NothingSelected, ValueError) as error:
        # An empty selection or an unknown Team is a mistake in the command, not a short run.
        print(f"[batch] {error}", file=sys.stderr, flush=True)
        return 2

    describe(plan, settings, job_by_job=settings.dry_run)
    if settings.dry_run:
        return 0
    if not plan.work:
        report_failures(settings, plan)
        log("nothing to render; everything selected is already up to date")
        return 0

    # Before the first batch, not after: an hour of rendering that ends in "no Blender" is an
    # hour nobody gets back, and a plan printed above a failure reads as though it ran.
    complaint = check_blender(settings.blender)
    if complaint is not None:
        print(f"[batch] {complaint}", file=sys.stderr, flush=True)
        return 2

    return _render_batches(settings, plan, batches(plan.work, settings.batch_size), launch)


def _render_batches(settings: Settings, plan: RunPlan, cut: list[Batch], launch) -> int:
    started = time.monotonic()
    total = plan.images
    done = failed = lost = 0
    stopped = False
    with tempfile.TemporaryDirectory(prefix="tf2-cosm-batch-") as scratch:
        for number, batch in enumerate(cut, start=1):
            log(f"batch {number}/{len(cut)}: {len(batch.jobs)} jobs x {' '.join(batch.teams)}")
            jobs_file = Path(scratch) / f"batch-{number}.json"
            jobs_file.write_text(
                json.dumps(job_list(list(batch.jobs), source=str(settings.jobs))), encoding="utf-8"
            )
            try:
                code = launch(blender_command(settings, jobs_file, batch))
            except KeyboardInterrupt:
                # ctrl-c reaches Blender too, so the batch in flight is already gone. Say what
                # the run got to and leave; the next run starts from the manifest.
                code, stopped = 130, True

            outcome = account_for(load_manifest(settings.manifest), batch)
            done += outcome.rendered + outcome.failed
            failed += outcome.failed
            lost += outcome.lost
            if outcome.lost:
                log(f"  batch {number} exited {code} and lost {outcome.lost} images; carrying on")
            log("  " + progress_line(
                done=done, failed=failed, total=total, elapsed=time.monotonic() - started
            ))
            if stopped:
                break

    elapsed = time.monotonic() - started
    log(f"{'stopped' if stopped else 'done'} in {format_duration(elapsed)}: "
        f"{done - failed} rendered, {failed} failed, {lost} lost")
    report_failures(settings, plan)
    if stopped:
        log("run it again to pick up where this stopped")
        return 130
    return 1 if lost else 0


def main(argv: list[str] | None = None) -> int:
    return run(parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
