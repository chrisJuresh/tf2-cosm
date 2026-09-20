"""The manifest: what the site is promised about which Worn Renders exist and which failed."""
from __future__ import annotations

import json

import pytest

from render.jobs import JOB_LIST_VERSION
from render.manifest import (
    MANIFEST_VERSION,
    REASON_IMPORT_ERROR,
    REASON_MODEL_MISSING,
    InvalidManifest,
    Manifest,
    load_manifest,
    validate_manifest,
)

AT = "2026-09-20T12:00:00+00:00"


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


def test_a_recorded_render_is_found_by_cosmetic_class_team_and_style():
    manifest = Manifest()

    manifest.record(a_job(), "red", path="team-captain/soldier-red-0.png", width=1024, height=1024, at=AT)

    entry = manifest.entry("team-captain", "soldier", "red", 0)
    assert entry["path"] == "team-captain/soldier-red-0.png"
    assert entry["width"] == 1024 and entry["height"] == 1024
    assert entry["model"] == "models/player/items/soldier/soldier_officer.mdl"
    assert entry["rendered_at"] == AT
    assert entry["job_version"] == JOB_LIST_VERSION
    assert entry["team_fallback"] is False


def test_a_cosmetic_with_no_render_has_no_entry():
    assert Manifest().entry("team-captain", "soldier", "red", 0) is None


def test_the_red_fallback_is_recorded_on_the_blu_entry():
    manifest = Manifest()

    manifest.record(
        a_job(), "blu", path="p.png", width=1024, height=1024, at=AT, fell_back_to_red=True
    )

    assert manifest.entry("team-captain", "soldier", "blu", 0)["team_fallback"] is True


def test_a_style_keeps_its_name_so_the_site_can_label_it():
    manifest = Manifest()

    manifest.record(
        a_job(style=1, style_name="Style 1"), "red", path="p.png", width=1024, height=1024, at=AT
    )

    assert manifest.entry("team-captain", "soldier", "red", 1)["style_name"] == "Style 1"


def test_teams_styles_and_classes_sit_side_by_side():
    manifest = Manifest()

    manifest.record(a_job(), "red", path="r.png", width=8, height=8, at=AT)
    manifest.record(a_job(), "blu", path="b.png", width=8, height=8, at=AT)
    manifest.record(a_job(**{"class": "demoman"}), "red", path="d.png", width=8, height=8, at=AT)

    assert manifest.entry("team-captain", "soldier", "blu", 0)["path"] == "b.png"
    assert manifest.entry("team-captain", "soldier", "red", 0)["path"] == "r.png"
    assert manifest.entry("team-captain", "demoman", "red", 0)["path"] == "d.png"


def test_re_rendering_replaces_the_entry():
    manifest = Manifest()

    manifest.record(a_job(), "red", path="old.png", width=8, height=8, at=AT)
    manifest.record(a_job(), "red", path="new.png", width=8, height=8, at=AT)

    assert manifest.entry("team-captain", "soldier", "red", 0)["path"] == "new.png"
    assert len(manifest.to_document()["renders"]["team-captain"]["soldier"]["red"]) == 1


def test_a_failure_is_recorded_with_a_reason_and_leaves_no_render():
    manifest = Manifest()

    manifest.fail(a_job(), "red", reason=REASON_MODEL_MISSING, detail="not in the archive", at=AT)

    (failure,) = manifest.to_document()["failures"]
    assert failure["slug"] == "team-captain"
    assert failure["class"] == "soldier"
    assert failure["team"] == "red"
    assert failure["style"] == 0
    assert failure["reason"] == REASON_MODEL_MISSING
    assert failure["detail"] == "not in the archive"
    assert failure["failed_at"] == AT
    assert manifest.entry("team-captain", "soldier", "red", 0) is None


def test_an_unknown_failure_reason_is_refused():
    with pytest.raises(ValueError, match="unknown failure reason"):
        Manifest().fail(a_job(), "red", reason="it broke", detail=None, at=AT)


def test_an_unknown_team_is_refused():
    with pytest.raises(ValueError, match="unknown Team"):
        Manifest().record(a_job(), "green", path="p.png", width=8, height=8, at=AT)


def test_retrying_a_job_that_failed_clears_its_failure():
    manifest = Manifest()

    manifest.fail(a_job(), "red", reason=REASON_IMPORT_ERROR, detail="boom", at=AT)
    manifest.record(a_job(), "red", path="p.png", width=8, height=8, at=AT)

    assert manifest.to_document()["failures"] == []
    assert manifest.entry("team-captain", "soldier", "red", 0) is not None


def test_a_failure_replaces_the_earlier_failure_for_the_same_job():
    manifest = Manifest()

    manifest.fail(a_job(), "red", reason=REASON_IMPORT_ERROR, detail="first", at=AT)
    manifest.fail(a_job(), "red", reason=REASON_IMPORT_ERROR, detail="second", at=AT)

    assert [f["detail"] for f in manifest.to_document()["failures"]] == ["second"]


def test_a_manifest_round_trips_through_a_file(tmp_path):
    manifest = Manifest()
    manifest.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)
    manifest.fail(a_job(**{"class": "spy"}), "red", reason=REASON_MODEL_MISSING, detail=None, at=AT)
    out = tmp_path / "manifest.json"

    manifest.write(out)

    reloaded = load_manifest(out)
    assert reloaded.entry("team-captain", "soldier", "red", 0)["path"] == "p.png"
    assert len(reloaded.to_document()["failures"]) == 1


def test_writing_leaves_no_temporary_file_behind(tmp_path):
    out = tmp_path / "manifest.json"

    Manifest().write(out)

    assert [p.name for p in tmp_path.iterdir()] == ["manifest.json"]


def test_loading_a_manifest_that_is_not_there_starts_an_empty_one(tmp_path):
    assert load_manifest(tmp_path / "absent.json").to_document()["renders"] == {}


def test_a_written_manifest_is_valid(tmp_path):
    manifest = Manifest()
    manifest.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)
    out = tmp_path / "manifest.json"

    manifest.write(out)

    document = json.loads(out.read_text(encoding="utf-8"))
    assert document["version"] == MANIFEST_VERSION
    validate_manifest(document)


@pytest.mark.parametrize(
    "document, message",
    [
        ({"version": 99, "renders": {}, "failures": []}, "unsupported manifest version"),
        ({"version": MANIFEST_VERSION, "failures": []}, "no 'renders'"),
        ({"version": MANIFEST_VERSION, "renders": {}}, "no 'failures'"),
        (
            {"version": MANIFEST_VERSION, "renders": {"s": {"soldier": {"green": {}}}}, "failures": []},
            "unknown Team",
        ),
        (
            {"version": MANIFEST_VERSION, "renders": {"s": {"scunt": {"red": {}}}}, "failures": []},
            "unknown class",
        ),
        (
            {
                "version": MANIFEST_VERSION,
                "renders": {"s": {"soldier": {"red": {"0": {"path": "p.png"}}}}},
                "failures": [],
            },
            "missing",
        ),
    ],
)
def test_a_malformed_manifest_is_refused(document, message):
    with pytest.raises(InvalidManifest, match=message):
        validate_manifest(document)


def test_an_invalid_manifest_is_never_written(tmp_path):
    manifest = Manifest()
    manifest.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)
    manifest.to_document()["renders"]["team-captain"]["soldier"]["red"]["0"]["width"] = "wide"
    out = tmp_path / "manifest.json"

    with pytest.raises(InvalidManifest):
        manifest.write(out)

    assert not out.exists()
