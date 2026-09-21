"""The two manifests the repository commits, read by the job that writes the shape.

The render job is in Python and the site is not, so the manifest contract exists twice:
`render.manifest` here, and `site/src/renders/manifest.ts` there. Nothing stops the two
drifting except a test that runs the same files through both, which is what this is on this
side — the site's own suite parses the same two files with its contract.

The files are the manifest the repository commits and the fixture manifest the site's
component tests are driven from. Neither is asserted to hold anything in particular — a
committed manifest grows a Cosmetic at a time as runs finish — only to be a manifest this
job would write.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from render.manifest import Manifest, load_manifest

REPO_ROOT = Path(__file__).resolve().parent.parent

COMMITTED = REPO_ROOT / "catalogue" / "renders.json"
SITE_FIXTURE = REPO_ROOT / "site" / "tests" / "fixtures" / "renders.json"


@pytest.mark.parametrize("path", [COMMITTED, SITE_FIXTURE], ids=["committed", "site-fixture"])
def test_the_committed_manifests_are_ones_this_job_would_write(path: Path) -> None:
    # `load_manifest` validates, so reaching the assertion is most of the test.
    manifest = load_manifest(path)
    assert manifest.to_document()["version"] == Manifest().to_document()["version"]


def test_the_site_fixture_covers_the_rungs_of_the_fallback_chain() -> None:
    """The fixture is only worth having if a run of it exercises every rung.

    Naming them here means a fixture regenerated without one of them fails on this side
    rather than quietly weakening a component test on the other.
    """
    manifest = load_manifest(SITE_FIXTURE)
    renders = manifest.to_document()["renders"]

    # A Cosmetic on more than one Class, so switching Class changes the picture.
    assert set(renders["team-captain"]) == {"soldier", "demoman"}
    # An All-Class Cosmetic rendered for some Classes and not others.
    assert set(renders["ghastly-gibus"]) == {"scout", "soldier", "heavy"}
    # Styles, and a Style that exists on one Team and not the other.
    assert set(renders["tin-pot"]["soldier"]["red"]) == {"0", "1"}
    assert set(renders["tin-pot"]["soldier"]["blu"]) == {"0"}
    # A BLU entry that is the RED image, which is not a second Team to offer.
    assert renders["crocodile-smile"]["sniper"]["blu"]["0"]["team_fallback"] is True
    # A master with no web derivative yet.
    assert renders["baronial-badge"]["engineer"]["red"]["0"]["worn"]["derivatives"] == {}
    # A Cosmetic with an Item Render beside its Worn Render, and one with none, so the site's
    # toggle is exercised both where it is offered and where it is not.
    assert renders["team-captain"]["soldier"]["red"]["0"]["alone"] is not None
    assert renders["ghastly-gibus"]["scout"]["red"]["0"]["alone"] is None
    # A Cosmetic that failed, and one never attempted: both fall back to the icon.
    assert [failure["slug"] for failure in manifest.to_document()["failures"]] == ["bolt-boy"]
    assert "dead-of-night" not in renders
