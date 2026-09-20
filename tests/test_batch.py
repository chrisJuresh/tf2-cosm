"""The batch runner: one command that renders what is missing and can be run again."""
from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

from render import batch as runner
from render.jobs import job_list
from render.manifest import REASON_IMPORT_ERROR, Manifest, load_manifest
from render.output import OutputLayout
from render.plan import Batch, JobWork, account_for
from tests.test_manifest import AT, a_job
from tests.test_plan import BATTERS, KILLER, TEAM_CAPTAIN, master_relpath


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    (tmp_path / "blender.exe").write_text("", encoding="utf-8")
    return tmp_path


def write_jobs(where: Path, *jobs: dict) -> Path:
    path = where / "jobs.json"
    path.write_text(json.dumps(job_list(list(jobs), source="tests")), encoding="utf-8")
    return path


def args_for(workspace: Path, jobs: Path, **overrides) -> object:
    settings = {
        "jobs": jobs,
        "slug": None,
        "classes": None,
        "styles": None,
        "teams": ["red", "blu"],
        "batch_size": 8,
        "workers": 1,
        "dry_run": False,
        "retry_failed": False,
        "trust_manifest": True,
        "blender": workspace / "blender.exe",
        "tf": workspace / "tf",
        "cache": workspace / "cache",
        "texture_cache": None,
        "root": workspace / "out",
        "masters_dir": "masters",
        "manifest": workspace / "renders.json",
        "size": 1024,
        "samples": 32,
        "site_packages": workspace / "site-packages",
    }
    settings.update(overrides)
    return runner.Settings(**settings)


class FakeBlender:
    """Stands in for a Blender process: reads the batch it was handed and writes its results.

    It parses the command the runner built, so a command Blender could not act on fails here
    too. `outcomes` maps a Cosmetic slug to what becomes of it: rendered, failed, or lost to a
    crash that leaves no manifest record at all.
    """

    def __init__(self, *, outcomes: dict[str, str] | None = None) -> None:
        self.outcomes = outcomes or {}
        self.commands: list[list[str]] = []
        self.batch_sizes: list[int] = []
        self.lock = threading.Lock()

    def __call__(self, command: list[str]) -> int:
        with self.lock:
            self.commands.append(command)
        given = command[command.index("--jobs") + 1]
        root = Path(command[command.index("--root") + 1])
        teams = command[command.index("--teams") + 1 :]
        # The manifest it writes is the one the runner named, which is a shard of its own:
        # a fake that wrote to the run's manifest instead would hide the very clobbering the
        # shards exist to prevent.
        into = Path(command[command.index("--manifest") + 1])
        document = json.loads(Path(given).read_text(encoding="utf-8"))
        with self.lock:
            self.batch_sizes.append(len(document["jobs"]))
        manifest = load_manifest(into)
        crashed = False
        for job in document["jobs"]:
            outcome = self.outcomes.get(job["slug"], "rendered")
            if outcome == "crash":
                crashed = True
                break
            for team in teams:
                if outcome == "failed":
                    manifest.fail(job, team, reason=REASON_IMPORT_ERROR, detail="no", at=AT)
                else:
                    relative = master_relpath(job, team)
                    image = root / relative
                    image.parent.mkdir(parents=True, exist_ok=True)
                    image.write_bytes(b"PNG")
                    manifest.record(
                        job, team, path=relative, width=1024, height=1024, at=AT
                    )
        manifest.write(into)
        return 1 if crashed else 0


# --- a run ------------------------------------------------------------------------------


def test_a_run_renders_every_job_and_writes_the_manifest(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS)
    blender = FakeBlender()

    code = runner.run(args_for(workspace, jobs), launch=blender)

    assert code == 0
    manifest = load_manifest(workspace / "renders.json")
    assert manifest.entry("team-captain", "soldier", "red", 0)["master"]["width"] == 1024
    assert manifest.entry("batters-helmet", "scout", "blu", 1) is not None


def test_a_second_run_over_the_same_jobs_renders_nothing(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS)
    blender = FakeBlender()
    runner.run(args_for(workspace, jobs), launch=blender)
    first = len(blender.commands)

    code = runner.run(args_for(workspace, jobs), launch=blender)

    assert code == 0
    assert len(blender.commands) == first, "Blender was opened for work already done"


def test_a_job_version_bump_re_renders_everything(workspace: Path, monkeypatch):
    jobs = write_jobs(workspace, TEAM_CAPTAIN)
    blender = FakeBlender()
    runner.run(args_for(workspace, jobs), launch=blender)

    monkeypatch.setattr("render.plan.JOB_LIST_VERSION", 2)
    runner.run(args_for(workspace, jobs), launch=blender)

    assert len(blender.commands) == 2


