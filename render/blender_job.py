"""The render step: job list in, PNG masters and manifest entries out. Runs inside Blender.

    blender -b --factory-startup --python render/blender_job.py -- \
        --jobs jobs.json --slug team-captain --teams red blu

Everything after `--` is ours. This module is the Blender adapter and nothing else: it mounts
the game, imports models, applies what `render.scene` decided, renders, and writes the
manifest. Every decision it applies — framing, camera, lights, bodygroup visibility, Team skin,
attachment — is computed in the pure modules, which are tested in the project venv.

One Blender process handles the whole selection: the game mounts once and SourceIO is patched
once (`render.sourceio_patch`). A job that fails is recorded in the manifest with a reason and
the run carries on, so one bad model never stops a long run.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import bpy
from mathutils import Matrix

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SITE_PACKAGES = REPO_ROOT / ".venv" / "Lib" / "site-packages"


def _import_path(argv: list[str]) -> None:
    """Make `render` and its pure-Python dependencies importable inside Blender's Python.

    Blender's interpreter has its own site-packages, without vdf or vpk; the project venv's are
    pure Python, so adding that folder to the path is enough. It has to happen before the first
    `render` import, which is why it reads the argument itself rather than waiting for argparse.
    """
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    given = argv.index("--site-packages") + 1 if "--site-packages" in argv else None
    site_packages = Path(argv[given]) if given and given < len(argv) else DEFAULT_SITE_PACKAGES
    if site_packages.exists() and str(site_packages) not in sys.path:
        sys.path.append(str(site_packages))


_import_path(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])

from render import scene as scene_plan  # noqa: E402
from render.cli import add_job_filters, add_render_paths  # noqa: E402
from render.extract import CLASS_MODELS, ModelCache, ModelNotInArchive  # noqa: E402
from render.geometry import Vec3  # noqa: E402
from render.jobs import validate_job_list  # noqa: E402
from render.manifest import (  # noqa: E402
    REASON_IMPORT_ERROR,
    REASON_MODEL_MISSING,
    REASON_NO_SKELETON,
    REASON_RENDER_ERROR,
    image_relpath,
    load_manifest,
)
from render.mdlinfo import read_mdl  # noqa: E402
from render.selection import select_jobs, selected_teams  # noqa: E402
from render.sourceio_patch import apply_patches  # noqa: E402


def log(*parts: object) -> None:
    print("[render]", *parts, flush=True)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class RenderFailure(Exception):
    """A job that cannot be rendered, carrying the reason the manifest should record."""

    def __init__(self, reason: str, detail: str) -> None:
        super().__init__(f"{reason}: {detail}")
        self.reason = reason
        self.detail = detail


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    argv = argv if argv is not None else (sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    parser = argparse.ArgumentParser(prog="blender_job", description=__doc__)
    add_job_filters(parser, teams_flag="--teams")
    parser.set_defaults(teams=list(scene_plan.TEAMS))
    add_render_paths(parser)
    return parser.parse_args(argv)


# --- Blender plumbing -------------------------------------------------------------------


def clear_scene() -> None:
    """Empty the scene between jobs, leaving the mounted game and the patched add-on alone."""
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for block in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures, bpy.data.materials,
                  bpy.data.images, bpy.data.cameras, bpy.data.lights, bpy.data.node_groups):
        for item in list(block):
            block.remove(item, do_unlink=True)


def mount_game(tf: Path, cache: Path) -> None:
    bpy.ops.preferences.addon_enable(module="SourceIO")
    apply_patches(log=log)
    texture_cache = (cache / "texture-cache").resolve()
    texture_cache.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.TextureCachePath = str(texture_cache)
    bpy.ops.sourceio.new_resource(filepath=str(tf))
    log(f"mounted {tf}")


def import_model(path: Path) -> tuple[bpy.types.Collection, list[bpy.types.Object]]:
    """Import one .mdl with SourceIO's game-accurate shader; raise RenderFailure if it will not."""
    before_objects = {o.name for o in bpy.data.objects}
    before_collections = {c.name for c in bpy.data.collections}
    started = time.perf_counter()
    try:
        bpy.ops.sourceio.mdl(
            filepath=str(path),
            files=[{"name": path.name}],
            directory=str(path.parent),
            discover_resources=False,
            import_textures=True,
            use_bvlg=True,  # the game shader: tint, lightwarp and phong (Principled renders paintables white)
            bodygroup_grouping=True,
            import_animations=False,
            write_qc=False,
            import_physics=False,
        )
    except Exception as error:  # noqa: BLE001 - any import failure is a recorded failure, not a crash
        raise RenderFailure(REASON_IMPORT_ERROR, f"{path.name}: {error!r}") from error
    objects = [o for o in bpy.data.objects if o.name not in before_objects]
    # The import's own collection, found by structure rather than by name: Blender renames a
    # collection to <name>.001 when an earlier job of the same Class has not been freed yet.
    fresh = [c for c in bpy.data.collections if c.name not in before_collections]
    nested = {child.name for collection in fresh for child in collection.children}
    roots = [c for c in fresh if c.name not in nested]
    roots.sort(key=lambda c: not c.name.startswith(path.stem))
    if not roots:
        raise RenderFailure(REASON_IMPORT_ERROR, f"SourceIO created no collection for {path.stem}")
    log(f"  imported {path.name} in {time.perf_counter() - started:.2f}s ({len(objects)} objects)")
    return roots[0], objects


