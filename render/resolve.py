"""Resolve the installed game's items into the job list a Worn Render run consumes.

Reads items_game.txt and tf_english.txt, applies the Cosmetic rule and the identity rule
(see `render.cosmetics`), checks every model against the game archive, and emits the
versioned job list documented in `render.jobs` — one job per Cosmetic, Class and Style.

Usage:
    python -m render.resolve --dry-run
    python -m render.resolve --out jobs.json [--tf <path to .../Team Fortress 2/tf>] [--only NAME ...]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from render.cosmetics import (
    ALL_CLASSES,
    classes_for,
    display_name,
    equip_regions,
    has_any_worn_model,
    hidden_bodygroups,
    is_medal,
    is_paintable,
    model_for,
    never_tradable,
    slug,
    style_has_own_model,
    styles_of,
    team_skins,
    wears_in_cosmetic_slot,
)
from render.items_game import iter_items, load_items_game, load_tokens, localized_name
from render.jobs import job_list, validate_job_list
from render.model_index import ModelIndex

DEFAULT_TF = Path("C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf")

REASON_MEDAL = "medal"
REASON_NEVER_TRADABLE = "never-tradable"
REASON_NO_MODEL = "no-model"
REASONS = (REASON_MEDAL, REASON_NEVER_TRADABLE, REASON_NO_MODEL)


class CosmeticNameCollision(Exception):
    """Two genuinely different items share a display name, so identity by name is ambiguous."""


@dataclass(frozen=True)
class Exclusion:
    defindex: int
    name: str
    reason: str
    detail: str | None = None


@dataclass(frozen=True)
class Resolution:
    jobs: list[dict] = field(default_factory=list)
    exclusions: list[Exclusion] = field(default_factory=list)

    @property
    def cosmetics(self) -> list[str]:
        """The display names that produced at least one job, in the order they were emitted."""
        seen: dict[str, None] = {}
        for job in self.jobs:
            seen.setdefault(job["name"], None)
        return list(seen)

    @property
    def all_class_cosmetics(self) -> list[str]:
        by_name: dict[str, set[str]] = {}
        for job in self.jobs:
            by_name.setdefault(job["name"], set()).add(job["class"])
        return [name for name, classes in by_name.items() if len(classes) == len(ALL_CLASSES)]

    @property
    def jobs_by_class(self) -> dict[str, int]:
        counts = Counter(job["class"] for job in self.jobs)
        return {cls: counts.get(cls, 0) for cls in ALL_CLASSES}

    @property
    def exclusions_by_reason(self) -> dict[str, int]:
        counts = Counter(exclusion.reason for exclusion in self.exclusions)
        return {reason: counts.get(reason, 0) for reason in REASONS}


def _resolve_model_path(path: str, cls: str, index: ModelIndex) -> str | None:
    """The archive's spelling of a model path, allowing for the demo/demoman folder split."""
    found = index.resolve(path)
    if found or cls != "demoman":
        return found
    alias = path.lower().replace("/demo/", "/demoman/").replace("demo_", "demoman_")
    return index.resolve(alias)


def _style_name(style: dict | None, tokens: dict[str, str]) -> str | None:
    """A Style's English name; the schema names it with a localisation token."""
    return (localized_name(style, tokens) or None) if style else None


def _jobs_for_item(
    item: dict, name: str, defindex: int, index: ModelIndex, tokens: dict[str, str]
) -> tuple[list[dict], list[Exclusion]]:
    """Every job one item definition would produce, plus an exclusion per model the game lacks."""
    jobs: list[dict] = []
    missing: list[Exclusion] = []
    classes = classes_for(item)
    regions = equip_regions(item)
    paintable = is_paintable(item)
    for style_index, style in styles_of(item):
        source = style if style is not None and style_has_own_model(style) else item
        skin_red, skin_blu = team_skins(item, style)
        hidden = hidden_bodygroups(item, style)
        for cls in classes:
            wanted = model_for(source, cls)
            found = _resolve_model_path(wanted, cls, index) if wanted else None
            if not found:
                missing.append(
                    Exclusion(
                        defindex,
                        name,
                        REASON_NO_MODEL,
                        f"{cls} style {style_index}: {wanted or 'no model path'}",
                    )
                )
                continue
            jobs.append(
                {
                    "name": name,
                    "slug": slug(name),
                    "defindex": defindex,
                    "aliases": [defindex],
                    "class": cls,
                    "style": style_index,
                    "style_name": _style_name(style, tokens),
                    "model": found,
                    "hide_bodygroups": hidden,
                    "skin_red": skin_red,
                    "skin_blu": skin_blu,
                    "slot": item.get("item_slot"),
                    "equip_regions": regions,
                    "paintable": paintable,
                }
            )
    return jobs, missing


