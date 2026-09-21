"""What a run still has to do, decided from the job list and the manifest alone.

A full run is long enough that starting it over is not an option, so a run renders what is
missing rather than what was asked for: the manifest is the record of what exists, and
everything in it at the current job list version is already done. That is what makes a second
run over the same jobs do nothing, and a `JOB_LIST_VERSION` bump re-render everything.

The unit of work is one job on one Team, which is two images: the Worn Render and the Item
Render, both frames of one import. A job owes that Team work unless every variant the run
wants is already recorded, so a job whose Item Render is missing renders both again — the
import is what a render costs, and re-framing the camera for the second frame is not worth
the plan needed to skip it.

Jobs are handed to Blender in batches because the Team is a material swap on an import that
is expensive to repeat, so a batch is a set of jobs *and* the Teams wanted from each; jobs
wanting different Teams go in different batches rather than costing an unwanted render each.

Nothing here touches Blender or the disk. `image_exists` is the one door to the filesystem and
the caller decides what goes behind it — it is handed the master's path as the manifest
records it, relative to the output root (`render.output`).
"""
from __future__ import annotations

from typing import Callable, Iterable, NamedTuple, Sequence

from render.jobs import JOB_LIST_VERSION
from render.manifest import Manifest
from render.scene import VARIANTS
from render.selection import select_jobs, selected_teams, selected_variants


class JobWork(NamedTuple):
    """One job and the Teams it still owes an image."""

    job: dict
    teams: tuple[str, ...]


class Batch(NamedTuple):
    """The jobs one Blender process renders, the Teams it renders each on, and the variants."""

    jobs: tuple[dict, ...]
    teams: tuple[str, ...]
    variants: tuple[str, ...] = VARIANTS

    @property
    def images(self) -> int:
        return len(self.jobs) * len(self.teams) * len(self.variants)


class RunPlan(NamedTuple):
    """The work left, and what the manifest already accounts for.

    `selected` is every job the filters matched, done or not, because what a run is *about* is
    wider than what it has left to do: a resumed run whose failures were all recorded
    yesterday still has to report them.

    The three tallies are all in images, so they add up to the run: a job on a Team that is
    done is done in both its pictures, and one that is owed owes both.
    """

    work: list[JobWork]
    up_to_date: int
    known_failures: int
    selected: list[dict]
    teams: tuple[str, ...]
    variants: tuple[str, ...] = VARIANTS

    @property
    def images(self) -> int:
        return sum(len(work.teams) for work in self.work) * len(self.variants)


def plan_run(
    document: dict,
    manifest: Manifest,
    *,
    teams: Sequence[str],
    variants: Sequence[str] = VARIANTS,
    slugs: Iterable[str] | None = None,
    classes: Iterable[str] | None = None,
    styles: Iterable[int] | None = None,
    retry_failed: bool = False,
    image_exists: Callable[[str], bool] | None = None,
) -> RunPlan:
    """The renders the selection still needs, in job list order.

    A job on a Team is already done when the manifest holds every wanted variant of it at this
    job version and — when `image_exists` is given — the files those pictures name are still
    on disk. One that failed before is left alone unless `retry_failed`, so re-running after a
    long run repeats the failures instead of the renders.
    """
    wanted = selected_teams(teams)
    wanted_variants = selected_variants(variants)
    selected = select_jobs(document, slugs=slugs, classes=classes, styles=styles)

    work: list[JobWork] = []
    up_to_date = known_failures = 0
    for job in selected:
        owed = []
        for team in wanted:
            if _is_rendered(manifest, job, team, image_exists, wanted_variants):
                up_to_date += len(wanted_variants)
            elif not retry_failed and _has_failed(manifest, job, team, wanted_variants):
                known_failures += len(wanted_variants)
            else:
                owed.append(team)
        if owed:
            work.append(JobWork(job, tuple(owed)))
    return RunPlan(
        work, up_to_date, known_failures, selected, tuple(wanted), tuple(wanted_variants)
    )


def batches(
    work: Sequence[JobWork], size: int, variants: Sequence[str] = VARIANTS
) -> list[Batch]:
    """The work cut into batches of at most `size` images, never mixing Teams.

    A batch is what one Blender process takes on and what a crash costs, so the size is
    counted in images rather than jobs. A single job never splits, so a job wanting more
    images than `size` is a batch of its own.
    """
    if size < 1:
        raise ValueError(f"a batch holds at least one image, not {size}")
    wanted = tuple(selected_variants(variants))
    cut: list[Batch] = []
    for teams in _team_groups(work):
        jobs: list[dict] = []
        for item in (item for item in work if item.teams == teams):
            if jobs and (len(jobs) + 1) * len(teams) * len(wanted) > size:
                cut.append(Batch(tuple(jobs), teams, wanted))
                jobs = []
            jobs.append(item.job)
        if jobs:
            cut.append(Batch(tuple(jobs), teams, wanted))
    return cut


def _team_groups(work: Sequence[JobWork]) -> list[tuple[str, ...]]:
    """The distinct Team sets, in the order they first appear, so batching is deterministic."""
    groups: list[tuple[str, ...]] = []
    for item in work:
        if item.teams not in groups:
            groups.append(item.teams)
    return groups


def _is_rendered(
    manifest: Manifest,
    job: dict,
    team: str,
    image_exists: Callable[[str], bool] | None,
    variants: Sequence[str] = VARIANTS,
) -> bool:
    entry = manifest.entry(job["slug"], job["class"], team, job["style"])
    if entry is None or entry["job_version"] != JOB_LIST_VERSION:
        return False
    pictures = [entry.get(variant) for variant in variants]
    if any(picture is None for picture in pictures):
        return False
    return image_exists is None or all(
        image_exists(picture["master"]["path"]) for picture in pictures
    )


def _has_failed(
    manifest: Manifest, job: dict, team: str, variants: Sequence[str] = VARIANTS
) -> bool:
    """Whether any wanted variant of this job failed under the job list we render from.

    A failure recorded under an older `JOB_LIST_VERSION` is not news about this one: the bump
    is what says the job's definition has changed, and a model or a bodygroup that resolves
    differently now is exactly the thing that might succeed this time.
    """
    failures = [
        manifest.failure(job["slug"], job["class"], team, job["style"], variant)
        for variant in variants
    ]
    return any(
        failure is not None and failure["job_version"] == JOB_LIST_VERSION for failure in failures
    )


class Outcome(NamedTuple):
    """What became of a batch, read back out of the manifest the renderer wrote."""

    rendered: int
    failed: int
    lost: int


def account_for(manifest: Manifest, batch: Batch) -> Outcome:
    """What the manifest now says about a batch that has been handed to Blender.

    An image the manifest knows nothing about was lost — the process died before reaching it —
    and that is the whole cost of a crash, because everything before it is already written.
    """
    rendered = failed = lost = 0
    for job in batch.jobs:
        for team in batch.teams:
            for variant in batch.variants:
                if _is_rendered(manifest, job, team, None, [variant]):
                    rendered += 1
                elif _has_failed(manifest, job, team, [variant]):
                    failed += 1
                else:
                    lost += 1
    return Outcome(rendered, failed, lost)
