"""What the command does with a resolution: report it, or validate and write it."""
from __future__ import annotations

import json

import pytest

from render.jobs import InvalidJobList
from render.resolve import Resolution, print_dry_run, resolve, write_job_list


def reported(printed: str, label: str) -> list[str]:
    """The words of the first reported line mentioning `label`, whatever the spacing."""
    for line in printed.splitlines():
        if label in line:
            return line.split()
    raise AssertionError(f"nothing reported for {label!r} in:\n{printed}")


def test_the_dry_run_reports_counts_and_every_excluded_item(schema, tokens, model_index, capsys):
    print_dry_run(resolve(schema, tokens, model_index))
    printed = capsys.readouterr().out

    assert reported(printed, "Cosmetics:")[-1] == "5"
    assert reported(printed, "All-Class:")[-1] == "1"
    assert reported(printed, "jobs:")[-1] == "15"
    assert reported(printed, "  soldier ") == ["soldier", "4"]
    assert reported(printed, "ESL Season 1 Gold Medal")[-1] == "medal"
    assert reported(printed, "Ye Olde Baker Boy")[-1] == "never-tradable"
    assert "no-model" in " ".join(reported(printed, "Scrap Metal Hat Part"))


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
