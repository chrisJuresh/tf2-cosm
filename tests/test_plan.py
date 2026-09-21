"""What a run still has to do, and how it is cut into batches."""
from __future__ import annotations

import pytest

from render.jobs import job_list
from render.manifest import ALONE, REASON_IMPORT_ERROR, WORN, Manifest
from render.plan import Batch, JobWork, batches, plan_run
from render.selection import NothingSelected
from tests.test_manifest import AT, a_job

TEAM_CAPTAIN = a_job()
BATTERS = a_job(name="Batter's Helmet", slug="batters-helmet", **{"class": "scout"}, style=1)
KILLER = a_job(name="Killer Exclusive", slug="killer-exclusive", **{"class": "heavy"})


def a_list(*jobs: dict) -> dict:
    return job_list(list(jobs), source="tests")


def master_relpath(job: dict, team: str, variant: str = WORN) -> str:
    suffix = "-alone" if variant == ALONE else ""
    return f"masters/{job['slug']}/{job['class']}-{team}-{job['style']}{suffix}.png"


def rendered(manifest: Manifest, job: dict, team: str, variants=(WORN, ALONE), **overrides) -> None:
    """Record a job on a Team as done — in both its pictures unless the test says otherwise."""
    for variant in variants:
        manifest.record(
            job,
            team,
            path=master_relpath(job, team, variant),
            width=1024,
            height=1024,
            at=AT,
            variant=variant,
            **overrides,
        )


# --- what is still to do ----------------------------------------------------------------


def test_an_empty_manifest_leaves_every_image_to_render():
    plan = plan_run(a_list(TEAM_CAPTAIN, BATTERS), Manifest(), teams=["red", "blu"])

    assert [work.job["slug"] for work in plan.work] == ["team-captain", "batters-helmet"]
    assert all(work.teams == ("red", "blu") for work in plan.work)
    assert plan.images == 8
    assert plan.up_to_date == 0


def test_a_rendered_image_is_not_rendered_again():
    manifest = Manifest()
    rendered(manifest, TEAM_CAPTAIN, "red")

    plan = plan_run(a_list(TEAM_CAPTAIN), manifest, teams=["red", "blu"])

    assert [(work.job["slug"], work.teams) for work in plan.work] == [("team-captain", ("blu",))]
    assert plan.up_to_date == 2


def test_a_run_over_finished_work_has_nothing_to_do():
    manifest = Manifest()
    rendered(manifest, TEAM_CAPTAIN, "red")
    rendered(manifest, TEAM_CAPTAIN, "blu")

    plan = plan_run(a_list(TEAM_CAPTAIN), manifest, teams=["red", "blu"])

    assert plan.work == []
    assert plan.images == 0
    assert plan.up_to_date == 4


def test_a_job_missing_only_its_item_render_is_rendered_again():
    """Both frames, not the one that is missing: the import is what a render costs."""
    manifest = Manifest()
    rendered(manifest, TEAM_CAPTAIN, "red", variants=[WORN])

    plan = plan_run(a_list(TEAM_CAPTAIN), manifest, teams=["red"])

    assert [work.teams for work in plan.work] == [("red",)]
    assert plan.up_to_date == 0


def test_a_run_that_wants_only_the_worn_render_leaves_the_item_render_alone():
    manifest = Manifest()
    rendered(manifest, TEAM_CAPTAIN, "red", variants=[WORN])

    plan = plan_run(a_list(TEAM_CAPTAIN), manifest, teams=["red"], variants=[WORN])

    assert plan.work == []
    assert plan.up_to_date == 1
    assert plan.variants == (WORN,)


def test_an_unknown_variant_is_refused():
    with pytest.raises(ValueError, match="unknown variant"):
        plan_run(a_list(TEAM_CAPTAIN), Manifest(), teams=["red"], variants=["floating"])


def test_a_failure_in_one_picture_is_enough_to_leave_the_job_alone():
    manifest = Manifest()
    rendered(manifest, TEAM_CAPTAIN, "red", variants=[WORN])
    manifest.fail(TEAM_CAPTAIN, "red", reason=REASON_IMPORT_ERROR, detail="no", at=AT, variant=ALONE)

    plan = plan_run(a_list(TEAM_CAPTAIN), manifest, teams=["red"])

    assert plan.work == []
    assert plan.known_failures == 2


