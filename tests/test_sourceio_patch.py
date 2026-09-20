"""The one piece of our SourceIO workarounds that is testable without Blender."""
from __future__ import annotations

import pytest

from render.sourceio_patch import collapse_slashes


@pytest.mark.parametrize(
    "path, expected",
    [
        ("materials//models/player/items/soldier/soldier_officer.vmt", "materials/models/player/items/soldier/soldier_officer.vmt"),
        ("materials///models/x.vmt", "materials/models/x.vmt"),
        ("materials/models/x.vmt", "materials/models/x.vmt"),
        ("", ""),
    ],
)
def test_repeated_slashes_collapse(path, expected):
    assert collapse_slashes(path) == expected


def test_a_leading_double_slash_is_left_alone():
    """Blender spells a path relative to the .blend file '//...'; it is not a doubled separator."""
    assert collapse_slashes("//textures/cache") == "//textures/cache"
