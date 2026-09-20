"""The Cosmetic rule and a Cosmetic's identity.

A Cosmetic (CONTEXT.md) is a wearable item in a head or misc slot, not a Medal, tradable in
at least some copies, with a model worn on the Class either at item level or in a Style.
Identity follows ADR-0003: the English name, with defindexes sharing it recorded as aliases.
"""
from __future__ import annotations

import re

ALL_CLASSES = ("scout", "soldier", "pyro", "demoman", "heavy", "engineer", "medic", "sniper", "spy")
COSMETIC_SLOTS = {"head", "misc"}
MEDAL_TYPES = {"#TF_Wearable_TournamentMedal", "#TF_Wearable_CommunityMedal"}


def model_class_token(cls: str) -> str:
    """The engine substitutes the class name into model basenames, except Demoman -> 'demo'."""
    return "demo" if cls == "demoman" else cls


def display_name(name: str) -> str:
    """The catalogue name: a leading 'The' is part of the game's prose, not the item's name."""
    return name[4:] if name.lower().startswith("the ") else name


def slug(name: str) -> str:
    """A URL-safe stable identifier derived from the display name (ADR-0003)."""
    ascii_name = name.replace("'", "").replace("’", "")
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", ascii_name.lower())).strip("-")


def wears_in_cosmetic_slot(item: dict) -> bool:
    """A wearable in a head or misc slot: everything the resolve step even looks at."""
    return item.get("item_class") == "tf_wearable" and item.get("item_slot") in COSMETIC_SLOTS


def is_medal(item: dict) -> bool:
    return item.get("item_type_name") in MEDAL_TYPES


def never_tradable(item: dict) -> bool:
    """True when every copy is untradable: 'cannot trade' is baked into the definition."""
    for block in ("attributes", "static_attrs"):
        for key, val in (item.get(block) or {}).items():
            if key.lower() == "cannot trade":
                value = val.get("value") if isinstance(val, dict) else val
                if str(value) == "1":
                    return True
    return False


def classes_for(item: dict) -> list[str]:
    """The Classes that can wear the item; an absent used_by_classes means All-Class."""
    used_by = item.get("used_by_classes")
    if not used_by:
        return list(ALL_CLASSES)
    named = {c.lower() for c in used_by.keys()}
    return [c for c in ALL_CLASSES if c in named]


def model_for(source: dict, cls: str) -> str | None:
    """Model path for one Class from a block carrying model_player / model_player_per_class."""
    per_class = source.get("model_player_per_class")
    if isinstance(per_class, dict):
        explicit = {k.lower(): v for k, v in per_class.items()}
        if cls in explicit:
            return explicit[cls]
        basename = explicit.get("basename")
        if basename:
            return basename.replace("%s", model_class_token(cls))
    return source.get("model_player") or None


def styles_of(item: dict) -> list[tuple[int, dict | None]]:
    """Every Style of the item, lowest index first. An item without Styles has the default one."""
    styles = (item.get("visuals") or {}).get("styles")
    if not isinstance(styles, dict) or not styles:
        return [(0, None)]
    out = []
    for key, style in styles.items():
        if not isinstance(style, dict):
            continue
        try:
            out.append((int(key), style))
        except ValueError:
            continue
    return sorted(out, key=lambda pair: pair[0]) or [(0, None)]


def style_has_own_model(style: dict | None) -> bool:
    return style is not None and ("model_player" in style or "model_player_per_class" in style)


def has_any_worn_model(item: dict) -> bool:
    """A Cosmetic must be worn somewhere: at item level or in one of its Styles."""
    sources = [item] + [s for _, s in styles_of(item) if s]
    return any(model_for(source, cls) for source in sources for cls in classes_for(item))


def hidden_bodygroups(item: dict, style: dict | None) -> list[str]:
    """Class bodygroups this Cosmetic hides: the item's, plus the Style's additions."""
    visuals = item.get("visuals") or {}
    hidden = {k for k, v in (visuals.get("player_bodygroups") or {}).items() if str(v) == "1"}
    if style:
        hidden |= set((style.get("additional_hidden_bodygroups") or {}).keys())
    return sorted(hidden)


def equip_regions(item: dict) -> list[str]:
    regions = item.get("equip_regions")
    if isinstance(regions, dict) and regions:
        return sorted(regions.keys())
    single = item.get("equip_region")
    return [single] if single else []


def team_skins(item: dict, style: dict | None) -> tuple[int, int]:
    """The RED and BLU skin indices: the Style's if it names them, else the item's, else 0 and 1."""
    sources: list[dict] = [style] if style else []
    sources += [item, item.get("visuals") or {}]
    for source in sources:
        if "skin_red" in source or "skin_blu" in source:
            return int(source.get("skin_red", 0)), int(source.get("skin_blu", 1))
    return 0, 1


def is_paintable(item: dict) -> bool:
    return (item.get("capabilities") or {}).get("paintable") == "1"