def bodygroup_meshes(
    root: bpy.types.Collection, known: list[str]
) -> dict[str, list[bpy.types.Object]]:
    """SourceIO nests <model>/<bodygroup>/<submodel>, renaming a collection whose name is taken."""
    meshes: dict[str, list[bpy.types.Object]] = {}
    for child in root.children:
        bodygroup = scene_plan.bodygroup_named(child.name, known)
        if bodygroup is None:
            continue
        found = [o for o in child.all_objects if o.type == "MESH"]
        if found:
            meshes.setdefault(bodygroup, []).extend(found)
    return meshes


def apply_bodygroups(root: bpy.types.Collection, mdl: Path, hide: list[str]) -> None:
    """Hide what the game hides: bodygroups off by default, plus the ones this Cosmetic hides."""
    info = read_mdl(mdl.read_bytes())
    defaults = {group.name: group.default_visible for group in info.bodygroups}
    visible = scene_plan.visible_bodygroups(defaults, hide)
    for name, meshes in bodygroup_meshes(root, list(defaults)).items():
        shown = visible.get(name, True)
        for mesh in meshes:
            mesh.hide_render = not shown
            mesh.hide_viewport = not shown
        if not shown:
            log(f"  hid bodygroup {name!r} ({len(meshes)} mesh)")


def apply_skin(objects: list[bpy.types.Object], family: int) -> int:
    """Swap every mesh's materials to `family`, the way the game's skin table does.

    `obj['skin_groups']` holds one material list per skin family — the model's whole material
    table, not just this mesh's slots — so the swap goes through a material-to-material map
    built from every family at once. Mapping from every family, rather than only from family 0,
    is what lets the other Team be rendered from the same import.
    """
    swapped = 0
    for obj in objects:
        if obj.type != "MESH" or "skin_groups" not in obj:
            continue
        groups = obj["skin_groups"].to_dict()
        target = groups.get(str(family))
        if target is None:
            log(f"  no skin family {family} for {obj.name!r} (has {sorted(groups)})")
            continue
        if not target:  # a mesh with no materials of its own has nothing to swap
            continue
        replacement = {
            material: target[index]
            for materials in groups.values()
            for index, material in enumerate(materials)
            if index < len(target)
        }
        for slot in obj.material_slots:
            wanted = replacement.get(slot.material)
            if wanted is not None and wanted is not slot.material:
                slot.material = wanted
                swapped += 1
        obj["active_skin"] = str(family)
    return swapped


def skin_families(mdl: Path) -> int:
    return read_mdl(mdl.read_bytes()).skin_family_count


def as_mat4(matrix: Matrix) -> tuple[tuple[float, ...], ...]:
    return tuple(tuple(row) for row in matrix)