def test_only_the_missing_teams_of_a_half_rendered_job_are_asked_for(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN)
    manifest = Manifest()
    manifest.record(
        TEAM_CAPTAIN, "red", path="x.png", width=1024, height=1024, at=AT
    )
    manifest.write(workspace / "renders.json")
    blender = FakeBlender()

    runner.run(args_for(workspace, jobs), launch=blender)

    command = blender.commands[0]
    assert command[command.index("--teams") + 1 :] == ["blu"]


# --- batches and crashes ----------------------------------------------------------------


def test_the_run_is_cut_into_batches_of_the_size_asked_for(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS, KILLER)
    blender = FakeBlender()

    runner.run(args_for(workspace, jobs, batch_size=4), launch=blender)

    assert blender.batch_sizes == [2, 1]


def test_a_crash_costs_its_batch_and_no_more(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS, KILLER)
    blender = FakeBlender(outcomes={"batters-helmet": "crash"})

    code = runner.run(args_for(workspace, jobs, batch_size=2), launch=blender)

    assert code == 1, "a run that lost work should not report success"
    manifest = load_manifest(workspace / "renders.json")
    assert manifest.entry("team-captain", "soldier", "red", 0) is not None
    assert manifest.entry("killer-exclusive", "heavy", "red", 0) is not None
    assert manifest.entry("batters-helmet", "scout", "red", 1) is None


def test_the_run_after_a_crash_picks_up_only_what_was_lost(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS, KILLER)
    crashing = FakeBlender(outcomes={"batters-helmet": "crash"})
    runner.run(args_for(workspace, jobs, batch_size=2), launch=crashing)
    blender = FakeBlender()

    code = runner.run(args_for(workspace, jobs, batch_size=2), launch=blender)

    assert code == 0
    assert blender.batch_sizes == [1]


# --- failures ---------------------------------------------------------------------------


def test_a_failing_job_does_not_stop_the_run_and_is_not_retried_by_default(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, KILLER)
    blender = FakeBlender(outcomes={"killer-exclusive": "failed"})

    runner.run(args_for(workspace, jobs, batch_size=2), launch=blender)
    again = FakeBlender()
    code = runner.run(args_for(workspace, jobs), launch=again)

    assert code == 0
    assert again.commands == []


def test_failures_can_be_asked_for_again(workspace: Path):
    jobs = write_jobs(workspace, KILLER)
    blender = FakeBlender(outcomes={"killer-exclusive": "failed"})
    runner.run(args_for(workspace, jobs), launch=blender)

    again = FakeBlender()
    runner.run(args_for(workspace, jobs, retry_failed=True), launch=again)

    assert again.batch_sizes == [1]


# --- subsets, dry runs and the missing Blender ---------------------------------------------


def test_a_subset_by_cosmetic_class_and_team_is_the_only_thing_rendered(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS, KILLER)
    blender = FakeBlender()

    runner.run(
        args_for(workspace, jobs, slug=["batters-helmet"], classes=["scout"], teams=["blu"]),
        launch=blender,
    )

    manifest = load_manifest(workspace / "renders.json")
    assert manifest.entry("batters-helmet", "scout", "blu", 1) is not None
    assert manifest.entry("team-captain", "soldier", "red", 0) is None


def test_a_dry_run_never_opens_blender_and_writes_nothing(workspace: Path, capsys):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS)
    blender = FakeBlender()

    code = runner.run(args_for(workspace, jobs, dry_run=True), launch=blender)

    assert code == 0
    assert blender.commands == []
    assert not (workspace / "renders.json").exists()
    printed = capsys.readouterr().out
    assert "4 images" in printed
    assert "team-captain" in printed, "a dry run says which jobs it means, job by job"


def test_a_real_run_opens_with_a_summary_rather_than_every_job(workspace: Path, capsys):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS)
    blender = FakeBlender()

    runner.run(args_for(workspace, jobs), launch=blender)

    opening = capsys.readouterr().out.split("batch 1/")[0]
    assert "soldier   2 images" in opening
    assert "team-captain" not in opening


def test_a_missing_blender_says_where_it_looked_rather_than_failing_obscurely(
    workspace: Path, capsys
):
    jobs = write_jobs(workspace, TEAM_CAPTAIN)
    blender = FakeBlender()

    code = runner.run(
        args_for(workspace, jobs, blender=workspace / "nowhere.exe"), launch=blender
    )

    assert code == 2
    assert blender.commands == []
    assert "nowhere.exe" in capsys.readouterr().err


