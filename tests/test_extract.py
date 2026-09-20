"""The assets cache: the render step asks for a model, the archive's files appear on disk."""
from __future__ import annotations

import io

import pytest

from render.extract import ModelCache, ModelNotInArchive

SOLDIER = "models/player/soldier.mdl"
ARCHIVE = {
    "models/player/soldier.mdl": b"mdl",
    "models/player/soldier.vvd": b"vvd",
    "models/player/soldier.dx90.vtx": b"vtx",
    "models/player/soldier.phy": b"phy",
    "models/player/soldier_hands.mdl": b"other model, same directory",
    "models/player/items/soldier/soldier_officer.mdl": b"hat",
}


class FakeArchive:
    """Stands in for the game's VPK: path list and file reads, which is all the cache uses."""

    def __init__(self, files: dict[str, bytes]) -> None:
        self.files = files
        self.reads: list[str] = []

    def __iter__(self):
        return iter(self.files)

    def get_file(self, name: str):
        self.reads.append(name)
        return io.BytesIO(self.files[name])


@pytest.fixture
def cache(tmp_path) -> ModelCache:
    return ModelCache(tmp_path / "assets-cache", archive=FakeArchive(dict(ARCHIVE)))


def test_a_model_arrives_with_the_files_that_share_its_stem(cache, tmp_path):
    path = cache.ensure(SOLDIER)

    assert path == tmp_path / "assets-cache" / "tf" / SOLDIER
    assert path.read_bytes() == b"mdl"
    written = sorted(p.name for p in path.parent.iterdir())
    assert written == ["soldier.dx90.vtx", "soldier.mdl", "soldier.phy", "soldier.vvd"]


def test_a_model_already_in_the_cache_is_not_read_again(cache):
    cache.ensure(SOLDIER)
    reads = len(cache.archive.reads)

    cache.ensure(SOLDIER)

    assert len(cache.archive.reads) == reads


def test_a_model_the_archive_does_not_have_is_refused_by_name(cache):
    with pytest.raises(ModelNotInArchive, match="models/player/items/scout/absent.mdl"):
        cache.ensure("models/player/items/scout/absent.mdl")


def test_the_archives_own_spelling_is_used_however_the_job_spells_it(cache, tmp_path):
    path = cache.ensure("MODELS\\Player\\Soldier.mdl")

    assert path == tmp_path / "assets-cache" / "tf" / SOLDIER
    assert path.exists()
