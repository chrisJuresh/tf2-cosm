"""Our workarounds for SourceIO 5.5.4, applied from our code at start-up.

The add-on is never edited (spec R1): upgrading it must stay a matter of replacing the folder.
Everything we have to work around is patched onto its classes here, once per Blender process,
and written up in `docs/render/run-notes.md`.

Four quirks: the first two were found by the spike, the last two by a full run.

1. Some TF2 items spell their material directory with a leading slash, so SourceIO asks the
   archive for `materials//models/...` and never finds the team-colour material — the item
   renders untinted. Collapsing repeated slashes on every content lookup fixes it.
2. `$detailblendmode 5` (used by eyeball materials) sends SourceIO's detail handler down a
   path that assumes the shader's BSDF output is already linked; on TF2 eyes it is not, and
   the handler raises. The detail layer is cosmetic at TF2's blend factors, so we let the
   material load without it rather than lose the import.
3. `TinyPath.suffix` takes the last dot in the *whole* path rather than in the last
   component, so `with_suffix` truncates any path with a dotted directory in it. The texture
   cache is the caller that matters: SourceIO writes a texture to
   `<TextureCachePath>/<texture>.png`, and with our cache under a `.claude/worktrees/...`
   checkout every texture landed on `<repo root>/.png` instead, each overwriting the last.
   Scoping the suffix to the last component fixes the cache and costs nothing else.
4. `VertexLitGeneric.create_nodes` reads `uv.output[0]` where it means `uv.outputs[0]`, and
   `uv` is None unless the material has a `$basetexturetransform`. Either way it raises, the
   material is abandoned half built with its output socket unconnected, and the item renders
   as a flat black silhouette. Both lines are reached by the commonest TF2 material there is —
   a `$phongexponenttexture` with no `$phongexponent` — so about a fifth of the catalogue came
   out with a black hat. We recompile the method from its own source with the typo corrected.

Only `collapse_slashes`, `suffix_of` and `repaired_source` are pure; the rest needs SourceIO
and is exercised by the render smoke test.
"""
from __future__ import annotations

_patched = False


def collapse_slashes(path: str) -> str:
    """`materials//models/x.vmt` -> `materials/models/x.vmt`, leaving a UNC prefix alone."""
    prefix, rest = ("//", path[2:]) if path.startswith("//") and not path.startswith("///") else ("", path)
    while "//" in rest:
        rest = rest.replace("//", "/")
    return prefix + rest


def suffix_of(path: str) -> str:
    """The suffix of the last component of a `/`-separated path.

    `a.b/c` has no suffix, and a leading dot names a dotfile rather than starting one.
    `TinyPath` turns every separator into `/` in `__new__`, so splitting on it is enough.
    """
    name = path[path.rindex("/") + 1 :] if "/" in path else path
    dot = name.rfind(".")
    return name[dot:] if dot > 0 else ""


#: What SourceIO 5.5.4 writes, and what it means. `None` is what the parameter is given when
#: there is no transform to route the texture through, and is what the add-on itself passes
#: everywhere else, so the correction is the expression the author meant rather than a guess.
UV_OUT_TYPO = "uv_out=uv.output[0]"
UV_OUT_FIXED = "uv_out=(uv.outputs[0] if uv is not None else None)"


def repaired_source(source: str) -> tuple[str, int]:
    """`source` with the `uv.output` typo corrected, and how many times it was corrected."""
    return source.replace(UV_OUT_TYPO, UV_OUT_FIXED), source.count(UV_OUT_TYPO)


def apply_patches(log=print) -> None:
    """Patch SourceIO in this process. Safe to call again; the second call does nothing."""
    global _patched
    if _patched:
        return
    _patch_content_lookups(log)
    _patch_detail_handler(log)
    _patch_path_suffix(log)
    _patch_uv_out(log)
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


def _patch_path_suffix(log) -> None:
    from SourceIO.library.utils.tiny_path import TinyPath

    TinyPath.suffix = property(lambda self: suffix_of(str(self)))
    log("patched SourceIO's TinyPath.suffix to read the last component only")


def _patch_uv_out(log) -> None:
    """Recompile `VertexLitGeneric.create_nodes` with its `uv.output` typo corrected.

    A two-character mistake in the middle of a three-hundred-line method: there is no smaller
    seam to reach it through, so the method is taken as text, corrected, and compiled against
    the add-on's own module globals. Nothing on disk is touched. A version of the add-on that
    has fixed the typo leaves nothing to replace, and the method is left exactly as it is.
    """
    import inspect
    import textwrap

    from SourceIO.blender_bindings.material_loader.shaders.source1_shaders import vertexlit_generic
    from SourceIO.blender_bindings.material_loader.shaders.source1_shaders.vertexlit_generic import (
        VertexLitGeneric,
    )

    source = textwrap.dedent(inspect.getsource(VertexLitGeneric.create_nodes))
    repaired, found = repaired_source(source)
    if not found:
        log("SourceIO's uv_out typo is gone; VertexLitGeneric left alone")
        return
    namespace = dict(vertexlit_generic.__dict__)
    exec(compile(repaired, vertexlit_generic.__file__, "exec"), namespace)  # noqa: S102
    VertexLitGeneric.create_nodes = namespace["create_nodes"]
    log(f"patched SourceIO's VertexLitGeneric.create_nodes ({found} uv_out typos)")
