"""The bucket the images are served from: its settings, and the one adapter that talks to it.

`render.output` made where an image lives configuration so that the folder could one day be
a bucket (story 22 of the Worn Render spec). This is that day's other half — the thin S3
adapter — kept apart from `render.publish` so the rule about *what* to upload stays pure and
testable with no network and no credentials, and only this module knows about boto3.

S3-compatible rather than Cloudflare-specific on purpose: R2 is what we point it at, and an
endpoint and four settings are all that a bucket is to this job.

    RENDER_BUCKET             the bucket name
    RENDER_BUCKET_ENDPOINT    https://<account>.r2.cloudflarestorage.com
    RENDER_BUCKET_KEY_ID      the access key id
    RENDER_BUCKET_SECRET      the secret access key
    RENDER_BUCKET_PREFIX      optional: a folder inside the bucket every key goes under
    RENDER_BUCKET_REGION      optional: "auto", which is what R2 wants, unless S3 is the target

The secret is read from the environment and never logged, never written to the manifest, and
never passed on a command line.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Mapping, Protocol

DEFAULT_REGION = "auto"

#: A week. The paths are not content-hashed — a re-render writes the same key — so an image
#: cannot be cached forever, and a browser holding last week's hat for a few days is the
#: cost of not asking the bucket for 12,000 unchanged files on every page view.
DEFAULT_CACHE_CONTROL = "public, max-age=604800"

CONTENT_TYPES = {".webp": "image/webp", ".png": "image/png"}


class MissingSettings(Exception):
    """The bucket is not configured, so there is nowhere to publish to."""


class Bucket(Protocol):
    """What publishing needs of a bucket, which is why the fake in the tests is five lines."""

    def list_sizes(self, prefix: str) -> dict[str, int]:
        """Every key under `prefix` that is already there, and how many bytes each one is."""

    def put(self, key: str, path: Path, *, content_type: str, cache_control: str) -> None:
        """Write one local file to one key."""


#: The settings without which there is no bucket to talk to, and the names they are set by.
REQUIRED_SETTINGS = {
    "bucket": "RENDER_BUCKET",
    "endpoint": "RENDER_BUCKET_ENDPOINT",
    "key_id": "RENDER_BUCKET_KEY_ID",
    "secret": "RENDER_BUCKET_SECRET",
}


@dataclass(frozen=True)
class BucketSettings:
    """Where the bucket is and how to sign for it.

    Reading these never fails, and the four that matter default to empty: a dry run on a
    machine with no credentials still has a question worth answering — what is there to
    publish — and `require()` is what a run that means to upload calls first.
    """

    bucket: str = ""
    endpoint: str = ""
    key_id: str = ""
    secret: str = ""
    prefix: str = ""
    region: str = DEFAULT_REGION

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "BucketSettings":
        env = os.environ if env is None else env
        return cls(
            **{field: env.get(name, "").strip() for field, name in REQUIRED_SETTINGS.items()},
            prefix=_prefix(env.get("RENDER_BUCKET_PREFIX", "")),
            region=env.get("RENDER_BUCKET_REGION", "").strip() or DEFAULT_REGION,
        )

    @property
    def missing(self) -> list[str]:
        """The settings that are not set, by the name they are set by."""
        return [name for field, name in REQUIRED_SETTINGS.items() if not getattr(self, field)]

    @property
    def configured(self) -> bool:
        return not self.missing

    def require(self) -> None:
        """Refuse before any work when there is nowhere to publish to.

        Named rather than counted: a run that stops because one setting is unset should say
        which one, not send the reader back to the documentation.
        """
        if self.missing:
            raise MissingSettings(
                f"the bucket is not configured; set {', '.join(self.missing)} (see .env.example)"
            )

    def key_for(self, relpath: str) -> str:
        """The key one manifest path takes in the bucket.

        The manifest's paths are relative to the output root, and the prefix is what the root
        becomes here — so `web/team-captain/soldier-red-0@256.webp` under a prefix of
        `renders` is `renders/web/team-captain/soldier-red-0@256.webp`, and the site's image
        base is the bucket's public URL plus that same prefix.
        """
        return f"{self.prefix}{relpath.lstrip('/')}"


def _prefix(value: str) -> str:
    """A prefix is a folder inside the bucket: no leading slash, one trailing slash, or empty."""
    cleaned = value.strip().strip("/")
    if not cleaned:
        return ""
    folder = PurePosixPath(cleaned)
    if ".." in folder.parts:
        raise ValueError(f"RENDER_BUCKET_PREFIX must be a folder inside the bucket, got {value!r}")
    return f"{folder}/"


def content_type_for(relpath: str) -> str:
    """What a file is served as. An unknown extension is not published as a guess.

    A bucket that serves a WebP as `application/octet-stream` makes a browser download it
    instead of drawing it, and the page would show a broken image with a 200 behind it — the
    one failure this job cannot see from here.
    """
    suffix = PurePosixPath(relpath).suffix.lower()
    if suffix not in CONTENT_TYPES:
        raise ValueError(f"no content type for {relpath!r}; images are {sorted(CONTENT_TYPES)}")
    return CONTENT_TYPES[suffix]


class S3Bucket:
    """A real bucket, over boto3. The only part of the job that opens a socket."""

    def __init__(self, settings: BucketSettings) -> None:
        settings.require()
        try:
            import boto3  # imported here: the rule, the tests and --dry-run need no client
        except ImportError as error:  # pragma: no cover - a missing dependency, not a branch
            raise MissingSettings(
                "boto3 is not installed; run "
                "./.venv/Scripts/python.exe -m pip install -r render/requirements.txt"
            ) from error
        self._settings = settings
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.endpoint,
            aws_access_key_id=settings.key_id,
            aws_secret_access_key=settings.secret,
            region_name=settings.region,
        )

    def list_sizes(self, prefix: str) -> dict[str, int]:
        sizes: dict[str, int] = {}
        for page in self._client.get_paginator("list_objects_v2").paginate(
            Bucket=self._settings.bucket, Prefix=prefix
        ):
            for record in page.get("Contents", ()):
                sizes[record["Key"]] = record["Size"]
        return sizes

    def put(self, key: str, path: Path, *, content_type: str, cache_control: str) -> None:
        self._client.upload_file(
            str(path),
            self._settings.bucket,
            key,
            ExtraArgs={"ContentType": content_type, "CacheControl": cache_control},
        )
