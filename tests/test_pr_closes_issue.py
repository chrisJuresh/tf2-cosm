"""The hook that stops a pull request being opened without closing its issue.

Issue #4 was delivered by #19 and stayed open for a day: the PR named `#4` in its
title, which GitHub does not act on, and its body carried no closing keyword. The
hook exists so that cannot happen quietly again, and these tests are the record of
what it does and does not refuse.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

HOOK = Path(__file__).resolve().parents[1] / ".claude" / "hooks" / "pr-closes-issue.py"


def load_hook():
    spec = importlib.util.spec_from_file_location("pr_closes_issue", HOOK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


hook = load_hook()


def review(command: str, *, files: dict[str, str] | None = None, commits: str | None = None):
    """The seam: one command in, a deny reason or None out. No disk, no git."""
    files = files or {}
    return hook.review(
        command,
        read_file=lambda path: files.get(path),
        branch_commits=lambda: commits,
    )


# ------------------------------------------------------- commands that open a PR


def test_a_body_file_that_closes_an_issue_is_allowed():
    assert review("gh pr create --base main --body-file B", files={"B": "Closes #4.\n\nWork."}) is None


def test_a_body_that_closes_an_issue_is_allowed():
    assert review('gh pr create --body "Fixes #12"') is None


def test_land_py_is_covered_because_it_creates_the_pr_itself():
    assert review("python .claude/scripts/land.py --title T --body-file B", files={"B": "no keyword"})


def test_fill_takes_the_body_from_the_branch_commits():
    assert review("gh pr create --fill", commits="Resolve the thing\n\nCloses #7.") is None


def test_land_py_with_no_body_file_falls_back_to_the_branch_commits():
    assert review("python .claude/scripts/land.py", commits="Closes #7.") is None


# -------------------------------------------------------------- what is refused


def test_an_issue_named_only_in_the_title_is_refused():
    """The exact shape of #19: `#4` in the title, nothing in the body."""
    reason = review('gh pr create --title "Resolve step (#4)" --body "Grow the spike into a module."')
    assert reason is not None
    assert "title" in reason


def test_a_body_with_no_issue_reference_at_all_is_refused():
    reason = review("gh pr create --fill", commits="Tidy the imports")
    assert reason is not None
    assert "Closes #" in reason


def test_a_bare_issue_number_does_not_close_anything():
    assert review('gh pr create --body "Part of #2, see #4"') is not None


@pytest.mark.parametrize(
    "keyword", ["Closes", "closes", "Closed", "Fixes", "fixed", "Resolves", "RESOLVED"]
)
def test_every_closing_keyword_github_honours_is_accepted(keyword):
    assert review(f'gh pr create --body "{keyword} #4"') is None


def test_a_cross_repository_reference_is_accepted():
    assert review('gh pr create --body "Closes chrisJuresh/tf2-cosm#4"') is None


# ------------------------------------------------ the escape hatch, and what is ignored


def test_a_pull_request_that_genuinely_closes_no_issue_says_so_and_is_allowed():
    assert review('gh pr create --body "No issue: syncing the guard from upstream."') is None


def test_the_escape_hatch_needs_a_reason():
    assert review('gh pr create --body "No issue"') is not None


@pytest.mark.parametrize(
    "command",
    [
        "gh pr view 19",
        "gh pr merge --squash",
        "gh issue list --state open",
        'git commit -m "Closes nothing"',
        "python -m render.resolve --dry-run",
    ],
)
def test_commands_that_open_no_pull_request_are_left_alone(command):
    assert review(command) is None


@pytest.mark.parametrize(
    "command",
    [
        'grep -n "pr create" .claude/scripts/land.py',
        "cat .claude/scripts/land.py",
        "wc -l .claude/scripts/land.py",
    ],
)
def test_reading_land_py_is_not_running_it(command):
    """A hook that denies a file read is a hook someone turns off."""
    assert review(command, commits="Tidy the imports") is None


@pytest.mark.parametrize(
    "command",
    [
        "python .claude/scripts/land.py",
        "python -S .claude/scripts/land.py --title T",
        "./.claude/scripts/land.py",
        "cd /repo && python .claude/scripts/land.py",
    ],
)
def test_running_land_py_however_it_is_spelled_is_covered(command):
    assert review(command, commits="Tidy the imports") is not None


def test_a_colon_after_the_keyword_still_closes_the_issue():
    """GitHub honours `Closes: #4`; denying it would be a false refusal."""
    assert review('gh pr create --body "Closes: #4"') is None


# --------------------------------------------------------------------- failing open


def test_an_unreadable_body_file_is_allowed_rather_than_guessed_at():
    """Blocking the only writer over state the hook merely failed to read is the worse error."""
    assert review("gh pr create --body-file missing.md") is None


def test_an_unparseable_command_is_allowed():
    assert review('gh pr create --body "unbalanced') is None


def test_branch_commits_that_cannot_be_read_are_allowed():
    assert review("gh pr create --fill", commits=None) is None
