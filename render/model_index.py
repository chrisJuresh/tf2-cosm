"""Which model paths the installed game actually has.

The resolve step must not discover a missing model mid-render, so every path it emits is
checked against an index first. Two implementations: the game's VPK archive in production,
a list of paths in tests.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Protocol


class ModelIndex(Protocol):
    def resolve(self, path: str) -> str | None:
        """Return the archive's own spelling of `path`, or None when it holds no such model."""


class InMemoryModelIndex:
    """A model index over a list of archive paths, matched the way Source matches them."""

    def __init__(self, paths: Iterable[str]) -> None:
        self._by_lower = {self._key(p): p for p in paths}

    @staticmethod
    def _key(path: str) -> str:
        """Source is case-insensitive and treats both slashes alike."""
        return path.lower().replace("\\", "/")

    def resolve(self, path: str) -> str | None:
        return self._by_lower.get(self._key(path))


class VpkModelIndex(InMemoryModelIndex):
    """A model index over the game's tf2_misc_dir.vpk: its whole path list, read once."""

    def __init__(self, vpk_path: Path) -> None:
        import vpk as vpk_module

        super().__init__(vpk_module.open(str(vpk_path)))
