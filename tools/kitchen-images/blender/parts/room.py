"""The room shell, window, backsplash, counters with the sink, and the faucet."""
import bpy

from kit import IN, box, cylinder


def build_room(S, M):
    R = S["room"]
    W, D, Hc, t = R["width"], R["depth"], R["height"], R["wall"]
    win = S["window"]
    box("floor", 0, 0, -1, W, D, 0, M["floor"], "room", bevel=0)
    box("ceiling", -t, -t, Hc, W + t, D + t, Hc + 1, M["ceiling"], "room", bevel=0)
    # back wall with the window opening
    x0, x1, z0, z1 = win["x0"], win["x1"], win["z0"], win["z1"]
    box("wall_back_l", -t, -t, 0, x0, 0, Hc, M["wall"], "room", bevel=0)
    box("wall_back_r", x1, -t, 0, W + t, 0, Hc, M["wall"], "room", bevel=0)
    box("wall_back_b", x0, -t, 0, x1, 0, z0, M["wall"], "room", bevel=0)
    box("wall_back_t", x0, -t, z1, x1, 0, Hc, M["wall"], "room", bevel=0)
    box("wall_left", -t, 0, 0, 0, D, Hc, M["wall"], "room", bevel=0)
    box("wall_right", W, 0, 0, W + t, D, Hc, M["wall"], "room", bevel=0)
    box("wall_front", -t, D, 0, W + t, D + t, Hc, M["wall"], "room", bevel=0)
    # window frame, mullion and sill
    f = 2.0
    # jamb liners the full wall depth (no dark gaps at the corners), then the frame and mullion
    for nm, a, b, c, d in (("jl", x0, x0 + 0.75, z0, z1), ("jr", x1 - 0.75, x1, z0, z1),
                           ("jt", x0, x1, z1 - 0.75, z1), ("jb", x0, x1, z0, z0 + 0.75)):
        box(f"win_{nm}", a, -t, c, b, 0.05, d, M["trim_white"], "room", bevel=0)
    box("win_l", x0, -t, z0, x0 + f, -t + 2.5, z1, M["trim_white"], "room", bevel=0)
    box("win_r", x1 - f, -t, z0, x1, -t + 2.5, z1, M["trim_white"], "room", bevel=0)
    box("win_t", x0, -t, z1 - f, x1, -t + 2.5, z1, M["trim_white"], "room", bevel=0)
    box("win_b", x0, -t, z0, x1, -t + 2.5, z0 + f, M["trim_white"], "room", bevel=0)
    box("win_m", (x0 + x1) / 2 - 0.75, -t, z0, (x0 + x1) / 2 + 0.75, -t + 2.5, z1, M["trim_white"], "room", bevel=0)
    box("win_glass", x0, -t + 1.2, z0, x1, -t + 1.3, z1, M["glass"], "room", bevel=0)
    # outside is the HDRI photo (build_scene._world), seen through the glass
    # backsplash tile between the counter and the uppers
    top = S["heights"]["base_top"] + S["heights"]["counter"]
    ub = S["heights"]["upper_bottom"]
    box("splash_back_a", 0, -0.01, top, x0, 0.3, ub, M["tile"], "room", bevel=0)
    box("splash_back_b", x0, -0.01, top, x1, 0.3, z0, M["tile"], "room", bevel=0)
    box("splash_back_c", x1, -0.01, top, W, 0.3, ub, M["tile"], "room", bevel=0)
    box("splash_left", -0.01, 0.3, top, 0.3, S["splash_left_to"], ub, M["tile"], "room", bevel=0)


def build_counters(S, M):
    H = S["heights"]
    z0, z1 = H["base_top"], H["base_top"] + H["counter"]
    for i, c in enumerate(S["counters"]):
        obj = box(f"counter_{i}", c["x0"], c["y0"], z0, c["x1"], c["y1"], z1, M["counter"], "counter", bevel=1 / 8)
        if "sink" in c:
            s = c["sink"]
            cutter = box(f"sink_cut_{i}", s["x0"], s["y0"], z0 - 1, s["x1"], s["y1"], z1 + 1, None, "room", bevel=0)
            cutter.hide_render = True
            cutter.hide_viewport = True
            mod = obj.modifiers.new("sink", "BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.object = cutter
            obj.modifiers.move(len(obj.modifiers) - 1, 0)
            box(f"sink_basin_{i}", s["x0"], s["y0"], z0 - 9, s["x1"], s["y1"], z0, M["sink"], "appliance", bevel=1 / 4)
            fx = (s["x0"] + s["x1"]) / 2
            fy = s["y0"] - 2.0
            cylinder("faucet_base", (fx, fy, z1), (fx, fy, z1 + 14), 0.6, M["chrome"], "appliance")
            cylinder("faucet_spout", (fx, fy, z1 + 14), (fx, fy + 8, z1 + 14), 0.45, M["chrome"], "appliance")
            cylinder("faucet_tip", (fx, fy + 8, z1 + 14), (fx, fy + 8, z1 + 10.5), 0.45, M["chrome"], "appliance")


def build_lights(S):
    R = S["room"]
    for i, (x, y) in enumerate(S["ceiling_lights"]):
        data = bpy.data.lights.new(f"can_{i}", "SPOT")
        data.energy = S["light"]["can_watts"]
        data.spot_size = 1.9
        data.spot_blend = 0.9
        data.shadow_soft_size = 2 * IN
        data.color = (1.0, 0.9, 0.78)
        obj = bpy.data.objects.new(f"can_{i}", data)
        obj.location = (x * IN, y * IN, (R["height"] - 0.5) * IN)
        bpy.context.scene.collection.objects.link(obj)
    # a big soft fill near the camera, as an interior photographer would use
    data = bpy.data.lights.new("fill", "AREA")
    data.shape = "RECTANGLE"
    data.size, data.size_y = 60 * IN, 40 * IN
    data.energy = S["light"]["fill_watts"]
    data.color = (1.0, 0.96, 0.9)
    obj = bpy.data.objects.new("fill", data)
    fx, fy, fz = S["light"]["fill_at"]
    obj.location = (fx * IN, fy * IN, fz * IN)
    obj.rotation_euler = tuple(a * 3.14159265 / 180 for a in S["light"]["fill_rot_deg"])
    bpy.context.scene.collection.objects.link(obj)
    # the sun, coming in through the window
    data = bpy.data.lights.new("sun", "SUN")
    data.energy = S["light"]["sun_strength"]
    data.angle = 0.02
    data.color = (1.0, 0.95, 0.88)
    obj = bpy.data.objects.new("sun", data)
    obj.rotation_euler = tuple(a * 3.14159265 / 180 for a in S["light"]["sun_rot_deg"])
    bpy.context.scene.collection.objects.link(obj)
