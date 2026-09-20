"""The small matrix layer the scene maths stands on, tested without Blender.

Blender's mathutils only exists inside Blender, so every decision the render step makes
about where things go is expressed in these types and tested in the project venv.
"""
from __future__ import annotations

import math

import pytest

from render.geometry import (
    IDENTITY,
    Vec3,
    inverse,
    look_at,
    multiply,
    placed_at,
    transform_point,
    translation_of,
)


def test_identity_leaves_a_point_alone():
    assert transform_point(IDENTITY, Vec3(1.0, 2.0, 3.0)) == Vec3(1.0, 2.0, 3.0)


def test_a_matrix_times_its_inverse_is_the_identity():
    matrix = (
        (0.0, -1.0, 0.0, 1.5),
        (1.0, 0.0, 0.0, -2.0),
        (0.0, 0.0, 2.0, 0.25),
        (0.0, 0.0, 0.0, 1.0),
    )

    product = multiply(matrix, inverse(matrix))

    for row, expected_row in zip(product, IDENTITY):
        for value, expected in zip(row, expected_row):
            assert value == pytest.approx(expected, abs=1e-9)


def test_a_singular_matrix_has_no_inverse():
    with pytest.raises(ZeroDivisionError):
        inverse(((0.0,) * 4,) * 4)


def test_translation_of_reads_the_last_column():
    matrix = (
        (1.0, 0.0, 0.0, 4.0),
        (0.0, 1.0, 0.0, 5.0),
        (0.0, 0.0, 1.0, 6.0),
        (0.0, 0.0, 0.0, 1.0),
    )

    assert translation_of(matrix) == Vec3(4.0, 5.0, 6.0)


def test_look_at_points_local_minus_z_at_the_target():
    rotation = look_at(Vec3(0.0, 0.0, 5.0), Vec3(0.0, 0.0, 0.0))

    forward = Vec3(*(row[2] for row in rotation[:3])).scaled(-1.0)

    assert forward.x == pytest.approx(0.0, abs=1e-9)
    assert forward.y == pytest.approx(0.0, abs=1e-9)
    assert forward.z == pytest.approx(-1.0, abs=1e-9)


def test_look_at_keeps_world_y_up():
    """SourceIO imports Y-up, so a Z-up track-to produces sideways renders (spike finding)."""
    eye = Vec3(2.0, 1.4, 3.0)

    rotation = look_at(eye, Vec3(0.0, 1.0, 0.0))

    up = Vec3(*(row[1] for row in rotation[:3]))
    assert up.y > 0.0
    # local +X (the camera's right) stays level: no roll about the view axis
    right = Vec3(*(row[0] for row in rotation[:3]))
    assert right.y == pytest.approx(0.0, abs=1e-9)


def test_look_at_columns_are_orthonormal():
    rotation = look_at(Vec3(1.0, 2.0, 3.0), Vec3(-1.0, 0.5, 0.0))

    axes = [Vec3(*(row[i] for row in rotation[:3])) for i in range(3)]
    for axis in axes:
        assert axis.length == pytest.approx(1.0, abs=1e-9)
    for left in range(3):
        for right in range(left + 1, 3):
            assert axes[left].dot(axes[right]) == pytest.approx(0.0, abs=1e-9)


def test_vector_helpers():
    assert (Vec3(1.0, 2.0, 3.0) + Vec3(1.0, 1.0, 1.0)) == Vec3(2.0, 3.0, 4.0)
    assert (Vec3(1.0, 2.0, 3.0) - Vec3(1.0, 1.0, 1.0)) == Vec3(0.0, 1.0, 2.0)
    assert Vec3(0.0, 3.0, 0.0).normalized() == Vec3(0.0, 1.0, 0.0)
    assert Vec3(1.0, 0.0, 0.0).cross(Vec3(0.0, 1.0, 0.0)) == Vec3(0.0, 0.0, 1.0)
    assert Vec3(3.0, 4.0, 0.0).length == pytest.approx(5.0)


def test_normalizing_a_zero_vector_is_refused():
    with pytest.raises(ValueError, match="zero-length"):
        Vec3(0.0, 0.0, 0.0).normalized()


def test_look_at_from_the_target_itself_is_refused():
    with pytest.raises(ValueError, match="zero-length"):
        look_at(Vec3(1.0, 1.0, 1.0), Vec3(1.0, 1.0, 1.0))


def test_look_at_straight_down_the_up_axis_is_refused():
    """Looking along world up leaves the roll undefined; the caller must tilt the camera."""
    with pytest.raises(ValueError, match="parallel"):
        look_at(Vec3(0.0, 5.0, 0.0), Vec3(0.0, 0.0, 0.0))


def test_placing_composes_a_rotation_with_a_position():
    """Blender takes a whole 4x4 as matrix_world, so placement never goes through Euler angles."""
    eye = Vec3(2.0, 1.0, 2.0)

    placement = placed_at(look_at(eye, Vec3(0.0, 1.0, 0.0)), eye)

    assert translation_of(placement) == eye
    assert placement[3] == (0.0, 0.0, 0.0, 1.0)
    assert all(math.isfinite(value) for row in placement for value in row)
