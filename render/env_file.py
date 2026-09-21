"""`.env` at the repository root, as the Python side reads it.

Every secret in this repository lives in one gitignored `.env` (the catalogue job's Steam and
backpack.tf keys, and now the bucket's credentials), so a command that asks the reader to
export four variables by hand instead would be the odd one out — and the one most likely to
be run with three of them set.

Deliberately not a dependency and deliberately small: `KEY=value` a line, `#` starts a
comment, a value may be quoted, and a real environment variable always wins, so a shell that
has already set something is never overridden by a file.
"""
from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV_FILE = REPO_ROOT / ".env"


def parse_env_file(text: str) -> dict[str, str]:
    """The settings one `.env` holds. A line that is not a setting is skipped, not an error."""
    settings: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, _, value = stripped.partition("=")
        name = name.removeprefix("export ").strip()
        if not name:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        settings[name] = value
    return settings


def load_env_file(path: Path | None = None, env: dict[str, str] | None = None) -> list[str]:
    """Fill anything the environment does not already say from `path`; return what was filled.

    A missing file is not a failure: a machine that sets its variables another way is a
    machine with nothing to read here.
    """
    path = DEFAULT_ENV_FILE if path is None else path
    env = os.environ if env is None else env
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    filled = []
    for name, value in parse_env_file(text).items():
        if not env.get(name):
            env[name] = value
            filled.append(name)
    return filled
