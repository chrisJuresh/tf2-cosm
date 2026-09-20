"""Where images and the manifest live: the one seam a bucket later replaces."""
from __future__ import annotations

from pathlib import Path

import pytest

from render.output import (
    DEFAULT_DERIVATIVES_DIR,
    DEFAULT_MASTERS_DIR,
    OutputLayout,
)


def a_job(**overrides) -> dict:
    job = {"slug": "team-captain", "class": "soldier", "style": 0}
    job.update(overrides)
    return job


def a_layout(tmp_path: Path) -> OutputLayout:
    return OutputLayout(
        root=tmp_path / "renders",
        masters_dir=DEFAULT_MASTERS_DIR,
        derivatives_dir=DEFAULT_DERIVATIVES_DIR,
        manifest=tmp_path / "catalogue/renders.json",
    )


def test_a_master_is_keyed_by_cosmetic_class_team_and_style(tmp_path):
    layout = a_layout(tmp_path)

    assert layout.master_relpath(a_job(), "red") == "masters/team-captain/soldier-red-0.png"
    assert layout.master_relpath(a_job(style=2), "blu") == "masters/team-captain/soldier-blu-2.png"


def test_a_derivative_sits_beside_its_master_under_the_web_folder(tmp_path):
    layout = a_layout(tmp_path)
    master = layout.master_relpath(a_job(), "red")

    assert layout.derivative_relpath(master, 512) == "web/team-captain/soldier-red-0@512.webp"


def test_every_derivative_size_gets_a_path_keyed_the_way_the_manifest_keys_it(tmp_path):
    layout = a_layout(tmp_path)

    relpaths = layout.derivative_relpaths(layout.master_relpath(a_job(), "red"), (512, 256))

    assert relpaths == {
        "512": "web/team-captain/soldier-red-0@512.webp",
        "256": "web/team-captain/soldier-red-0@256.webp",
    }


def test_manifest_paths_stay_relative_so_a_bucket_can_replace_the_folder(tmp_path):
    layout = a_layout(tmp_path)

    for relpath in (
        layout.master_relpath(a_job(), "red"),
        layout.derivative_relpath(layout.master_relpath(a_job(), "red"), 256),
    ):
        assert not Path(relpath).is_absolute()
        assert "\\" not in relpath


def test_the_absolute_path_of_an_image_is_the_root_plus_its_relative_path(tmp_path):
    layout = a_layout(tmp_path)

    assert layout.path_for("web/a@256.webp") == tmp_path / "renders/web/a@256.webp"


def test_the_layout_defaults_to_the_repository_when_nothing_is_configured(tmp_path):
    layout = OutputLayout.from_env({}, repo_root=tmp_path)

    assert layout.root == tmp_path / "renders"
    assert layout.masters_dir == DEFAULT_MASTERS_DIR
    assert layout.derivatives_dir == DEFAULT_DERIVATIVES_DIR
    assert layout.manifest == tmp_path / "catalogue" / "renders.json"


def test_the_output_root_and_the_image_folders_are_configuration(tmp_path):
    layout = OutputLayout.from_env(
        {
            "RENDER_OUTPUT_ROOT": str(tmp_path / "elsewhere"),
            "RENDER_MASTERS_DIR": "full",
            "RENDER_DERIVATIVES_DIR": "small",
            "RENDER_MANIFEST": str(tmp_path / "somewhere/renders.json"),
        },
        repo_root=tmp_path,
    )

    assert layout.root == tmp_path / "elsewhere"
    assert layout.master_relpath(a_job(), "red") == "full/team-captain/soldier-red-0.png"
    assert layout.derivative_relpath("full/team-captain/soldier-red-0.png", 256) == (
        "small/team-captain/soldier-red-0@256.webp"
    )
    assert layout.manifest == tmp_path / "somewhere/renders.json"


def test_an_image_folder_that_escapes_the_output_root_is_refused(tmp_path):
    with pytest.raises(ValueError, match="image folder"):
        OutputLayout.from_env({"RENDER_MASTERS_DIR": "../masters"}, repo_root=tmp_path)


def test_a_derivative_path_is_refused_for_a_master_outside_the_masters_folder(tmp_path):
    with pytest.raises(ValueError, match="masters"):
        a_layout(tmp_path).derivative_relpath("elsewhere/soldier-red-0.png", 256)
