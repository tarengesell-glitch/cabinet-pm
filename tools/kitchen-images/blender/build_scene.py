"""Builds the whole kitchen for one set of picks: materials, room, runs, island, lights, camera."""
import json
import math
import pathlib

import bpy

import materials as mt
from kit import IN
from parts import cabinets, island, props, room

HERE = pathlib.Path(__file__).resolve().parent
TOOL = HERE.parent
DATA = TOOL.parent.parent / "src" / "modules" / "visual-library" / "data"

SPECIES_ASSET = {
    "red_oak_rift": "red_oak_veneer", "red_oak_rotary": "red_oak_veneer",
    "white_oak_rift": "white_oak_veneer", "white_oak_rotary": "white_oak_veneer",
    "maple": "white_maple_veneer", "cherry": "cherry_veneer",
    "walnut_rift": "walnut_veneer", "walnut_rotary": "walnut_veneer",
}


def colour_hex(list_id: str, colour_id: str) -> str:
    files = {"sherwin_williams": "sherwin-williams.json", "tafisa_tfl": "tafisa-tfl.json"}
    d = json.loads((DATA / "colours" / files[list_id]).read_text())
    for c in d["colours"]:
        if c["id"] == colour_id:
            if "hex" not in c:
                raise ValueError(f"{list_id} colour {colour_id} has no hex value")
            return c["hex"]
    raise ValueError(f"{list_id} has no colour {colour_id!r}")


def front_material(picks, looks):
    m = picks["material"]
    if m == "painted":
        return mt.paint("cabinet", colour_hex("sherwin_williams", picks["colour"]))
    if m in SPECIES_ASSET:
        st = looks["stains"][picks["colour"]]
        return mt.textured("cabinet", SPECIES_ASSET[m], looks["veneer_tile_in"], st.get("tint"), st.get("strength", 0.0),
                           st.get("darken", 0.0))
    raise NotImplementedError(f"material {m!r} is not in the pilot")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build(scene_spec: dict, picks: dict, looks: dict) -> dict:
    reset()
    S = scene_spec
    H = dict(S["heights"], ceiling=S["room"]["height"])
    cc = looks["counter_colours"][picks["counter_colour"]]
    fin = looks["finishes"][picks["hardware_finish"]]
    M = {
        "front": front_material(picks, looks),
        "toe": mt.matte("toe", "#2A2826", 0.7),
        "hw": mt.metal("hardware", fin["hex"], fin["roughness"], fin.get("anisotropic", 0.0)),
        "steel": mt.metal("steel", "#C7C9C9", 0.22, 0.4),
        "chrome": mt.metal("chrome", "#E4E6E8", 0.06),
        "black_glass": mt.paint("black_glass", "#0C0C0E", 0.05),
        "black_metal": mt.metal("black_metal", "#1C1C1C", 0.4),
        "sink": mt.metal("sink", "#9A9C9C", 0.3),
        "counter": mt.quartz("counter", cc["base"], cc["vein"], picks["counter_pattern"]),
        "led": mt.emission("led", "#FFE2B8", looks["led_strength"]),
        "floor": mt.textured("floor", "laminate_floor_02", 60, coat=0.1, rotate_grain=False, saturation=0.7),
        "wall": mt.matte("wall", "#E3DED6", 0.9),
        "ceiling": mt.matte("ceiling_paint", "#F2F0EC", 0.95),
        "trim_white": mt.paint("trim_white", "#F1EFEA", 0.4),
        "glass": _glass(),
        "tile": mt.subway_tile("tile"),
        "lawn": mt.matte("lawn", "#5D7A3A", 0.9),
        "hedge": mt.matte("hedge", "#3E5A2C", 0.9),
        "ceramic": mt.paint("ceramic", "#F4F1EA", 0.15),
        "board": mt.textured("board", "walnut_veneer", 30, coat=0.2),
        "lemon": mt.paint("lemon", "#E8C33A", 0.45),
        "brass": mt.metal("brass", "#C9A66B", 0.3),
        "shade": mt.paint("shade", "#1E1F21", 0.5),
        "bulb": mt.emission("bulb", "#FFD9A8", 40.0),
    }
    room.build_room(S, M)
    for run in S["runs"]:
        cabinets.build_run(run, H, picks, M)
    room.build_counters(S, M)
    island.build(S, picks, M)
    room.build_lights(S)
    props.build(S, M)
    _world(S)
    cam = _camera(S)
    return {"camera": cam.name}


def _glass():
    mat = bpy.data.materials.new("glass")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.0
    b.inputs["IOR"].default_value = 1.45
    b.inputs["Thin Wall"].default_value = True
    return mat


def _world(S):
    world = bpy.data.worlds.new("sky")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.radians(S["light"]["sky_sun_elevation_deg"])
    sky.sun_rotation = math.radians(S["light"]["sky_sun_rotation_deg"])
    bg = nt.nodes["Background"]
    bg.inputs["Strength"].default_value = S["light"]["sky_strength"]
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])


def _camera(S):
    C = S["camera"]
    data = bpy.data.cameras.new("cam")
    data.lens = C["lens_mm"]
    data.sensor_width = 36
    data.shift_x, data.shift_y = C.get("shift_x", 0.0), C.get("shift_y", 0.0)
    data.clip_start = 0.05
    cam = bpy.data.objects.new("cam", data)
    cam.location = tuple(v * IN for v in C["at"])
    # level camera (vertical lines stay vertical), turned to face the yaw angle
    cam.rotation_euler = (math.radians(90 + C.get("pitch_deg", 0.0)), 0, math.radians(C["yaw_deg"]))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam
