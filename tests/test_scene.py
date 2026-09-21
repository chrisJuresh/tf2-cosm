"""How one job becomes a scene: framing, camera, bodygroup visibility, Team skin, attachment.

Every decision the render step makes is a pure function here, so it is tested without
Blender and the Blender adapter is left with nothing but calls into the API.
"""
from __future__ import annotations

import math

import pytest

from render.geometry import IDENTITY, Vec3, transform_point, translation_of
from render.scene import (
    BODY,
    BODY_FLOOR,
    BODY_SPAN,
    BUST,
    LIGHT_RIG,
    MIN_SPAN,
    Bounds,
    alignment,
    bodygroup_named,
    camera_placement,
    frame_for_bounds,
    frame_target,
    framing_for,
    light_placement,
    skin_plan,
    view_axes,
    visible_bodygroups,
)


def translated(x: float, y: float, z: float):
    return (
        (1.0, 0.0, 0.0, x),
        (0.0, 1.0, 0.0, y),
        (0.0, 0.0, 1.0, z),
        (0.0, 0.0, 0.0, 1.0),
    )


class TestFramingChoice:
    @pytest.mark.parametrize("regions", [["hat"], ["face"], ["glasses", "hat"], ["whole_head"]])
    def test_head_region_items_get_the_bust(self, regions):
        assert framing_for(regions, slot="head") == BUST

    @pytest.mark.parametrize("regions", [["back"], ["feet"], ["arms"], ["hat", "back"]])
    def test_anything_worn_below_the_head_gets_the_body(self, regions):
        assert framing_for(regions, slot="misc") == BODY

    def test_a_head_slot_item_with_no_equip_region_gets_the_bust(self):
        assert framing_for([], slot="head") == BUST

    def test_a_misc_slot_item_with_no_equip_region_gets_the_body(self):
        assert framing_for([], slot="misc") == BODY

    def test_an_unknown_region_is_framed_as_a_body_rather_than_cropped(self):
        assert framing_for(["mascot"], slot="misc") == BODY


class TestFrameTarget:
    head = Vec3(0.0, 1.62, 0.0)
    pelvis = Vec3(0.0, 0.92, 0.0)

    def test_a_bust_centres_just_above_the_head_bone(self):
        centre, span = frame_target(self.head, self.pelvis, BUST)

        assert centre.y > self.head.y
        assert span < 1.0

    def test_a_body_frames_wider_than_a_bust_and_lines_up_with_the_pelvis(self):
        centre, span = frame_target(self.head, self.pelvis, BODY)
        _, bust_span = frame_target(self.head, self.pelvis, BUST)

        assert centre.x == self.pelvis.x and centre.z == self.pelvis.z
        assert span > bust_span

    def test_a_body_frame_holds_the_class_from_below_its_feet_to_above_its_head(self):
        centre, span = frame_target(self.head, self.pelvis, BODY)

        assert centre.y + span / 2 > self.head.y
        assert centre.y - span / 2 < 0.0

    def test_every_class_is_framed_at_the_same_scale(self):
        """A shorter class must not fill the frame like a taller one, or the grid reads wrong."""
        scout = frame_target(Vec3(0.0, 1.55, 0.0), Vec3(0.0, 0.88, 0.0), BODY)
        heavy = frame_target(Vec3(0.0, 1.74, 0.0), Vec3(0.0, 0.96, 0.0), BODY)

        assert scout[1] == heavy[1]
        assert scout[0].y == heavy[0].y

    def test_an_unknown_framing_is_refused(self):
        with pytest.raises(ValueError, match="unknown framing"):
            frame_target(self.head, self.pelvis, "portrait")


def box(low, high) -> Bounds:
    return Bounds(Vec3(*low), Vec3(*high))


#: Roughly where each of these sits on a Class standing with its feet at y=0.
PARROT = box((0.10, 1.34, -0.04), (0.26, 1.50, 0.10))
HAT = box((-0.12, 1.62, -0.12), (0.12, 1.82, 0.12))
TOP = box((-0.20, 0.92, -0.14), (0.20, 1.48, 0.14))
TROUSERS = box((-0.18, 0.02, -0.12), (0.18, 0.96, 0.12))
WHOLE_BODY = box((-0.30, 0.00, -0.20), (0.30, 1.80, 0.20))