def test_a_job_version_bump_re_renders_everything():
    manifest = Manifest()
    rendered(manifest, TEAM_CAPTAIN, "red")
    manifest.entry("team-captain", "soldier", "red", 0)["job_version"] = 0

    plan = plan_run(a_list(TEAM_CAPTAIN), manifest, teams=["red"])

    assert [work.teams for work in plan.work] == [("red",)]
    assert plan.up_to_date == 0


def test_an_image_the_manifest_claims_but_disk_has_lost_is_rendered_again():
    manifest = Manifest()
    rendered(manifest, TEAM_CAPTAIN, "red")

    plan = plan_run(
        a_list(TEAM_CAPTAIN), manifest, teams=["red"], image_exists=lambda path: False
    )

    assert [work.teams for work in plan.work] == [("red",)]


# --- failures ---------------------------------------------------------------------------


def test_a_job_that_failed_before_is_left_alone_so_a_second_run_does_nothing():
    manifest = Manifest()
    manifest.fail(KILLER, "red", reason=REASON_IMPORT_ERROR, detail="boom", at=AT)

    plan = plan_run(a_list(KILLER), manifest, teams=["red"])

    assert plan.work == []
    assert plan.known_failures == 2


def test_a_job_version_bump_retries_failures_too_so_it_re_renders_everything(monkeypatch):
    manifest = Manifest()
    manifest.fail(KILLER, "red", reason=REASON_IMPORT_ERROR, detail="boom", at=AT)
    monkeypatch.setattr("render.plan.JOB_LIST_VERSION", 2)

    plan = plan_run(a_list(KILLER), manifest, teams=["red"])

    assert [work.teams for work in plan.work] == [("red",)]
    assert plan.known_failures == 0


def test_asking_for_failures_to_be_retried_puts_them_back_in_the_run():
    manifest = Manifest()
    manifest.fail(KILLER, "red", reason=REASON_IMPORT_ERROR, detail="boom", at=AT)

    plan = plan_run(a_list(KILLER), manifest, teams=["red"], retry_failed=True)

    assert [work.teams for work in plan.work] == [("red",)]
    assert plan.known_failures == 0


# --- subset selection -------------------------------------------------------------------


def test_a_subset_by_cosmetic_class_and_team_narrows_the_run():
    document = a_list(TEAM_CAPTAIN, BATTERS, KILLER)

    plan = plan_run(document, Manifest(), teams=["blu"], slugs=["batters-helmet"])

    assert [(work.job["slug"], work.teams) for work in plan.work] == [("batters-helmet", ("blu",))]


def test_a_subset_matching_no_job_is_an_error_rather_than_an_empty_run():
    with pytest.raises(NothingSelected):
        plan_run(a_list(TEAM_CAPTAIN), Manifest(), teams=["red"], slugs=["no-such-hat"])


def test_an_unknown_team_is_refused():
    with pytest.raises(ValueError, match="unknown Team"):
        plan_run(a_list(TEAM_CAPTAIN), Manifest(), teams=["green"])


# --- batches ----------------------------------------------------------------------------


def test_jobs_are_batched_up_to_a_number_of_images():
    work = [JobWork(job, ("red", "blu")) for job in (TEAM_CAPTAIN, BATTERS, KILLER)]

    cut = batches(work, 8)

    assert [len(batch.jobs) for batch in cut] == [2, 1]
    assert [batch.images for batch in cut] == [8, 4]


def test_a_batch_smaller_than_one_job_still_holds_that_job():
    cut = batches([JobWork(TEAM_CAPTAIN, ("red", "blu"))], 1)

    assert cut == [Batch((TEAM_CAPTAIN,), ("red", "blu"), (WORN, ALONE))]


def test_a_batch_carries_the_variants_it_is_to_render():
    cut = batches([JobWork(TEAM_CAPTAIN, ("red",))], 8, [WORN])

    assert cut == [Batch((TEAM_CAPTAIN,), ("red",), (WORN,))]
    assert cut[0].images == 1


def test_jobs_wanting_different_teams_are_never_batched_together():
    work = [
        JobWork(TEAM_CAPTAIN, ("red", "blu")),
        JobWork(BATTERS, ("blu",)),
        JobWork(KILLER, ("red", "blu")),
    ]

    cut = batches(work, 10)

    assert [(len(batch.jobs), batch.teams) for batch in cut] == [
        (2, ("red", "blu")),
        (1, ("blu",)),
    ]


def test_no_work_is_no_batches():
    assert batches([], 8) == []
