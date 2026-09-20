"""The job list: the resolve step's output and the render step's input.

Shape, version 1:

    {
      "version": 1,                       # JOB_LIST_VERSION; a bump means the render step must re-read
      "source": "<where the schema came from>",
      "job_count": <int>,                 # == len(jobs)
      "jobs": [
        {
          "name": "Team Captain",         # English name, leading "The" removed (ADR-0003)
          "slug": "team-captain",         # URL-safe stable identifier
          "defindex": 378,                # the alias the render uses (its model resolves)
          "aliases": [378, 30370],        # every defindex sharing the name, ascending
          "class": "soldier",             # one of render.cosmetics.ALL_CLASSES
          "style": 0,                     # Style index; 0 is the default Style
          "style_name": "Open" | null,    # the Style's name where it has one
          "model": "models/...mdl",       # as spelled in the game archive
          "hide_bodygroups": ["hat"],     # class bodygroups this job hides
          "skin_red": 0, "skin_blu": 1,   # skin family per Team
          "slot": "head" | "misc",
          "equip_regions": ["hat"],       # drives bust vs body framing
          "paintable": false
        }
      ]
    }

Nothing downstream should reach past this shape into items_game.
"""
from __future__ import annotations

from render.cosmetics import ALL_CLASSES

JOB_LIST_VERSION = 1

JOB_FIELD_TYPES: dict[str, type | tuple[type, ...]] = {
    "name": str,
    "slug": str,
    "defindex": int,
    "aliases": list,
    "class": str,
    "style": int,
    "style_name": (str, type(None)),
    "model": str,
    "hide_bodygroups": list,
    "skin_red": int,
    "skin_blu": int,
    "slot": str,
    "equip_regions": list,
    "paintable": bool,
}


class InvalidJobList(Exception):
    """The job list does not match the documented shape; it must not be written or rendered."""


def job_list(jobs: list[dict], *, source: str) -> dict:
    return {
        "version": JOB_LIST_VERSION,
        "source": source,
        "job_count": len(jobs),
        "jobs": jobs,
    }


def validate_job_list(document: object) -> None:
    """Raise InvalidJobList unless `document` is a version-1 job list, field by field."""
    if not isinstance(document, dict):
        raise InvalidJobList(f"job list must be an object, got {type(document).__name__}")
    if document.get("version") != JOB_LIST_VERSION:
        raise InvalidJobList(f"unsupported job list version {document.get('version')!r}")
    jobs = document.get("jobs")
    if not isinstance(jobs, list):
        raise InvalidJobList("job list has no 'jobs' array")
    if document.get("job_count") != len(jobs):
        raise InvalidJobList(f"job_count {document.get('job_count')!r} != {len(jobs)} jobs")

    seen: set[tuple] = set()
    for index, job in enumerate(jobs):
        where = f"job {index}"
        if not isinstance(job, dict):
            raise InvalidJobList(f"{where} is not an object")
        unknown = set(job) - set(JOB_FIELD_TYPES)
        if unknown:
            raise InvalidJobList(f"{where} has unknown fields {sorted(unknown)}")
        for field, expected in JOB_FIELD_TYPES.items():
            if field not in job:
                raise InvalidJobList(f"{where} is missing {field!r}")
            value = job[field]
            if isinstance(expected, type) and expected is int and isinstance(value, bool):
                raise InvalidJobList(f"{where} field {field!r} must be an int, got a bool")
            if not isinstance(value, expected):
                raise InvalidJobList(f"{where} field {field!r} has type {type(value).__name__}")
        if job["class"] not in ALL_CLASSES:
            raise InvalidJobList(f"{where} has unknown class {job['class']!r}")
        if not job["slug"]:
            raise InvalidJobList(f"{where} has an empty slug")
        if job["defindex"] not in job["aliases"]:
            raise InvalidJobList(f"{where} renders defindex {job['defindex']} which is not an alias")
        if not job["model"].endswith(".mdl"):
            raise InvalidJobList(f"{where} model {job['model']!r} is not a .mdl path")
        key = (job["slug"], job["class"], job["style"])
        if key in seen:
            raise InvalidJobList(f"{where} duplicates an earlier job for {key}")
        seen.add(key)
