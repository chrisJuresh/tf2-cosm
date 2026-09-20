"""Which model paths the installed game actually has.

The resolve step must not discover a missing model mid-render, so every path it emits is
checked against an index first. Two implementations: the game's VPK archive in production,
a set of paths in tests.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Protocol


class ModelIndex(Protocol):
    def resolve(self, path: str) -> str | None:
        """Return the archive's own spelling of `path`, or None when it holds no such model."""


class InMemoryModelIndex:
    """A model index over a fixed list of paths."""

    def __init__(self, paths: Iterable[str]) -> None:
        self._by_lower = {p.lower().replace("\\", "/"): p for p in paths}

    def resolve(self, path: str) -> str | None:
        return self._by_lower.get(path.lower().replace("\\", "/"))


class VpkModelIndex:
    """A model index over the game's tf2_misc_dir.vpk."""

    def __init__(self, vpk_path: Path) -> None:
        import vpk as vpk_module

        archive = vpk_module.open(str(vpk_path))
        self._by_lower = {p.lower().replace("\\", "/"): p for p in archive}

    def resolve(self, path: str) -> str | None:
        return self._by_lower.get(path.lower().replace("\\", "/"))
