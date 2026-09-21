"""The one piece of our SourceIO workarounds that is testable without Blender."""
from __future__ import annotations

import pytest

from render.sourceio_patch import UV_OUT_TYPO, collapse_slashes, repaired_source, suffix_of


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


def test_both_uv_out_typos_are_corrected():
    """SourceIO writes `uv.output` in two places; both are the socket list, and `uv` can be None."""
    source = (
        "def create_nodes(self):\n"
        "    uv = None\n"
        "    a = f(uv_out=uv.output[0])\n"
        "    b = g(x, uv_out=uv.output[0])\n"
    )
    repaired, found = repaired_source(source)
    assert found == 2
    assert UV_OUT_TYPO not in repaired
    assert repaired.count("uv_out=(uv.outputs[0] if uv is not None else None)") == 2


def test_a_source_without_the_typo_is_left_exactly_as_it_is():
    """An add-on that has fixed this upstream must not be rewritten behind its back."""
    source = "def create_nodes(self):\n    return f(uv_out=uv.outputs[0])\n"
    assert repaired_source(source) == (source, 0)