def test_an_image_the_manifest_claims_but_disk_has_lost_is_rendered_again(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN)
    blender = FakeBlender()
    runner.run(args_for(workspace, jobs), launch=blender)
    for image in (workspace / "out").rglob("*.png"):
        image.unlink()

    again = FakeBlender()
    runner.run(args_for(workspace, jobs, trust_manifest=False), launch=again)

    assert again.batch_sizes == [1]


def test_ctrl_c_stops_after_the_batch_it_interrupted_rather_than_raising(workspace: Path, capsys):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS, KILLER)

    def interrupted(command: list[str]) -> int:
        raise KeyboardInterrupt

    code = runner.run(args_for(workspace, jobs, batch_size=2), launch=interrupted)

    assert code == 130
    assert "run it again" in capsys.readouterr().out


def test_the_failure_list_is_this_runs_failures_and_not_the_whole_manifest(
    workspace: Path, capsys
):
    manifest = Manifest()
    manifest.fail(BATTERS, "red", reason=REASON_IMPORT_ERROR, detail="an older run", at=AT)
    manifest.write(workspace / "renders.json")
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS, KILLER)
    blender = FakeBlender(outcomes={"killer-exclusive": "failed"})

    runner.run(args_for(workspace, jobs, slug=["team-captain", "killer-exclusive"]), launch=blender)

    printed = capsys.readouterr().out
    assert "killer-exclusive" in printed
    assert "an older run" not in printed


def test_a_run_with_nothing_left_to_do_still_reports_the_failures_it_is_standing_on(
    workspace: Path, capsys
):
    """The run after a failing one has no work, and its failures are the whole news in it."""
    jobs = write_jobs(workspace, KILLER)
    blender = FakeBlender(outcomes={"killer-exclusive": "failed"})
    runner.run(args_for(workspace, jobs), launch=blender)
    capsys.readouterr()

    runner.run(args_for(workspace, jobs), launch=FakeBlender())

    printed = capsys.readouterr().out
    assert "2 failures" in printed
    assert "killer-exclusive" in printed


# --- the command line -----------------------------------------------------------------------


@pytest.mark.parametrize("flag", ["--slug", "--class", "--team", "--style"])
def test_a_filter_given_no_values_is_refused_rather_than_read_as_everything(flag):
    """`nargs="*"` would make `--team` with nothing after it mean "no Teams", and render nothing."""
    with pytest.raises(SystemExit):
        runner.parse_args(["--jobs", "jobs.json", flag])


def test_the_command_line_is_parsed_into_the_settings_a_run_takes():
    settings = runner.parse_args(
        ["--jobs", "jobs.json", "--class", "spy", "--team", "red", "--batch-size", "8", "--dry-run"]
    )

    assert (settings.classes, settings.teams, settings.batch_size) == (["spy"], ["red"], 8)
    assert settings.dry_run and not settings.retry_failed and not settings.trust_manifest


def test_the_batch_is_handed_to_blender_as_a_job_list_of_its_own(tmp_path: Path):
    settings = runner.parse_args(["--jobs", "jobs.json"])
    layout = OutputLayout.from_env({"RENDER_OUTPUT_ROOT": str(tmp_path / "out")})

    command = runner.blender_command(
        settings,
        layout,
        tmp_path / "batch-1.json",
        Batch((), ("red", "blu")),
        manifest=tmp_path / "shard-1.json",
        texture_cache=tmp_path / "textures",
    )

    assert command[1:5] == ["-b", "--factory-startup", "--python", str(runner.BLENDER_SCRIPT)]
    assert command[command.index("--jobs") + 1] == str(tmp_path / "batch-1.json")
    assert command[command.index("--teams") + 1 :] == ["red", "blu"]
    # settled paths, not the flags that were typed: the child must not resolve the layout again
    assert command[command.index("--root") + 1] == str(tmp_path / "out")
    assert command[command.index("--masters-dir") + 1] == layout.masters_dir
    # its own shard and its own texture cache, never the run's
    assert command[command.index("--manifest") + 1] == str(tmp_path / "shard-1.json")
    assert command[command.index("--texture-cache") + 1] == str(tmp_path / "textures")


def test_a_blender_that_is_there_needs_no_explaining(workspace: Path):
    assert runner.check_blender(workspace / "blender.exe") is None


def test_a_blender_that_is_not_there_is_never_swapped_for_another_one(tmp_path: Path):
    complaint = runner.check_blender(tmp_path / "nowhere.exe")

    assert complaint is not None
    assert "nowhere.exe" in complaint and "Install Blender" in complaint


# --- what a batch came to -----------------------------------------------------------------


