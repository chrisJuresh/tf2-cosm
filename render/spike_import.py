"""Spike: import one class model and one cosmetic with SourceIO inside headless Blender, then render.

Run from the repo root (models must already be in the cache, see extract.py):
    blender -b --factory-startup --python render/spike_import.py -- \
        --cache assets-cache --class-model models/player/soldier.mdl \
        --item-model models/player/items/soldier/soldier_officer.mdl \
        --hide hat --team red --out renders/spike/team_captain_soldier_red.png

Everything after "--" is ours. Findings from this script shape the production render job:
  * SourceIO imports Source models Y-up, facing +Z, in metres (scale 0.01905).
  * One mesh object per bodygroup submodel with geometry, grouped in collections named
    after the bodygroup; submodels that are blank in the game are simply absent, so default
    visibility must come from the .mdl bodypart table (mdlinfo.read_mdl).
  * Each mesh carries obj['skin_groups'] = {'0': [materials...], '1': [...]} ; team skin is a
    positional material remap from family 0 to family N.
"""
from __future__ import annotations

import argparse
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mdlinfo import read_mdl  # noqa: E402

TF = Path("C:/Program Files (x86)/Steam/steamapps/common/Team Fortress 2/tf")
TEAM_SKIN = {"red": 0, "blu": 1}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path("assets-cache"))
    ap.add_argument("--class-model", required=True)
    ap.add_argument("--item-model", required=True)
    ap.add_argument("--hide", nargs="*", default=[], help="class bodygroups the item hides, e.g. hat headphones")
    ap.add_argument("--team", choices=list(TEAM_SKIN), default="red")
    ap.add_argument("--frame", choices=["bust", "body"], default="bust")
    ap.add_argument("--bvlg", action="store_true", help="use SourceIO's BlenderVertexLitGeneric shader")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--save-blend", action="store_true")
    return ap.parse_args(argv)


def log(*parts: object) -> None:
    print("[spike]", *parts, flush=True)


def patch_sourceio() -> None:
    """Work around SourceIO 5.5.4 quirks that break TF2 item materials.

    Some item models list their material directory with a leading slash, so SourceIO asks the
    archive for 'materials//models/...' and the team-colour material is never found. Collapse
    repeated slashes on every content lookup.
    """
    from SourceIO.library.shared.content_manager.manager import ContentManager
    from SourceIO.library.utils.tiny_path import TinyPath

    if getattr(ContentManager, "_tf2cosm_patched", False):
        return

    def normalized(path):
        text = str(path)
        while "//" in text:
            text = text.replace("//", "/")
        return TinyPath(text)

    original_find = ContentManager.find_file
    original_check = ContentManager.check

    def find_file(self, path, *args, **kwargs):
        return original_find(self, normalized(path), *args, **kwargs)

    def check(self, path, *args, **kwargs):
        return original_check(self, normalized(path), *args, **kwargs)

    ContentManager.find_file = find_file
    ContentManager.check = check
    ContentManager._tf2cosm_patched = True
    log("patched SourceIO content lookups to collapse '//'")


def mount_game() -> None:
    scene = bpy.context.scene
    scene.TextureCachePath = str((Path.cwd() / "assets-cache" / "texture-cache").resolve())
    Path(scene.TextureCachePath).mkdir(parents=True, exist_ok=True)
    bpy.ops.sourceio.new_resource(filepath=str(TF))


def import_model(cache: Path, rel: str, bvlg: bool) -> tuple[bpy.types.Collection, list[bpy.types.Object]]:
    path = (cache / "tf" / rel).resolve()
    if not path.exists():
        raise SystemExit(f"model not in cache: {path}")
    before = {o.name for o in bpy.data.objects}
    before_colls = {c.name for c in bpy.data.collections}
    t0 = time.perf_counter()
    result = bpy.ops.sourceio.mdl(
        filepath=str(path),
        files=[{"name": path.name}],
        directory=str(path.parent),
        discover_resources=False,
        import_textures=True,
        use_bvlg=bvlg,
        bodygroup_grouping=True,
        import_animations=False,
        write_qc=False,
        import_physics=False,
    )
    new_objs = [o for o in bpy.data.objects if o.name not in before]
    roots = [c for c in bpy.data.collections if c.name not in before_colls and c.name == path.stem]
    log(f"import {rel}: {result} in {time.perf_counter() - t0:.2f}s, {len(new_objs)} objects")
    if not roots:
        raise SystemExit(f"could not find the collection SourceIO created for {path.stem}")
    return roots[0], new_objs


