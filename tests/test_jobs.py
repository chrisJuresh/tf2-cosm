"""The job list's documented shape: what the render step is promised, and what is refused."""
from __future__ import annotations

import pytest

from render.jobs import JOB_LIST_VERSION, InvalidJobList, job_list, validate_job_list
from render.resolve import resolve


def a_job(**overrides) -> dict:
    job = {
        "name": "Team Captain",
        "slug": "team-captain",
        "defindex": 378,
        "aliases": [378],
        "class": "soldier",
        "style": 0,
        "style_name": None,
        "model": "models/player/items/soldier/soldier_officer.mdl",
        "hide_bodygroups": ["hat"],
        "skin_red": 0,
        "skin_blu": 1,
        "slot": "head",
        "equip_regions": ["hat"],
        "paintable": False,
    }
    job.update(overrides)
    return job


def test_a_resolved_job_list_is_valid(schema, tokens, model_index):
    result = resolve(schema, tokens, model_index)

    document = job_list(result.jobs, source="tests/fixtures")

    assert document["version"] == JOB_LIST_VERSION
    assert document["job_count"] == len(result.jobs)
    validate_job_list(document)


def test_a_well_formed_job_list_passes():
    validate_job_list(job_list([a_job()], source="tests"))


@pytest.mark.parametrize(
    "document, message",
    [
        ({"version": 99, "source": "t", "job_count": 0, "jobs": []}, "unsupported job list version"),
        ({"version": JOB_LIST_VERSION, "source": "t", "job_count": 2, "jobs": []}, "job_count"),
        ({"version": JOB_LIST_VERSION, "source": "t", "job_count": 0}, "no 'jobs' array"),
    ],
)
def test_a_malformed_envelope_is_refused(document, message):
    with pytest.raises(InvalidJobList, match=message):
        validate_job_list(document)


@pytest.mark.parametrize(
    "job, message",
    [
        ({"style": "0"}, "field 'style' has type str"),
        ({"class": "demo"}, "unknown class"),
        ({"slug": ""}, "empty slug"),
        ({"aliases": [999]}, "not an alias"),
        ({"model": "models/player/items/soldier/soldier_officer"}, "not a .mdl path"),
        ({"skin_red": True}, "must be an int"),
    ],
)
def test_a_malformed_job_is_refused(job, message):
    with pytest.raises(InvalidJobList, match=message):
        validate_job_list(job_list([a_job(**job)], source="tests"))


def test_a_job_missing_a_field_is_refused():
    job = a_job()
    del job["paintable"]

    with pytest.raises(InvalidJobList, match="missing 'paintable'"):
        validate_job_list(job_list([job], source="tests"))


def test_an_unknown_field_is_refused():
    with pytest.raises(InvalidJobList, match="unknown fields"):
        validate_job_list(job_list([a_job(team="red")], source="tests"))


def test_two_jobs_for_the_same_cosmetic_class_and_style_are_refused():
    with pytest.raises(InvalidJobList, match="duplicates an earlier job"):
        validate_job_list(job_list([a_job(), a_job()], source="tests"))
