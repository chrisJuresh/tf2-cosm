"""Choosing what a run renders: which jobs from the list, and on which Teams."""
from __future__ import annotations

import pytest

from render.jobs import job_list
from render.selection import NothingSelected, select_jobs, selected_teams
from tests.test_manifest import a_job


def a_list(*jobs: dict) -> dict:
    return job_list(list(jobs), source="tests")


BATTERS = a_job(name="Batter's Helmet", slug="batters-helmet", **{"class": "scout"}, style=1)
KILLER = a_job(name="Killer Exclusive", slug="killer-exclusive", **{"class": "heavy"})


def test_with_no_filter_every_job_is_selected():
    document = a_list(a_job(), BATTERS)

    assert len(select_jobs(document)) == 2


def test_a_slug_narrows_the_run_to_one_cosmetic():
    document = a_list(a_job(), BATTERS, KILLER)

    selected = select_jobs(document, slugs=["batters-helmet"])

    assert [job["slug"] for job in selected] == ["batters-helmet"]


def test_a_class_and_a_style_narrow_it_further():
    document = a_list(a_job(), a_job(style=1), a_job(**{"class": "demoman"}))

    selected = select_jobs(document, classes=["soldier"], styles=[1])

    assert [(job["class"], job["style"]) for job in selected] == [("soldier", 1)]


def test_selecting_nothing_is_an_error_rather_than_an_empty_run():
    with pytest.raises(NothingSelected, match="no-such-hat"):
        select_jobs(a_list(a_job()), slugs=["no-such-hat"])


def test_the_teams_are_rendered_in_the_order_asked_for():
    assert selected_teams(["blu", "red"]) == ["blu", "red"]


def test_an_unknown_team_is_refused():
    with pytest.raises(ValueError, match="unknown Team"):
        selected_teams(["green"])
