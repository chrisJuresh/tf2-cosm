"""The resolve step's seam: schema + tokens + model index in, job list out.

Assertions are on the emitted jobs and exclusions only — never on how they were derived.
"""
from __future__ import annotations

import pytest

from render.cosmetics import ALL_CLASSES, equip_regions
from render.model_index import InMemoryModelIndex
from render.resolve import Cosmetic, CosmeticNameCollision, resolve
from tests.conftest import FIXTURE_MODELS


def jobs_named(result, name: str) -> list[dict]:
    return [j for j in result.jobs if j["name"] == name]


def test_class_exclusive_cosmetic_emits_one_job_per_style(schema, tokens, model_index):
    result = resolve(schema, tokens, model_index)

    assert jobs_named(result, "Bolt Boy") == [
        {
            "name": "Bolt Boy",
            "slug": "bolt-boy",
            "defindex": 101,
            "aliases": [101],
            "class": "scout",
            "style": 0,
            "style_name": None,
            "model": "models/player/items/scout/boltboy.mdl",
            "hide_bodygroups": ["hat"],
            "skin_red": 0,
            "skin_blu": 1,
            "slot": "head",
            "equip_regions": ["hat"],
            "paintable": False,
        }
    ]


def test_multi_class_cosmetic_substitutes_demo_for_the_demoman(schema, tokens, model_index):
    result = resolve(schema, tokens, model_index)

    assert [(j["class"], j["model"]) for j in jobs_named(result, "Team Captain")] == [
        ("soldier", "models/player/items/soldier/soldier_officer.mdl"),
        ("demoman", "models/player/items/demo/demo_officer.mdl"),
    ]


def test_all_class_cosmetic_renders_on_every_class(schema, tokens, model_index):
    result = resolve(schema, tokens, model_index)
    jobs = jobs_named(result, "Ghastly Gibus")

    assert [j["class"] for j in jobs] == list(ALL_CLASSES)
    assert [c.name for c in result.all_class_cosmetics] == ["Ghastly Gibus"]


def test_an_all_class_cosmetic_stays_all_class_when_a_model_is_missing(schema, tokens):
    index = InMemoryModelIndex(
        [p for p in FIXTURE_MODELS if p != "models/player/items/all_class/gibus_pyro.mdl"]
    )

    result = resolve(schema, tokens, index)

    assert [j["class"] for j in jobs_named(result, "Ghastly Gibus")] != list(ALL_CLASSES)
    assert [c.name for c in result.all_class_cosmetics] == ["Ghastly Gibus"]


def test_defindexes_sharing_a_name_become_one_cosmetic_with_aliases(schema, tokens, model_index):
    result = resolve(schema, tokens, model_index)
    jobs = jobs_named(result, "Ghastly Gibus")

    assert {j["defindex"] for j in jobs} == {103}
    assert {tuple(j["aliases"]) for j in jobs} == {(103, 104)}


def test_a_cosmetic_whose_models_live_only_in_styles_emits_a_job_per_style(schema, tokens, model_index):
    result = resolve(schema, tokens, model_index)

    assert [
        (j["style"], j["style_name"], j["model"], j["hide_bodygroups"], j["skin_red"], j["skin_blu"])
        for j in jobs_named(result, "Tin Pot")
    ] == [
        (0, "Closed", "models/player/items/soldier/tin_pot.mdl", ["hat"], 0, 1),
        (1, "Open", "models/player/items/soldier/tin_pot_open.mdl", ["hat", "medal"], 2, 3),
    ]


def test_items_worn_below_the_head_carry_their_equip_regions_and_paintability(schema, tokens, model_index):
    (job,) = jobs_named(resolve(schema, tokens, model_index), "Dead of Night")

    assert job["slot"] == "misc"
    assert job["equip_regions"] == ["medal", "shirt"]
    assert job["paintable"] is True


def test_an_item_writing_its_one_equip_region_as_a_block_still_reads_as_region_names():
    """A few live items spell `equip_region` as a block; the render step frames on these names."""
    assert equip_regions({"equip_region": {"whole_head": "1", "head_skin": "1"}}) == [
        "head_skin",
        "whole_head",
    ]


