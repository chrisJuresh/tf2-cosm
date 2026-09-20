"""The manifest: the render job's output as the site reads it.

Shape, version 1:

    {
      "version": 1,                       # MANIFEST_VERSION
      "renders": {
        "team-captain": {                 # Cosmetic slug (ADR-0003)
          "soldier": {                    # Class
            "red": {                      # Team
              "0": {                      # Style index, as a string (JSON object keys are strings)
                "path": "team-captain/soldier-red-0.png",   # relative to the output root
                "width": 1024, "height": 1024,
                "model": "models/player/items/soldier/soldier_officer.mdl",
                "style_name": null,
                "rendered_at": "2026-09-20T12:00:00+00:00",
                "job_version": 1,         # the job list version this render was made from
                "team_fallback": false    # true when BLU was asked for and RED was rendered
              }
            }
          }
        }
      },
      "failures": [
        {"slug", "class", "team", "style", "model", "reason", "detail", "failed_at"}
      ]
    }

The manifest is written atomically and committed; the images are not (ADR-0001). A Cosmetic
with no entry and no failure has simply not been rendered yet; the site falls back to the
Backpack Icon for anything it cannot find here.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from render.cosmetics import ALL_CLASSES
from render.jobs import JOB_LIST_VERSION
from render.scene import TEAMS

MANIFEST_VERSION = 1

REASON_MODEL_MISSING = "model-missing"
REASON_IMPORT_ERROR = "import-error"
REASON_RENDER_ERROR = "render-error"
REASON_NO_SKELETON = "no-skeleton"
FAILURE_REASONS = (
    REASON_MODEL_MISSING,
    REASON_IMPORT_ERROR,
    REASON_RENDER_ERROR,
    REASON_NO_SKELETON,
)

ENTRY_FIELD_TYPES: dict[str, type | tuple[type, ...]] = {
    "path": str,
    "width": int,
    "height": int,
    "model": str,
    "style_name": (str, type(None)),
    "rendered_at": str,
    "job_version": int,
    "team_fallback": bool,
}

FAILURE_FIELD_TYPES: dict[str, type | tuple[type, ...]] = {
    "slug": str,
    "class": str,
    "team": str,
    "style": int,
    "model": str,
    "reason": str,
    "detail": (str, type(None)),
    "failed_at": str,
}


def image_relpath(job: dict, team: str) -> str:
    """Where one render lives under the output root: the manifest's own path convention."""
    return f"{job['slug']}/{job['class']}-{team}-{job['style']}.png"


class InvalidManifest(Exception):
    """The manifest does not match the documented shape; it must not be written or published."""


class Manifest:
    """The renders and failures known so far, added to one job at a time."""

    def __init__(self, document: dict | None = None) -> None:
        self._document = document or {"version": MANIFEST_VERSION, "renders": {}, "failures": []}

    def to_document(self) -> dict:
        """The live document — validated on write, so callers may read but should not rewrite it."""
        return self._document

    def entry(self, slug: str, cls: str, team: str, style: int) -> dict | None:
        return (
            self._document["renders"]
            .get(slug, {})
            .get(cls, {})
            .get(team, {})
            .get(str(style))
        )

    def record(
        self,
        job: dict,
        team: str,
        *,
        path: str,
        width: int,
        height: int,
        at: str,
        fell_back_to_red: bool = False,
    ) -> dict:
        """Record one rendered image, replacing any earlier render or failure for the same job."""
        self._check_team(team)
        entry = {
            "path": path,
            "width": width,
            "height": height,
            "model": job["model"],
            "style_name": job["style_name"],
            "rendered_at": at,
            "job_version": JOB_LIST_VERSION,
            "team_fallback": fell_back_to_red,
        }
        renders = self._document["renders"]
        by_class = renders.setdefault(job["slug"], {}).setdefault(job["class"], {})
        by_class.setdefault(team, {})[str(job["style"])] = entry
        self._forget_failure(job, team)
        return entry

    def fail(self, job: dict, team: str, *, reason: str, detail: str | None, at: str) -> dict:
        """Record why one job produced no image, so the site can fall back and the run can go on."""
        self._check_team(team)
        if reason not in FAILURE_REASONS:
            raise ValueError(f"unknown failure reason {reason!r}")
        self._forget_failure(job, team)
        failure = {
            "slug": job["slug"],
            "class": job["class"],
            "team": team,
            "style": job["style"],
            "model": job["model"],
            "reason": reason,
            "detail": detail,
            "failed_at": at,
        }
        self._document["failures"].append(failure)
        return failure

    def write(self, out: Path) -> None:
        """Validate, then replace the file in one step, so a crash never leaves half a manifest."""
        validate_manifest(self._document)
        out.parent.mkdir(parents=True, exist_ok=True)
        temporary = out.with_name(out.name + ".tmp")
        temporary.write_text(json.dumps(self._document, indent=1, sort_keys=True), encoding="utf-8")
        os.replace(temporary, out)

    @staticmethod
    def _check_team(team: str) -> None:
        if team not in TEAMS:
            raise ValueError(f"unknown Team {team!r}")

    def _forget_failure(self, job: dict, team: str) -> None:
        identity = (job["slug"], job["class"], team, job["style"])
        self._document["failures"] = [
            failure
            for failure in self._document["failures"]
            if (failure["slug"], failure["class"], failure["team"], failure["style"]) != identity
        ]