class TestBounds:
    def test_a_box_holds_every_point_it_was_built_around(self):
        bounds = Bounds.around([Vec3(0.0, 1.0, -0.5), Vec3(0.4, 1.6, 0.2)])

        assert bounds.low == Vec3(0.0, 1.0, -0.5)
        assert bounds.high == Vec3(0.4, 1.6, 0.2)
        assert bounds.centre == Vec3(0.2, 1.3, -0.15)

    def test_no_points_is_no_box(self):
        assert Bounds.around([]) is None

    def test_extent_along_an_axis_is_the_box_measured_in_that_direction(self):
        bounds = box((-1.0, -2.0, -3.0), (1.0, 2.0, 3.0))

        assert bounds.extent_along(Vec3(1.0, 0.0, 0.0)) == pytest.approx(2.0)
        assert bounds.extent_along(Vec3(0.0, 1.0, 0.0)) == pytest.approx(4.0)
        assert bounds.extent_along(Vec3(0.0, 0.0, -1.0)) == pytest.approx(6.0)


class TestViewAxes:
    def test_the_axes_are_the_camera_s_own_right_and_up(self):
        right, up = view_axes()
        centre = Vec3(0.0, 1.5, 0.0)

        placement = camera_placement(centre, 1.0)
        camera_right = Vec3(*(placement[row][0] for row in range(3)))
        camera_up = Vec3(*(placement[row][1] for row in range(3)))

        assert right == pytest.approx(tuple(camera_right), abs=1e-9)
        assert up == pytest.approx(tuple(camera_up), abs=1e-9)


class TestFrameForBounds:
    """What the picture shows is the Cosmetic's own extent, with a little of the Class round it."""

    def test_the_cosmetic_fits_with_room_to_spare_on_both_axes(self):
        right, up = view_axes()

        _, span = frame_for_bounds(WHOLE_BODY)

        assert span > WHOLE_BODY.extent_along(right)
        assert span > WHOLE_BODY.extent_along(up)

    def test_a_parrot_is_framed_on_the_parrot_and_not_on_the_class(self):
        centre, span = frame_for_bounds(PARROT)

        assert span == pytest.approx(MIN_SPAN)
        assert centre.y - span / 2 < PARROT.low.y and PARROT.high.y < centre.y + span / 2
        assert centre.y - span / 2 > 1.0  # the Class's legs and feet are nowhere in it

    def test_a_smaller_cosmetic_is_framed_tighter_than_a_larger_one(self):
        assert frame_for_bounds(HAT)[1] < frame_for_bounds(TOP)[1] < frame_for_bounds(WHOLE_BODY)[1]

    def test_a_top_cuts_the_legs_off_below_it(self):
        centre, span = frame_for_bounds(TOP)

        assert centre.y - span / 2 > 0.0

    def test_trousers_show_the_legs_and_leave_the_head_out(self):
        centre, span = frame_for_bounds(TROUSERS)

        assert centre.y + span / 2 < 1.5

    def test_nothing_is_framed_wider_than_a_whole_body(self):
        _, span = frame_for_bounds(box((-2.0, 0.0, -2.0), (2.0, 4.0, 2.0)))

        assert span == pytest.approx(BODY_SPAN)

    def test_a_frame_never_digs_below_the_ground_the_class_stands_on(self):
        centre, span = frame_for_bounds(TROUSERS)

        assert centre.y - span / 2 >= BODY_FLOOR - 1e-9

    def test_the_room_a_small_cosmetic_does_not_fill_goes_to_the_wearer_below_it(self):
        """A hat with a face under it reads; a hat with empty air over it does not."""
        centre, span = frame_for_bounds(HAT)

        above = centre.y + span / 2 - HAT.high.y
        below = HAT.low.y - (centre.y - span / 2)
        assert 0.0 < above < below

    def test_a_cosmetic_that_fills_its_frame_is_not_dropped_in_it(self):
        centre, _ = frame_for_bounds(TROUSERS)
        undropped, _ = frame_for_bounds(TROUSERS, min_span=0.0)

        assert centre.y == pytest.approx(undropped.y)

    def test_a_pin_is_not_magnified_past_what_reads_as_a_cosmetic(self):
        _, span = frame_for_bounds(box((0.0, 1.40, 0.0), (0.02, 1.42, 0.02)))

        assert span == pytest.approx(MIN_SPAN)


