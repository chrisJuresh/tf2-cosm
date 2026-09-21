"""The publish step: the manifest's web derivatives, pushed to the bucket the site reads.

    ./.venv/Scripts/python.exe -m render.publish --dry-run
    ./.venv/Scripts/python.exe -m render.publish
    ./.venv/Scripts/python.exe -m render.publish --sizes 256 --workers 16

The site never calls an API and the images are never committed (ADR-0001), so what is on the
page in production is exactly what is in the bucket. This is the step that puts it there, and
the last one in the chain: resolve, render, derive, publish.

It reads the *manifest*, not the folder, because the manifest is the record of what was
rendered and every path in it is already relative to the output root — which is the whole
point of that root being configuration (story 22 of the Worn Render spec). A file sitting in
`renders/web` that no manifest entry claims is a leftover from an older run, and uploading it
would serve a picture the page has no way to ask for.

Masters stay on the machine that rendered them: 8 GB the site never asks for, and the archive
the derivatives can always be remade from.

Resumable in the same way `render.derive` is: the bucket is listed once, and an object that is
already there at the same number of bytes is skipped, so a run interrupted at nine thousand
images picks up where it stopped and a run over finished work uploads nothing. Bytes rather
than a checksum because that is what a listing gives for free — a derivative re-encoded to the
same size to the byte is not a thing the encoder does, and `--force` is there for the day it
is doubted.

The bucket is on a free tier, and a free tier is a cliff rather than a wall: nothing at
Cloudflare stops a run from crossing it, so the guard is here. Because the listing already
says what the bucket holds, the run knows before its first upload what it would leave behind,
and refuses to send anything at all when that is past `--max-bucket-bytes`. Today's whole
catalogue is 465 MB against a 9 GB budget; what the guard is really for is the command that
means to publish the 8 GB of masters by mistake.
"""
from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Mapping, Sequence

from render.bucket import (
    DEFAULT_CACHE_CONTROL,
    Bucket,
    BucketSettings,
    MissingSettings,
    S3Bucket,
    content_type_for,
)
from render.env_file import load_env_file
from render.manifest import Manifest, load_manifest
from render.output import OutputLayout
from render.progress import estimate_remaining, format_duration

DEFAULT_WORKERS = 8

#: How often a run that takes an hour says where it is.
PROGRESS_EVERY = 250

#: Cloudflare R2's free tier: 10 GB of storage a month, egress free. Decimal GB, which is
#: how the bill counts them.
FREE_TIER_BYTES = 10_000_000_000

#: What a run refuses to push the bucket past, with headroom under the free tier so that
#: crossing it is a message rather than an invoice. `--max-bucket-bytes 0` lifts it.
DEFAULT_MAX_BUCKET_BYTES = 9_000_000_000


class OverBudget(Exception):
    """The run would put the bucket past its budget, so none of it is sent."""


def log(*parts: object) -> None:
    print("[publish]", *parts, flush=True)


@dataclass(frozen=True)
class Upload:
    """One image to write: where it is, where it goes, and how big it is."""

    relpath: str
    key: str
    path: Path
    size: int


@dataclass
class Plan:
    """What a run would do, worked out before it opens a single connection."""

    uploads: list[Upload] = field(default_factory=list)
    already_there: int = 0
    missing: list[str] = field(default_factory=list)

    @property
    def bytes_to_upload(self) -> int:
        return sum(upload.size for upload in self.uploads)


@dataclass
class Outcome:
    """What a run did."""

    uploaded: int = 0
    skipped: int = 0
    failed: int = 0
    missing: int = 0


def derivative_paths(manifest: Manifest, sizes: Sequence[int] | None = None) -> list[str]:
    """Every derivative the manifest records, sorted, each one once.

    Sorted so two runs do the same work in the same order and a progress line means something;
    deduplicated because the same picture is recorded under both Teams when BLU fell back to
    RED, and uploading it twice is a waste, not a second image.
    """
    wanted = None if sizes is None else {str(size) for size in sizes}
    paths = {
        record["path"]
        for _, _, _, _, entry in manifest.entries()
        for size, record in entry["derivatives"].items()
        if wanted is None or size in wanted
    }
    return sorted(paths)


