"""Read the installed game's item definitions the way the engine does.

items_game.txt is a VDF document whose item definitions inherit from prefabs; tf_english.txt
is a UTF-16 VDF of localisation tokens. Nothing in here knows what a Cosmetic is — that rule
lives in `render.cosmetics`.
"""
from __future__ import annotations

import copy
from pathlib import Path

import vdf


def load_items_game(path: Path) -> dict:
    """Parse items_game.txt into plain dicts (duplicate keys collapse to the last value)."""
    with Path(path).open(encoding="utf-8", errors="replace") as f:
        return vdf.load(f)["items_game"]


def load_tokens(path: Path) -> dict[str, str]:
    """Parse tf_english.txt. It is UTF-16 in the game; keys are case-insensitive in Source."""
    raw = Path(path).read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16")
    else:
        text = raw.decode("utf-8-sig", errors="replace")
    tokens = vdf.loads(text)["lang"]["Tokens"]
    return {k.lower(): v for k, v in tokens.items()}


def merge(dst: dict, src: dict) -> None:
    """Overlay src onto dst in place, recursing into sub-blocks the way the schema nests them."""
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            merge(dst[k], v)
        else:
            dst[k] = copy.deepcopy(v) if isinstance(v, dict) else v


def resolve_prefabs(item: dict, prefabs: dict) -> dict:
    """Apply the space-separated prefab chain left to right, then the item's own keys on top."""
    out: dict = {}
    for name in str(item.get("prefab", "")).split():
        if name in prefabs:
            merge(out, resolve_prefabs(prefabs[name], prefabs))
    merge(out, item)
    return out


def localized_name(item: dict, tokens: dict[str, str]) -> str:
    """The English display name: a leading '#' means a localisation token."""
    raw = item.get("item_name") or item.get("name") or ""
    if raw.startswith("#"):
        raw = tokens.get(raw[1:].lower(), raw)
    return raw


def iter_items(schema: dict, tokens: dict[str, str]):
    """Yield (defindex, fully inherited definition, English name) for every real item."""
    prefabs = schema.get("prefabs") or {}
    for defindex, raw in (schema.get("items") or {}).items():
        if defindex == "default":
            continue
        try:
            number = int(defindex)
        except ValueError:
            continue
        item = resolve_prefabs(raw, prefabs)
        yield number, item, localized_name(item, tokens)
