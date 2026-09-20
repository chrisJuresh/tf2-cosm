"""The model-file reader's seam: .mdl bytes in, bodygroups and skin families out.

The fixture header is built here rather than checked in, so the test says exactly which
bytes produce which reading and no game file is ever committed.
"""
from __future__ import annotations

import struct

import pytest

from render.mdlinfo import read_mdl

HEADER_SIZE = 408
BONE_SIZE = 216
TEXTURE_SIZE = 64
BODYPART_SIZE = 16
MODEL_SIZE = 148


def build_mdl(
    *,
    name: str = "player/soldier.mdl",
    version: int = 49,
    bones: tuple[str, ...] = ("bip_head",),
    textures: tuple[str, ...] = ("soldier_head",),
    skin_families: int = 2,
    bodygroups: tuple[tuple[str, tuple[tuple[str, int], ...]], ...] = (("hat", (("hat_geo", 120),)),),
) -> bytes:
    """Assemble the parts of a studiohdr_t the reader looks at, with a string table at the end."""
    bone_off = HEADER_SIZE
    texture_off = bone_off + BONE_SIZE * len(bones)
    bodypart_off = texture_off + TEXTURE_SIZE * len(textures)
    model_off = bodypart_off + BODYPART_SIZE * len(bodygroups)
    total_models = sum(len(submodels) for _, submodels in bodygroups)
    strings_off = model_off + MODEL_SIZE * total_models

    strings = bytearray()
    placed: dict[str, int] = {}

    def place(text: str) -> int:
        if text not in placed:
            placed[text] = strings_off + len(strings)
            strings.extend(text.encode("ascii") + b"\0")
        return placed[text]

    bone_names = [place(bone) for bone in bones]
    texture_names = [place(texture) for texture in textures]
    bodypart_names = [place(group) for group, _ in bodygroups]

    data = bytearray(strings_off)
    data[0:4] = b"IDST"
    struct.pack_into("<i", data, 4, version)
    data[12 : 12 + len(name)] = name.encode("ascii")
    struct.pack_into("<ii", data, 156, len(bones), bone_off)
    struct.pack_into("<ii", data, 204, len(textures), texture_off)
    struct.pack_into("<iii", data, 220, len(textures), skin_families, 0)
    struct.pack_into("<ii", data, 232, len(bodygroups), bodypart_off)

    for index, string_at in enumerate(bone_names):
        at = bone_off + index * BONE_SIZE
        struct.pack_into("<i", data, at, string_at - at)
    for index, string_at in enumerate(texture_names):
        at = texture_off + index * TEXTURE_SIZE
        struct.pack_into("<i", data, at, string_at - at)

    next_model = model_off
    for index, (_, submodels) in enumerate(bodygroups):
        at = bodypart_off + index * BODYPART_SIZE
        struct.pack_into("<iiii", data, at, bodypart_names[index] - at, len(submodels), 0, next_model - at)
        for sub_index, (sub_name, vertex_count) in enumerate(submodels):
            model_at = next_model + sub_index * MODEL_SIZE
            data[model_at : model_at + len(sub_name)] = sub_name.encode("ascii")
            struct.pack_into("<i", data, model_at + 80, vertex_count)
        next_model += MODEL_SIZE * len(submodels)

    return bytes(data + strings)


def test_reads_bodygroup_names_and_submodels():
    info = read_mdl(
        build_mdl(
            bodygroups=(
                ("hat", (("soldier_hat", 96), ("blank", 0))),
                ("medal", (("blank", 0), ("soldier_medal", 48))),
            )
        )
    )

    assert [group.name for group in info.bodygroups] == ["hat", "medal"]
    assert [(sub.name, sub.vertex_count) for sub in info.bodygroups[0].submodels] == [
        ("soldier_hat", 96),
        ("blank", 0),
    ]


def test_a_blank_first_submodel_means_the_bodygroup_is_off_by_default():
    info = read_mdl(
        build_mdl(
            bodygroups=(
                ("hat", (("soldier_hat", 96), ("blank", 0))),
                ("medal", (("blank", 0), ("soldier_medal", 48))),
            )
        )
    )
    visible, hidden = info.bodygroups

    assert (visible.default_visible, visible.geometry_index) == (True, 0)
    assert (hidden.default_visible, hidden.geometry_index) == (False, 1)


def test_reads_the_skin_family_count_bones_and_textures():
    info = read_mdl(
        build_mdl(
            name="player/items/soldier/soldier_officer.mdl",
            bones=("bip_head", "bip_spine_3"),
            textures=("officer_hat", "officer_trim"),
            skin_families=4,
        )
    )

    assert info.name == "player/items/soldier/soldier_officer.mdl"
    assert info.version == 49
    assert info.skin_family_count == 4
    assert info.bone_names == ("bip_head", "bip_spine_3")
    assert info.texture_names == ("officer_hat", "officer_trim")


def test_a_file_that_is_not_a_source_model_is_refused():
    with pytest.raises(ValueError, match="not a Source MDL file"):
        read_mdl(b"RIFF" + bytes(512))
