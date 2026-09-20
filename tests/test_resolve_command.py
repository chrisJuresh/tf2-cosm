"""What the command does with a resolution: report it, or validate and write it."""
from __future__ import annotations

import json

import pytest

from render.jobs import InvalidJobList
from render.resolve import Resolution, print_dry_run, resolve, write_job_list


def test_the_dry_run_reports_counts_and_every_excluded_item(schema, tokens, model_index, capsys):
    print_dry_run(resolve(schema, tokens, model_index))
    printed = capsys.readouterr().out

    assert "Cosmetics:  5" in printed
    assert "All-Class:  1" in printed
    assert "jobs:       15" in printed
    assert "soldier   4" in printed
    assert "ESL Season 1 Gold Medal" in printed and "medal" in printed
    assert "Ye Olde Baker Boy" in printed and "never-tradable" in printed
    assert "Scrap Metal Hat Part" in printed and "no-model" in printed


def test_writing_a_job_list_round_trips_through_json(schema, tokens, model_index, tmp_path):
    result = resolve(schema, tokens, model_index)
    out = tmp_path / "jobs.json"

    write_job_list(result, out, source="tests/fixtures")

    assert json.loads(out.read_text(encoding="utf-8"))["jobs"] == result.jobs


def test_an_invalid_job_list_is_not_written(tmp_path):
    out = tmp_path / "jobs.json"

    with pytest.raises(InvalidJobList):
        write_job_list(Resolution(jobs=[{"name": "broken"}]), out, source="tests")

    assert not out.exists()