def _check_for_collision(name: str, candidates: dict[int, list[dict]]) -> None:
    """Defindexes sharing a name are aliases only if they wear something in common (ADR-0003)."""
    models = {defindex: {job["model"].lower() for job in jobs} for defindex, jobs in candidates.items() if jobs}
    defindexes = sorted(models)
    for left in defindexes:
        for right in defindexes:
            if left < right and models[left].isdisjoint(models[right]):
                raise CosmeticNameCollision(
                    f"{name!r} is used by two items with no model in common: "
                    f"{left} wears {sorted(models[left])}, {right} wears {sorted(models[right])}"
                )


def resolve(schema: dict, tokens: dict[str, str], index: ModelIndex, only: set[str] | None = None) -> Resolution:
    """Apply the Cosmetic rule and the identity rule to a parsed schema and emit the jobs."""
    exclusions: list[Exclusion] = []
    by_name: dict[str, dict[int, dict]] = {}

    for defindex, item, raw_name in iter_items(schema, tokens):
        if not wears_in_cosmetic_slot(item):
            continue
        name = display_name(raw_name)
        if is_medal(item):
            exclusions.append(Exclusion(defindex, name, REASON_MEDAL))
            continue
        if never_tradable(item):
            exclusions.append(Exclusion(defindex, name, REASON_NEVER_TRADABLE))
            continue
        if not has_any_worn_model(item):
            exclusions.append(Exclusion(defindex, name, REASON_NO_MODEL, "no model in the definition"))
            continue
        by_name.setdefault(name, {})[defindex] = item

    jobs: list[dict] = []
    for name in sorted(by_name):
        aliases = sorted(by_name[name])
        candidates = {
            defindex: _jobs_for_item(by_name[name][defindex], name, defindex, index, tokens)
            for defindex in aliases
        }
        _check_for_collision(name, {defindex: pair[0] for defindex, pair in candidates.items()})
        # ADR-0003: render the first alias whose models resolve; fall back to the least incomplete.
        chosen = min(aliases, key=lambda d: (len(candidates[d][1]), d))
        chosen_jobs, chosen_missing = candidates[chosen]
        if not chosen_jobs:
            exclusions.append(Exclusion(chosen, name, REASON_NO_MODEL, "no model resolves in the game archive"))
            continue
        exclusions.extend(chosen_missing)
        if only is not None and name.lower() not in only:
            continue
        for job in chosen_jobs:
            job["aliases"] = aliases
        jobs.extend(chosen_jobs)

    return Resolution(jobs, exclusions)


def resolve_installed_game(tf: Path, only: set[str] | None = None) -> Resolution:
    from render.model_index import VpkModelIndex

    schema = load_items_game(tf / "scripts/items/items_game.txt")
    tokens = load_tokens(tf / "resource/tf_english.txt")
    return resolve(schema, tokens, VpkModelIndex(tf / "tf2_misc_dir.vpk"), only)


def print_dry_run(result: Resolution) -> None:
    print(f"Cosmetics:  {len(result.cosmetics)}")
    print(f"All-Class:  {len(result.all_class_cosmetics)}")
    print(f"jobs:       {len(result.jobs)}")
    print("jobs by class:")
    for cls, count in result.jobs_by_class.items():
        print(f"  {cls:<9} {count}")
    print("exclusions by reason:")
    for reason, count in result.exclusions_by_reason.items():
        print(f"  {reason:<14} {count}")
    print(f"excluded items ({len(result.exclusions)}):")
    for exclusion in result.exclusions:
        detail = f": {exclusion.detail}" if exclusion.detail else ""
        print(f"  {exclusion.defindex:>6}  {exclusion.name:<40} {exclusion.reason}{detail}")
    print("jobs:")
    for job in result.jobs:
        print(f"  {job['slug']:<40} {job['class']:<9} style {job['style']}  {job['model']}")


def write_job_list(result: Resolution, out: Path, source: str) -> dict:
    """Validate the job list, then write it. An invalid list is never written."""
    document = job_list(result.jobs, source=source)
    validate_job_list(document)
    out.write_text(json.dumps(document, indent=1), encoding="utf-8")
    return document


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tf", type=Path, default=DEFAULT_TF, help="the game's tf folder")
    parser.add_argument("--only", nargs="*", default=None, help="display names to keep (case-insensitive)")
    parser.add_argument("--out", type=Path, default=None, help="where to write the job list")
    parser.add_argument("--dry-run", action="store_true", help="list the jobs and exclusions, write nothing")
    args = parser.parse_args(argv)

    if not args.dry_run and args.out is None:
        parser.error("give --out to write a job list, or --dry-run to only report")

    only = {n.lower() for n in args.only} if args.only else None
    result = resolve_installed_game(args.tf, only)

    if args.dry_run:
        print_dry_run(result)
        return 0

    write_job_list(result, args.out, source=str(args.tf))
    print(f"wrote {len(result.jobs)} jobs for {len(result.cosmetics)} Cosmetics to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
