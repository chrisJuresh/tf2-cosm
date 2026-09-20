"""What a run still has to do, decided from the job list and the manifest alone.

A full run is long enough that starting it over is not an option, so a run renders what is
missing rather than what was asked for: the manifest is the record of what exists, and
everything in it at the current job list version is already done. That is what makes a second
run over the same jobs do nothing, and a `JOB_LIST_VERSION` bump re-render everything.

The unit of work is one image — one job on one Team. Jobs are handed to Blender in batches
because the Team is a material swap on an import that is expensive to repeat, so a batch is a
set of jobs *and* the Teams wanted from each; jobs wanting different Teams go in different
batches rather than costing an unwanted render each.

Nothing here touches Blender or the disk. `image_exists` is the one door to the filesystem and
the caller decides what goes behind it — it is handed the master's path as the manifest
records it, relative to the output root (`render.output`).
"""
from __future__ import annotations

from typing import Callable, Iterable, NamedTuple, Sequence

from render.jobs import JOB_LIST_VERSION
from render.manifest import Manifest
from render.selection import select_jobs, selected_teams


class JobWork(NamedTuple):
    """One job and the Teams it still owes an image."""

    job: dict
    teams: tuple[str, ...]


class Batch(NamedTuple):
    """The jobs one Blender process renders, and the Teams it renders each on."""

    jobs: tuple[dict, ...]
    teams: tuple[str, ...]

    @property
    def images(self) -> int:
        return len(self.jobs) * len(self.teams)


class RunPlan(NamedTuple):
    """The work left, and what the manifest already accounts for.

    `selected` is every job the filters matched, done or not, because what a run is *about* is
    wider than what it has left to do: a resumed run whose failures were all recorded
    yesterday still has to report them.
    """

    work: list[JobWork]
    up_to_date: int
    known_failures: int
    selected: list[dict]
    teams: tuple[str, ...]

    @property
    def images(self) -> int:
        return sum(len(work.teams) for work in self.work)


def plan_run(
    document: dict,
    manifest: Manifest,
    *,
    teams: Sequence[str],
    slugs: Iterable[str] | None = None,
    classes: Iterable[str] | None = None,
    styles: Iterable[int] | None = None,
    retry_failed: bool = False,
    image_exists: Callable[[str], bool] | None = None,
) -> RunPlan:
    """The images the selection still needs, in job list order.

    An image is already done when the manifest holds an entry for it at this job version and
    — when `image_exists` is given — the file that entry names is still on disk. An image that
    failed before is left alone unless `retry_failed`, so re-running after a long run repeats
    the failures instead of the renders.
    """
    wanted = selected_teams(teams)
    selected = select_jobs(document, slugs=slugs, classes=classes, styles=styles)

    work: list[JobWork] = []
    up_to_date = known_failures = 0
    for job in selected:
        owed = []
        for team in wanted:
            if _is_rendered(manifest, job, team, image_exists):
                up_to_date += 1
            elif not retry_failed and _has_failed(manifest, job, team):
                known_failures += 1
            else:
                owed.append(team)
        if owed:
            work.append(JobWork(job, tuple(owed)))
    return RunPlan(work, up_to_date, known_failures, selected, tuple(wanted))


def batches(work: Sequence[JobWork], size: int) -> list[Batch]:
    """The work cut into batches of at most `size` images, never mixing Teams.

    A batch is what one Blender process takes on and what a crash costs, so the size is
    counted in images rather than jobs. A single job never splits, so a job wanting more
    images than `size` is a batch of its own.
    """
    if size < 1:
        raise ValueError(f"a batch holds at least one image, not {size}")
    cut: list[Batch] = []
    for teams in _team_groups(work):
        jobs: list[dict] = []
        for item in (item for item in work if item.teams == teams):
            if jobs and (len(jobs) + 1) * len(teams) > size:
                cut.append(Batch(tuple(jobs), teams))
                jobs = []
            jobs.append(item.job)
        if jobs:
            cut.append(Batch(tuple(jobs), teams))
    return cut


def _team_groups(work: Sequence[JobWork]) -> list[tuple[str, ...]]:
    """The distinct Team sets, in the order they first appear, so batching is deterministic."""
    groups: list[tuple[str, ...]] = []
    for item in work:
        if item.teams not in groups:
            groups.append(item.teams)
    return groups


def _is_rendered(
    manifest: Manifest, job: dict, team: str, image_exists: Callable[[str], bool] | None
) -> bool:
    entry = manifest.entry(job["slug"], job["class"], team, job["style"])
    if entry is None or entry["job_version"] != JOB_LIST_VERSION:
        return False
    return image_exists is None or image_exists(entry["master"]["path"])


def _has_failed(manifest: Manifest, job: dict, team: str) -> bool:
    """Whether this job failed under the job list we are rendering from.

    A failure recorded under an older `JOB_LIST_VERSION` is not news about this one: the bump
    is what says the job's definition has changed, and a model or a bodygroup that resolves
    differently now is exactly the thing that might succeed this time.
    """
    failure = manifest.failure(job["slug"], job["class"], team, job["style"])
    return failure is not None and failure["job_version"] == JOB_LIST_VERSION


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
            if _is_rendered(manifest, job, team, None):
                rendered += 1
            elif _has_failed(manifest, job, team):
                failed += 1
            else:
                lost += 1
    return Outcome(rendered, failed, lost)
