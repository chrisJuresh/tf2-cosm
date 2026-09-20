"""The render step end to end: Blender really runs, real models, real PNGs.

Skipped automatically when Blender or the game is missing, so the suite still passes on a
machine that cannot render. Assertions are on the files and the manifest — never on Blender
internals: the image is the declared size, its corners are transparent and its centre is not,
and the manifest says what was rendered and why anything failed.

    ./.venv/Scripts/python.exe -m pytest tests/test_render_smoke.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from render.derivatives import DERIVATIVE_SIZES
from render.derive import main as derive_main
from render.jobs import JOB_LIST_VERSION, job_list, validate_job_list
from render.manifest import REASON_MODEL_MISSING, validate_manifest
from render.resolve import resolve_installed_game

BLENDER = Path(
    os.environ.get("TF2COSM_BLENDER", "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe")
)
TF = Path(
    os.environ.get(
        "TF2COSM_TF", "C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf"
    )
)
REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_PACKAGES = Path(sys.prefix) / "Lib" / "site-packages"
CACHE = REPO_ROOT / "assets-cache"

#: A bust, a bust whose Style hides two class bodygroups, and a Cosmetic with no BLU skin.
RENDERED = [
    ("team-captain", "soldier", 0),
    ("batters-helmet", "scout", 1),
    ("killer-exclusive", "heavy", 0),
]
NAMES = {"team captain", "batter's helmet", "killer exclusive"}

pytestmark = pytest.mark.skipif(
    not (BLENDER.exists() and TF.exists()),
    reason=f"needs Blender at {BLENDER} and the game at {TF}",
)


@pytest.fixture(scope="module")
def rendered(tmp_path_factory) -> tuple[dict, Path]:
    """Render the known jobs once, plus one job whose model the game does not have."""
    Image = pytest.importorskip("PIL.Image")  # noqa: F841 - fail early if Pillow is missing
    workspace = tmp_path_factory.mktemp("render-smoke")
    jobs_file = workspace / "jobs.json"
    out = workspace / "images"  # the output root; masters and web sizes sit under it
    manifest_file = workspace / "manifest.json"

    resolution = resolve_installed_game(TF, only=NAMES)
    jobs = [
        job
        for job in resolution.jobs
        if (job["slug"], job["class"], job["style"]) in set(RENDERED)
    ]
    assert {(j["slug"], j["class"], j["style"]) for j in jobs} == set(RENDERED)

    absent = dict(jobs[0])
    absent.update(
        {
            "name": "Not In The Game",
            "slug": "not-in-the-game",
            "model": "models/player/items/soldier/no_such_model.mdl",
        }
    )
    document = job_list(jobs + [absent], source=str(TF))
    validate_job_list(document)
    jobs_file.write_text(json.dumps(document), encoding="utf-8")

    result = subprocess.run(
        [
            str(BLENDER), "-b", "--factory-startup",
            "--python", str(REPO_ROOT / "render" / "blender_job.py"), "--",
            "--jobs", str(jobs_file),
            "--teams", "red", "blu",
            "--tf", str(TF),
            "--cache", str(CACHE),
            "--out", str(out),
            "--manifest", str(manifest_file),
            "--site-packages", str(SITE_PACKAGES),
        ],
        capture_output=True,
        text=True,
        timeout=900,
    )
    assert result.returncode == 0, result.stdout[-4000:] + result.stderr[-4000:]

    # The web sizes are a step of their own, outside Blender: this is the whole job.
    assert derive_main(["--root", str(out), "--manifest", str(manifest_file)]) == 0

    document = json.loads(manifest_file.read_text(encoding="utf-8"))
    validate_manifest(document)
    return document, out


@pytest.mark.parametrize("slug, cls, style", RENDERED)
@pytest.mark.parametrize("team", ["red", "blu"])
def test_a_known_job_produces_an_image_the_manifest_can_find(rendered, slug, cls, style, team):
    document, out = rendered

    entry = document["renders"][slug][cls][team][str(style)]

    assert entry["master"]["width"] == 1024 and entry["master"]["height"] == 1024
    assert entry["model"].endswith(".mdl")
    assert entry["rendered_at"].startswith("20")
    assert entry["job_version"] == JOB_LIST_VERSION
    assert (out / entry["master"]["path"]).exists()


@pytest.mark.parametrize("slug, cls, style", RENDERED)
@pytest.mark.parametrize("team", ["red", "blu"])
def test_the_image_is_a_transparent_square_with_the_class_in_the_middle(
    rendered, slug, cls, style, team
):
    from PIL import Image

    document, out = rendered

    image = Image.open(out / document["renders"][slug][cls][team][str(style)]["master"]["path"])

    assert image.size == (1024, 1024)
    assert image.mode == "RGBA"
    # The top corners are sky in every framing; the bottom ones are shoulder in a bust.
    assert [image.getpixel(corner)[3] for corner in ((0, 0), (1023, 0))] == [0, 0]
    assert image.getpixel((512, 512))[3] == 255


def test_a_cosmetic_with_no_blu_skin_renders_red_and_the_manifest_records_it(rendered):
    document, _ = rendered

    assert document["renders"]["killer-exclusive"]["heavy"]["blu"]["0"]["team_fallback"] is True
    assert document["renders"]["team-captain"]["soldier"]["blu"]["0"]["team_fallback"] is False


def test_a_missing_model_is_recorded_as_a_failure_and_does_not_stop_the_run(rendered):
    document, out = rendered

    failures = [f for f in document["failures"] if f["slug"] == "not-in-the-game"]

    assert {f["team"] for f in failures} == {"red", "blu"}
    assert {f["reason"] for f in failures} == {REASON_MODEL_MISSING}
    assert all(f["detail"] for f in failures)
    assert "not-in-the-game" not in document["renders"]
    assert not (out / "masters" / "not-in-the-game").exists()


@pytest.mark.parametrize("slug, cls, style", RENDERED)
def test_every_master_gains_its_web_sizes(rendered, slug, cls, style):
    from PIL import Image

    document, out = rendered

    derivatives = document["renders"][slug][cls]["red"][str(style)]["derivatives"]

    assert sorted(derivatives) == sorted(str(size) for size in DERIVATIVE_SIZES)
    for size, record in derivatives.items():
        assert record["width"] == record["height"] == int(size)
        with Image.open(out / record["path"]) as image:
            assert image.size == (int(size), int(size))
            assert image.convert("RGBA").getpixel((0, 0))[3] == 0