def attach(class_armature: bpy.types.Object, item_armature: bpy.types.Object) -> None:
    """Place the cosmetic's armature so its bones coincide with the class skeleton (bonemerge)."""
    class_bones = {
        bone.name: as_mat4(class_armature.matrix_world @ bone.matrix_local)
        for bone in class_armature.data.bones
    }
    item_bones = {bone.name: as_mat4(bone.matrix_local) for bone in item_armature.data.bones}
    result = scene_plan.alignment(class_bones, item_bones)
    if result is None:
        raise RenderFailure(
            REASON_NO_SKELETON,
            f"{item_armature.name} shares no bone with the class skeleton",
        )
    item_armature.matrix_world = Matrix(result.matrix)
    note = f"; bones disagreeing with it: {result.disagreeing}" if result.disagreeing else ""
    log(f"  attached via {result.anchor!r} ({len(result.shared)} shared bones){note}")


def bone_position(armature: bpy.types.Object, name: str, fallback: Vec3) -> Vec3:
    bones = armature.data.bones
    if name not in bones:
        return fallback
    return Vec3(*(armature.matrix_world @ bones[name].head_local))


def build_camera_and_lights(centre: Vec3, span: float) -> None:
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("cam")
    camera_data.lens = scene_plan.LENS_MM
    camera_data.sensor_width = scene_plan.SENSOR_WIDTH_MM
    camera = bpy.data.objects.new("cam", camera_data)
    scene.collection.objects.link(camera)
    camera.matrix_world = Matrix(scene_plan.camera_placement(centre, span))
    scene.camera = camera

    for light in scene_plan.LIGHT_RIG:
        data = bpy.data.lights.new(light.name, type=light.kind)
        data.energy = light.energy
        if light.kind == "AREA":
            data.size = light.size
        obj = bpy.data.objects.new(light.name, data)
        scene.collection.objects.link(obj)
        obj.matrix_world = Matrix(scene_plan.light_placement(light, centre))

    world = scene.world or bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = scene_plan.WORLD_COLOR
        background.inputs["Strength"].default_value = scene_plan.WORLD_STRENGTH