def bodygroup_objects(root: bpy.types.Collection) -> dict[str, list[bpy.types.Object]]:
    """SourceIO nests <model>/<bodygroup>/<submodel>; return bodygroup name -> mesh objects."""
    out: dict[str, list[bpy.types.Object]] = {}
    for bg in root.children:
        if bg.name.endswith(("_ATTACHMENTS", "_PHYSICS")):
            continue
        meshes = [o for o in bg.all_objects if o.type == "MESH"]
        if meshes:
            out[bg.name] = meshes
    return out


def apply_bodygroups(root: bpy.types.Collection, mdl_path: Path, hide: list[str]) -> None:
    info = read_mdl(mdl_path.read_bytes())
    defaults = {bg.name: bg.default_visible for bg in info.bodygroups}
    log("bodygroups", {bg.name: ("on" if bg.default_visible else "off") for bg in info.bodygroups})
    wanted_hidden = {h.lower() for h in hide}
    for name, meshes in bodygroup_objects(root).items():
        # SourceIO names the collection after the bodygroup; Blender may suffix duplicates with .001
        base = name.split(".")[0]
        visible = defaults.get(base, True) and base.lower() not in wanted_hidden
        for o in meshes:
            o.hide_render = not visible
            o.hide_viewport = not visible
        if not visible:
            log(f"  hidden bodygroup {base!r} ({len(meshes)} mesh)")


def apply_team(objs: list[bpy.types.Object], skin: int) -> None:
    if skin == 0:
        return
    for o in objs:
        if o.type != "MESH" or "skin_groups" not in o:
            continue
        groups = o["skin_groups"].to_dict()
        base, target = groups.get("0"), groups.get(str(skin))
        if not base or not target or len(base) != len(target):
            log(f"  no skin {skin} for {o.name!r} (families: {sorted(groups)})")
            continue
        remap = {a: b for a, b in zip(base, target) if a is not b}
        swapped = 0
        for i, slot in enumerate(o.material_slots):
            if slot.material in remap:
                o.material_slots[i].material = remap[slot.material]
                swapped += 1
        o["active_skin"] = str(skin)
        if swapped:
            log(f"  skin {skin} on {o.name!r}: {swapped} material(s) swapped")


def parse_vmt_color(value: object) -> tuple[float, float, float] | None:
    """VMT colours are "{r g b}" in 0-255 or "[r g b]" in 0-1."""
    text = str(value).strip()
    if not text or text[0] not in "{[":
        return None
    parts = text.strip("{}[] ").replace(",", " ").split()
    if len(parts) < 3:
        return None
    nums = [float(p) for p in parts[:3]]
    scale = 255.0 if text[0] == "{" else 1.0
    return tuple(n / scale for n in nums)  # type: ignore[return-value]