def load_manifest(path: Path) -> Manifest:
    """The manifest at `path`, or an empty one when nothing has been rendered yet."""
    if not path.exists():
        return Manifest()
    document = json.loads(path.read_text(encoding="utf-8"))
    validate_manifest(document)
    return Manifest(document)


def _check_fields(where: str, record: object, types: dict[str, type | tuple[type, ...]]) -> None:
    if not isinstance(record, dict):
        raise InvalidManifest(f"{where} is not an object")
    unknown = set(record) - set(types)
    if unknown:
        raise InvalidManifest(f"{where} has unknown fields {sorted(unknown)}")
    for field, expected in types.items():
        if field not in record:
            raise InvalidManifest(f"{where} is missing {field!r}")
        value = record[field]
        if expected is int and isinstance(value, bool):
            raise InvalidManifest(f"{where} field {field!r} must be an int, got a bool")
        if not isinstance(value, expected):
            raise InvalidManifest(f"{where} field {field!r} has type {type(value).__name__}")


def validate_manifest(document: object) -> None:
    """Raise InvalidManifest unless `document` is a version-1 manifest, entry by entry."""
    if not isinstance(document, dict):
        raise InvalidManifest(f"manifest must be an object, got {type(document).__name__}")
    if document.get("version") != MANIFEST_VERSION:
        raise InvalidManifest(f"unsupported manifest version {document.get('version')!r}")
    renders = document.get("renders")
    if not isinstance(renders, dict):
        raise InvalidManifest("manifest has no 'renders' object")
    failures = document.get("failures")
    if not isinstance(failures, list):
        raise InvalidManifest("manifest has no 'failures' array")

    for slug, by_class in renders.items():
        if not isinstance(by_class, dict):
            raise InvalidManifest(f"{slug!r} is not an object of Classes")
        for cls, by_team in by_class.items():
            if cls not in ALL_CLASSES:
                raise InvalidManifest(f"{slug!r} has unknown class {cls!r}")
            if not isinstance(by_team, dict):
                raise InvalidManifest(f"{slug}/{cls} is not an object of Teams")
            for team, by_style in by_team.items():
                if team not in TEAMS:
                    raise InvalidManifest(f"{slug}/{cls} has unknown Team {team!r}")
                if not isinstance(by_style, dict):
                    raise InvalidManifest(f"{slug}/{cls}/{team} is not an object of Styles")
                for style, entry in by_style.items():
                    where = f"{slug}/{cls}/{team}/{style}"
                    if not style.isdigit():
                        raise InvalidManifest(f"{where} is not a Style index")
                    _check_fields(where, entry, ENTRY_FIELD_TYPES)

    for index, failure in enumerate(failures):
        where = f"failure {index}"
        _check_fields(where, failure, FAILURE_FIELD_TYPES)
        if failure["class"] not in ALL_CLASSES:
            raise InvalidManifest(f"{where} has unknown class {failure['class']!r}")
        if failure["team"] not in TEAMS:
            raise InvalidManifest(f"{where} has unknown Team {failure['team']!r}")
        if failure["reason"] not in FAILURE_REASONS:
            raise InvalidManifest(f"{where} has unknown failure reason {failure['reason']!r}")
