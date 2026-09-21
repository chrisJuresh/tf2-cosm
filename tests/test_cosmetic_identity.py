"""The render job's half of the shared slug oracle.

The catalogue data job derives the same slug from the same name, and the site looks this
job's render manifest up by it, so the two rules are one rule. Its half of this table is
`data/tests/identity.test.ts`; the table itself is `tests/fixtures/slugs.json` and the
reasoning is `docs/fixtures/cosmetic-oracle.md`.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from render.cosmetics import display_name, slug

ORACLE = json.loads((Path(__file__).parent / "fixtures" / "slugs.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("name,expected", sorted(ORACLE["slugs"].items()))
def test_the_slug_oracle(name: str, expected: str) -> None:
    assert slug(name) == expected


@pytest.mark.parametrize("name", ORACLE["unsluggable"])
def test_a_name_with_nothing_to_slug_is_refused(name: str) -> None:
    with pytest.raises(ValueError):
        slug(name)


def test_the_slug_is_idempotent() -> None:
    """A slug fed back in is itself, so re-slugging a stored identifier cannot drift."""
    for expected in ORACLE["slugs"].values():
        assert slug(expected) == expected


def test_display_name_drops_a_leading_the() -> None:
    assert display_name("The Team Captain") == "Team Captain"
    assert display_name("Thermal Tracker") == "Thermal Tracker"