class TestCamera:
    centre = Vec3(0.0, 1.7, 0.0)

    def test_the_camera_stands_off_far_enough_to_fit_the_span(self):
        span = 0.8

        placement = camera_placement(self.centre, span)

        distance = (translation_of(placement) - self.centre).length
        half_angle = math.atan((span / 2) / distance)
        assert half_angle == pytest.approx(math.atan(36 / (2 * 85)), rel=1e-6)

    def test_a_wider_span_moves_the_camera_further_back(self):
        near = (translation_of(camera_placement(self.centre, 0.8)) - self.centre).length
        far = (translation_of(camera_placement(self.centre, 2.0)) - self.centre).length

        assert far > near

    def test_the_camera_views_the_model_from_its_front_and_slightly_above(self):
        """The imported model faces +Z and is Y-up, so a three-quarter view sits at +Z, above."""
        position = translation_of(camera_placement(self.centre, 0.8))

        assert position.z > 0.0
        assert position.y > self.centre.y

    def test_the_camera_looks_at_the_centre_with_world_y_up(self):
        placement = camera_placement(self.centre, 0.8)

        position = translation_of(placement)
        forward = Vec3(*(row[2] for row in placement[:3])).scaled(-1.0)
        to_centre = (self.centre - position).normalized()
        assert forward.x == pytest.approx(to_centre.x, abs=1e-9)
        assert forward.y == pytest.approx(to_centre.y, abs=1e-9)
        assert forward.z == pytest.approx(to_centre.z, abs=1e-9)
        assert Vec3(*(row[1] for row in placement[:3])).y > 0.0


class TestLightRig:
    def test_the_rig_is_the_three_lights_the_spike_settled_on(self):
        assert [light.name for light in LIGHT_RIG] == ["key", "fill", "rim"]

    def test_every_light_is_placed_relative_to_the_framed_centre_and_aimed_at_it(self):
        centre = Vec3(0.0, 1.7, 0.0)

        for light in LIGHT_RIG:
            placement = light_placement(light, centre)

            position = translation_of(placement)
            assert position == centre + Vec3(*light.offset)
            forward = Vec3(*(row[2] for row in placement[:3])).scaled(-1.0)
            to_centre = (centre - position).normalized()
            assert forward.y == pytest.approx(to_centre.y, abs=1e-9)


class TestBodygroupNames:
    """SourceIO renames a collection whose name is taken, and the names collide constantly."""

    known = ["hat", "medal", "soldier", "rocket"]

    def test_a_collection_named_after_its_bodygroup_is_that_bodygroup(self):
        assert bodygroup_named("hat", self.known) == "hat"

    def test_a_suffixed_collection_is_matched_back_to_its_bodygroup(self):
        assert bodygroup_named("hat_1", self.known) == "hat"
        assert bodygroup_named("soldier_1", self.known) == "soldier"

    def test_blenders_own_duplicate_suffix_is_matched_too(self):
        assert bodygroup_named("medal.001", self.known) == "medal"

    def test_an_exact_match_wins_over_stripping_a_suffix(self):
        assert bodygroup_named("hat_1", ["hat_1", "hat"]) == "hat_1"

    def test_a_collection_that_is_no_bodygroup_of_this_model_matches_nothing(self):
        assert bodygroup_named("soldier_ATTACHMENTS", self.known) is None
        assert bodygroup_named("headphones", self.known) is None


