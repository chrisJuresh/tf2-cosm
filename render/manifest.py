"""The manifest: the render job's output as the site reads it, and the contract it reads it by.

Shape, version 2:

    {
      "version": 2,                       # MANIFEST_VERSION
      "renders": {
        "team-captain": {                 # Cosmetic slug (ADR-0003)
          "soldier": {                    # Class
            "red": {                      # Team
              "0": {                      # Style index, as a string (JSON object keys are strings)
                "master": {               # the 1024 PNG, kept locally, never committed
                  "path": "masters/team-captain/soldier-red-0.png",  # relative to the output root
                  "width": 1024, "height": 1024
                },
                "derivatives": {          # one per web size, keyed by the size in pixels
                  "512": {"path": "web/team-captain/soldier-red-0@512.webp",
                          "width": 512, "height": 512},
                  "256": {"path": "web/team-captain/soldier-red-0@256.webp",
                          "width": 256, "height": 256}
                },
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
        {"slug", "class", "team", "style", "model", "reason", "detail", "failed_at",
         "job_version"}
      ]
    }

Every path is relative to the output root, which is configuration (`render.output`), so the
day the folder becomes a bucket the manifest does not change. Derivatives are empty between
the render step and `render.derive`, which is a separate step because Pillow is a compiled
package and Blender's Python is not the project venv.

The manifest is written atomically and committed; the images are not (ADR-0001). Alongside it
goes the JSON Schema this module generates, which is the published contract: the same field
tables drive both it and `validate_manifest`, so they cannot drift. A Cosmetic with no entry
and no failure has simply not been rendered yet; the site falls back to the Backpack Icon for
anything it cannot find here.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterator, Mapping

from render.cosmetics import ALL_CLASSES
from render.jobs import JOB_LIST_VERSION
from render.scene import TEAMS

MANIFEST_VERSION = 2

REASON_MODEL_MISSING = "model-missing"
REASON_IMPORT_ERROR = "import-error"
REASON_RENDER_ERROR = "render-error"
REASON_NO_SKELETON = "no-skeleton"
REASON_DERIVE_ERROR = "derive-error"
FAILURE_REASONS = (
    REASON_MODEL_MISSING,
    REASON_IMPORT_ERROR,
    REASON_RENDER_ERROR,
    REASON_NO_SKELETON,
    REASON_DERIVE_ERROR,
)

IMAGE_FIELD_TYPES: dict[str, type | tuple[type, ...]] = {
    "path": str,
    "width": int,
    "height": int,
}

ENTRY_FIELD_TYPES: dict[str, type | tuple[type, ...]] = {
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
    "job_version": int,
}


class InvalidManifest(Exception):
    """The manifest does not match the documented shape; it must not be written or published."""


def image_record(path: str, width: int, height: int) -> dict:
    return {"path": path, "width": width, "height": height}


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

    def failure(self, slug: str, cls: str, team: str, style: int) -> dict | None:
        """Why one job produced no image last time, or None if it has never been tried."""
        identity = (slug, cls, team, style)
        for failure in self._document["failures"]:
            if (failure["slug"], failure["class"], failure["team"], failure["style"]) == identity:
                return failure
        return None

    def failures_for(self, identities: set[tuple[str, str, str, int]]) -> list[dict]:
        """Every recorded failure among `identities`, each a (slug, Class, Team, Style) tuple."""
        return [
            failure
            for failure in self._document["failures"]
            if (failure["slug"], failure["class"], failure["team"], failure["style"]) in identities
        ]

    def entries(self) -> Iterator[tuple[str, str, str, int, dict]]:
        """Every recorded render, as (slug, Class, Team, Style, entry) — what `render.derive` walks."""
        for slug, by_class in self._document["renders"].items():
            for cls, by_team in by_class.items():
                for team, by_style in by_team.items():
                    for style, entry in by_style.items():
                        yield slug, cls, team, int(style), entry

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
        """Record one rendered master, replacing any earlier render or failure for the same job.

        The derivatives start empty: they are made from the master afterwards, outside Blender.
        """
        self._check_team(team)
        entry = {
            "master": image_record(path, width, height),
            "derivatives": {},
            "model": job["model"],
            "style_name": job["style_name"],
            "rendered_at": at,
            "job_version": JOB_LIST_VERSION,
            "team_fallback": fell_back_to_red,
        }
        renders = self._document["renders"]
        by_class = renders.setdefault(job["slug"], {}).setdefault(job["class"], {})
        by_class.setdefault(team, {})[str(job["style"])] = entry
        self.forget_failure(job["slug"], job["class"], team, job["style"])
        return entry

    def set_derivatives(
        self, slug: str, cls: str, team: str, style: int, derivatives: Mapping[str, dict]
    ) -> dict:
        """Attach the web sizes made from one master, replacing whatever was recorded before."""
        entry = self.entry(slug, cls, team, style)
        if entry is None:
            raise KeyError(f"no render recorded for {slug}/{cls}/{team}/{style}")
        entry["derivatives"] = {
            size: image_record(record["path"], record["width"], record["height"])
            for size, record in derivatives.items()
        }
        self.forget_failure(slug, cls, team, style)
        return entry

    def fail(self, job: dict, team: str, *, reason: str, detail: str | None, at: str) -> dict:
        """Record why one job produced no image, so the site can fall back and the run can go on."""
        return self.fail_render(
            job["slug"],
            job["class"],
            team,
            job["style"],
            model=job["model"],
            reason=reason,
            detail=detail,
            at=at,
        )

    def fail_render(
        self,
        slug: str,
        cls: str,
        team: str,
        style: int,
        *,
        model: str,
        reason: str,
        detail: str | None,
        at: str,
    ) -> dict:
        """The same, for a step that holds a manifest entry rather than a job — `render.derive`."""
        self._check_team(team)
        if reason not in FAILURE_REASONS:
            raise ValueError(f"unknown failure reason {reason!r}")
        self.forget_failure(slug, cls, team, style)
        failure = {
            "slug": slug,
            "class": cls,
            "team": team,
            "style": style,
            "model": model,
            "reason": reason,
            "detail": detail,
            "failed_at": at,
            "job_version": JOB_LIST_VERSION,
        }
        self._document["failures"].append(failure)
        return failure

    def forget_failure(self, slug: str, cls: str, team: str, style: int) -> None:
        """Drop any failure recorded for one job, because it has just been done successfully."""
        identity = (slug, cls, team, style)
        self._document["failures"] = [
            failure
            for failure in self._document["failures"]
            if (failure["slug"], failure["class"], failure["team"], failure["style"]) != identity
        ]

    def write(self, out: Path) -> None:
        """Validate, then replace the file in one step, so a crash never leaves half a manifest.

        The schema is written beside it, the way the catalogue job publishes its own.
        """
        validate_manifest(self._document)
        out.parent.mkdir(parents=True, exist_ok=True)
        _replace(out, json.dumps(self._document, indent=1, sort_keys=True))
        _replace(schema_path(out), json.dumps(manifest_json_schema(), indent=2, sort_keys=True))

    @staticmethod
    def _check_team(team: str) -> None:
        if team not in TEAMS:
            raise ValueError(f"unknown Team {team!r}")


def _replace(out: Path, text: str) -> None:
    """Write `text` to `out` atomically: a reader sees the old file or the new one, never half."""
    temporary = out.with_name(out.name + ".tmp")
    temporary.write_text(text + "\n", encoding="utf-8")
    os.replace(temporary, out)


def schema_path(manifest: Path) -> Path:
    """Where the published schema sits beside a manifest file."""
    return manifest.with_name(f"{manifest.stem}.v{MANIFEST_VERSION}.schema.json")


def load_manifest(path: Path) -> Manifest:
    """The manifest at `path`, or an empty one when nothing has been rendered yet."""
    if not path.exists():
        return Manifest()
    document = json.loads(path.read_text(encoding="utf-8"))
    validate_manifest(document)
    return Manifest(document)


def _check_fields(where: str, record: object, types: Mapping[str, type | tuple[type, ...]]) -> None:
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


def _check_image(where: str, record: object) -> None:
    _check_fields(where, record, IMAGE_FIELD_TYPES)
    assert isinstance(record, dict)
    for side in ("width", "height"):
        if record[side] < 1:
            raise InvalidManifest(f"{where} field {side!r} must be at least 1 pixel")


def _check_entry(where: str, entry: object) -> None:
    if not isinstance(entry, dict):
        raise InvalidManifest(f"{where} is not an object")
    _check_fields(where, entry, {**ENTRY_FIELD_TYPES, "master": dict, "derivatives": dict})
    _check_image(f"{where}/master", entry["master"])
    for size, record in entry["derivatives"].items():
        if not size.isdigit():
            raise InvalidManifest(f"{where}/derivatives has a size {size!r} that is not pixels")
        _check_image(f"{where}/derivatives/{size}", record)


def validate_manifest(document: object) -> None:
    """Raise InvalidManifest unless `document` is a version-2 manifest, entry by entry."""
    if not isinstance(document, dict):
        raise InvalidManifest(f"manifest must be an object, got {type(document).__name__}")
    if document.get("version") != MANIFEST_VERSION:
        # There is no migration, on purpose: a manifest is a record of images on this disk,
        # every one of which can be rendered again, so saying what it is worth is cheaper
        # than carrying a converter for every past shape.
        raise InvalidManifest(
            f"unsupported manifest version {document.get('version')!r}, this job writes "
            f"v{MANIFEST_VERSION}. A manifest is regenerated by rendering, so delete it and "
            f"render again rather than editing it."
        )
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
                    _check_entry(where, entry)

    for index, failure in enumerate(failures):
        where = f"failure {index}"
        _check_fields(where, failure, FAILURE_FIELD_TYPES)
        if failure["class"] not in ALL_CLASSES:
            raise InvalidManifest(f"{where} has unknown class {failure['class']!r}")
        if failure["team"] not in TEAMS:
            raise InvalidManifest(f"{where} has unknown Team {failure['team']!r}")
        if failure["reason"] not in FAILURE_REASONS:
            raise InvalidManifest(f"{where} has unknown failure reason {failure['reason']!r}")


# --- The published schema ---------------------------------------------------------------

_JSON_TYPES: dict[type, str] = {str: "string", int: "integer", bool: "boolean"}


def _json_type(expected: type | tuple[type, ...]) -> dict:
    kinds = expected if isinstance(expected, tuple) else (expected,)
    names = ["null" if kind is type(None) else _JSON_TYPES[kind] for kind in kinds]
    return {"type": names[0] if len(names) == 1 else names}


def _object_of(types: Mapping[str, type | tuple[type, ...]], **extra_properties: dict) -> dict:
    properties = {name: _json_type(expected) for name, expected in types.items()}
    properties.update(extra_properties)
    return {
        "type": "object",
        "properties": properties,
        "required": sorted(properties),
        "additionalProperties": False,
    }


def manifest_json_schema() -> dict:
    """The JSON Schema published beside the manifest, generated from the same field tables.

    It is the contract the site and any later uploader read; generating it here is what keeps
    it and `validate_manifest` describing one shape rather than two.
    """
    image = _object_of(IMAGE_FIELD_TYPES)
    image["properties"]["width"]["minimum"] = 1
    image["properties"]["height"]["minimum"] = 1
    image["description"] = "One image file, by its path relative to the output root."

    entry = _object_of(
        ENTRY_FIELD_TYPES,
        master=image,
        derivatives={
            "type": "object",
            "description": "Web sizes made from the master, keyed by their size in pixels.",
            "propertyNames": {"pattern": "^[0-9]+$"},
            "additionalProperties": image,
        },
    )
    failure = _object_of(FAILURE_FIELD_TYPES)
    failure["properties"]["class"]["enum"] = list(ALL_CLASSES)
    failure["properties"]["team"]["enum"] = list(TEAMS)
    failure["properties"]["reason"]["enum"] = list(FAILURE_REASONS)

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": f"https://github.com/chrisJuresh/tf2-cosm/catalogue/renders/v{MANIFEST_VERSION}",
        "title": f"TF2 Cosmetics Worn Render manifest v{MANIFEST_VERSION}",
        "description": (
            "Which Worn Renders exist and which failed. Keyed by Cosmetic slug, then Class, "
            "then Team, then Style index; every path is relative to the configured output root."
        ),
        "type": "object",
        "required": ["version", "renders", "failures"],
        "additionalProperties": False,
        "properties": {
            "version": {"const": MANIFEST_VERSION},
            "renders": {
                "type": "object",
                "description": "Renders by Cosmetic slug.",
                "additionalProperties": {
                    "type": "object",
                    "description": "Renders by Class.",
                    "propertyNames": {"enum": list(ALL_CLASSES)},
                    "additionalProperties": {
                        "type": "object",
                        "description": "Renders by Team.",
                        "propertyNames": {"enum": list(TEAMS)},
                        "additionalProperties": {
                            "type": "object",
                            "description": "Renders by Style index.",
                            "propertyNames": {"pattern": "^[0-9]+$"},
                            "additionalProperties": entry,
                        },
                    },
                },
            },
            "failures": {
                "type": "array",
                "description": "Why a job produced no image; the site falls back to the Backpack Icon.",
                "items": failure,
            },
        },
    }
