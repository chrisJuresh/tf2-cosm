"""The derive step: masters on disk in, web derivatives and a finished manifest out."""
from __future__ import annotations

import json

import pytest
from PIL import Image

from render.derive import derive_all, main
from render.manifest import REASON_DERIVE_ERROR, Manifest, load_manifest
from render.output import OutputLayout

AT = "2026-09-20T12:00:00+00:00"
SIZES = (512, 256)


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


def a_layout(tmp_path) -> OutputLayout:
    return OutputLayout.from_env({}, repo_root=tmp_path)


def write_master(layout: OutputLayout, relpath: str, opaque: bool = True) -> None:
    out = layout.path_for(relpath)
    out.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    if opaque:
        image.paste((10, 20, 30, 255), (16, 8, 48, 56))
    image.save(out, format="PNG")


def a_manifest(layout: OutputLayout, **job_overrides) -> tuple[Manifest, str]:
    job = a_job(**job_overrides)
    manifest = Manifest()
    relpath = layout.master_relpath(job, "red")
    manifest.record(job, "red", path=relpath, width=64, height=64, at=AT)
    return manifest, relpath


def test_every_master_gains_both_web_sizes(tmp_path):
    layout = a_layout(tmp_path)
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath)

    outcome = derive_all(manifest, layout, SIZES, at=AT)

    entry = manifest.entry("team-captain", "soldier", "red", 0)
    assert sorted(entry["derivatives"]) == ["256", "512"]
    for size in SIZES:
        record = entry["derivatives"][str(size)]
        assert layout.path_for(record["path"]).exists()
        assert record["width"] == record["height"] == size
    assert outcome.derived == 1 and outcome.failed == 0


def test_a_derivative_keeps_the_transparent_background(tmp_path):
    layout = a_layout(tmp_path)
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath)

    derive_all(manifest, layout, SIZES, at=AT)

    record = manifest.entry("team-captain", "soldier", "red", 0)["derivatives"]["256"]
    with Image.open(layout.path_for(record["path"])) as image:
        assert image.convert("RGBA").getpixel((0, 0))[3] == 0


def test_a_second_run_does_the_work_once(tmp_path):
    layout = a_layout(tmp_path)
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath)
    derive_all(manifest, layout, SIZES, at=AT)

    outcome = derive_all(manifest, layout, SIZES, at=AT)

    assert outcome.derived == 0 and outcome.skipped == 1


def test_a_derivative_deleted_from_disk_is_made_again(tmp_path):
    layout = a_layout(tmp_path)
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath)
    derive_all(manifest, layout, SIZES, at=AT)
    entry = manifest.entry("team-captain", "soldier", "red", 0)
    layout.path_for(entry["derivatives"]["256"]["path"]).unlink()

    outcome = derive_all(manifest, layout, SIZES, at=AT)

    assert outcome.derived == 1
    assert layout.path_for(entry["derivatives"]["256"]["path"]).exists()


def test_asking_for_a_different_set_of_sizes_makes_that_set(tmp_path):
    layout = a_layout(tmp_path)
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath)
    derive_all(manifest, layout, SIZES, at=AT)

    derive_all(manifest, layout, (128,), at=AT)

    assert sorted(manifest.entry("team-captain", "soldier", "red", 0)["derivatives"]) == ["128"]


def test_forcing_remakes_derivatives_that_are_already_there(tmp_path):
    layout = a_layout(tmp_path)
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath)
    derive_all(manifest, layout, SIZES, at=AT)

    outcome = derive_all(manifest, layout, SIZES, at=AT, force=True)

    assert outcome.derived == 1 and outcome.skipped == 0


def test_a_master_that_is_not_on_disk_is_a_recorded_failure_not_a_crash(tmp_path):
    layout = a_layout(tmp_path)
    manifest, _ = a_manifest(layout)

    outcome = derive_all(manifest, layout, SIZES, at=AT)

    assert outcome.failed == 1
    (failure,) = manifest.to_document()["failures"]
    assert failure["reason"] == REASON_DERIVE_ERROR
    assert failure["slug"] == "team-captain" and failure["team"] == "red"