class TestBodygroups:
    defaults = {"hat": True, "medal": False, "rocket": False, "head": True}

    def test_a_bodygroup_the_item_hides_is_hidden(self):
        assert visible_bodygroups(self.defaults, ["hat"])["hat"] is False

    def test_a_bodygroup_off_in_the_game_stays_off(self):
        visible = visible_bodygroups(self.defaults, [])

        assert visible["medal"] is False
        assert visible["rocket"] is False

    def test_everything_else_is_visible(self):
        assert visible_bodygroups(self.defaults, ["hat"])["head"] is True

    def test_hiding_is_case_insensitive_like_the_engine(self):
        assert visible_bodygroups(self.defaults, ["HAT"])["hat"] is False

    def test_hiding_a_bodygroup_the_class_does_not_have_changes_nothing(self):
        assert visible_bodygroups(self.defaults, ["ears"]) == visible_bodygroups(self.defaults, [])


class TestTeamSkin:
    def test_red_renders_the_items_red_family(self):
        choice = skin_plan("red", skin_red=0, skin_blu=1, family_count=2)

        assert choice.family == 0
        assert choice.fell_back_to_red is False

    def test_blu_renders_the_items_blu_family(self):
        choice = skin_plan("blu", skin_red=0, skin_blu=1, family_count=2)

        assert choice.family == 1
        assert choice.fell_back_to_red is False

    def test_a_model_with_no_blu_family_renders_red_and_says_so(self):
        choice = skin_plan("blu", skin_red=0, skin_blu=1, family_count=1)

        assert choice.family == 0
        assert choice.fell_back_to_red is True

    def test_an_item_naming_unusual_families_is_taken_at_its_word(self):
        choice = skin_plan("blu", skin_red=2, skin_blu=3, family_count=4)

        assert choice.family == 3

    def test_a_red_family_beyond_the_model_falls_back_to_the_first(self):
        choice = skin_plan("red", skin_red=2, skin_blu=3, family_count=1)

        assert choice.family == 0
        assert choice.fell_back_to_red is True

    def test_an_unknown_team_is_refused(self):
        with pytest.raises(ValueError, match="unknown Team"):
            skin_plan("green", skin_red=0, skin_blu=1, family_count=2)


class TestAttachment:
    def test_a_hat_bone_at_the_origin_lands_on_the_class_head_bone(self):
        """Hats are authored in head-bone space with one bone at the origin (spike finding)."""
        class_bones = {"bip_head": translated(0.0, 1.6, 0.1)}
        item_bones = {"bip_head": IDENTITY}

        result = alignment(class_bones, item_bones)

        assert result is not None
        assert result.anchor == "bip_head"
        assert transform_point(result.matrix, Vec3(0.0, 0.0, 0.0)) == Vec3(0.0, 1.6, 0.1)

    def test_an_item_already_authored_in_world_space_is_left_where_it_is(self):
        bones = {"bip_head": translated(0.0, 1.6, 0.1), "bip_spine": translated(0.0, 1.2, 0.0)}

        result = alignment(bones, dict(bones))

        assert result is not None
        assert translation_of(result.matrix) == Vec3(0.0, 0.0, 0.0)
        assert result.disagreeing == []

    def test_the_head_bone_anchors_the_placement_when_several_bones_are_shared(self):
        class_bones = {"bip_spine": translated(0.0, 1.2, 0.0), "bip_head": translated(0.0, 1.6, 0.0)}
        item_bones = {"bip_spine": IDENTITY, "bip_head": IDENTITY}

        result = alignment(class_bones, item_bones)

        assert result.anchor == "bip_head"
        assert result.shared == ["bip_head", "bip_spine"]
        assert result.disagreeing == ["bip_spine"]

    def test_the_first_shared_bone_anchors_when_there_is_no_head_bone(self):
        result = alignment({"bip_pelvis": translated(0.0, 0.9, 0.0)}, {"bip_pelvis": IDENTITY})

        assert result.anchor == "bip_pelvis"

    def test_an_item_sharing_no_bone_with_the_class_cannot_be_attached(self):
        assert alignment({"bip_head": IDENTITY}, {"prop_bone": IDENTITY}) is None