def test_a_batch_is_accounted_for_render_by_render():
    manifest = Manifest()
    manifest.record(TEAM_CAPTAIN, "red", path="x.png", width=1, height=1, at=AT)
    manifest.fail(TEAM_CAPTAIN, "blu", reason=REASON_IMPORT_ERROR, detail="no", at=AT)

    outcome = account_for(manifest, Batch((TEAM_CAPTAIN, KILLER), ("red", "blu")))

    assert (outcome.rendered, outcome.failed, outcome.lost) == (1, 1, 2)


# --- several Blenders at once -------------------------------------------------------------


def test_every_batch_gets_a_manifest_shard_of_its_own(workspace: Path):
    """Two processes sharing a manifest file would each rewrite it whole and drop the other's."""
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS, KILLER)
    blender = FakeBlender()

    runner.run(args_for(workspace, jobs, batch_size=2), launch=blender)

    named = [command[command.index("--manifest") + 1] for command in blender.commands]
    assert len(set(named)) == len(named), "two batches were pointed at one manifest"
    assert str(workspace / "renders.json") not in named, "a batch wrote the run's manifest"


def test_the_run_renders_everything_with_several_workers(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN, BATTERS, KILLER)
    blender = FakeBlender()

    code = runner.run(args_for(workspace, jobs, batch_size=2, workers=3), launch=blender)

    assert code == 0
    manifest = load_manifest(workspace / "renders.json")
    for slug, cls, style in (
        ("team-captain", "soldier", 0),
        ("batters-helmet", "scout", 1),
        ("killer-exclusive", "heavy", 0),
    ):
        for team in ("red", "blu"):
            assert manifest.entry(slug, cls, team, style) is not None, f"{slug} {team} lost"


def test_workers_do_not_drop_each_others_work(workspace: Path):
    """The point of the shards: every batch's results survive into the run's manifest."""
    jobs = write_jobs(workspace, *[dict(TEAM_CAPTAIN, slug=f"hat-{n}") for n in range(12)])
    blender = FakeBlender()

    runner.run(args_for(workspace, jobs, batch_size=2, workers=4), launch=blender)

    manifest = load_manifest(workspace / "renders.json")
    assert [n for n in range(12) if manifest.entry(f"hat-{n}", "soldier", "red", 0) is None] == []


def test_a_crash_in_one_worker_costs_its_batch_and_no_more(workspace: Path):
    jobs = write_jobs(workspace, *[dict(TEAM_CAPTAIN, slug=f"hat-{n}") for n in range(8)])
    blender = FakeBlender(outcomes={"hat-3": "crash"})

    # Four images a batch is two jobs a batch, so the crashing batch has a survivor in it:
    # what the batch wrote before it died has to reach the manifest like anything else.
    code = runner.run(args_for(workspace, jobs, batch_size=4, workers=4), launch=blender)

    assert code == 1, "a run that lost work should not report success"
    manifest = load_manifest(workspace / "renders.json")
    survived = [n for n in range(8) if manifest.entry(f"hat-{n}", "soldier", "red", 0) is not None]
    assert 3 not in survived
    assert len(survived) == 7, "a crash in one worker took more than its own batch"


def test_a_failure_recorded_by_one_worker_reaches_the_run_manifest(workspace: Path):
    jobs = write_jobs(workspace, *[dict(TEAM_CAPTAIN, slug=f"hat-{n}") for n in range(6)])
    blender = FakeBlender(outcomes={"hat-4": "failed"})

    runner.run(args_for(workspace, jobs, batch_size=2, workers=3), launch=blender)

    manifest = load_manifest(workspace / "renders.json")
    assert manifest.failure("hat-4", "soldier", "red", 0)["reason"] == REASON_IMPORT_ERROR


def test_more_workers_than_batches_opens_no_idle_blender(workspace: Path):
    jobs = write_jobs(workspace, TEAM_CAPTAIN)
    blender = FakeBlender()

    runner.run(args_for(workspace, jobs, batch_size=8, workers=16), launch=blender)

    assert len(blender.commands) == 1


def test_each_worker_gets_a_texture_cache_of_its_own(workspace: Path):
    """SourceIO writes decoded textures in place, so two processes must not share a cache."""
    jobs = write_jobs(workspace, *[dict(TEAM_CAPTAIN, slug=f"hat-{n}") for n in range(8)])
    blender = FakeBlender()

    runner.run(args_for(workspace, jobs, batch_size=2, workers=4), launch=blender)

    caches = {command[command.index("--texture-cache") + 1] for command in blender.commands}
    assert len(caches) == 4


def test_a_single_worker_keeps_the_one_shared_texture_cache(workspace: Path):
    settings = args_for(workspace, workspace / "jobs.json", workers=1)

    assert runner.texture_cache_for(settings, 0) == workspace / "cache" / "texture-cache"