def test_an_item_with_no_equip_region_at_all_has_none():
    assert equip_regions({}) == []


def test_medals_never_tradable_items_and_modelless_items_are_excluded_with_a_reason(
    schema, tokens, model_index
):
    result = resolve(schema, tokens, model_index)

    assert [(e.defindex, e.name, e.reason) for e in result.exclusions] == [
        (106, "ESL Season 1 Gold Medal", "medal"),
        (107, "Ye Olde Baker Boy", "never-tradable"),
        (108, "Scrap Metal Hat Part", "no-model"),
    ]
    assert [c.name for c in result.cosmetics] == [
        "Bolt Boy",
        "Dead of Night",
        "Ghastly Gibus",
        "Team Captain",
        "Tin Pot",
    ]


def test_the_dry_run_counts_jobs_by_class_and_exclusions_by_reason(schema, tokens, model_index):
    result = resolve(schema, tokens, model_index)

    assert result.jobs_by_class == {
        "scout": 2,
        "soldier": 4,
        "pyro": 1,
        "demoman": 2,
        "heavy": 1,
        "engineer": 1,
        "medic": 1,
        "sniper": 1,
        "spy": 2,
    }
    assert sum(result.jobs_by_class.values()) == len(result.jobs)
    assert result.exclusions_by_reason == {"medal": 1, "never-tradable": 1, "no-model": 1}


def test_only_keeps_the_named_cosmetics_without_changing_the_exclusions(schema, tokens, model_index):
    result = resolve(schema, tokens, model_index, only={"tin pot"})

    assert [c.name for c in result.cosmetics] == ["Tin Pot"]
    assert len(result.exclusions) == 3


def test_a_cosmetic_records_its_slug_aliases_and_classes(schema, tokens, model_index):
    by_name = {c.name: c for c in resolve(schema, tokens, model_index).cosmetics}

    assert by_name["Ghastly Gibus"] == Cosmetic(
        name="Ghastly Gibus", slug="ghastly-gibus", aliases=[103, 104], classes=list(ALL_CLASSES)
    )
    assert by_name["Team Captain"].classes == ["soldier", "demoman"]


def test_two_different_items_sharing_a_name_fail_loudly(tokens, model_index):
    def hat(model: str) -> dict:
        return {
            "item_class": "tf_wearable",
            "item_slot": "head",
            "item_name": "#TF_BoltBoy",
            "used_by_classes": {"Scout": "1"},
            "model_player": model,
        }

    schema = {
        "prefabs": {},
        "items": {
            "201": hat("models/player/items/scout/boltboy.mdl"),
            "202": hat("models/player/items/scout/baker_boy.mdl"),
        },
    }

    with pytest.raises(CosmeticNameCollision, match="Bolt Boy"):
        resolve(schema, tokens, model_index)


def test_a_model_the_game_archive_lacks_is_excluded_not_emitted(schema, tokens):
    index = InMemoryModelIndex(
        [p for p in FIXTURE_MODELS if p != "models/player/items/demo/demo_officer.mdl"]
    )

    result = resolve(schema, tokens, index)

    assert [j["class"] for j in jobs_named(result, "Team Captain")] == ["soldier"]
    assert [
        (e.name, e.reason, e.detail)
        for e in result.exclusions
        if e.name == "Team Captain"
    ] == [("Team Captain", "no-model", "demoman style 0: models/player/items/demo/demo_officer.mdl")]


def test_two_different_items_sharing_a_name_fail_loudly_even_when_no_model_resolves(tokens):
    def hat(model: str) -> dict:
        return {
            "item_class": "tf_wearable",
            "item_slot": "head",
            "item_name": "#TF_BoltBoy",
            "used_by_classes": {"Scout": "1"},
            "model_player": model,
        }

    schema = {
        "prefabs": {},
        "items": {
            "201": hat("models/player/items/scout/one.mdl"),
            "202": hat("models/player/items/scout/another.mdl"),
        },
    }

    with pytest.raises(CosmeticNameCollision, match="Bolt Boy"):
        resolve(schema, tokens, InMemoryModelIndex([]))
