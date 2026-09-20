#!/usr/bin/env python3
"""A pull request says which issue it closes, in its body, where GitHub reads it.

Issue #4 was delivered by #19 and stayed open. The PR named `#4` in its **title** —
which GitHub does not act on — and its body carried no closing keyword, so nothing
closed the issue and nothing said so. A day later the issue still read as open work
and a session set out to build what was already on `main`. #20, one commit later,
opened with `Closes #9.` and closed its issue on merge. The difference was one line.

That is a discipline problem, and discipline is the wrong tool: the omission is
invisible at the moment it is made, the PR merges green, and the cost lands on
whoever reads the tracker next. So it is a rule instead. This hook refuses to open
a pull request whose body would not close anything, and says which line to add.

It reads the body the PR will actually get, by the same routes `gh` does:

    --body-file / -F   the file's contents
    --body / -b        the argument
    --fill, or neither the commit messages on the branch — which is also what
                       `.claude/scripts/land.py` falls back to when given no body

A pull request that genuinely closes no issue — a guard resync, a dependency bump —
says so in a line of its own and is allowed:

    No issue: syncing the guard from upstream.

It fails **open** on every question it cannot answer: an unreadable body file, a
command it cannot parse, a branch whose commits git will not print. Blocking the
only writer in a tree over state the hook merely failed to read is the worse error,
and it is the error that gets a hook deleted.

  CLAUDE_PR_CLOSES_ISSUE=off     turns it off
  CLAUDE_PR_CLOSES_ISSUE=warn    reports instead of denying

Both are read from the hook's own environment, which is Claude Code's, so they are
the operator's switches and not a session's.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

# GitHub's own list. Any of these followed by an issue reference closes it on merge.
CLOSING = re.compile(
    r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+"
    r"(?:[\w.-]+/[\w.-]+)?#\d+",
    re.IGNORECASE,
)
# The escape hatch, on a line of its own, with a reason after the colon.
NO_ISSUE = re.compile(r"^\s*no issue\s*:\s*\S+", re.IGNORECASE | re.MULTILINE)

BODY_FILE_FLAGS = ("--body-file", "-F")
BODY_FLAGS = ("--body", "-b")


INTERPRETER = re.compile(r"^(?:.*[\\/])?(?:python(?:3(?:\.\d+)?)?|py)(?:\.exe)?$", re.IGNORECASE)


def runs_land_py(argv: list[str]) -> bool:
    """land.py being *run*, not merely named.

    `grep "pr create" .claude/scripts/land.py` mentions the script and creates nothing,
    and a hook that denies a file read is a hook someone turns off. So the token has to
    be the command itself or the argument of a Python interpreter.
    """
    for i, arg in enumerate(argv):
        if not arg.endswith("land.py"):
            continue
        preceding = [token for token in argv[:i] if not token.startswith("-")]
        if not preceding or INTERPRETER.match(preceding[-1]):
            return True
    return False


def creates_a_pull_request(argv: list[str]) -> bool:
    """`gh pr create`, or land.py, which runs `gh pr create` itself."""
    if runs_land_py(argv):
        return True
    for i, arg in enumerate(argv):
        if arg == "gh" and argv[i + 1 : i + 3] == ["pr", "create"]:
            return True
    return False


def flag_value(argv: list[str], flags: tuple[str, ...]) -> str | None:
    for i, arg in enumerate(argv):
        if arg in flags and i + 1 < len(argv):
            return argv[i + 1]
        for flag in flags:
            if arg.startswith(flag + "="):
                return arg[len(flag) + 1 :]
    return None


def pull_request_body(
    argv: list[str],
    read_file: Callable[[str], str | None],
    branch_commits: Callable[[], str | None],
) -> str | None:
    """The body the pull request will get, by whichever route `gh` would take."""
    path = flag_value(argv, BODY_FILE_FLAGS)
    if path is not None:
        return read_file(path)
    body = flag_value(argv, BODY_FLAGS)
    if body is not None:
        return body
    # `--fill`, `--fill-first`, or land.py with no body: gh builds the body from the
    # commits on the branch.
    return branch_commits()


def closes_an_issue(body: str) -> bool:
    return bool(CLOSING.search(body) or NO_ISSUE.search(body))


def reason(argv: list[str], body: str) -> str:
    title = flag_value(argv, ("--title", "-t")) or ""
    note = ""
    if re.search(r"#\d+", title):
        note = (
            "The title names an issue, and GitHub does not act on the title — only on "
            "the body. That is exactly how #4 was delivered by #19 and stayed open.\n\n"
        )
    return (
        "Denied: this pull request's body would not close an issue.\n\n"
        + note
        + "Put a closing keyword and the issue number on the body's first line, where "
        "GitHub reads it:\n\n"
        "    Closes #<n>.\n\n"
        "`closes`, `fixes` and `resolves` all work, in any tense. A `--fill` body comes "
        "from the branch's commit messages, so the line can live in the commit instead.\n\n"
        "If this pull request genuinely closes no issue — a guard resync, a dependency "
        "bump — say so with a reason and this passes:\n\n"
        "    No issue: <why>\n\n"
        f"The body checked was:\n\n{(body.strip() or '(empty)')[:500]}"
    )


def review(
    command: str,
    *,
    read_file: Callable[[str], str | None],
    branch_commits: Callable[[], str | None],
) -> str | None:
    """A deny reason, or None to allow. The whole decision, with no disk and no git."""
    try:
        argv = shlex.split(command, posix=True)
    except ValueError:
        return None  # An unparseable command is not one to judge.
    if not creates_a_pull_request(argv):
        return None
    body = pull_request_body(argv, read_file, branch_commits)
    if body is None:
        return None  # Nothing to read means nothing to conclude.
    if closes_an_issue(body):
        return None
    return reason(argv, body)


# ------------------------------------------------------------------ the hook itself


def file_reader(cwd: Path) -> Callable[[str], str | None]:
    def read(path: str) -> str | None:
        try:
            return (cwd / path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None

    return read


def integration_branch(cwd: Path) -> str:
    for parent in (cwd, *cwd.parents):
        config = parent / ".claude" / "worktree-per-change.json"
        if config.is_file():
            try:
                return json.loads(config.read_text(encoding="utf-8"))["integrationBranch"]
            except (OSError, ValueError, KeyError):
                break
    return "main"


def commit_reader(cwd: Path) -> Callable[[], str | None]:
    def read() -> str | None:
        branch = integration_branch(cwd)
        for revisions in (f"origin/{branch}..HEAD", "-1"):
            try:
                result = subprocess.run(
                    ["git", "-C", str(cwd), "log", revisions, "--pretty=%B"],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
            except (OSError, subprocess.SubprocessError):
                return None
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout
        return None

    return read


def main() -> None:
    mode = (os.environ.get("CLAUDE_PR_CLOSES_ISSUE") or "on").strip().lower()
    if mode == "off":
        return
    try:
        payload = json.load(sys.stdin)
    except (ValueError, OSError):
        return
    if payload.get("tool_name") not in ("Bash", "PowerShell"):
        return
    command = (payload.get("tool_input") or {}).get("command")
    cwd = payload.get("cwd")
    if not command or not cwd:
        return

    tree = Path(cwd)
    denial = review(command, read_file=file_reader(tree), branch_commits=commit_reader(tree))
    if denial is None:
        return
    if mode == "warn":
        # Report and say nothing about permission: an explicit `allow` here would
        # auto-approve the call and make warn mode more permissive than no hook at all.
        json.dump({"systemMessage": "pr-closes-issue (warn mode) would have denied this. " + denial}, sys.stdout)
        return
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": denial,
            }
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
    sys.exit(0)
