"""Read the parts of a Source .mdl header the render job needs: bodygroups and skins.

SourceIO imports only submodels that have geometry, so to know whether a bodygroup is
visible by default (submodel 0 has geometry) or hidden by default (submodel 0 is blank,
as with the Soldier's medal) we read the bodypart table ourselves. Pure Python, no Blender.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass

MDL_MAGIC = b"IDST"
BODYPART_SIZE = 16
MODEL_SIZE = 148


def _cstr(data: bytes, offset: int) -> str:
    end = data.index(b"\0", offset)
    return data[offset:end].decode("ascii", errors="replace")


@dataclass(frozen=True)
class Submodel:
    name: str
    vertex_count: int


@dataclass(frozen=True)
class Bodygroup:
    name: str
    submodels: tuple[Submodel, ...]

    @property
    def default_visible(self) -> bool:
        """Submodel 0 is the engine default; a blank default means the group is off unless an item turns it on."""
        return bool(self.submodels) and self.submodels[0].vertex_count > 0

    @property
    def geometry_index(self) -> int | None:
        for i, sub in enumerate(self.submodels):
            if sub.vertex_count > 0:
                return i
        return None


@dataclass(frozen=True)
class MdlInfo:
    name: str
    version: int
    bone_names: tuple[str, ...]
    bodygroups: tuple[Bodygroup, ...]
    skin_family_count: int
    texture_names: tuple[str, ...]


def read_mdl(data: bytes) -> MdlInfo:
    if data[:4] != MDL_MAGIC:
        raise ValueError("not a Source MDL file")
    version = struct.unpack_from("<i", data, 4)[0]
    name = data[12:76].split(b"\0")[0].decode("ascii", errors="replace")
    # studiohdr_t field offsets (v44-v49): bones 156, textures 204, skins 220, bodyparts 232
    numbones, boneindex = struct.unpack_from("<ii", data, 156)
    numtextures, textureindex = struct.unpack_from("<ii", data, 204)
    numskinref, numskinfamilies, _skinindex = struct.unpack_from("<iii", data, 220)
    numbodyparts, bodypartindex = struct.unpack_from("<ii", data, 232)

    bones = []
    for i in range(numbones):
        off = boneindex + i * 216
        nameoff = struct.unpack_from("<i", data, off)[0]
        bones.append(_cstr(data, off + nameoff))

    textures = []
    for i in range(numtextures):
        off = textureindex + i * 64
        nameoff = struct.unpack_from("<i", data, off)[0]
        textures.append(_cstr(data, off + nameoff))

    bodygroups = []
    for i in range(numbodyparts):
        off = bodypartindex + i * BODYPART_SIZE
        nameoff, nummodels, _base, modelindex = struct.unpack_from("<iiii", data, off)
        submodels = []
        for j in range(nummodels):
            moff = off + modelindex + j * MODEL_SIZE
            mname = data[moff : moff + 64].split(b"\0")[0].decode("ascii", errors="replace")
            numvertices = struct.unpack_from("<i", data, moff + 80)[0]
            submodels.append(Submodel(mname, numvertices))
        bodygroups.append(Bodygroup(_cstr(data, off + nameoff), tuple(submodels)))

    return MdlInfo(name, version, tuple(bones), tuple(bodygroups), numskinfamilies, tuple(textures))


if __name__ == "__main__":
    import sys
    from pathlib import Path

    for arg in sys.argv[1:]:
        info = read_mdl(Path(arg).read_bytes())
        print(f"{info.name} v{info.version} bones={len(info.bone_names)} skins={info.skin_family_count} textures={list(info.texture_names)}")
        for bg in info.bodygroups:
            print(f"  bodygroup {bg.name!r} default_visible={bg.default_visible} submodels={[(s.name, s.vertex_count) for s in bg.submodels]}")