def apply_paint_tint(objs: list[bpy.types.Object]) -> None:
    """Reproduce TF2's unpainted item tint on SourceIO's Principled materials.

    Paintable cosmetics ship a greyscale base texture plus $colortint_base (the colour when no paint
    is applied). In-game: colour = base * tint, or, when $blendtintbybasealpha is set,
    lerp(base, mix(base * tint, tint, $blendtintcoloroverbase), base.alpha). SourceIO's Principled
    path ignores these, so paintable items render white without this step.
    """
    seen: set[str] = set()
    for o in objs:
        if o.type != "MESH" or o.hide_render:
            continue
        for slot in o.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen or not mat.use_nodes:
                continue
            seen.add(mat.name)
            params = {str(k).lower(): v for k, v in (mat.get("vmt_parameters") or {}).items()} if "vmt_parameters" in mat else {}
            tint = parse_vmt_color(params.get("$colortint_base", params.get("$color2", "")))
            if tint is None or all(abs(c - 1.0) < 1e-3 for c in tint):
                if "items/" in mat.name or "_blue" in mat.name:
                    log(f"  no tint for {mat.name!r}: params={sorted(params)[:12]} nodes={[n.type for n in mat.node_tree.nodes][:8]}")
                continue
            tree = mat.node_tree
            principled = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if principled is None or not principled.inputs["Base Color"].links:
                log(f"  no base texture link for {mat.name!r}: nodes={[n.type for n in tree.nodes][:8]}")
                continue
            link = principled.inputs["Base Color"].links[0]
            tex_node, tex_socket = link.from_node, link.from_socket
            blend_by_alpha = str(params.get("$blendtintbybasealpha", "0")).strip() == "1"
            over_base = float(str(params.get("$blendtintcoloroverbase", "0")).strip() or 0)

            # ShaderNodeMixRGB has unambiguous socket names (Fac, Color1, Color2, Color); the newer
            # ShaderNodeMix exposes several inputs all called "A", which is easy to wire wrongly.
            tint_rgb = tree.nodes.new("ShaderNodeRGB")
            tint_rgb.outputs[0].default_value = (*tint, 1.0)
            tint_rgb.label = "$colortint_base"
            multiply = tree.nodes.new("ShaderNodeMixRGB")
            multiply.blend_type = "MULTIPLY"
            multiply.inputs["Fac"].default_value = 1.0
            tree.links.new(tex_socket, multiply.inputs["Color1"])
            tree.links.new(tint_rgb.outputs[0], multiply.inputs["Color2"])
            tinted_out = multiply.outputs["Color"]
            if over_base > 0:
                over = tree.nodes.new("ShaderNodeMixRGB")
                over.inputs["Fac"].default_value = over_base
                tree.links.new(tinted_out, over.inputs["Color1"])
                tree.links.new(tint_rgb.outputs[0], over.inputs["Color2"])
                tinted_out = over.outputs["Color"]
            if blend_by_alpha and "Alpha" in tex_node.outputs:
                by_alpha = tree.nodes.new("ShaderNodeMixRGB")
                tree.links.new(tex_node.outputs["Alpha"], by_alpha.inputs["Fac"])
                tree.links.new(tex_socket, by_alpha.inputs["Color1"])
                tree.links.new(tinted_out, by_alpha.inputs["Color2"])
                tinted_out = by_alpha.outputs["Color"]
                # the alpha channel is a paint mask here, not transparency
                for alpha_link in list(principled.inputs["Alpha"].links):
                    tree.links.remove(alpha_link)
                principled.inputs["Alpha"].default_value = 1.0
            tree.links.remove(link)
            tree.links.new(tinted_out, principled.inputs["Base Color"])
            log(f"  tinted {mat.name!r} with {tuple(round(c, 3) for c in tint)} blend_by_alpha={blend_by_alpha} over_base={over_base}")


def attach_item(class_arm: bpy.types.Object, item_arm: bpy.types.Object) -> None:
    """Place the cosmetic's armature so its bones coincide with the class skeleton (the engine's bonemerge).

    Hats are authored in head-bone space: their single bip_head bone sits at the origin, so without this
    step the hat renders at the class's feet. For every bone the two skeletons share, the offset must be
    the same; we compute it from bip_head (or the first shared bone) and warn if the others disagree.
    """
    shared = [b.name for b in item_arm.data.bones if b.name in class_arm.data.bones]
    if not shared:
        log(f"  WARNING no shared bones between {class_arm.name} and {item_arm.name}; item left in place")
        return
    anchor = "bip_head" if "bip_head" in shared else shared[0]
    offsets = {}
    for name in shared:
        class_bone = class_arm.matrix_world @ class_arm.data.bones[name].matrix_local
        item_bone = item_arm.data.bones[name].matrix_local
        offsets[name] = class_bone @ item_bone.inverted()
    item_arm.matrix_world = offsets[anchor]
    disagree = [n for n, m in offsets.items() if (m.translation - offsets[anchor].translation).length > 0.005]
    log(f"  attached {item_arm.name} via {anchor!r}; shared bones {len(shared)}" + (f"; inconsistent: {disagree}" if disagree else ""))


