"""What a long run prints while you are not watching it."""
from __future__ import annotations

import pytest

from render.progress import estimate_remaining, format_duration, progress_line


@pytest.mark.parametrize(
    "seconds, expected",
    [
        (0, "0s"),
        (9.4, "9s"),
        (59, "59s"),
        (60, "1m 00s"),
        (750, "12m 30s"),
        (3600, "1h 00m"),
        (4335, "1h 12m"),
        (100000, "27h 46m"),
    ],
)
def test_a_duration_reads_at_a_glance(seconds, expected):
    assert format_duration(seconds) == expected


def test_a_duration_nobody_can_estimate_yet_is_not_a_number():
    assert format_duration(None) == "unknown"


def test_time_remaining_is_the_rate_so_far_over_what_is_left():
    assert estimate_remaining(done=10, total=60, elapsed=20.0) == pytest.approx(100.0)


def test_nothing_done_yet_is_no_estimate_rather_than_a_wrong_one():
    assert estimate_remaining(done=0, total=60, elapsed=20.0) is None


def test_a_finished_run_has_no_time_remaining():
    assert estimate_remaining(done=60, total=60, elapsed=20.0) == 0.0


def test_progress_says_done_remaining_failures_and_an_estimate():
    line = progress_line(done=10, failed=2, total=60, elapsed=20.0)

    assert line == "10/60 images - 8 rendered, 2 failed, 50 left - 2.0s each, ~1m 40s remaining"


def test_progress_before_the_first_image_admits_it_cannot_estimate():
    line = progress_line(done=0, failed=0, total=60, elapsed=0.0)

    assert line == "0/60 images - 0 rendered, 0 failed, 60 left - ~unknown remaining"
