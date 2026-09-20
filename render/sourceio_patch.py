"""Our workarounds for SourceIO 5.5.4, applied from our code at start-up.

The add-on is never edited (spec R1): upgrading it must stay a matter of replacing the folder.
Everything we have to work around is patched onto its classes here, once per Blender process,
and written up in `docs/render/run-notes.md`.

Two quirks, both found by the spike:

1. Some TF2 items spell their material directory with a leading slash, so SourceIO asks the
   archive for `materials//models/...` and never finds the team-colour material — the item
   renders untinted. Collapsing repeated slashes on every content lookup fixes it.
2. `$detailblendmode 5` (used by eyeball materials) sends SourceIO's detail handler down a
   path that assumes the shader's BSDF output is already linked; on TF2 eyes it is not, and
   the handler raises. The detail layer is cosmetic at TF2's blend factors, so we let the
   material load without it rather than lose the import.

Only `collapse_slashes` is pure; the rest needs SourceIO and is exercised by the render smoke
test.
"""
from __future__ import annotations

_patched = False


def collapse_slashes(path: str) -> str:
    """`materials//models/x.vmt` -> `materials/models/x.vmt`, leaving a UNC prefix alone."""
    prefix, rest = ("//", path[2:]) if path.startswith("//") and not path.startswith("///") else ("", path)
    while "//" in rest:
        rest = rest.replace("//", "/")
    return prefix + rest


def apply_patches(log=print) -> None:
    """Patch SourceIO in this process. Safe to call again; the second call does nothing."""
    global _patched
    if _patched:
        return
    _patch_content_lookups(log)
    _patch_detail_handler(log)
    _patched = True


def _patch_content_lookups(log) -> None:
    from SourceIO.library.shared.content_manager.manager import ContentManager
    from SourceIO.library.utils.tiny_path import TinyPath

    def normalized(path):
        return TinyPath(collapse_slashes(str(path)))

    original_find = ContentManager.find_file
    original_check = ContentManager.check

    def find_file(self, path, *args, **kwargs):
        return original_find(self, normalized(path), *args, **kwargs)

    def check(self, path, *args, **kwargs):
        return original_check(self, normalized(path), *args, **kwargs)

    ContentManager.find_file = find_file
    ContentManager.check = check
    log("patched SourceIO content lookups to collapse '//'")


def _patch_detail_handler(log) -> None:
    from SourceIO.blender_bindings.material_loader.shaders.source1_shaders.detail import (
        DetailSupportMixin,
    )

    def without_detail_on_error(method):
        def handler(self, next_socket, albedo_socket, *args, **kwargs):
            try:
                return method(self, next_socket, albedo_socket, *args, **kwargs)
            except Exception as error:  # noqa: BLE001 - the detail layer is never worth an import
                log(f"  detail layer skipped (mode {self.detailmode}): {error!r}")
                return albedo_socket, None

        return handler

    DetailSupportMixin.handle_detail = without_detail_on_error(DetailSupportMixin.handle_detail)
    DetailSupportMixin.handle_detail2 = without_detail_on_error(DetailSupportMixin.handle_detail2)
    log("patched SourceIO detail handler to survive $detailblendmode 5")
