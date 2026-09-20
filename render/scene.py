"""One job's scene, decided before Blender is touched.

Everything the render step chooses — which framing a Cosmetic gets, where the camera and the
three lights stand, which class bodygroups stay visible, which skin family the Team wants and
where the cosmetic's armature has to land — is a pure function of the job and of numbers read
out of the model files. The Blender adapter (`render.blender_job`) does no arithmetic of its
own; it applies what this module returns.

World conventions come from SourceIO's import: Y is up, the model faces +Z, metres.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Iterable, Mapping, NamedTuple, Sequence

from render.geometry import Mat4, Vec3, inverse, look_at, multiply, placed_at, translation_of

BUST = "bust"
BODY = "body"

TEAMS = ("red", "blu")

#: Equip regions worn on or around the head, as the installed schema spells them; anything
#: else — and anything unrecognised — is framed as a body rather than risk cropping it out.
HEAD_REGIONS = frozenset(
    {
        "hat",
        "face",
        "glasses",
        "lenses",
        "beard",
        "ears",
        "head_skin",
        "whole_head",
        "pyro_head_replacement",
        "demo_eyepatch",
        "demo_head_replacement",
        "engineer_hair",
        "heavy_hair",
        "sniper_headband",
        "soldier_cigar",
    }
)

HEAD_BONE = "bip_head"
PELVIS_BONE = "bip_pelvis"

#: A class model's own Team skins. Only Cosmetics name their skins in the schema; the classes
#: are always RED first, BLU second, and a Cosmetic with no BLU skin must not drag the Class
#: it is worn on back to RED with it.
CLASS_SKIN_RED = 0
CLASS_SKIN_BLU = 1

#: A bust is framed on the head bone: tight enough to read in a grid, with headroom for a
#: tall hat and enough chest below to show a collar or a badge.
BUST_RISE = 0.02
BUST_SPAN = 0.64
#: A body frame sits on the ground — the class armature's feet are at world y=0 — and is tall
#: enough to clear the tallest class's head with a hat on. Fixed, so every class is at one scale.
BODY_SPAN = 2.15
BODY_FLOOR = -0.14

LENS_MM = 85.0
SENSOR_WIDTH_MM = 36.0
CAMERA_YAW = math.radians(35.0)
CAMERA_RISE = 0.10

#: Bones do not sit at the exact same place in every skeleton; further than this apart and the
#: cosmetic is attached through bones that disagree, which is worth saying out loud.
BONE_AGREEMENT_M = 0.005


def framing_for(equip_regions: Sequence[str], slot: str) -> str:
    """Bust for a Cosmetic worn on the head, body for anything worn lower (or partly lower)."""
    regions = [region.lower() for region in equip_regions if region]
    if not regions:
        return BUST if slot == "head" else BODY
    return BUST if all(region in HEAD_REGIONS for region in regions) else BODY


def frame_target(head: Vec3, pelvis: Vec3, framing: str) -> tuple[Vec3, float]:
    """The centre to look at and the vertical span to fit, in world space."""
    if framing == BUST:
        return Vec3(head.x, head.y + BUST_RISE, head.z), BUST_SPAN
    if framing == BODY:
        return Vec3(pelvis.x, BODY_FLOOR + BODY_SPAN / 2, pelvis.z), BODY_SPAN
    raise ValueError(f"unknown framing {framing!r}")


def camera_placement(
    centre: Vec3,
    span: float,
    *,
    lens_mm: float = LENS_MM,
    sensor_width_mm: float = SENSOR_WIDTH_MM,
    yaw: float = CAMERA_YAW,
    rise: float = CAMERA_RISE,
) -> Mat4:
    """Where the camera stands and how it is turned, as one `matrix_world`.

    A three-quarter front view: the model faces +Z and its left is +X, so the camera sits to
    the model's front-right and slightly above, far enough back for `span` to fill the frame.
    """
    field_of_view = 2 * math.atan(sensor_width_mm / (2 * lens_mm))
    distance = (span / 2) / math.tan(field_of_view / 2)
    direction = Vec3(-math.sin(yaw), rise, math.cos(yaw)).normalized()
    position = centre + direction.scaled(distance)
    return placed_at(look_at(position, centre), position)


class Light(NamedTuple):
    name: str
    kind: str
    offset: tuple[float, float, float]
    energy: float
    size: float


#: The fixed rig: identical for every render, so pictures are comparable (spec R1).
LIGHT_RIG: tuple[Light, ...] = (
    Light("key", "AREA", (-1.6, 1.4, 1.8), 350.0, 1.5),
    Light("fill", "AREA", (1.8, 0.6, 1.4), 120.0, 2.0),
    Light("rim", "AREA", (0.6, 1.2, -2.0), 150.0, 1.0),
)

WORLD_STRENGTH = 0.6
WORLD_COLOR = (0.35, 0.35, 0.38, 1.0)


def light_placement(light: Light, centre: Vec3) -> Mat4:
    position = centre + Vec3(*light.offset)
    return placed_at(look_at(position, centre), position)


def bodygroup_named(collection: str, known: Iterable[str]) -> str | None:
    """The bodygroup a SourceIO collection stands for, or None when it is not one of `known`.

    A collection whose name is taken is renamed: SourceIO suffixes `_1` and Blender `.001`. The
    names collide often — a class's own bodygroup shares the model's name, and every class has
    a `hat` — so a suffixed name is matched back to the bodygroup it came from. An exact match
    always wins, in case a model really does have a bodygroup named `hat_1`.
    """
    names = list(known)
    if collection in names:
        return collection
    stripped = re.sub(r"(_\d+|\.\d+)$", "", collection)
    return stripped if stripped in names else None


def visible_bodygroups(defaults: Mapping[str, bool], hide: Iterable[str]) -> dict[str, bool]:
    """Which class bodygroups render: on by default in the game and not hidden by the item."""
    hidden = {name.lower() for name in hide}
    return {name: default and name.lower() not in hidden for name, default in defaults.items()}


@dataclass(frozen=True)
class SkinChoice:
    """The skin family to render, and whether it is the RED fallback rather than what was asked."""

    family: int
    fell_back_to_red: bool
    requested: int


def skin_plan(team: str, *, skin_red: int, skin_blu: int, family_count: int) -> SkinChoice:
    """The Team's skin family, falling back to RED when the model has no such family."""
    if team not in TEAMS:
        raise ValueError(f"unknown Team {team!r}")
    requested = skin_blu if team == "blu" else skin_red
    if 0 <= requested < family_count:
        return SkinChoice(requested, False, requested)
    fallback = skin_red if 0 <= skin_red < family_count else 0
    return SkinChoice(fallback, True, requested)


@dataclass(frozen=True)
class Alignment:
    """Where a cosmetic's armature has to go for its bones to coincide with the class skeleton."""

    matrix: Mat4
    anchor: str
    shared: list[str]
    disagreeing: list[str]


def alignment(
    class_bones: Mapping[str, Mat4], item_bones: Mapping[str, Mat4]
) -> Alignment | None:
    """The engine's bonemerge as one transform, or None when the two skeletons share no bone.

    Hats are authored in head-bone space — a single `bip_head` at the origin — so without this
    they render at the class's feet. The transform maps each shared bone's rest matrix in the
    item onto the same bone in the class; one anchor decides it and the rest are checked.
    """
    shared = sorted(name for name in item_bones if name in class_bones)
    if not shared:
        return None
    anchor = HEAD_BONE if HEAD_BONE in shared else shared[0]
    offsets = {
        name: multiply(class_bones[name], inverse(item_bones[name])) for name in shared
    }
    chosen = offsets[anchor]
    disagreeing = [
        name
        for name in shared
        if (translation_of(offsets[name]) - translation_of(chosen)).length > BONE_AGREEMENT_M
    ]
    return Alignment(chosen, anchor, shared, disagreeing)
