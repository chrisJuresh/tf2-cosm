"""Resolve every Cosmetic in items_game.txt to the model files a Worn Render needs.

Reads the installed game's items_game.txt and tf_english.txt, applies prefab
inheritance the way the engine does, keeps only Cosmetics (see CONTEXT.md), and
emits one render job per (Cosmetic, Class, Style) with the model path, the class
bodygroups to hide and the RED/BLU skin indices. Model paths are checked against
the game's VPK index so missing models are reported rather than discovered mid-render.

Usage:
    python render/resolve.py [--tf <path to .../Team Fortress 2/tf>] [--only NAME ...]
        [--out jobs.json]
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
from collections import Counter
from pathlib import Path

import vdf
import vpk

DEFAULT_TF = Path("C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf")
ALL_CLASSES = ["scout", "soldier", "pyro", "demoman", "heavy", "engineer", "medic", "sniper", "spy"]
MEDAL_TYPES = {"#TF_Wearable_TournamentMedal", "#TF_Wearable_CommunityMedal"}
COSMETIC_SLOTS = {"head", "misc"}


def model_class_token(cls: str) -> str:
    """The engine substitutes the class name into model basenames, except Demoman -> 'demo'."""
    return "demo" if cls == "demoman" else cls


def load_items_game(path: Path) -> dict:
    # Plain dicts: duplicate keys (rare in items_game) collapse to the last value, and deepcopy works.
    with path.open(encoding="utf-8", errors="replace") as f:
        return vdf.load(f)["items_game"]


def load_tokens(path: Path) -> dict[str, str]:
    """tf_english.txt is UTF-16; keys are case-insensitive in Source."""
    raw = path.read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16")
    else:
        text = raw.decode("utf-8", errors="replace")
    tokens = vdf.loads(text)["lang"]["Tokens"]
    return {k.lower(): v for k, v in tokens.items()}


def merge(dst: dict, src: dict) -> None:
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
    raw = item.get("item_name") or item.get("name") or ""
    if raw.startswith("#"):
        raw = tokens.get(raw[1:].lower(), raw)
    return raw


def display_name(name: str) -> str:
    return name[4:] if name.lower().startswith("the ") else name


def is_cosmetic(item: dict) -> bool:
    return (
        item.get("item_class") == "tf_wearable"
        and item.get("item_slot") in COSMETIC_SLOTS
        and item.get("item_type_name") not in MEDAL_TYPES
    )


def never_tradable(item: dict) -> bool:
    """True when every copy is untradable: the 'cannot trade' attribute is baked into the definition."""
    for block in ("attributes", "static_attrs"):
        attrs = item.get(block) or {}
        for key, val in attrs.items():
            if key.lower() == "cannot trade":
                value = val.get("value") if isinstance(val, dict) else val
                if str(value) == "1":
                    return True
    return False


def classes_for(item: dict) -> list[str]:
    ubc = item.get("used_by_classes")
    if not ubc:
        return list(ALL_CLASSES)
    return [c.lower() for c in ubc.keys() if c.lower() in ALL_CLASSES]


def model_for(source: dict, cls: str) -> str | None:
    """Model path for one class from a block carrying model_player / model_player_per_class."""
    ppc = source.get("model_player_per_class")
    if isinstance(ppc, dict):
        explicit = {k.lower(): v for k, v in ppc.items()}
        if cls in explicit:
            return explicit[cls]
        if "basename" in explicit:
            return explicit["basename"].replace("%s", model_class_token(cls))
    return source.get("model_player") or None


def bodygroups_hidden(visuals: dict, style: dict | None) -> list[str]:
    hidden = {k for k, v in (visuals.get("player_bodygroups") or {}).items() if str(v) == "1"}
    if style:
        hidden |= set((style.get("additional_hidden_bodygroups") or {}).keys())
    return sorted(hidden)


def styles_of(item: dict) -> list[tuple[int, dict | None]]:
    styles = (item.get("visuals") or {}).get("styles")
    if not isinstance(styles, dict) or not styles:
        return [(0, None)]
    out = []
    for key, style in styles.items():
        if isinstance(style, dict):
            try:
                out.append((int(key), style))
            except ValueError:
                continue
    return sorted(out, key=lambda t: t[0]) or [(0, None)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tf", type=Path, default=DEFAULT_TF)
    ap.add_argument("--only", nargs="*", default=None, help="display names to keep (case-insensitive)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    ig = load_items_game(args.tf / "scripts/items/items_game.txt")
    tokens = load_tokens(args.tf / "resource/tf_english.txt")
    prefabs = ig["prefabs"]
    misc = vpk.open(str(args.tf / "tf2_misc_dir.vpk"))
    vpk_paths = {p.lower(): p for p in misc}

    only = {n.lower() for n in args.only} if args.only else None
    stats: Counter = Counter()
    jobs: list[dict] = []
    problems: list[tuple] = []
    by_name: dict[str, list[str]] = {}

    for defindex, raw in ig["items"].items():
        if defindex == "default":
            continue
        item = resolve_prefabs(raw, prefabs)
        if not is_cosmetic(item):
            continue
        stats["cosmetics_incl_never_tradable"] += 1
        name = display_name(localized_name(item, tokens))
        if never_tradable(item):
            stats["never_tradable"] += 1
            if stats["never_tradable"] <= 8:
                problems.append(("never-tradable (excluded)", defindex, name))
            continue
        visuals = item.get("visuals") or {}
        classes = classes_for(item)
        model_sources = [item] + [s for _, s in styles_of(item) if s]
        if not any(model_for(src, cls) for src in model_sources for cls in classes):
            # Craft components and tokens share the wearable item class but have nothing to wear.
            stats["no_player_model (excluded)"] += 1
            problems.append(("no player model (excluded)", defindex, name))
            continue
        stats["cosmetics"] += 1
        by_name.setdefault(name, []).append(defindex)
        if only is not None and name.lower() not in only:
            continue

        stats[f"classes={len(classes)}"] += 1
        for style_index, style in styles_of(item):
            has_own_model = bool(style) and ("model_player" in style or "model_player_per_class" in style)
            source = style if has_own_model else item
            for cls in classes:
                path = model_for(source, cls)
                if not path:
                    problems.append(("no model", defindex, name, cls, style_index))
                    stats["no_model"] += 1
                    continue
                key = path.lower()
                if key in vpk_paths:
                    path = vpk_paths[key]
                else:
                    alt = None
                    if cls == "demoman":
                        alt = path.lower().replace("/demo/", "/demoman/").replace("demo_", "demoman_")
                    if alt and alt in vpk_paths:
                        path = vpk_paths[alt]
                        stats["demoman_alias_fallback"] += 1
                    else:
                        problems.append(("model missing", defindex, name, cls, style_index, path))
                        stats["model_missing"] += 1
                        continue
                regions = sorted((item.get("equip_regions") or {}).keys()) or [item.get("equip_region")]
                jobs.append(
                    {
                        "name": name,
                        "defindex": int(defindex),
                        "class": cls,
                        "style": style_index,
                        "style_name": (style or {}).get("name"),
                        "model": path,
                        "hide_bodygroups": bodygroups_hidden(visuals, style),
                        "skin_red": int((style or {}).get("skin_red", 0)),
                        "skin_blu": int((style or {}).get("skin_blu", 1)),
                        "slot": item.get("item_slot"),
                        "equip_region": regions,
                        "paintable": (item.get("capabilities") or {}).get("paintable") == "1",
                    }
                )
                stats["jobs"] += 1

    dupes = {n: d for n, d in by_name.items() if len(d) > 1}
    stats["names"] = len(by_name)
    stats["names_with_multiple_defindex"] = len(dupes)

    print("stats:", json.dumps(dict(sorted(stats.items())), indent=1))
    print("names with several defindexes (first 12):", json.dumps(dict(list(dupes.items())[:12]), indent=1))
    print(f"problems ({len(problems)}), first 20:")
    for p in problems[:20]:
        print("  ", p)
    if args.out:
        args.out.write_text(json.dumps(jobs, indent=1), encoding="utf-8")
        print(f"wrote {len(jobs)} jobs to {args.out}")
    else:
        for j in jobs[:40]:
            print(json.dumps(j))
    return 0


if __name__ == "__main__":
    sys.exit(main())
