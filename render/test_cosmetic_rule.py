"""The render job's half of the shared Cosmetic-rule oracle.

The catalogue data job (`data/`) reads the same two files and must reach the same
answer. See fixtures/cosmetic-rule/README.md.

    ./.venv/Scripts/python.exe -m pytest render
"""
from __future__ import annotations

import json
from pathlib import Path

import vdf

from resolve import classify, classes_for

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures/cosmetic-rule"


def load_fixture() -> tuple[dict, dict[str, str]]:
    items_game = vdf.loads((FIXTURES / "items_game.txt").read_text(encoding="utf-8"))["items_game"]
    tokens = json.loads((FIXTURES / "english-tokens.json").read_text(encoding="utf-8"))
    return items_game, tokens


def expected() -> dict:
    return json.loads((FIXTURES / "expected-cosmetics.json").read_text(encoding="utf-8"))


def classified() -> list[tuple[int, dict, str, str | None]]:
    items_game, tokens = load_fixture()
    return [(int(d), item, name, reason) for d, item, name, reason in classify(items_game, tokens)]


def test_keeps_exactly_the_cosmetics_the_oracle_lists() -> None:
    """This step works per defindex, so a Cosmetic's aliases are separate rows here."""
    kept = sorted((defindex, name) for defindex, _, name, reason in classified() if reason is None)
    wanted = sorted(
        (defindex, one["name"])
        for one in expected()["cosmetics"]
        for defindex in [one["defindex"], *one["aliases"]]
    )
    assert kept == wanted


def test_excludes_each_near_miss_for_the_oracle_s_reason() -> None:
    reasons = {defindex: reason for defindex, _, _, reason in classified()}
    for excluded in expected()["excluded"]:
        assert reasons[excluded["defindex"]] == excluded["reason"], excluded["name"]


def test_records_the_classes_the_oracle_gives() -> None:
    classes = {defindex: classes_for(item) for defindex, item, _, reason in classified() if reason is None}
    for cosmetic in expected()["cosmetics"]:
        assert classes[cosmetic["defindex"]] == cosmetic["classes"], cosmetic["name"]


def test_names_have_their_leading_the_stripped() -> None:
    names = [name for _, _, name, reason in classified() if reason is None]
    assert not [name for name in names if name.lower().startswith("the ")]