def plan_publish(
    relpaths: Iterable[str],
    layout: OutputLayout,
    settings: BucketSettings,
    remote_sizes: dict[str, int],
    *,
    force: bool = False,
) -> Plan:
    """Which of these paths still have to go up, given what the bucket already holds.

    A path the manifest records but the machine does not have is *missing*, not a failure: the
    manifest is committed and shared, so a checkout that has rendered half the catalogue
    publishes its half rather than refusing the run.
    """
    plan = Plan()
    for relpath in relpaths:
        path = layout.path_for(relpath)
        try:
            size = path.stat().st_size
        except OSError:
            plan.missing.append(relpath)
            continue
        key = settings.key_for(relpath)
        if not force and remote_sizes.get(key) == size:
            plan.already_there += 1
            continue
        plan.uploads.append(Upload(relpath=relpath, key=key, path=path, size=size))
    return plan


def format_bytes(count: int) -> str:
    """A size a human reads at a glance, in the decimal units a bill is counted in."""
    for unit, scale in (("GB", 1_000_000_000), ("MB", 1_000_000), ("kB", 1_000)):
        if count >= scale:
            return f"{count / scale:.2f} {unit}".replace(".00 ", " ")
    return f"{count} bytes"


def project_bucket_bytes(plan: Plan, remote_sizes: Mapping[str, int]) -> int:
    """How big the bucket would be once this plan has run.

    What is there, less what this run overwrites, plus what it writes — an image re-uploaded
    at a new size replaces its old bytes rather than adding to them, and counting it twice
    would refuse a run that costs nothing.
    """
    replaced = sum(remote_sizes.get(upload.key, 0) for upload in plan.uploads)
    return sum(remote_sizes.values()) - replaced + plan.bytes_to_upload


def check_budget(plan: Plan, remote_sizes: Mapping[str, int], budget: int) -> int:
    """Refuse a run that would take the bucket past `budget`; return what it would come to.

    Checked before the first upload rather than as the run goes, because a guard that stops
    halfway has already spent whatever it spent. A budget of 0 is no budget at all.
    """
    projected = project_bucket_bytes(plan, remote_sizes)
    if budget and projected > budget:
        raise OverBudget(
            f"this run would leave {format_bytes(projected)} in the bucket, past the "
            f"{format_bytes(budget)} budget"
            + (f" (the free tier is {format_bytes(FREE_TIER_BYTES)})" if budget < FREE_TIER_BYTES else "")
            + "; nothing was uploaded. Publish fewer sizes, or raise --max-bucket-bytes "
            "knowing what it costs."
        )
    return projected


def publish(
    plan: Plan,
    bucket: Bucket,
    *,
    cache_control: str = DEFAULT_CACHE_CONTROL,
    workers: int = DEFAULT_WORKERS,
    on_log: Callable[..., None] = log,
) -> Outcome:
    """Upload everything the plan holds, several at a time, reporting as it goes.

    Threads rather than processes: each upload is a socket waiting, not a core working, and
    the GIL is released for the whole of it.
    """
    outcome = Outcome(skipped=plan.already_there, missing=len(plan.missing))
    total = len(plan.uploads)
    started = time.monotonic()
    done = 0

    def send(upload: Upload) -> tuple[Upload, Exception | None]:
        try:
            bucket.put(
                upload.key,
                upload.path,
                content_type=content_type_for(upload.relpath),
                cache_control=cache_control,
            )
        except Exception as error:  # one image failing is not the run failing
            return upload, error
        return upload, None

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        for upload, error in pool.map(send, plan.uploads):
            done += 1
            if error is not None:
                outcome.failed += 1
                on_log(f"FAILED {upload.relpath}: {error!r}")
            else:
                outcome.uploaded += 1
            if done % PROGRESS_EVERY == 0 or done == total:
                elapsed = time.monotonic() - started
                remaining = estimate_remaining(done=done, total=total, elapsed=elapsed)
                on_log(
                    f"  {done}/{total} images - {outcome.uploaded} uploaded, "
                    f"{outcome.failed} failed - ~{format_duration(remaining)} remaining"
                )
    return outcome


