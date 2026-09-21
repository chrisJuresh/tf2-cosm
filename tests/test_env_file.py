"""`.env`, as the Python side reads it: enough of the format, and never over a real variable."""
from __future__ import annotations

from render.env_file import load_env_file, parse_env_file


def test_a_setting_a_line():
    assert parse_env_file("RENDER_BUCKET=tf2-cosm-renders\nRENDER_BUCKET_REGION=auto\n") == {
        "RENDER_BUCKET": "tf2-cosm-renders",
        "RENDER_BUCKET_REGION": "auto",
    }


def test_comments_blank_lines_and_exports():
    text = "\n# the bucket\n\nexport RENDER_BUCKET=one\nnot a setting\n"

    assert parse_env_file(text) == {"RENDER_BUCKET": "one"}


def test_a_quoted_value_loses_its_quotes():
    assert parse_env_file("A='one two'\nB=\"three\"\n") == {"A": "one two", "B": "three"}


def test_a_secret_keeps_everything_after_the_first_equals():
    assert parse_env_file("RENDER_BUCKET_SECRET=abc=def=\n") == {"RENDER_BUCKET_SECRET": "abc=def="}


def test_the_environment_wins_over_the_file(tmp_path):
    path = tmp_path / ".env"
    path.write_text("RENDER_BUCKET=from-the-file\nRENDER_BUCKET_KEY_ID=key\n", encoding="utf-8")
    env = {"RENDER_BUCKET": "from-the-shell"}

    filled = load_env_file(path, env)

    assert env["RENDER_BUCKET"] == "from-the-shell"
    assert env["RENDER_BUCKET_KEY_ID"] == "key"
    assert filled == ["RENDER_BUCKET_KEY_ID"]


def test_no_file_is_not_a_failure(tmp_path):
    assert load_env_file(tmp_path / "nothing.env", {}) == []
