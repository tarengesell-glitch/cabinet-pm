"""The island: cabinets facing the sink run, the back panel facing the room, end treatments and its counter.

Pilot covers back panel slab and matching doors, and ends gable (1 1/2" or 4", cabinet or full
depth), match back, and waterfall. The slat and wainscotting panels come after the pilot.
"""
from kit import Frame, box
from parts import cabinets, doors

GABLE = {"gable_1_5_cabinet": (1.5, "cabinet"), "gable_1_5_full": (1.5, "full"),
         "gable_4_cabinet": (4.0, "cabinet"), "gable_4_full": (4.0, "full")}


def build(S, picks, M):
    I, H = S["island"], S["heights"]
    x0, x1, yf, d = I["x0"], I["x1"], I["y_front"], H["base_depth"]
    yb = yf + d  # back of the cabinets
    top, ctop = H["base_top"], H["base_top"] + H["counter"]
    cy0, cy1 = yf - 1.0, I["counter_back"]
    # cabinets face -y (toward the sink run)
    run = {"id": "island", "frame": "-y", "origin": [x1, yb], "start": 0, "level": "base", "items": I["items"]}
    cabinets.build_run(run, H, picks, M)
    # back panel, facing +y toward the room
    back = picks["island_back"]
    pb0, pb1 = yb, yb + 0.75
    if back == "slab":
        box("island_back", x0, pb0, 0, x1, pb1, top, M["front"], "island_back", bevel=1 / 32)
    elif back == "matching_doors":
        fr = Frame("+y", (0, pb0))
        n = max(1, round((x1 - x0) / 24))
        w = (x1 - x0) / n
        for i in range(n):
            doors.front(fr, f"island_back_door{i}", x0 + i * w + 0.06, H["toe"] + 0.06, x0 + (i + 1) * w - 0.06,
                        top - 0.06, 0.0, picks["door_style"], M["front"])
        for o in [o for o in __import__("bpy").data.objects if o.name.startswith("island_back_door")]:
            o.pass_index, o["region"] = 4, "island_back"
    else:
        raise NotImplementedError(f"island back {back!r} is not in the pilot")
    # ends
    end = picks["island_end"]
    ext = 0.0
    if end == "waterfall":
        t = H["counter"]
        for name, a, b in (("L", x0 - t, x0), ("R", x1, x1 + t)):
            box(f"island_waterfall_{name}", a, cy0, 0, b, cy1, ctop, M["counter"], "island_ends", bevel=1 / 8)
        cx0, cx1 = x0, x1
    else:
        if end == "match_back":
            t, depth = 0.75, "full"
        else:
            t, depth = GABLE[end]
        ye = pb1 if depth == "cabinet" else cy1 - 0.5
        for name, a, b in (("L", x0 - t, x0), ("R", x1, x1 + t)):
            box(f"island_end_{name}", a, yf - 0.75, 0, b, ye, top, M["front"], "island_ends", bevel=1 / 16)
        ext = t + 0.5
        cx0, cx1 = x0 - ext, x1 + ext
    box("island_counter", cx0, cy0, top, cx1, cy1, ctop, M["counter"], "counter", bevel=1 / 8)
