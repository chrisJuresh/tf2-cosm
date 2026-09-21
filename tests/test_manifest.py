"""The manifest: what the site is promised about which renders exist and which failed."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from render.jobs import JOB_LIST_VERSION
from render.manifest import (
    ALONE,
    MANIFEST_VERSION,
    REASON_DERIVE_ERROR,
    REASON_IMPORT_ERROR,
    REASON_MODEL_MISSING,
    REASON_RENDER_ERROR,
    WORN,
    InvalidManifest,
    Manifest,
    load_manifest,
    manifest_json_schema,
    schema_path,
    validate_manifest,
)

AT = "2026-09-20T12:00:00+00:00"

REPO_ROOT = Path(__file__).resolve().parent.parent


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


def an_alone_derivative(size: int) -> dict:
    return {
        "path": f"web/team-captain/soldier-red-0-alone@{size}.webp",
        "width": size,
        "height": size,
    }


def a_derivative(size: int) -> dict:
    return {"path": f"web/team-captain/soldier-red-0@{size}.webp", "width": size, "height": size}


def test_a_recorded_render_is_found_by_cosmetic_class_team_and_style():
    manifest = Manifest()

    manifest.record(
        a_job(), "red", path="masters/team-captain/soldier-red-0.png", width=1024, height=1024, at=AT
    )

    entry = manifest.entry("team-captain", "soldier", "red", 0)
    assert entry["worn"]["master"] == {
        "path": "masters/team-captain/soldier-red-0.png",
        "width": 1024,
        "height": 1024,
    }
    assert entry["model"] == "models/player/items/soldier/soldier_officer.mdl"
    assert entry["rendered_at"] == AT
    assert entry["job_version"] == JOB_LIST_VERSION
    assert entry["team_fallback"] is False


def test_a_fresh_render_has_no_derivatives_until_they_are_made():
    manifest = Manifest()

    manifest.record(a_job(), "red", path="m.png", width=1024, height=1024, at=AT)

    assert manifest.entry("team-captain", "soldier", "red", 0)["worn"]["derivatives"] == {}


def test_derivatives_are_attached_to_the_master_they_were_made_from():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="m.png", width=1024, height=1024, at=AT)

    manifest.set_derivatives(
        "team-captain", "soldier", "red", 0, {"512": a_derivative(512), "256": a_derivative(256)}
    )

    derivatives = manifest.entry("team-captain", "soldier", "red", 0)["worn"]["derivatives"]
    assert sorted(derivatives) == ["256", "512"]
    assert derivatives["512"] == a_derivative(512)


def test_derivatives_for_a_render_nobody_made_are_refused():
    with pytest.raises(KeyError, match="no worn render recorded"):
        Manifest().set_derivatives("team-captain", "soldier", "red", 0, {"512": a_derivative(512)})


def test_re_rendering_drops_the_derivatives_of_the_master_it_replaced():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="m.png", width=1024, height=1024, at=AT)
    manifest.set_derivatives("team-captain", "soldier", "red", 0, {"512": a_derivative(512)})

    manifest.record(a_job(), "red", path="m.png", width=1024, height=1024, at=AT)

    assert manifest.entry("team-captain", "soldier", "red", 0)["worn"]["derivatives"] == {}


def test_a_cosmetic_is_recorded_both_worn_and_on_its_own():
    manifest = Manifest()

    manifest.record(a_job(), "red", path="worn.png", width=1024, height=1024, at=AT)
    manifest.record(
        a_job(), "red", path="alone.png", width=1024, height=1024, at=AT, variant=ALONE
    )

    entry = manifest.entry("team-captain", "soldier", "red", 0)
    assert entry["worn"]["master"]["path"] == "worn.png"
    assert entry["alone"]["master"]["path"] == "alone.png"


def test_a_job_rendered_only_worn_has_no_item_render():
    manifest = Manifest()

    manifest.record(a_job(), "red", path="worn.png", width=1024, height=1024, at=AT)

    assert manifest.entry("team-captain", "soldier", "red", 0)["alone"] is None
    assert manifest.picture("team-captain", "soldier", "red", 0, ALONE) is None


def test_each_picture_keeps_its_own_derivatives():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="worn.png", width=1024, height=1024, at=AT)
    manifest.record(
        a_job(), "red", path="alone.png", width=1024, height=1024, at=AT, variant=ALONE
    )

    manifest.set_derivatives("team-captain", "soldier", "red", 0, {"512": a_derivative(512)})
    manifest.set_derivatives(
        "team-captain", "soldier", "red", 0, {"512": an_alone_derivative(512)}, ALONE
    )

    entry = manifest.entry("team-captain", "soldier", "red", 0)
    assert entry["worn"]["derivatives"]["512"] == a_derivative(512)
    assert entry["alone"]["derivatives"]["512"] == an_alone_derivative(512)


def test_re_rendering_one_picture_leaves_the_other_where_it_was():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="worn.png", width=1024, height=1024, at=AT)
    manifest.set_derivatives("team-captain", "soldier", "red", 0, {"512": a_derivative(512)})

    manifest.record(
        a_job(), "red", path="alone.png", width=1024, height=1024, at=AT, variant=ALONE
    )

    worn = manifest.picture("team-captain", "soldier", "red", 0, WORN)
    assert worn["master"]["path"] == "worn.png"
    assert worn["derivatives"]["512"] == a_derivative(512)


def test_a_failure_is_about_one_picture_and_not_the_other():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="worn.png", width=1024, height=1024, at=AT)

    manifest.fail(
        a_job(), "red", reason=REASON_RENDER_ERROR, detail="nothing in frame", at=AT, variant=ALONE
    )

    assert manifest.failure("team-captain", "soldier", "red", 0, ALONE)["variant"] == ALONE
    assert manifest.failure("team-captain", "soldier", "red", 0, WORN) is None
    assert manifest.picture("team-captain", "soldier", "red", 0, WORN) is not None


def test_every_picture_can_be_walked_variant_by_variant():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="worn.png", width=8, height=8, at=AT)
    manifest.record(a_job(), "red", path="alone.png", width=8, height=8, at=AT, variant=ALONE)
    manifest.record(a_job(style=1), "blu", path="b.png", width=8, height=8, at=AT)

    walked = {
        (slug, cls, team, style, variant, picture["master"]["path"])
        for slug, cls, team, style, variant, picture in manifest.pictures()
    }

    assert walked == {
        ("team-captain", "soldier", "red", 0, WORN, "worn.png"),
        ("team-captain", "soldier", "red", 0, ALONE, "alone.png"),
        ("team-captain", "soldier", "blu", 1, WORN, "b.png"),
    }


def test_an_unknown_variant_is_refused():
    with pytest.raises(ValueError, match="unknown variant"):
        Manifest().record(a_job(), "red", path="p.png", width=8, height=8, at=AT, variant="floating")


def test_every_recorded_render_can_be_walked():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="r.png", width=8, height=8, at=AT)
    manifest.record(a_job(style=1), "blu", path="b.png", width=8, height=8, at=AT)

    walked = {(slug, cls, team, style) for slug, cls, team, style, _ in manifest.entries()}

    assert walked == {
        ("team-captain", "soldier", "red", 0),
        ("team-captain", "soldier", "blu", 1),
    }


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

    assert manifest.entry("team-captain", "soldier", "blu", 0)["worn"]["master"]["path"] == "b.png"
    assert manifest.entry("team-captain", "soldier", "red", 0)["worn"]["master"]["path"] == "r.png"
    assert manifest.entry("team-captain", "demoman", "red", 0)["worn"]["master"]["path"] == "d.png"


def test_re_rendering_replaces_the_entry():
    manifest = Manifest()

    manifest.record(a_job(), "red", path="old.png", width=8, height=8, at=AT)
    manifest.record(a_job(), "red", path="new.png", width=8, height=8, at=AT)

    assert manifest.entry("team-captain", "soldier", "red", 0)["worn"]["master"]["path"] == "new.png"
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


def test_a_step_that_holds_an_entry_rather_than_a_job_can_still_record_why_it_failed():
    manifest = Manifest()

    manifest.fail_render(
        "team-captain",
        "soldier",
        "red",
        0,
        model="m.mdl",
        reason=REASON_DERIVE_ERROR,
        detail="the master is not on disk",
        at=AT,
    )

    (failure,) = manifest.to_document()["failures"]
    assert failure["reason"] == REASON_DERIVE_ERROR
    assert failure["model"] == "m.mdl"


def test_an_unknown_failure_reason_is_refused():
    with pytest.raises(ValueError, match="unknown failure reason"):
        Manifest().fail(a_job(), "red", reason="it broke", detail=None, at=AT)


def test_forgetting_the_last_render_of_a_cosmetic_takes_the_whole_branch():
    """The site joins the catalogue to this document by the slug alone, so an empty husk
    would read as 'this Cosmetic has renders' and shadow its Backpack Icon fallback."""
    manifest = Manifest()
    manifest.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)

    manifest.forget_render("team-captain", "soldier", "red", 0)

    assert manifest.to_document()["renders"] == {}


def test_forgetting_one_render_leaves_its_siblings_and_their_branches():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="red.png", width=1024, height=1024, at=AT)
    manifest.record(a_job(), "blu", path="blu.png", width=1024, height=1024, at=AT)
    manifest.record(a_job(**{"class": "scout"}), "red", path="scout.png", width=1024, height=1024, at=AT)

    manifest.forget_render("team-captain", "soldier", "red", 0)

    assert manifest.entry("team-captain", "soldier", "red", 0) is None
    assert manifest.entry("team-captain", "soldier", "blu", 0)["worn"]["master"]["path"] == "blu.png"
    assert manifest.entry("team-captain", "scout", "red", 0)["worn"]["master"]["path"] == "scout.png"


def test_forgetting_a_render_that_was_never_there_changes_nothing():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)

    manifest.forget_render("ghastly-gibus", "soldier", "red", 0)
    manifest.forget_render("team-captain", "sniper", "red", 0)
    manifest.forget_render("team-captain", "soldier", "red", 3)

    assert manifest.entry("team-captain", "soldier", "red", 0)["worn"]["master"]["path"] == "p.png"
    assert set(manifest.to_document()["renders"]) == {"team-captain"}


def test_an_unknown_team_is_refused():
    with pytest.raises(ValueError, match="unknown Team"):
        Manifest().record(a_job(), "green", path="p.png", width=8, height=8, at=AT)


def test_retrying_a_job_that_failed_clears_its_failure():
    manifest = Manifest()

    manifest.fail(a_job(), "red", reason=REASON_IMPORT_ERROR, detail="boom", at=AT)
    manifest.record(a_job(), "red", path="p.png", width=8, height=8, at=AT)

    assert manifest.to_document()["failures"] == []
    assert manifest.entry("team-captain", "soldier", "red", 0) is not None


def test_deriving_what_failed_to_derive_clears_its_failure():
    manifest = Manifest()
    manifest.record(a_job(), "red", path="p.png", width=8, height=8, at=AT)
    manifest.fail(a_job(), "red", reason=REASON_DERIVE_ERROR, detail="boom", at=AT)

    manifest.set_derivatives("team-captain", "soldier", "red", 0, {"256": a_derivative(256)})

    assert manifest.to_document()["failures"] == []


def test_a_failure_replaces_the_earlier_failure_for_the_same_job():
    manifest = Manifest()

    manifest.fail(a_job(), "red", reason=REASON_IMPORT_ERROR, detail="first", at=AT)
    manifest.fail(a_job(), "red", reason=REASON_IMPORT_ERROR, detail="second", at=AT)

    assert [f["detail"] for f in manifest.to_document()["failures"]] == ["second"]


def test_a_manifest_round_trips_through_a_file(tmp_path):
    manifest = Manifest()
    manifest.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)
    manifest.set_derivatives("team-captain", "soldier", "red", 0, {"512": a_derivative(512)})
    manifest.fail(a_job(**{"class": "spy"}), "red", reason=REASON_MODEL_MISSING, detail=None, at=AT)
    out = tmp_path / "manifest.json"

    manifest.write(out)

    reloaded = load_manifest(out)
    entry = reloaded.entry("team-captain", "soldier", "red", 0)
    assert entry["worn"]["master"]["path"] == "p.png"
    assert entry["worn"]["derivatives"]["512"] == a_derivative(512)
    assert len(reloaded.to_document()["failures"]) == 1


def test_writing_leaves_no_temporary_file_behind(tmp_path):
    out = tmp_path / "manifest.json"

    Manifest().write(out)

    assert sorted(p.name for p in tmp_path.iterdir()) == [
        "manifest.json",
        schema_path(out).name,
    ]


def test_loading_a_manifest_that_is_not_there_starts_an_empty_one(tmp_path):
    assert load_manifest(tmp_path / "absent.json").to_document()["renders"] == {}


def test_a_manifest_from_an_older_version_says_what_to_do_about_itself(tmp_path):
    out = tmp_path / "renders.json"
    out.write_text(json.dumps({"version": 1, "renders": {}, "failures": []}), encoding="utf-8")

    with pytest.raises(InvalidManifest, match="delete it and render again"):
        load_manifest(out)


def test_a_written_manifest_is_valid(tmp_path):
    manifest = Manifest()
    manifest.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)
    out = tmp_path / "manifest.json"

    manifest.write(out)

    document = json.loads(out.read_text(encoding="utf-8"))
    assert document["version"] == MANIFEST_VERSION
    validate_manifest(document)


def test_the_schema_is_published_beside_the_manifest(tmp_path):
    out = tmp_path / "renders.json"

    Manifest().write(out)

    published = json.loads(schema_path(out).read_text(encoding="utf-8"))
    assert schema_path(out).name == f"renders.v{MANIFEST_VERSION}.schema.json"
    assert published == manifest_json_schema()


def test_the_schema_committed_to_the_repository_is_the_one_the_job_writes():
    committed = REPO_ROOT / "catalogue" / f"renders.v{MANIFEST_VERSION}.schema.json"

    assert json.loads(committed.read_text(encoding="utf-8")) == manifest_json_schema()


def test_the_schema_describes_the_entry_the_site_reads():
    schema = manifest_json_schema()

    style = (
        schema["properties"]["renders"]["additionalProperties"]["additionalProperties"][
            "additionalProperties"
        ]["additionalProperties"]
    )
    assert sorted(style["properties"]) == [
        "alone",
        "job_version",
        "model",
        "rendered_at",
        "style_name",
        "team_fallback",
        "worn",
    ]
    worn = style["properties"]["worn"]["oneOf"][0]
    assert worn["properties"]["master"]["properties"]["width"]["type"] == "integer"
    assert worn["properties"]["derivatives"]["propertyNames"] == {"pattern": "^[0-9]+$"}
    assert style["properties"]["alone"]["oneOf"][1] == {"type": "null"}
    assert schema["properties"]["failures"]["items"]["properties"]["reason"]["enum"]


def a_picture(path: str = "m.png", **overrides) -> dict:
    picture = {"master": {"path": path, "width": 1024, "height": 1024}, "derivatives": {}}
    picture.update(overrides)
    return picture


def a_valid_entry() -> dict:
    return {
        "worn": a_picture(),
        "alone": None,
        "model": "m.mdl",
        "style_name": None,
        "rendered_at": AT,
        "job_version": JOB_LIST_VERSION,
        "team_fallback": False,
    }


def a_document(entry: dict) -> dict:
    return {
        "version": MANIFEST_VERSION,
        "renders": {"s": {"soldier": {"red": {"0": entry}}}},
        "failures": [],
    }


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
                "renders": {"s": {"soldier": {"red": {"0": {"worn": {"master": {"path": "p"}}}}}}},
                "failures": [],
            },
            "missing",
        ),
        (
            a_document(
                {**a_valid_entry(), "worn": a_picture(master={"path": "m.png", "width": 0, "height": 8})}
            ),
            "at least 1 pixel",
        ),
        (
            a_document(
                {
                    **a_valid_entry(),
                    "worn": a_picture(derivatives={"big": {"path": "d.webp", "width": 1, "height": 1}}),
                }
            ),
            "not pixels",
        ),
        (
            a_document(
                {**a_valid_entry(), "worn": a_picture(derivatives={"256": {"path": "d.webp", "width": 1}})}
            ),
            "missing",
        ),
        (a_document({**a_valid_entry(), "worn": None}), "records no picture at all"),
        (
            a_document({**a_valid_entry(), "alone": a_picture("a.png")})
            | {
                "failures": [
                    {
                        "slug": "s",
                        "class": "soldier",
                        "team": "red",
                        "style": 0,
                        "variant": "floating",
                        "model": "m.mdl",
                        "reason": REASON_IMPORT_ERROR,
                        "detail": None,
                        "failed_at": AT,
                        "job_version": JOB_LIST_VERSION,
                    }
                ]
            },
            "unknown variant",
        ),
    ],
)
def test_a_malformed_manifest_is_refused(document, message):
    with pytest.raises(InvalidManifest, match=message):
        validate_manifest(document)


def test_a_well_formed_manifest_passes():
    validate_manifest(a_document(a_valid_entry()))


def test_an_invalid_manifest_is_never_written(tmp_path):
    manifest = Manifest()
    manifest.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)
    manifest.entry("team-captain", "soldier", "red", 0)["worn"]["master"]["width"] = "wide"
    out = tmp_path / "manifest.json"

    with pytest.raises(InvalidManifest):
        manifest.write(out)

    assert not out.exists()


# --- merging what several render processes wrote separately -------------------------------


def test_merging_adds_the_other_manifests_renders():
    into, shard = Manifest(), Manifest()
    into.record(a_job(), "red", path="red.png", width=1024, height=1024, at=AT)
    shard.record(a_job(), "blu", path="blu.png", width=1024, height=1024, at=AT)

    into.merge(shard)

    assert into.entry("team-captain", "soldier", "red", 0)["worn"]["master"]["path"] == "red.png"
    assert into.entry("team-captain", "soldier", "blu", 0)["worn"]["master"]["path"] == "blu.png"


def test_merging_lets_the_other_manifest_win_the_same_job():
    into, shard = Manifest(), Manifest()
    into.record(a_job(), "red", path="old.png", width=1024, height=1024, at=AT)
    shard.record(a_job(), "red", path="new.png", width=1024, height=1024, at=AT)

    into.merge(shard)

    assert into.entry("team-captain", "soldier", "red", 0)["worn"]["master"]["path"] == "new.png"


def test_a_merged_render_clears_an_earlier_failure_for_the_same_job():
    into, shard = Manifest(), Manifest()
    into.fail(a_job(), "red", reason=REASON_IMPORT_ERROR, detail="no", at=AT)
    shard.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)

    into.merge(shard)

    assert into.failure("team-captain", "soldier", "red", 0) is None
    assert into.entry("team-captain", "soldier", "red", 0) is not None


def test_a_merged_failure_only_drops_the_picture_it_is_about():
    into, shard = Manifest(), Manifest()
    into.record(a_job(), "red", path="worn.png", width=1024, height=1024, at=AT)
    into.record(a_job(), "red", path="alone.png", width=1024, height=1024, at=AT, variant=ALONE)
    shard.fail(a_job(), "red", reason=REASON_IMPORT_ERROR, detail="no", at=AT, variant=ALONE)

    into.merge(shard)

    entry = into.entry("team-captain", "soldier", "red", 0)
    assert entry["worn"]["master"]["path"] == "worn.png"
    assert entry["alone"] is None


def test_a_merged_failure_replaces_an_earlier_render_for_the_same_job():
    into, shard = Manifest(), Manifest()
    into.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)
    shard.fail(a_job(), "red", reason=REASON_IMPORT_ERROR, detail="no", at=AT)

    into.merge(shard)

    assert into.entry("team-captain", "soldier", "red", 0) is None
    assert into.failure("team-captain", "soldier", "red", 0)["reason"] == REASON_IMPORT_ERROR


def test_merging_leaves_jobs_the_other_manifest_says_nothing_about_alone():
    into, shard = Manifest(), Manifest()
    into.record(a_job(), "red", path="kept.png", width=1024, height=1024, at=AT)
    shard.record(a_job(**{"class": "scout"}), "red", path="added.png", width=1024, height=1024, at=AT)

    into.merge(shard)

    assert into.entry("team-captain", "soldier", "red", 0)["worn"]["master"]["path"] == "kept.png"
    assert into.entry("team-captain", "scout", "red", 0)["worn"]["master"]["path"] == "added.png"


def test_a_merged_manifest_is_still_writable():
    into, shard = Manifest(), Manifest()
    shard.record(a_job(), "red", path="p.png", width=1024, height=1024, at=AT)
    into.merge(shard)

    validate_manifest(into.to_document())