def test_a_master_with_nothing_on_it_is_a_recorded_failure(tmp_path):
    layout = a_layout(tmp_path)
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath, opaque=False)

    outcome = derive_all(manifest, layout, SIZES, at=AT)

    assert outcome.failed == 1
    assert manifest.to_document()["failures"][0]["reason"] == REASON_DERIVE_ERROR


def test_one_bad_master_never_stops_the_rest(tmp_path):
    layout = a_layout(tmp_path)
    manifest = Manifest()
    for style, has_master in ((0, False), (1, True)):
        job = a_job(style=style)
        relpath = layout.master_relpath(job, "red")
        manifest.record(job, "red", path=relpath, width=64, height=64, at=AT)
        if has_master:
            write_master(layout, relpath)

    outcome = derive_all(manifest, layout, SIZES, at=AT)

    assert outcome.derived == 1 and outcome.failed == 1
    assert manifest.entry("team-captain", "soldier", "red", 1)["derivatives"]


def test_the_command_writes_the_manifest_it_finished(tmp_path):
    layout = a_layout(tmp_path)
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath)
    manifest.write(layout.manifest)

    assert main(["--root", str(layout.root), "--manifest", str(layout.manifest)]) == 0

    entry = load_manifest(layout.manifest).entry("team-captain", "soldier", "red", 0)
    assert sorted(entry["derivatives"]) == ["256", "512"]


def test_a_dry_run_writes_nothing(tmp_path, capsys):
    layout = a_layout(tmp_path)
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath)
    manifest.write(layout.manifest)
    before = layout.manifest.read_text(encoding="utf-8")

    assert main(["--root", str(layout.root), "--manifest", str(layout.manifest), "--dry-run"]) == 0

    assert layout.manifest.read_text(encoding="utf-8") == before
    assert not (layout.root / layout.derivatives_dir).exists()
    printed = capsys.readouterr().out
    assert relpath in printed and "would derive 1" in printed


def test_the_command_reports_a_run_that_could_derive_nothing(tmp_path):
    layout = a_layout(tmp_path)
    manifest, _ = a_manifest(layout)
    manifest.write(layout.manifest)

    assert main(["--root", str(layout.root), "--manifest", str(layout.manifest)]) == 1

    document = json.loads(layout.manifest.read_text(encoding="utf-8"))
    assert document["failures"][0]["reason"] == REASON_DERIVE_ERROR


def test_an_empty_manifest_is_not_an_error(tmp_path):
    layout = a_layout(tmp_path)
    Manifest().write(layout.manifest)

    assert main(["--root", str(layout.root), "--manifest", str(layout.manifest)]) == 0


def test_the_image_folders_can_be_moved_without_touching_the_code(tmp_path, monkeypatch):
    monkeypatch.setenv("RENDER_DERIVATIVES_DIR", "thumbs")
    layout = OutputLayout.from_env(repo_root=tmp_path).overridden(root=tmp_path / "renders")
    manifest, relpath = a_manifest(layout)
    write_master(layout, relpath)

    derive_all(manifest, layout, (128,), at=AT)

    record = manifest.entry("team-captain", "soldier", "red", 0)["derivatives"]["128"]
    assert record["path"].startswith("thumbs/")
    assert (tmp_path / "renders" / record["path"]).exists()


@pytest.mark.parametrize("sizes", [["0"], ["-4"], ["nope"]])
def test_a_size_that_is_not_pixels_is_refused(tmp_path, sizes):
    layout = a_layout(tmp_path)
    Manifest().write(layout.manifest)

    with pytest.raises(SystemExit):
        main(["--manifest", str(layout.manifest), "--sizes", *sizes])