def configure_render(size: int, samples: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.eevee.taa_render_samples = samples
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def render_to(out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(out.resolve())
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as error:  # noqa: BLE001 - a failed frame is a recorded failure, not a crash
        raise RenderFailure(REASON_RENDER_ERROR, f"{out.name}: {error!r}") from error
    if not out.exists():
        raise RenderFailure(REASON_RENDER_ERROR, f"Blender wrote no file at {out}")


# --- The run ----------------------------------------------------------------------------


def as_failure(error: Exception, default_reason: str) -> RenderFailure:
    """Whatever went wrong, as something the manifest can record and the run can walk past.

    Only the failures we anticipated arrive as RenderFailure. Anything else — a truncated
    .mdl, an add-on that raises where it never has before — is recorded under `default_reason`
    with its traceback printed, because losing the rest of a ten-hour run to it is worse.
    """
    if isinstance(error, RenderFailure):
        log(f"  FAILED {error.reason}: {error.detail}")
        return error
    traceback.print_exc()
    log(f"  FAILED {default_reason}: {error!r}")
    return RenderFailure(default_reason, repr(error))


class ImportedJob:
    """One job's scene: both models in, framed and lit, ready for either Team.

    The Class and the Cosmetic keep their own skin tables: a Cosmetic with no BLU skin falls
    back to RED on its own, while the Class it is worn on still renders in the Team's colours.
    """

    def __init__(
        self,
        class_objects: list[bpy.types.Object],
        class_families: int,
        item_objects: list[bpy.types.Object],
        item_families: int,
    ) -> None:
        self.class_objects = class_objects
        self.class_families = class_families
        self.item_objects = item_objects
        self.item_families = item_families


def set_up_job(job: dict, cache: ModelCache, args: argparse.Namespace) -> ImportedJob:
    clear_scene()
    class_model = CLASS_MODELS[job["class"]]
    try:
        class_path = cache.ensure(class_model)
        item_path = cache.ensure(job["model"])
    except ModelNotInArchive as error:
        raise RenderFailure(REASON_MODEL_MISSING, str(error)) from error

    class_root, class_objects = import_model(class_path)
    item_root, item_objects = import_model(item_path)
    apply_bodygroups(class_root, class_path, job["hide_bodygroups"])
    apply_bodygroups(item_root, item_path, [])

    class_armature = next((o for o in class_objects if o.type == "ARMATURE"), None)
    if class_armature is None:
        raise RenderFailure(REASON_NO_SKELETON, f"{class_model} imported without an armature")
    item_armature = next((o for o in item_objects if o.type == "ARMATURE"), None)
    if item_armature is None:
        raise RenderFailure(REASON_NO_SKELETON, f"{job['model']} imported without an armature")
    attach(class_armature, item_armature)

    framing = scene_plan.framing_for(job["equip_regions"], job["slot"])
    head = bone_position(class_armature, scene_plan.HEAD_BONE, Vec3(0.0, 1.45, 0.0))
    pelvis = bone_position(class_armature, scene_plan.PELVIS_BONE, Vec3(0.0, 0.80, 0.0))
    centre, span = scene_plan.frame_target(head, pelvis, framing)
    log(f"  {framing} frame, centre {tuple(round(v, 3) for v in centre)}, span {span}")
    build_camera_and_lights(centre, span)
    configure_render(args.size, args.samples)
    return ImportedJob(
        class_objects, skin_families(class_path), item_objects, skin_families(item_path)
    )


def render_team(imported: ImportedJob, job: dict, team: str, out_root: Path) -> tuple[str, bool]:
    """Render one Team from an already-imported job: its image path, and whether RED stood in."""
    on_class = scene_plan.skin_plan(
        team,
        skin_red=scene_plan.CLASS_SKIN_RED,
        skin_blu=scene_plan.CLASS_SKIN_BLU,
        family_count=imported.class_families,
    )
    choice = scene_plan.skin_plan(
        team,
        skin_red=job["skin_red"],
        skin_blu=job["skin_blu"],
        family_count=imported.item_families,
    )
    if choice.fell_back_to_red:
        log(f"  {team}: the Cosmetic has no skin family {choice.requested}, rendering it RED")
    if on_class.fell_back_to_red:
        log(f"  {team}: the Class has no skin family {on_class.requested}, rendering it RED")
    apply_skin(imported.class_objects, on_class.family)
    apply_skin(imported.item_objects, choice.family)
    relative = image_relpath(job, team)
    started = time.perf_counter()
    render_to(out_root / relative)
    log(f"  {team}: {relative} in {time.perf_counter() - started:.2f}s")
    return relative, choice.fell_back_to_red or on_class.fell_back_to_red


def run(args: argparse.Namespace) -> int:
    document = json.loads(args.jobs.read_text(encoding="utf-8"))
    validate_job_list(document)
    jobs = select_jobs(document, slugs=args.slug, classes=args.classes, styles=args.styles)
    teams = selected_teams(args.teams)
    manifest = load_manifest(args.manifest)
    log(f"{len(jobs)} jobs x {len(teams)} teams -> {args.out}")

    mount_game(args.tf, args.cache)
    cache = ModelCache.for_game(args.tf, args.cache)

    rendered = failed = 0
    for number, job in enumerate(jobs, start=1):
        log(f"[{number}/{len(jobs)}] {job['slug']} on {job['class']} style {job['style']}")
        try:
            imported = set_up_job(job, cache, args)
        except Exception as error:  # noqa: BLE001 - one bad model never stops a ten-hour run
            failure = as_failure(error, REASON_IMPORT_ERROR)
            for team in teams:
                manifest.fail(job, team, reason=failure.reason, detail=failure.detail, at=now())
            failed += len(teams)
            manifest.write(args.manifest)
            continue
        for team in teams:
            try:
                relative, fell_back_to_red = render_team(imported, job, team, args.out)
            except Exception as error:  # noqa: BLE001 - as above, per Team
                failure = as_failure(error, REASON_RENDER_ERROR)
                manifest.fail(job, team, reason=failure.reason, detail=failure.detail, at=now())
                failed += 1
            else:
                manifest.record(
                    job,
                    team,
                    path=relative,
                    width=args.size,
                    height=args.size,
                    at=now(),
                    fell_back_to_red=fell_back_to_red,
                )
                rendered += 1
        # Once per job, not once per image: the manifest is rewritten whole, and a long run
        # would otherwise spend more time writing it than rendering.
        manifest.write(args.manifest)

    log(f"done: {rendered} rendered, {failed} failed; manifest {args.manifest}")
    return 1 if rendered == 0 and failed else 0


def main() -> int:
    args = parse_args()
    try:
        return run(args)
    except Exception:  # noqa: BLE001 - print a readable reason; Blender swallows tracebacks quietly
        traceback.print_exc()
        return 2


if __name__ == "__main__":
    sys.exit(main())