def frame_target(armature: bpy.types.Object, frame: str) -> tuple[Vector, float]:
    """Centre and vertical span to frame, in world space (Y is up after SourceIO import)."""
    bones = armature.data.bones
    head = armature.matrix_world @ bones["bip_head"].head_local if "bip_head" in bones else Vector((0, 1.45, 0))
    pelvis = armature.matrix_world @ bones["bip_pelvis"].head_local if "bip_pelvis" in bones else Vector((0, 0.8, 0))
    if frame == "bust":
        centre = Vector((head.x, head.y + 0.08, head.z))
        span = 0.80
    else:
        centre = Vector((pelvis.x, pelvis.y + 0.12, pelvis.z))
        span = 2.0
    return centre, span


def look_at(obj: bpy.types.Object, target: Vector, world_up: Vector = Vector((0.0, 1.0, 0.0))) -> None:
    """Point a camera or light (which look down local -Z) at target, keeping local +Y aligned with world_up.

    Vector.to_track_quat treats Blender's global Z as up, which is wrong for SourceIO's Y-up import.
    """
    forward = (target - obj.location).normalized()
    right = forward.cross(world_up).normalized()
    up = right.cross(forward).normalized()
    obj.rotation_euler = Matrix((right, up, -forward)).transposed().to_euler()


def setup_render(centre: Vector, span: float, size: int, samples: int, out: Path) -> None:
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

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 85
    cam_data.sensor_width = 36
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    fov = 2 * math.atan(cam_data.sensor_width / (2 * cam_data.lens))
    distance = (span / 2) / math.tan(fov / 2)
    # three-quarter view: the model faces +Z, its left is +X; camera to the model's front-right, slightly above
    yaw = math.radians(35)
    direction = Vector((-math.sin(yaw), 0.18, math.cos(yaw))).normalized()
    cam.location = centre + direction * distance
    look_at(cam, centre)
    scene.camera = cam

    def light(name: str, kind: str, offset: tuple[float, float, float], energy: float, size_: float = 1.0) -> None:
        data = bpy.data.lights.new(name, type=kind)
        data.energy = energy
        if kind == "AREA":
            data.size = size_
        obj = bpy.data.objects.new(name, data)
        obj.location = centre + Vector(offset)
        look_at(obj, centre)
        scene.collection.objects.link(obj)

    light("key", "AREA", (-1.6, 1.4, 1.8), 350, 1.5)
    light("fill", "AREA", (1.8, 0.6, 1.4), 120, 2.0)
    light("rim", "AREA", (0.6, 1.2, -2.0), 150, 1.0)
    world = bpy.data.worlds.new("world") if scene.world is None else scene.world
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.35, 0.35, 0.38, 1.0)
        bg.inputs["Strength"].default_value = 0.6

    out.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out.resolve())


def main() -> None:
    args = parse_args()
    bpy.ops.preferences.addon_enable(module="SourceIO")
    patch_sourceio()
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    mount_game()

    class_root, class_objs = import_model(args.cache, args.class_model, args.bvlg)
    item_root, item_objs = import_model(args.cache, args.item_model, args.bvlg)
    apply_bodygroups(class_root, (args.cache / "tf" / args.class_model).resolve(), args.hide)
    apply_bodygroups(item_root, (args.cache / "tf" / args.item_model).resolve(), [])
    apply_team(class_objs + item_objs, TEAM_SKIN[args.team])
    if not args.bvlg:
        apply_paint_tint(class_objs + item_objs)

    armature = next(o for o in class_objs if o.type == "ARMATURE")
    item_armature = next((o for o in item_objs if o.type == "ARMATURE"), None)
    if item_armature is not None:
        attach_item(armature, item_armature)
    else:
        log("  WARNING cosmetic imported without an armature (static prop?)")
    centre, span = frame_target(armature, args.frame)
    log("frame", args.frame, "centre", tuple(round(v, 3) for v in centre), "span", span)
    setup_render(centre, span, args.size, args.samples, args.out)

    t0 = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    log(f"rendered {args.out} in {time.perf_counter() - t0:.2f}s")
    if args.save_blend:
        blend = args.out.with_suffix(".blend")
        bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve()))
        log("saved", blend)


main()
