# Publishing the renders: the bucket, and the deployment that reads it

The images are never committed (ADR-0001) and the site never calls an API (ADR-0002), so what
a visitor sees is exactly what is in the bucket. A deployment with no bucket behind it is not
broken — every row falls back to its Backpack Icon, which is what production does for an
unrendered Cosmetic anyway — it is just a catalogue with no pictures, which is what
https://tf2-cosm.vercel.app was until this step existed.

Two settings, one on each side, are the whole of it:

| Side | Setting | Value |
| --- | --- | --- |
| The render job | `RENDER_BUCKET`, `RENDER_BUCKET_ENDPOINT`, `RENDER_BUCKET_KEY_ID`, `RENDER_BUCKET_SECRET` | the bucket to upload to |
| The site's build | `NEXT_PUBLIC_RENDER_BASE_URL` | the bucket's public URL |

They have to agree, and nothing checks that they do: the manifest's paths are relative to
both, so a prefix on one side and not the other is a page of 404s with a green build.

## The four steps

### 1. A bucket

Cloudflare R2, at https://dash.cloudflare.com → R2. Create a bucket — `tf2-cosm-renders` is
the name the rest of this assumes — in an automatic location. 465 MB of derivatives sits
inside the 10 GB free tier, and R2 charges nothing for egress, which for a page that is
mostly images is the number that matters.

### 2. Credentials for it

R2 → **Manage API tokens** → **Create API token**, with **Object Read & Write** permission on
that one bucket and nothing else. Copy the three values it shows once — the account endpoint,
the access key id and the secret — into `.env` at the repository root, which is gitignored:

```bash
RENDER_BUCKET=tf2-cosm-renders
RENDER_BUCKET_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
RENDER_BUCKET_KEY_ID=<access key id>
RENDER_BUCKET_SECRET=<secret access key>
```

The secret only ever lives there and in the environment `render.publish` reads. It is never
logged, never written to the manifest and never passed on a command line. A variable already
set in the shell wins over the file, and `--env-file` points at another one — which a
worktree needs, since `.env` is gitignored and only the main checkout has it.

### 3. Upload

```bash
./.venv/Scripts/python.exe -m render.publish --dry-run
./.venv/Scripts/python.exe -m render.publish
```

The dry run reads the manifest, lists the bucket and says what it would send, without writing
anything; it works with no credentials at all, and then plans against an empty bucket.

The real run uploads every derivative the manifest records, eight at a time, and is resumable
in the same way `render.derive` is: an object already there at the same number of bytes is
skipped, so a run stopped halfway picks up where it left off and a run over finished work
uploads nothing. `--force` re-uploads regardless, `--sizes 256` narrows to one web size, and
`--workers` changes how many are in flight.

Masters stay on the machine that rendered them: 8 GB the site never asks for, and the archive
every derivative can be remade from.

A run refuses outright — before its first upload, with a non-zero exit and nothing sent — if
what it would leave in the bucket crosses `--max-bucket-bytes`, 9 GB by default. See *Staying
inside the free tier* below.

### 4. Point the deployment at it

The bucket needs a public URL. In R2 → the bucket → **Settings** → **Public access**, either

- connect a **custom domain** you already have on Cloudflare — `images.<your domain>` — which
  is what a production deployment should use, or
- enable the **r2.dev** development URL, which is quicker and which Cloudflare rate-limits and
  asks you not to rely on in production.

Then, in the Vercel project → Settings → Environment Variables, for Production and Preview:

```
NEXT_PUBLIC_RENDER_BASE_URL=https://<the public URL>
```

Next inlines `NEXT_PUBLIC_*` at build time (`site/src/renders/base-url.ts`), so the variable
is baked into the static export and **an existing deployment does not pick it up** — redeploy
after setting it.

Check one image before trusting the page:

```bash
curl -I https://<the public URL>/web/team-captain/soldier-red-0@256.webp
```

`200` with `content-type: image/webp` is the answer. A 200 with
`application/octet-stream` means the object went up without its type and the browser will
download it instead of drawing it; re-upload with `--force`.

## Staying inside the free tier

R2's free tier, per month: **10 GB-month of storage**, **1 million Class A operations** (a
`PutObject` or a page of `ListObjects`), **10 million Class B**, and **egress free** —
which is the one that matters for a page that is mostly pictures, and the reason this is R2
and not S3.

What the catalogue actually costs against that:

| | Free each month | A full publish |
| --- | --- | --- |
| Storage | 10 GB | 0.47 GB |
| Class A (writes, listings) | 1,000,000 | ~24,700 the first time, ~25 on a run with nothing to do |
| Egress | free | — |

Two orders of magnitude of headroom, and a second run over finished work uploads nothing, so
routine re-publishing costs a listing. The risk is not the catalogue growing into the tier —
it is one wrong command, `--derivatives-dir masters` being the obvious one, putting 8 GB up
in a single run.

So the job refuses. Before it uploads anything, it knows what the bucket holds (it has just
listed it) and what it is about to add, and if the two together cross `--max-bucket-bytes` —
9 GB by default, headroom under the 10 — it sends nothing at all and exits non-zero:

```
[publish] this run would leave 8.51 GB in the bucket, past the 9 GB budget ...
```

Overwriting an object counts its new bytes, not both, so re-publishing the same catalogue at
a new quality is never read as growth. `--max-bucket-bytes 0` lifts the guard for someone who
means it.

Nothing on Cloudflare's side is a hard cap — R2 has no spending limit to switch on, only
notifications — so the guard in the job is the real one. Worth adding the notification as
well, at **https://dash.cloudflare.com/?to=/:account/notifications**: **Add** → *Billing usage
alert* → R2 storage, at 80% of the free tier. That one tells you; this one stops you.

## What a prefix changes

`RENDER_BUCKET_PREFIX` puts every key in a folder inside the bucket, and the base URL then has
to include that folder — the prefix is what the output root becomes on the other side. Unset
is simplest: the bucket holds `web/<slug>/<class>-<team>-<style>@<size>.webp` at its root,
exactly the paths the manifest records.

## After a re-render

`resolve` → `batch` → `derive` → `publish`, and only the last one has anything new to say:
a re-derived image is a different number of bytes, so the next publish replaces it. The keys
are not content-hashed, so a browser can hold the old picture for as long as the
`Cache-Control` says — a week by default, `--cache-control` to change it.

Nothing prunes. An object whose Cosmetic has been renamed keeps its old key and is simply
never asked for again; deleting it is a manual job in the dashboard, and 4 KB.
