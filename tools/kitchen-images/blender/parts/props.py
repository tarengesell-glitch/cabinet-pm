"""Things that make a kitchen look lived-in: baseboards, can-light trims, island pendants and a few
counter props. They stay the same in every image and sit away from the regions the tests change."""
import math
import pathlib

import bmesh
import bpy

from kit import IN, REGIONS, box, cylinder, mesh_object

MODELS = pathlib.Path(__file__).resolve().parents[2] / "assets" / "models"


def model(asset: str, at, height_in: float, turn_deg: float = 0.0):
    """Places a scanned CC0 model (see fetch_assets.py) standing on `at` (inches), scaled to a real height."""
    path = MODELS / asset / f"{asset}.gltf"
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing: run fetch_assets.py first")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"{asset} imported no meshes")
    bpy.context.view_layer.update()
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    k = height_in * IN / (max(zs) - min(zs))
    roots = [o for o in new if o.parent is None]
    pivot = bpy.data.objects.new(f"{asset}_pivot", None)
    bpy.context.scene.collection.objects.link(pivot)
    for r in roots:
        r.parent = pivot
    pivot.location = (0, 0, -min(zs))
    bpy.context.view_layer.update()
    holder = bpy.data.objects.new(f"{asset}_at", None)
    bpy.context.scene.collection.objects.link(holder)
    pivot.parent = holder
    holder.scale = (k, k, k)
    holder.rotation_euler = (0, 0, math.radians(turn_deg))
    holder.location = tuple(c * IN for c in at)
    for o in meshes:
        o.pass_index = REGIONS["room"]
        o["region"] = "room"
    return holder


def _sphere(name, centre, r, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=r * IN)
    for v in bm.verts:
        v.co.x += centre[0] * IN
        v.co.y += centre[1] * IN
        v.co.z += centre[2] * IN
    obj = mesh_object(name, bm, mat, "room")
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def build(S, M):
    R, H = S["room"], S["heights"]
    W, D, Hc = R["width"], R["depth"], R["height"]
    ctop = H["base_top"] + H["counter"]
    # baseboards on the open walls
    box("base_right", W - 0.6, 26, 0, W, D, 4.5, M["trim_white"], "room")
    box("base_front", 0, D - 0.6, 0, W, D, 4.5, M["trim_white"], "room")
    box("base_left", 0, 122, 0, 0.6, D, 4.5, M["trim_white"], "room")
    # can-light trims in the ceiling
    for i, (x, y) in enumerate(S["ceiling_lights"]):
        cylinder(f"can_trim_{i}", (x, y, Hc - 0.15), (x, y, Hc), 2.6, M["trim_white"], "room")
        cylinder(f"can_glow_{i}", (x, y, Hc - 0.2), (x, y, Hc - 0.1), 1.8, M["bulb"], "room")
    # two pendants over the island
    I = S["island"]
    py = (I["y_front"] + I["counter_back"]) / 2
    for i, px in enumerate((I["x0"] + (I["x1"] - I["x0"]) * 0.3, I["x0"] + (I["x1"] - I["x0"]) * 0.7)):
        cylinder(f"pendant_rod_{i}", (px, py, 66), (px, py, Hc), 0.12, M["brass"], "room")
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=5.5 * IN, radius2=1.2 * IN, depth=6 * IN)
        for v in bm.verts:
            v.co.x += px * IN
            v.co.y += py * IN
            v.co.z += 63 * IN
        shade = mesh_object(f"pendant_shade_{i}", bm, M["shade"], "room")
        mod = shade.modifiers.new("thick", "SOLIDIFY")
        mod.thickness = 0.06 * IN
        _sphere(f"pendant_bulb_{i}", (px, py, 60.8), 1.1, M["bulb"])
    # counter props on the back run, clear of the sink and range
    cylinder("crock", (190, 9, ctop), (190, 9, ctop + 7), 2.6, M["ceramic"], "room")
    for i, (dx, dy, h) in enumerate([(-0.8, 0.3, 14), (0.6, -0.5, 13), (0.2, 0.9, 15)]):
        cylinder(f"utensil_{i}", (190 + dx, 9 + dy, ctop + 2), (190 + dx * 2.2, 9 + dy * 2.2, ctop + h), 0.25,
                 M["board"], "room")
    cx, cy = 14, 52  # bowl of lemons on the side run
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=3.2 * IN, radius2=5.0 * IN, depth=3.2 * IN)
    for v in bm.verts:
        v.co.x += cx * IN
        v.co.y += cy * IN
        v.co.z += (ctop + 1.6) * IN
    bowl = mesh_object("bowl", bm, M["ceramic"], "room")
    for p in bowl.data.polygons:
        p.use_smooth = True
    for i, (dx, dy, dz) in enumerate([(-1.5, 0.5, 3.6), (1.4, -0.6, 3.6), (0.2, 1.5, 3.8), (0.1, -0.2, 5.4)]):
        _sphere(f"lemon_{i}", (cx + dx, cy + dy, ctop + dz), 1.4, M["lemon"])
    # scanned CC0 models: stools tucked under the island overhang, a vase and a bowl
    sy = I["counter_back"] - 6
    for i, sx in enumerate((I["x0"] + 24, I["x0"] + 52)):
        model("bar_chair_round_01", (sx, sy, 0), 25.5, turn_deg=15 * i)
    model("ceramic_vase_03", (7, 38, ctop), 11)
    model("wooden_bowl_02", (I["x0"] + 20, I["y_front"] + 14, ctop + 0.0), 2.9)
