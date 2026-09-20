"""How a run that takes hours tells you where it is.

A full render is left running unattended, so the one thing the output has to answer is
whether to wait for it or come back tomorrow. The estimate is the mean rate over the whole
run so far rather than the last batch: renders vary by class and by how much of the assets
cache is already warm, and an estimate that swings by the minute is worse than a steady one
that is a little stale.
"""
from __future__ import annotations


def format_duration(seconds: float | None) -> str:
    """A duration a human reads at a glance: `45s`, `12m 30s`, `1h 12m`."""
    if seconds is None:
        return "unknown"
    whole = int(seconds)
    if whole < 60:
        return f"{whole}s"
    minutes, remainder = divmod(whole, 60)
    if minutes < 60:
        return f"{minutes}m {remainder:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m"


def estimate_remaining(*, done: int, total: int, elapsed: float) -> float | None:
    """Seconds left at the rate so far, or None until there is a rate to go on."""
    if done <= 0:
        return None
    return elapsed / done * max(total - done, 0)


def progress_line(*, done: int, failed: int, total: int, elapsed: float) -> str:
    """One line of progress: what is done, what failed, what is left, and how long it will take."""
    remaining = estimate_remaining(done=done, total=total, elapsed=elapsed)
    rate = f"{elapsed / done:.1f}s each, " if done else ""
    return (
        f"{done}/{total} images - {done - failed} rendered, {failed} failed, "
        f"{max(total - done, 0)} left - {rate}~{format_duration(remaining)} remaining"
    )
