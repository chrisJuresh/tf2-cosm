"""Web derivatives: two smaller images, alpha kept, on a consistent trimmed canvas."""
from __future__ import annotations

from math import ceil

import pytest
from PIL import Image

from render.derivatives import (
    DERIVATIVE_FORMAT,
    DERIVATIVE_SIZES,
    TRIM_PADDING,
    EmptyMaster,
    derive_image,
    trim_to_square,
    write_derivatives,
)


def a_master(size: int = 256, box: tuple[int, int, int, int] = (64, 32, 128, 160)) -> Image.Image:
    """A transparent square with one opaque rectangle on it, standing in for a silhouette."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    image.paste((200, 60, 60, 255), box)
    return image


def write_master(path, **kwargs) -> Image.Image:
    image = a_master(**kwargs)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")
    return image


def test_trimming_keeps_every_opaque_pixel():
    master = a_master(box=(64, 32, 128, 160))
    opaque_before = master.getchannel("A").histogram()[255]

    trimmed = trim_to_square(master)

    assert trimmed.getchannel("A").histogram()[255] == opaque_before


def test_the_trimmed_canvas_is_square_so_nothing_is_ever_distorted():
    trimmed = trim_to_square(a_master(box=(10, 10, 20, 200)))

    assert trimmed.width == trimmed.height


def test_the_trimmed_canvas_is_the_content_plus_a_fixed_margin():
    # The content is 128 tall and 64 wide, so the square is the taller side plus a margin
    # of TRIM_PADDING of that side on each of the four edges.
    trimmed = trim_to_square(a_master(box=(64, 32, 128, 160)))

    assert trimmed.width == 128 + 2 * ceil(128 * TRIM_PADDING)


def test_trimming_centres_the_content_so_the_margin_is_even():
    trimmed = trim_to_square(a_master(box=(0, 0, 40, 40)))
    left, top, right, bottom = trimmed.getchannel("A").getbbox()

    assert left == trimmed.width - right
    assert top == trimmed.height - bottom


def test_the_transparent_border_survives_trimming():
    trimmed = trim_to_square(a_master())

    assert trimmed.mode == "RGBA"
    assert trimmed.getpixel((0, 0))[3] == 0


def test_a_master_with_nothing_on_it_is_refused_rather_than_trimmed_to_nothing():
    with pytest.raises(EmptyMaster):
        trim_to_square(Image.new("RGBA", (64, 64), (0, 0, 0, 0)))


def test_a_derivative_is_square_at_the_size_asked_for():
    derived = derive_image(a_master(), 128)

    assert derived.size == (128, 128)


def test_two_masters_framed_differently_still_share_one_canvas():
    one = derive_image(a_master(box=(0, 0, 30, 30)), 64)
    other = derive_image(a_master(box=(100, 10, 250, 250)), 64)

    assert one.size == other.size


def test_writing_derivatives_puts_both_sizes_on_disk_with_their_dimensions(tmp_path):
    master = tmp_path / "masters/team-captain/soldier-red-0.png"
    write_master(master)

    derivatives = write_derivatives(
        master,
        {
            "512": "web/team-captain/soldier-red-0@512.webp",
            "256": "web/team-captain/soldier-red-0@256.webp",
        },
        tmp_path,
    )

    assert sorted(derivatives) == ["256", "512"]
    for size, record in derivatives.items():
        written = tmp_path / record["path"]
        assert written.exists()
        assert record["width"] == record["height"] == int(size)
        with Image.open(written) as image:
            assert image.size == (int(size), int(size))
            assert image.format == DERIVATIVE_FORMAT.upper()


def test_a_written_derivative_keeps_its_transparent_background(tmp_path):
    master = tmp_path / "m.png"
    write_master(master)

    derivatives = write_derivatives(master, {"64": "web/m@64.webp"}, tmp_path)

    with Image.open(tmp_path / derivatives["64"]["path"]) as image:
        assert image.convert("RGBA").getpixel((0, 0))[3] == 0


def test_a_master_that_is_not_there_is_refused_rather_than_written_around(tmp_path):
    with pytest.raises(FileNotFoundError):
        write_derivatives(tmp_path / "absent.png", {"64": "web/absent@64.webp"}, tmp_path)


def test_the_sizes_the_job_ships_are_two_web_sizes_smaller_than_the_master():
    assert len(DERIVATIVE_SIZES) == 2
    assert all(size < 1024 for size in DERIVATIVE_SIZES)
    assert DERIVATIVE_SIZES == tuple(sorted(DERIVATIVE_SIZES, reverse=True))
