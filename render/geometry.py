"""The small 4x4 layer the render step's scene maths is written in.

Blender's `mathutils` exists only inside Blender, so every placement decision — where the
camera goes, how a cosmetic's armature lands on the class skeleton — is computed in these
plain types and tested in the project venv. The Blender adapter converts at the boundary:
`Matrix(m)` takes a row-major 4x4 exactly as spelled here.

Conventions: row-major, column-vector (`m @ v`), so the last column is the translation.
The imported world is Y-up and the model faces +Z (SourceIO), which is why `look_at` takes
world up as a parameter instead of assuming Blender's +Z.
"""
from __future__ import annotations

import math
from typing import NamedTuple

Mat4 = tuple[tuple[float, float, float, float], ...]

IDENTITY: Mat4 = (
    (1.0, 0.0, 0.0, 0.0),
    (0.0, 1.0, 0.0, 0.0),
    (0.0, 0.0, 1.0, 0.0),
    (0.0, 0.0, 0.0, 1.0),
)

class Vec3(NamedTuple):
    x: float
    y: float
    z: float

    def __add__(self, other: "Vec3") -> "Vec3":  # type: ignore[override]
        return Vec3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: "Vec3") -> "Vec3":
        return Vec3(self.x - other.x, self.y - other.y, self.z - other.z)

    def scaled(self, factor: float) -> "Vec3":
        return Vec3(self.x * factor, self.y * factor, self.z * factor)

    def dot(self, other: "Vec3") -> float:
        return self.x * other.x + self.y * other.y + self.z * other.z

    def cross(self, other: "Vec3") -> "Vec3":
        return Vec3(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x,
        )

    @property
    def length(self) -> float:
        return math.sqrt(self.dot(self))

    def normalized(self) -> "Vec3":
        length = self.length
        if length == 0.0:
            raise ValueError("cannot normalize a zero-length vector")
        return self.scaled(1.0 / length)


WORLD_UP = Vec3(0.0, 1.0, 0.0)


def multiply(left: Mat4, right: Mat4) -> Mat4:
    return tuple(
        tuple(sum(left[row][k] * right[k][col] for k in range(4)) for col in range(4))
        for row in range(4)
    )


def inverse(matrix: Mat4) -> Mat4:
    """Gauss-Jordan with partial pivoting; raises ZeroDivisionError on a singular matrix."""
    rows = [list(matrix[i]) + list(IDENTITY[i]) for i in range(4)]
    for col in range(4):
        pivot = max(range(col, 4), key=lambda r: abs(rows[r][col]))
        if abs(rows[pivot][col]) < 1e-12:
            raise ZeroDivisionError("matrix is singular and cannot be inverted")
        rows[col], rows[pivot] = rows[pivot], rows[col]
        scale = rows[col][col]
        rows[col] = [value / scale for value in rows[col]]
        for other in range(4):
            if other == col:
                continue
            factor = rows[other][col]
            if factor:
                rows[other] = [a - factor * b for a, b in zip(rows[other], rows[col])]
    return tuple(tuple(row[4:]) for row in rows)


def transform_point(matrix: Mat4, point: Vec3) -> Vec3:
    return Vec3(
        *(
            matrix[row][0] * point.x + matrix[row][1] * point.y + matrix[row][2] * point.z + matrix[row][3]
            for row in range(3)
        )
    )


def translation_of(matrix: Mat4) -> Vec3:
    return Vec3(matrix[0][3], matrix[1][3], matrix[2][3])


def look_at(eye: Vec3, target: Vec3, world_up: Vec3 = WORLD_UP) -> Mat4:
    """Rotation for a camera or light (they look down local -Z) aiming at `target`.

    Local +Y is kept in the plane of `world_up`, so the render is upright in a Y-up world.
    """
    forward = (target - eye).normalized()
    right = forward.cross(world_up)
    if right.length < 1e-9:
        raise ValueError("view direction is parallel to world up; the roll would be undefined")
    right = right.normalized()
    up = right.cross(forward).normalized()
    axes = (right, up, forward.scaled(-1.0))
    return tuple(
        tuple(axis[row] for axis in axes) + (0.0,) for row in range(3)
    ) + ((0.0, 0.0, 0.0, 1.0),)


def placed_at(rotation: Mat4, position: Vec3) -> Mat4:
    """A rotation plus a position as the single 4x4 Blender takes for `matrix_world`."""
    return tuple(
        rotation[row][:3] + (position[row],) for row in range(3)
    ) + ((0.0, 0.0, 0.0, 1.0),)