def _sizes(values: list[str] | None) -> list[int] | None:
    if values is None:
        return None
    sizes = []
    for value in values:
        if not value.isdigit() or int(value) < 1:
            raise argparse.ArgumentTypeError(f"a web size is a number of pixels, got {value!r}")
        sizes.append(int(value))
    return sizes


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="render.publish",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--manifest", type=Path, default=None, help="the manifest to publish from")
    parser.add_argument(
        "--env-file",
        type=Path,
        default=None,
        help="where the bucket's settings are read from (default: .env beside this checkout)",
    )
    parser.add_argument("--root", type=Path, default=None, help="the output root images live under")
    parser.add_argument("--derivatives-dir", default=None, help="the image folder holding web sizes")
    parser.add_argument(
        "--sizes", nargs="+", default=None, help="only these web sizes; every recorded size by default"
    )
    parser.add_argument(
        "--cache-control", default=DEFAULT_CACHE_CONTROL, help="the Cache-Control every object gets"
    )
    parser.add_argument(
        "--workers", type=int, default=DEFAULT_WORKERS, help="uploads in flight at once"
    )
    parser.add_argument(
        "--max-bucket-bytes",
        type=int,
        default=DEFAULT_MAX_BUCKET_BYTES,
        help="refuse a run that would leave the bucket bigger than this; 0 for no budget",
    )
    parser.add_argument("--force", action="store_true", help="upload images that are already there")
    parser.add_argument("--dry-run", action="store_true", help="report what would go up, upload nothing")
    args = parser.parse_args(argv)
    try:
        args.sizes = _sizes(args.sizes)
    except argparse.ArgumentTypeError as error:
        parser.error(str(error))
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    # Before anything reads the environment: the credentials live in `.env`, which is where
    # every other secret in this repository lives, and a real variable still wins.
    load_env_file(args.env_file)
    layout = OutputLayout.from_env().overridden(
        root=args.root, derivatives_dir=args.derivatives_dir, manifest=args.manifest
    )
    settings = BucketSettings.from_env()
    if not settings.configured:
        try:
            settings.require()
        except MissingSettings as error:
            if not args.dry_run:
                log(error)
                return 2
            # A dry run still answers "what is there to publish" on a machine with no
            # credentials; it just cannot know what the bucket already holds.
            log(f"{error}; planning against an empty bucket")

    # A dry run opens the client too, and only ever lists with it: what would be uploaded
    # depends on what is up there already, and a plan that guesses at that is not a plan.
    bucket = S3Bucket(settings) if settings.configured else None

    manifest = load_manifest(layout.manifest)
    relpaths = derivative_paths(manifest, args.sizes)
    log(f"{len(relpaths)} images recorded in {layout.manifest}")

    remote: dict[str, int] = {}
    if bucket is not None:
        # The whole bucket, not just this run's prefix: the budget is what the account is
        # billed for, and that is every object in it.
        remote = bucket.list_sizes("")
        log(
            f"{len(remote)} objects already in {settings.bucket} "
            f"({format_bytes(sum(remote.values()))})"
        )

    plan = plan_publish(relpaths, layout, settings, remote, force=args.force)
    if plan.missing:
        log(
            f"{len(plan.missing)} recorded images are not on this machine and will not be "
            f"published, the first being {plan.missing[0]}"
        )
    try:
        projected = check_budget(plan, remote, args.max_bucket_bytes)
    except OverBudget as refused:
        log(refused)
        return 2

    size = format_bytes(plan.bytes_to_upload)
    leaves = f"leaving {format_bytes(projected)} in the bucket"
    if args.dry_run:
        log(
            f"would upload {len(plan.uploads)} images ({size}), skip {plan.already_there} "
            f"already there, {leaves}; nothing uploaded"
        )
        return 0

    log(f"uploading {len(plan.uploads)} images ({size}) to {settings.endpoint}, {leaves}")
    outcome = publish(
        plan,
        bucket,
        cache_control=args.cache_control,
        workers=args.workers,
    )
    log(
        f"done: {outcome.uploaded} uploaded, {outcome.skipped} already there, "
        f"{outcome.failed} failed, {outcome.missing} not on this machine"
    )
    return 1 if outcome.failed else 0


if __name__ == "__main__":
    sys.exit(main())
