"""The one piece of our SourceIO workarounds that is testable without Blender."""
from __future__ import annotations

import pytest

from render.sourceio_patch import collapse_slashes, suffix_of


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


@pytest.mark.parametrize(
    "path, expected",
    [
        # The bug: a dot in a *directory* is not the path's suffix.
        ("C:/Users/Chris/Desktop/tf2-cosm/.claude/worktrees/x/assets-cache/spy_head_red", ""),
        ("C:/a.b/c/texture", ""),
        # The ordinary cases still answer what pathlib answers.
        ("C:/a.b/c/texture.png", ".png"),
        ("models/player/spy/spy_head_red", ""),
        ("models/player/spy/spy_head_red.vtf", ".vtf"),
        ("texture.png", ".png"),
        ("", ""),
        # A dotfile's leading dot starts no suffix, as pathlib has it.
        ("cache/.png", ""),
        ("cache/.hidden.png", ".png"),
    ],
)
def test_the_suffix_comes_from_the_last_component(path, expected):
    assert suffix_of(path) == expected
