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
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from render.cli import add_job_filters, add_render_paths
from render.jobs import job_list, validate_job_list
from render.manifest import load_manifest
from render.output import OutputLayout
from render.plan import Batch, RunPlan, account_for, batches, plan_run
from render.progress import format_duration, progress_line
from render.scene import TEAMS
from render.selection import NothingSelected

REPO_ROOT = Path(__file__).resolve().parent.parent
BLENDER_SCRIPT = REPO_ROOT / "render" / "blender_job.py"
DEFAULT_BLENDER = Path("C:/Program Files/Blender Foundation/Blender 5.2/blender.exe")

#: Images per Blender process. Small enough that a crash costs minutes rather than hours,
#: large enough that the mount and add-on start-up (a few seconds) disappear into the run.
DEFAULT_BATCH_SIZE = 40

#: Blender processes at once. One by default: a full run is the thing worth parallelising and
#: it is asked for explicitly, and a debugging run of one Cosmetic wants its output readable.
DEFAULT_WORKERS = 1

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
    workers: int
    dry_run: bool
    retry_failed: bool
    trust_manifest: bool
    blender: Path
    tf: Path
    cache: Path
    texture_cache: Path | None
    root: Path | None
    masters_dir: str | None
    manifest: Path | None
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
    add_job_filters(parser, teams_flag="--team")
    parser.set_defaults(teams=list(TEAMS))
    parser.add_argument(
        "--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="images per Blender process"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help="Blender processes at once; the import, not the frame, is what a core buys back",
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
    parser.add_argument(
        "--blender", type=Path, default=DEFAULT_BLENDER, help="the Blender to run the render step in"
    )
    add_render_paths(parser)
    return Settings(**vars(parser.parse_args(argv)))


def blender_command(
    settings: Settings,
    layout: OutputLayout,
    jobs_file: Path,
    batch: Batch,
    *,
    manifest: Path,
    texture_cache: Path,
) -> list[str]:
    """The render step, told to render exactly this batch and nothing else.

    The batch is handed over as a job list of its own rather than as filters: the child then
    has one job to do per job in the file, and needs to know nothing about the manifest,
    resuming or what the rest of the run is doing.

    The layout is passed as settled paths, not as the flags that were typed: the runner has
    already let the command line beat the environment, and the child must not resolve it a
    second time and possibly differently.

    The manifest it is given is its own shard, never the run's — see `_render_batches`.
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
        "--texture-cache", str(texture_cache),
        "--root", str(layout.root),
        "--masters-dir", layout.masters_dir,
        "--manifest", str(manifest),
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


def describe(plan: RunPlan, layout: OutputLayout, *, job_by_job: bool) -> None:
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
    log(f"masters -> {layout.path_for(layout.masters_dir)}; manifest -> {layout.manifest}")


def report_failures(layout: OutputLayout, plan: RunPlan) -> None:
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
    failures = load_manifest(layout.manifest).failures_for(selected)
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
    layout = OutputLayout.from_env().overridden(
        root=settings.root, masters_dir=settings.masters_dir, manifest=settings.manifest
    )
    document = json.loads(settings.jobs.read_text(encoding="utf-8"))
    validate_job_list(document)
    manifest = load_manifest(layout.manifest)

    exists = None if settings.trust_manifest else lambda path: layout.path_for(path).exists()
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

    describe(plan, layout, job_by_job=settings.dry_run)
    if settings.dry_run:
        return 0
    if not plan.work:
        report_failures(layout, plan)
        log("nothing to render; everything selected is already up to date")
        return 0

    # Before the first batch, not after: an hour of rendering that ends in "no Blender" is an
    # hour nobody gets back, and a plan printed above a failure reads as though it ran.
    complaint = check_blender(settings.blender)
    if complaint is not None:
        print(f"[batch] {complaint}", file=sys.stderr, flush=True)
        return 2

    return _render_batches(settings, layout, plan, batches(plan.work, settings.batch_size), launch)


def texture_cache_for(settings: Settings, worker: int) -> Path:
    """The decoded-texture cache one worker uses.

    SourceIO writes each decoded texture in place, so two processes sharing a cache can read
    one that is half written. Each worker therefore gets its own — kept beside the assets
    cache rather than in the run's scratch, because it is worth having on the next run too.
    A single-worker run keeps the one shared folder it has always used.
    """
    base = settings.texture_cache or settings.cache / "texture-cache"
    if settings.workers <= 1:
        return base
    return base.with_name(f"{base.name}-w{worker}")


def _render_batches(
    settings: Settings, layout: OutputLayout, plan: RunPlan, cut: list[Batch], launch
) -> int:
    """Hand every batch to Blender, `settings.workers` of them at a time.

    Each batch writes its results to a manifest shard of its own, and the runner folds that
    shard into the run's manifest when the batch comes back. Blender processes cannot share a
    manifest file — each rewrites it whole, so the last writer would drop the others' work —
    and the shard is cheap besides: the child rewrites it after every job, and a file holding
    one batch stays small where the run's manifest grows all run long.

    What a crash costs is still one batch, because the shard is written job by job and merged
    whatever the exit code. What a *runner* crash costs is the batches in flight, which is why
    the merge happens as each one lands rather than at the end.
    """
    started = time.monotonic()
    workers = max(1, min(settings.workers, len(cut)))
    tally = _Tally(total=plan.images)
    manifest = load_manifest(layout.manifest)
    merging = threading.Lock()
    stopping = threading.Event()

    if workers > 1:
        log(f"{workers} Blender processes at a time over {len(cut)} batches")

    with tempfile.TemporaryDirectory(prefix="tf2-cosm-batch-") as scratch:

        def render_one(number: int, batch: Batch, worker: int) -> None:
            jobs_file = Path(scratch) / f"batch-{number}.json"
            jobs_file.write_text(
                json.dumps(job_list(list(batch.jobs), source=str(settings.jobs))), encoding="utf-8"
            )
            shard = Path(scratch) / f"manifest-{number}.json"
            log(f"batch {number}/{len(cut)}: {len(batch.jobs)} jobs x {' '.join(batch.teams)}")
            code = launch(
                blender_command(
                    settings,
                    layout,
                    jobs_file,
                    batch,
                    manifest=shard,
                    texture_cache=texture_cache_for(settings, worker),
                )
            )
            with merging:
                written = load_manifest(shard)
                manifest.merge(written)
                manifest.write(layout.manifest)
                outcome = account_for(written, batch)
                tally.add(outcome)
                if outcome.lost:
                    log(f"  batch {number} exited {code} and lost {outcome.lost} images; carrying on")
                log("  " + progress_line(
                    done=tally.done,
                    failed=tally.failed,
                    total=tally.total,
                    elapsed=time.monotonic() - started,
                ))

        def take(assigned: list[tuple[int, Batch]], worker: int) -> None:
            for number, batch in assigned:
                if stopping.is_set():
                    return
                render_one(number, batch, worker)

        # Round robin, so every worker gets batches from across the run rather than one
        # worker getting all of a Class whose models are slow.
        rounds = [list(enumerate(cut, start=1))[index::workers] for index in range(workers)]
        try:
            if workers == 1:
                take(rounds[0], 0)
            else:
                with ThreadPoolExecutor(max_workers=workers) as pool:
                    running = [
                        pool.submit(take, assigned, worker)
                        for worker, assigned in enumerate(rounds)
                    ]
                    try:
                        for finished in as_completed(running):
                            finished.result()
                    except BaseException:
                        # Set it here, not in the outer handler: leaving this `with` block
                        # shuts the pool down waiting, and a worker that has not been told
                        # to stop by then works through every batch it is still holding —
                        # a ctrl-c that drains the run instead of ending it. The same goes
                        # for anything else a worker raises, which the serial path would
                        # have stopped on at once.
                        stopping.set()
                        raise
        except KeyboardInterrupt:
            # ctrl-c reaches every Blender in the process group, so the batches in flight are
            # already gone. Stop handing out new ones, let the threads unwind, and leave; the
            # next run starts from the manifest, which holds everything already merged.
            stopping.set()

    stopped = stopping.is_set()
    elapsed = time.monotonic() - started
    log(f"{'stopped' if stopped else 'done'} in {format_duration(elapsed)}: "
        f"{tally.done - tally.failed} rendered, {tally.failed} failed, {tally.lost} lost")
    report_failures(layout, plan)
    if stopped:
        log("run it again to pick up where this stopped")
        return 130
    return 1 if tally.lost else 0


class _Tally:
    """What the run has got through so far, added to as each batch lands."""

    def __init__(self, *, total: int) -> None:
        self.total = total
        self.done = self.failed = self.lost = 0

    def add(self, outcome) -> None:
        self.done += outcome.rendered + outcome.failed
        self.failed += outcome.failed
        self.lost += outcome.lost


def main(argv: list[str] | None = None) -> int:
    return run(parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
