"""Which jobs a run renders, and on which Teams.

The job list holds one job per Cosmetic, Class and Style; a Team is not a job because both
Teams come from the same import with a material swap, so a run is the selected jobs times the
Teams asked for — one image each.
"""
from __future__ import annotations

from typing import Iterable, Sequence

from render.scene import TEAMS


class NothingSelected(Exception):
    """The filters matched no job, which is a mistake worth stopping for, not an empty run."""


def select_jobs(
    document: dict,
    *,
    slugs: Iterable[str] | None = None,
    classes: Iterable[str] | None = None,
    styles: Iterable[int] | None = None,
) -> list[dict]:
    """The jobs in `document` matching every filter given, in job-list order."""
    wanted_slugs = {slug.lower() for slug in slugs} if slugs else None
    wanted_classes = {cls.lower() for cls in classes} if classes else None
    wanted_styles = set(styles) if styles is not None else None

    selected = [
        job
        for job in document["jobs"]
        if (wanted_slugs is None or job["slug"] in wanted_slugs)
        and (wanted_classes is None or job["class"] in wanted_classes)
        and (wanted_styles is None or job["style"] in wanted_styles)
    ]
    if not selected:
        asked = ", ".join(
            part
            for part in (
                f"slugs {sorted(wanted_slugs)}" if wanted_slugs else "",
                f"classes {sorted(wanted_classes)}" if wanted_classes else "",
                f"styles {sorted(wanted_styles)}" if wanted_styles else "",
            )
            if part
        )
        raise NothingSelected(f"no job matches {asked or 'the job list'}")
    return selected


def selected_teams(teams: Sequence[str]) -> list[str]:
    """The Teams to render, in the order given, refusing anything that is not a Team."""
    for team in teams:
        if team not in TEAMS:
            raise ValueError(f"unknown Team {team!r}")
    return list(teams)
