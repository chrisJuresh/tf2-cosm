"""The manifest: the render job's output as the site reads it, and the contract it reads it by.

Shape, version 3:

    {
      "version": 3,                       # MANIFEST_VERSION
      "renders": {
        "team-captain": {                 # Cosmetic slug (ADR-0003)
          "soldier": {                    # Class
            "red": {                      # Team
              "0": {                      # Style index, as a string (JSON object keys are strings)
                "worn": {                 # the Worn Render: the Cosmetic on the Class
                  "master": {             # the 1024 PNG, kept locally, never committed
                    "path": "masters/team-captain/soldier-red-0.png",  # relative to the root
                    "width": 1024, "height": 1024
                  },
                  "derivatives": {        # one per web size, keyed by the size in pixels
                    "512": {"path": "web/team-captain/soldier-red-0@512.webp",
                            "width": 512, "height": 512},
                    "256": {"path": "web/team-captain/soldier-red-0@256.webp",
                            "width": 256, "height": 256}
                  }
                },
                "alone": {                # the Item Render: the same Cosmetic with no Class
                  "master": {"path": "masters/team-captain/soldier-red-0-alone.png",
                             "width": 1024, "height": 1024},
                  "derivatives": {}
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
        {"slug", "class", "team", "style", "variant", "model", "reason", "detail",
         "failed_at", "job_version"}
      ]
    }

Either picture may be null: they are rendered from one import but as two frames, and a frame
that fails is recorded as a failure for that variant while the other one stands. An entry with
neither picture is not written at all.

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
from render.scene import ALONE, TEAMS, VARIANTS, WORN

MANIFEST_VERSION = 3

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
    "variant": str,
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

    def picture(self, slug: str, cls: str, team: str, style: int, variant: str) -> dict | None:
        """One of an entry's two pictures — its master and its derivatives — or None.

        None means the same thing whether the entry is missing or the entry holds no picture
        of this variant: nobody has rendered it. Every caller treats the two alike, so the
        distinction is not one worth making them make.
        """
        _check_variant(variant)
        entry = self.entry(slug, cls, team, style)
        return None if entry is None else entry.get(variant)

    def failure(
        self, slug: str, cls: str, team: str, style: int, variant: str = WORN
    ) -> dict | None:
        """Why one image was not made last time, or None if it has never been tried."""
        identity = (slug, cls, team, style, variant)
        for failure in self._document["failures"]:
            if _identity_of(failure) == identity:
                return failure
        return None

    def failures_for(self, identities: set[tuple[str, str, str, int, str]]) -> list[dict]:
        """Every recorded failure among `identities`, each (slug, Class, Team, Style, variant)."""
        return [
            failure for failure in self._document["failures"] if _identity_of(failure) in identities
        ]

    def entries(self) -> Iterator[tuple[str, str, str, int, dict]]:
        """Every recorded entry, as (slug, Class, Team, Style, entry)."""
        for slug, by_class in self._document["renders"].items():
            for cls, by_team in by_class.items():
                for team, by_style in by_team.items():
                    for style, entry in by_style.items():
                        yield slug, cls, team, int(style), entry

    def pictures(self) -> Iterator[tuple[str, str, str, int, str, dict]]:
        """Every picture recorded, variant by variant.

        What `render.derive` and the publish step walk, because both are about image files
        rather than about jobs: an entry is one job, and a job now makes two pictures.
        """
        for slug, cls, team, style, entry in self.entries():
            for variant in VARIANTS:
                picture = entry.get(variant)
                if picture is not None:
                    yield slug, cls, team, style, variant, picture

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
        variant: str = WORN,
    ) -> dict:
        """Record one rendered master, replacing any earlier one or failure for that image.

        The two variants of a job arrive here one at a time and share an entry, so recording
        an Item Render keeps the Worn Render already in it rather than starting the entry
        over. The metadata is the job's and is the same either way; the derivatives start
        empty, because they are made from the master afterwards, outside Blender.
        """
        self._check_team(team)
        _check_variant(variant)
        by_team = (
            self._document["renders"]
            .setdefault(job["slug"], {})
            .setdefault(job["class"], {})
            .setdefault(team, {})
        )
        entry = by_team.setdefault(str(job["style"]), {name: None for name in VARIANTS})
        entry[variant] = {"master": image_record(path, width, height), "derivatives": {}}
        entry.update(
            {
                "model": job["model"],
                "style_name": job["style_name"],
                "rendered_at": at,
                "job_version": JOB_LIST_VERSION,
                "team_fallback": fell_back_to_red,
            }
        )
        self.forget_failure(job["slug"], job["class"], team, job["style"], variant)
        return entry

    def set_derivatives(
        self,
        slug: str,
        cls: str,
        team: str,
        style: int,
        derivatives: Mapping[str, dict],
        variant: str = WORN,
    ) -> dict:
        """Attach the web sizes made from one master, replacing whatever was recorded before."""
        picture = self.picture(slug, cls, team, style, variant)
        if picture is None:
            raise KeyError(f"no {variant} render recorded for {slug}/{cls}/{team}/{style}")
        picture["derivatives"] = {
            size: image_record(record["path"], record["width"], record["height"])
            for size, record in derivatives.items()
        }
        self.forget_failure(slug, cls, team, style, variant)
        return picture

    def fail(
        self,
        job: dict,
        team: str,
        *,
        reason: str,
        detail: str | None,
        at: str,
        variant: str = WORN,
    ) -> dict:
        """Record why one image was not made, so the site can fall back and the run can go on."""
        return self.fail_render(
            job["slug"],
            job["class"],
            team,
            job["style"],
            model=job["model"],
            reason=reason,
            detail=detail,
            at=at,
            variant=variant,
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
        variant: str = WORN,
    ) -> dict:
        """The same, for a step that holds a manifest entry rather than a job — `render.derive`."""
        self._check_team(team)
        _check_variant(variant)
        if reason not in FAILURE_REASONS:
            raise ValueError(f"unknown failure reason {reason!r}")
        self.forget_failure(slug, cls, team, style, variant)
        failure = {
            "slug": slug,
            "class": cls,
            "team": team,
            "style": style,
            "variant": variant,
            "model": model,
            "reason": reason,
            "detail": detail,
            "failed_at": at,
            "job_version": JOB_LIST_VERSION,
        }
        self._document["failures"].append(failure)
        return failure

    def forget_failure(
        self, slug: str, cls: str, team: str, style: int, variant: str = WORN
    ) -> None:
        """Drop any failure recorded for one image, because it has just been done."""
        identity = (slug, cls, team, style, variant)
        self._document["failures"] = [
            failure for failure in self._document["failures"] if _identity_of(failure) != identity
        ]

    def forget_render(
        self, slug: str, cls: str, team: str, style: int, variant: str = WORN
    ) -> None:
        """Drop one recorded picture, because it has just been found to fail.

        The entry goes with it once neither variant is left — an entry is a record of images,
        and one holding no image at all would read as a render that exists and cannot be found
        rather than as one nobody has made — and so does any branch left with nothing under it.
        An empty Class or slug would otherwise read as "this Cosmetic has renders" to the site,
        which joins the catalogue to this document by the slug alone.
        """
        renders = self._document["renders"]
        by_class = renders.get(slug)
        by_team = (by_class or {}).get(cls)
        by_style = (by_team or {}).get(team)
        entry = None if by_style is None else by_style.get(str(style))
        if entry is None:
            return
        entry[variant] = None
        if any(entry.get(name) is not None for name in VARIANTS):
            return
        by_style.pop(str(style), None)
        if not by_style:
            by_team.pop(team, None)
        if not by_team:
            by_class.pop(cls, None)
        if not by_class:
            renders.pop(slug, None)

    def merge(self, other: "Manifest") -> None:
        """Fold another manifest into this one, letting `other` win job by job.

        This is what lets several Blender processes run at once. They cannot share a manifest
        file — each rewrites it whole, so the last writer would drop everyone else's work —
        so each writes its own small one and the runner folds it in here, one at a time.

        A job appears in `other` as a render or as a failure, never both, and either one
        replaces whatever this manifest said about that job before: both mean "this is what
        became of it just now". Jobs `other` says nothing about are left alone, which is why
        a shard holding one batch can be merged into a manifest holding a whole run.
        """
        for slug, cls, team, style, entry in list(other.entries()):
            by_class = self._document["renders"].setdefault(slug, {}).setdefault(cls, {})
            by_class.setdefault(team, {})[str(style)] = entry
            for variant in VARIANTS:
                if entry.get(variant) is not None:
                    self.forget_failure(slug, cls, team, style, variant)
        for failure in other._document["failures"]:
            identity = _identity_of(failure)
            self.forget_failure(*identity)
            self.forget_render(*identity)
            self._document["failures"].append(failure)

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


def _check_variant(variant: str) -> None:
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant {variant!r}")


def _identity_of(failure: Mapping[str, object]) -> tuple:
    """What a failure is about: one image, which is a job and one of its two pictures."""
    return (
        failure["slug"],
        failure["class"],
        failure["team"],
        failure["style"],
        failure["variant"],
    )


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


def _check_picture(where: str, picture: object) -> None:
    _check_fields(where, picture, {"master": dict, "derivatives": dict})
    assert isinstance(picture, dict)
    _check_image(f"{where}/master", picture["master"])
    for size, record in picture["derivatives"].items():
        if not size.isdigit():
            raise InvalidManifest(f"{where}/derivatives has a size {size!r} that is not pixels")
        _check_image(f"{where}/derivatives/{size}", record)


def _check_entry(where: str, entry: object) -> None:
    if not isinstance(entry, dict):
        raise InvalidManifest(f"{where} is not an object")
    _check_fields(
        where, entry, {**ENTRY_FIELD_TYPES, **{variant: (dict, type(None)) for variant in VARIANTS}}
    )
    for variant in VARIANTS:
        if entry[variant] is not None:
            _check_picture(f"{where}/{variant}", entry[variant])
    if all(entry[variant] is None for variant in VARIANTS):
        raise InvalidManifest(f"{where} records no picture at all")


def validate_manifest(document: object) -> None:
    """Raise InvalidManifest unless `document` is a version-3 manifest, entry by entry."""
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
        if failure["variant"] not in VARIANTS:
            raise InvalidManifest(f"{where} has unknown variant {failure['variant']!r}")
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

    picture = {
        "type": "object",
        "description": "One rendered master and the web sizes made from it.",
        "required": ["master", "derivatives"],
        "additionalProperties": False,
        "properties": {
            "master": image,
            "derivatives": {
                "type": "object",
                "description": "Web sizes made from the master, keyed by their size in pixels.",
                "propertyNames": {"pattern": "^[0-9]+$"},
                "additionalProperties": image,
            },
        },
    }
    nullable_picture = {
        "description": "A picture, or null where this variant has not been rendered.",
        "oneOf": [picture, {"type": "null"}],
    }
    entry = _object_of(
        ENTRY_FIELD_TYPES,
        worn={**nullable_picture, "title": "The Worn Render: the Cosmetic on the Class"},
        alone={**nullable_picture, "title": "The Item Render: the Cosmetic with no Class"},
    )
    entry["not"] = {"properties": {variant: {"type": "null"} for variant in VARIANTS}}
    entry["description"] = "One Cosmetic on one Class, Team and Style, in up to two pictures."
    failure = _object_of(FAILURE_FIELD_TYPES)
    failure["properties"]["class"]["enum"] = list(ALL_CLASSES)
    failure["properties"]["team"]["enum"] = list(TEAMS)
    failure["properties"]["variant"]["enum"] = list(VARIANTS)
    failure["properties"]["reason"]["enum"] = list(FAILURE_REASONS)

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": f"https://github.com/chrisJuresh/tf2-cosm/catalogue/renders/v{MANIFEST_VERSION}",
        "title": f"TF2 Cosmetics render manifest v{MANIFEST_VERSION}",
        "description": (
            "Which Worn Renders and Item Renders exist and which failed. Keyed by Cosmetic "
            "slug, then Class, then Team, then Style index; every path is relative to the "
            "configured output root."
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
