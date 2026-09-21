"""The publish step: the manifest's derivatives in, a bucket holding exactly them out.

No network and no credentials anywhere here. The bucket is a dictionary, which is all the
`Bucket` protocol asks for, and everything worth getting wrong — what goes up, what is
skipped, what key a path takes, what a file is served as — is decided before anything is
sent.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from render.bucket import (
    DEFAULT_CACHE_CONTROL,
    BucketSettings,
    MissingSettings,
    content_type_for,
)
from render.manifest import Manifest
from render.output import OutputLayout
from render.publish import (
    DEFAULT_MAX_BUCKET_BYTES,
    FREE_TIER_BYTES,
    OverBudget,
    check_budget,
    derivative_paths,
    format_bytes,
    main,
    plan_publish,
    project_bucket_bytes,
    publish,
)

AT = "2026-09-20T12:00:00+00:00"

ENV = {
    "RENDER_BUCKET": "tf2-cosm-renders",
    "RENDER_BUCKET_ENDPOINT": "https://account.r2.cloudflarestorage.com",
    "RENDER_BUCKET_KEY_ID": "key",
    "RENDER_BUCKET_SECRET": "secret",
}


class FakeBucket:
    """A bucket that is a dictionary, and one key that refuses to be written."""

    def __init__(self, contents: dict[str, int] | None = None, *, refuse: str | None = None) -> None:
        self.contents = dict(contents or {})
        self.written: dict[str, dict[str, object]] = {}
        self.refuse = refuse

    def list_sizes(self, prefix: str) -> dict[str, int]:
        return {key: size for key, size in self.contents.items() if key.startswith(prefix)}

    def put(self, key: str, path: Path, *, content_type: str, cache_control: str) -> None:
        if key == self.refuse:
            raise OSError("the bucket said no")
        self.written[key] = {"bytes": path.stat().st_size, "type": content_type, "cache": cache_control}
        self.contents[key] = path.stat().st_size


def a_layout(tmp_path) -> OutputLayout:
    return OutputLayout.from_env({}, repo_root=tmp_path)


def a_job(**overrides) -> dict:
    job = {
        "slug": "team-captain",
        "class": "soldier",
        "style": 0,
        "style_name": None,
        "model": "models/player/items/soldier/soldier_officer.mdl",
    }
    job.update(overrides)
    return job


def a_manifest(layout: OutputLayout, *, teams=("red",), **job_overrides) -> Manifest:
    """One rendered Cosmetic per Team asked for, derivatives recorded at both web sizes."""
    manifest = Manifest()
    job = a_job(**job_overrides)
    for team in teams:
        master = layout.master_relpath(job, team)
        manifest.record(job, team, path=master, width=1024, height=1024, at=AT)
        manifest.set_derivatives(
            job["slug"],
            job["class"],
            team,
            job["style"],
            {
                size: {"path": path, "width": int(size), "height": int(size)}
                for size, path in layout.derivative_relpaths(master, (512, 256)).items()
            },
        )
    return manifest


def write_image(layout: OutputLayout, relpath: str, contents: bytes = b"webp") -> Path:
    path = layout.path_for(relpath)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)
    return path


def test_the_paths_published_are_the_derivatives_the_manifest_records(tmp_path):
    layout = a_layout(tmp_path)
    manifest = a_manifest(layout, teams=("red", "blu"))

    paths = derivative_paths(manifest)

    assert paths == sorted(paths)
    assert paths == [
        "web/team-captain/soldier-blu-0@256.webp",
        "web/team-captain/soldier-blu-0@512.webp",
        "web/team-captain/soldier-red-0@256.webp",
        "web/team-captain/soldier-red-0@512.webp",
    ]


def test_masters_are_never_published(tmp_path):
    layout = a_layout(tmp_path)

    assert not any("masters" in path for path in derivative_paths(a_manifest(layout)))


def test_one_size_can_be_published_on_its_own(tmp_path):
    layout = a_layout(tmp_path)

    assert derivative_paths(a_manifest(layout), [256]) == ["web/team-captain/soldier-red-0@256.webp"]


def test_a_picture_recorded_under_both_teams_goes_up_once(tmp_path):
    """BLU falling back to RED records the same file twice; it is still one image."""
    layout = a_layout(tmp_path)
    manifest = Manifest()
    job = a_job()
    master = layout.master_relpath(job, "red")
    derivatives = {
        size: {"path": path, "width": int(size), "height": int(size)}
        for size, path in layout.derivative_relpaths(master, (256,)).items()
    }
    for team in ("red", "blu"):
        manifest.record(job, team, path=master, width=1024, height=1024, at=AT, fell_back_to_red=team == "blu")
        manifest.set_derivatives(job["slug"], job["class"], team, job["style"], derivatives)

    assert derivative_paths(manifest) == ["web/team-captain/soldier-red-0@256.webp"]


def test_a_plan_holds_what_is_not_in_the_bucket_yet(tmp_path):
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    here = "web/team-captain/soldier-red-0@256.webp"
    there = "web/team-captain/soldier-red-0@512.webp"
    write_image(layout, here, b"1234")
    write_image(layout, there, b"12345678")

    plan = plan_publish([here, there], layout, settings, {there: 8})

    assert [upload.relpath for upload in plan.uploads] == [here]
    assert plan.already_there == 1
    assert plan.bytes_to_upload == 4


def test_an_object_of_a_different_size_is_published_again(tmp_path):
    """A re-derived image writes the same path, so what is up there is stale, not done."""
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    relpath = "web/team-captain/soldier-red-0@256.webp"
    write_image(layout, relpath, b"1234")

    plan = plan_publish([relpath], layout, settings, {relpath: 9})

    assert [upload.relpath for upload in plan.uploads] == [relpath]


def test_force_publishes_what_is_already_there(tmp_path):
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    relpath = "web/team-captain/soldier-red-0@256.webp"
    write_image(layout, relpath, b"1234")

    plan = plan_publish([relpath], layout, settings, {relpath: 4}, force=True)

    assert [upload.relpath for upload in plan.uploads] == [relpath]
    assert plan.already_there == 0


def test_a_recorded_image_this_machine_does_not_have_is_missing_not_fatal(tmp_path):
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    here = "web/team-captain/soldier-red-0@256.webp"
    write_image(layout, here)

    plan = plan_publish([here, "web/gone/scout-red-0@256.webp"], layout, settings, {})

    assert plan.missing == ["web/gone/scout-red-0@256.webp"]
    assert [upload.relpath for upload in plan.uploads] == [here]


def test_publishing_writes_every_image_as_a_webp_the_browser_will_draw(tmp_path):
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    relpath = "web/team-captain/soldier-red-0@256.webp"
    write_image(layout, relpath)
    bucket = FakeBucket()

    outcome = publish(plan_publish([relpath], layout, settings, {}), bucket, on_log=lambda *_: None)

    assert outcome.uploaded == 1 and outcome.failed == 0
    assert bucket.written[relpath] == {
        "bytes": 4,
        "type": "image/webp",
        "cache": DEFAULT_CACHE_CONTROL,
    }


def test_one_image_failing_does_not_stop_the_rest(tmp_path):
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    good = "web/team-captain/soldier-red-0@256.webp"
    bad = "web/team-captain/soldier-red-0@512.webp"
    write_image(layout, good)
    write_image(layout, bad)
    bucket = FakeBucket(refuse=bad)

    outcome = publish(plan_publish([good, bad], layout, settings, {}), bucket, on_log=lambda *_: None)

    assert outcome.uploaded == 1 and outcome.failed == 1
    assert set(bucket.written) == {good}


def test_a_second_run_over_finished_work_uploads_nothing(tmp_path):
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    relpath = "web/team-captain/soldier-red-0@256.webp"
    write_image(layout, relpath)
    bucket = FakeBucket()
    publish(plan_publish([relpath], layout, settings, {}), bucket, on_log=lambda *_: None)

    again = plan_publish([relpath], layout, settings, bucket.list_sizes(""))

    assert again.uploads == [] and again.already_there == 1


def test_a_prefix_is_the_folder_the_output_root_becomes():
    settings = BucketSettings.from_env({**ENV, "RENDER_BUCKET_PREFIX": "/renders/"})

    assert settings.key_for("web/team-captain/soldier-red-0@256.webp") == (
        "renders/web/team-captain/soldier-red-0@256.webp"
    )


def test_without_a_prefix_a_key_is_the_manifest_path():
    settings = BucketSettings.from_env(ENV)

    assert settings.key_for("web/a/b@256.webp") == "web/a/b@256.webp"


def test_a_prefix_cannot_climb_out_of_the_bucket():
    with pytest.raises(ValueError):
        BucketSettings.from_env({**ENV, "RENDER_BUCKET_PREFIX": "../elsewhere"})


def test_settings_name_what_is_unset():
    settings = BucketSettings.from_env({"RENDER_BUCKET": "tf2-cosm-renders"})

    assert not settings.configured
    with pytest.raises(MissingSettings) as refused:
        settings.require()
    assert "RENDER_BUCKET_ENDPOINT" in str(refused.value)
    assert "RENDER_BUCKET_SECRET" in str(refused.value)


def test_an_unconfigured_run_refuses_before_it_reads_anything(tmp_path, monkeypatch, capsys):
    for name in ENV:
        monkeypatch.delenv(name, raising=False)

    refused = main(
        [
            "--manifest",
            str(tmp_path / "renders.json"),
            "--root",
            str(tmp_path),
            "--env-file",
            str(tmp_path / "nothing.env"),
        ]
    )

    assert refused == 2
    assert "RENDER_BUCKET" in capsys.readouterr().out


def test_a_dry_run_needs_no_credentials_and_uploads_nothing(tmp_path, monkeypatch, capsys):
    for name in ENV:
        monkeypatch.delenv(name, raising=False)
    layout = a_layout(tmp_path)
    manifest = a_manifest(layout)
    for relpath in derivative_paths(manifest):
        write_image(layout, relpath)
    manifest.write(layout.manifest)

    code = main(
        [
            "--manifest",
            str(layout.manifest),
            "--root",
            str(layout.root),
            "--env-file",
            str(tmp_path / "nothing.env"),
            "--dry-run",
        ]
    )

    assert code == 0
    assert "would upload 2 images" in capsys.readouterr().out


def test_an_unknown_file_type_is_not_published_as_a_guess():
    with pytest.raises(ValueError):
        content_type_for("web/team-captain/soldier-red-0@256.txt")


def test_a_master_would_be_served_as_a_png():
    assert content_type_for("masters/team-captain/soldier-red-0.png") == "image/png"


def test_a_run_inside_the_budget_says_what_it_would_leave(tmp_path):
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    relpath = "web/team-captain/soldier-red-0@256.webp"
    write_image(layout, relpath, b"1234")
    remote = {"web/somebody-elses-file": 1000}

    plan = plan_publish([relpath], layout, settings, remote)

    assert check_budget(plan, remote, DEFAULT_MAX_BUCKET_BYTES) == 1004


def test_a_run_that_would_cross_the_budget_sends_nothing(tmp_path):
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    relpath = "web/team-captain/soldier-red-0@256.webp"
    write_image(layout, relpath, b"12345678")

    plan = plan_publish([relpath], layout, settings, {})

    with pytest.raises(OverBudget) as refused:
        check_budget(plan, {}, 4)
    assert "nothing was uploaded" in str(refused.value)


def test_replacing_an_object_counts_its_new_bytes_not_both(tmp_path):
    """A re-derived image is not growth, and a guard that called it growth would refuse a
    run that costs nothing."""
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    relpath = "web/team-captain/soldier-red-0@256.webp"
    write_image(layout, relpath, b"1234")
    remote = {relpath: 1000}

    plan = plan_publish([relpath], layout, settings, remote)

    assert project_bucket_bytes(plan, remote) == 4


def test_no_budget_at_all_is_a_budget_of_zero(tmp_path):
    layout = a_layout(tmp_path)
    settings = BucketSettings.from_env(ENV)
    relpath = "web/team-captain/soldier-red-0@256.webp"
    write_image(layout, relpath, b"12345678")

    plan = plan_publish([relpath], layout, settings, {})

    assert check_budget(plan, {}, 0) == 8


def test_the_default_budget_leaves_headroom_under_the_free_tier():
    assert DEFAULT_MAX_BUCKET_BYTES < FREE_TIER_BYTES


def test_a_size_is_reported_in_the_units_a_bill_counts():
    assert format_bytes(465_000_000) == "465 MB"
    assert format_bytes(9_000_000_000) == "9 GB"
    assert format_bytes(1_234_567_890) == "1.23 GB"
    assert format_bytes(512) == "512 bytes"
