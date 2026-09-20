from __future__ import annotations

from pathlib import Path

import pytest

from render.items_game import load_items_game, load_tokens
from render.model_index import InMemoryModelIndex

FIXTURES = Path(__file__).parent / "fixtures"

CLASS_TOKENS = ["scout", "soldier", "pyro", "demo", "heavy", "engineer", "medic", "sniper", "spy"]

FIXTURE_MODELS = [
    "models/player/items/scout/boltboy.mdl",
    "models/player/items/scout/baker_boy.mdl",
    "models/player/items/soldier/soldier_officer.mdl",
    "models/player/items/demo/demo_officer.mdl",
    "models/player/items/soldier/tin_pot.mdl",
    "models/player/items/soldier/tin_pot_open.mdl",
    "models/player/items/spy/dead_of_night.mdl",
    "models/workshop/player/items/all_class/esl_medal/esl_medal.mdl",
    *[f"models/player/items/all_class/gibus_{token}.mdl" for token in CLASS_TOKENS],
]


@pytest.fixture
def schema() -> dict:
    return load_items_game(FIXTURES / "items_game_excerpt.txt")


@pytest.fixture
def tokens() -> dict[str, str]:
    return load_tokens(FIXTURES / "tf_english_excerpt.txt")


@pytest.fixture
def model_index() -> InMemoryModelIndex:
    return InMemoryModelIndex(FIXTURE_MODELS)
