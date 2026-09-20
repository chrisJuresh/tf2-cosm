"""Master PNG in, web-sized images out. Pillow only — no Blender, no game.

The master is a 1024x1024 transparent PNG framed by the render step. A derivative is the
same picture on a *consistent trimmed canvas*: the transparent margin around the silhouette
is cut away, what is left is centred on a square with a fixed margin, and that square is
resized to the target size. Every derivative of every Cosmetic therefore has the same shape
and the same proportion of empty space, so a grid of them reads evenly whatever the item's
own framing was — user story 9 of the Worn Render spec.

The trade-off is deliberate and lives only here: trimming normalises each item to its own
silhouette, so a pin and a top hat fill their thumbnails equally rather than at true relative
scale. The master keeps the true scale, and a detail view reads that; derivatives are
regenerated from masters at any time, so the rule can change without re-rendering.

Format is WebP: alpha, modern compression, and every browser we care about reads it.
"""
from __future__ import annotations

from math import ceil
from pathlib import Path
from typing import Mapping

from PIL import Image

from render.output import DERIVATIVE_FORMAT

#: The web sizes, largest first: a detail view and a grid thumbnail.
DERIVATIVE_SIZES = (512, 256)

#: Margin added on every side of the trimmed content, as a fraction of its longest side.
TRIM_PADDING = 0.04

#: WebP encoder settings. `method` trades encoding time for file size; measured on these
#: images, 6 costs about fifty times what 4 costs and saves nothing, so 4 it is.
WEBP_QUALITY = 90
WEBP_METHOD = 4


class EmptyMaster(Exception):
    """The master has no opaque pixel, so there is no silhouette to trim to.

    Blender writing a fully transparent frame means the camera framed nothing — a real
    failure worth recording, not a picture worth shrinking.
    """


def trim_to_square(master: Image.Image, padding: float = TRIM_PADDING) -> Image.Image:
    """The master's content, centred on a transparent square with a fixed margin."""
    image = master.convert("RGBA") if master.mode != "RGBA" else master
    box = image.getchannel("A").getbbox()
    if box is None:
        raise EmptyMaster("the master has no opaque pixel")
    content = image.crop(box)
    # The margin is whole pixels on each side rather than a fraction of the whole edge, so
    # the content lands dead centre instead of one pixel off it whenever the total is odd.
    edge = max(content.size) + 2 * ceil(max(content.size) * padding)
    canvas = Image.new("RGBA", (edge, edge), (0, 0, 0, 0))
    canvas.paste(content, ((edge - content.width) // 2, (edge - content.height) // 2))
    return canvas


def derive_image(master: Image.Image, size: int) -> Image.Image:
    """One derivative: the trimmed square at `size` by `size`, alpha intact."""
    if size < 1:
        raise ValueError(f"a derivative size must be at least 1 pixel, got {size}")
    return trim_to_square(master).resize((size, size), Image.Resampling.LANCZOS)


def write_derivatives(
    master: Path, relpaths: Mapping[str, str], root: Path
) -> dict[str, dict[str, object]]:
    """Write one derivative per entry of `relpaths` under `root`; return manifest records.

    `relpaths` maps the size, as the string the manifest keys derivatives by, to the path the
    image takes relative to the output root — the render job never decides where a file lives,
    `render.output` does.
    """
    with Image.open(master) as opened:
        loaded = opened.convert("RGBA")
    written: dict[str, dict[str, object]] = {}
    for size, relpath in relpaths.items():
        pixels = int(size)
        out = root / relpath
        out.parent.mkdir(parents=True, exist_ok=True)
        derive_image(loaded, pixels).save(
            out, format=DERIVATIVE_FORMAT.upper(), quality=WEBP_QUALITY, method=WEBP_METHOD
        )
        written[size] = {"path": relpath, "width": pixels, "height": pixels}
    return written
