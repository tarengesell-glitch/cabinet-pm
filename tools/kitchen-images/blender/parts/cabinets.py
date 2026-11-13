"""Cabinet runs: boxes, toe kicks, fronts and their hardware, from the scene file."""
from parts import appliances, doors, hardware

G = 0.125  # gap between fronts


def _stile(picks):
    return doors.STILE.get(picks["door_style"], 0)


def _fronts(fr, name, u0, u1, v0, v1, w0, layout, picks, M, opening="hi", upper=False):
    """Lay out the fronts on one cabinet. layout: doors2 | door1 | drawers3 | drawer_doors2 | sink."""
    style = picks["door_style"]
    u0g, u1g, v0g, v1g = u0 + G / 2, u1 - G / 2, v0 + G / 2, v1 - G / 2
    rows = []  # (kind, v0, v1, hardware)
    if layout in ("drawers3",):
        top = v1g - 6.0
        mid = top - (top - v0g - G) / 2
        rows = [("drawer", top + G / 2, v1g, True), ("drawer", mid + G / 2, top - G / 2, True),
                ("drawer", v0g, mid - G / 2, True)]
    elif layout in ("drawer_doors2", "sink"):
        top = v1g - 6.0
        rows = [("drawer", top + G / 2, v1g, layout != "sink"), ("doors", v0g, top - G / 2, True)]
    else:
        rows = [("doors", v0g, v1g, True)]
    top_offset = None
    for i, (kind, a, b, hw) in enumerate(rows):
        if kind == "drawer":
            w_face = doors.front(fr, f"{name}_dr{i}", u0g, a, u1g, b, w0, style, M["front"], drawer=True)
            if top_offset is None:
                top_offset = (b - a) / 2
            if hw:
                hardware.place(fr, f"{name}_dr{i}_hw", (u0g, a, u1g, b), w_face, "drawer", picks, M["hw"],
                               {"top_offset": top_offset})
            continue
        two = layout in ("doors2", "drawer_doors2", "sink") and (u1 - u0) > 24
        spans = [(u0g, (u0 + u1) / 2 - G / 2, "hi"), ((u0 + u1) / 2 + G / 2, u1g, "lo")] if two else \
            [(u0g, u1g, opening)]
        for j, (a_u, b_u, op) in enumerate(spans):
            w_face = doors.front(fr, f"{name}_d{i}{j}", a_u, a, b_u, b, w0, style, M["front"])
            hardware.place(fr, f"{name}_d{i}{j}_hw", (a_u, a, b_u, b), w_face, "door", picks, M["hw"],
                           {"opening": op, "upper": upper, "stile": _stile(picks)})


def build_run(run, H, picks, M):
    from kit import Frame

    fr = Frame(run["frame"], run["origin"])
    u = run["start"]
    level = run["level"]
    for n, it in enumerate(run["items"]):
        u0, u1 = u, u + it["w"]
        u = u1
        name = f"{run['id']}_{n}_{it['type']}"
        t = it["type"]
        if t == "gap":
            continue
        if level == "base":
            depth = H["base_depth"]
            box_w = depth - doors.T
            if t in ("base", "filler"):
                fr.box(f"{name}_toe", u0, 0, 0, u1, H["toe"], box_w - H["toe_recess"], M["toe"], "carcass", bevel=0)
                fr.box(f"{name}_box", u0, H["toe"], 0, u1, H["base_top"], box_w, M["front"], "cabinet_fronts",
                       bevel=0)
                if t == "filler":
                    fr.box(f"{name}_fill", u0, H["toe"], box_w, u1, H["base_top"], depth, M["front"],
                           "cabinet_fronts", bevel=1 / 32)
                else:
                    _fronts(fr, name, u0, u1, H["toe"], H["base_top"], box_w, it["fronts"], picks, M,
                            it.get("opening", "hi"))
            elif t == "panel":
                fr.box(name, u0, 0, 0, u1, H["upper_top"], it.get("depth", 26), M["front"], "cabinet_fronts",
                       bevel=1 / 16)
            elif t == "blank":
                fr.box(name, u0, 0, 0, u1, H["base_top"], depth, M["front"], "carcass", bevel=0)
            else:
                appliances.build(t, fr, name, u0, u1, H, M)
        else:  # upper
            depth = it.get("depth", H["upper_depth"])
            box_w = depth - doors.T
            v0 = it.get("bottom", H["upper_bottom"])
            v1 = H["upper_top"]
            if t == "hood":
                appliances.build("hood", fr, name, u0, u1, H, M)
                continue
            fr.box(f"{name}_box", u0, v0, 0, u1, v1, box_w, M["front"], "cabinet_fronts", bevel=0)
            if t == "filler":
                fr.box(f"{name}_fill", u0, v0, box_w, u1, v1, depth, M["front"], "cabinet_fronts", bevel=1 / 32)
            elif t == "upper":
                _fronts(fr, name, u0, u1, v0, v1, box_w, it["fronts"], picks, M, it.get("opening", "hi"),
                        upper=True)
            if t != "blank" and it.get("trim", True):
                trims(fr, name, u0, u1, v0, v1, depth, picks, M)


def trims(fr, name, u0, u1, v0, v1, depth, picks, M):
    """Top trim and light valance along one upper (catalog `trim` group)."""
    top = picks["top_trim"]
    if top == "flat_0_75":
        fr.box(f"{name}_toptrim", u0, v1, 0, u1, v1 + 0.75, depth + 0.25, M["front"], "top_trim", bevel=1 / 32)
    elif top == "flat_3":
        fr.box(f"{name}_toptrim", u0, v1, 0, u1, v1 + 3.0, depth + 0.25, M["front"], "top_trim", bevel=1 / 32)
    val = picks["valance"]
    if val == "hidden":
        fr.box(f"{name}_led", u0 + 1, v0 - 0.05, depth - 2.5, u1 - 1, v0, depth - 2.0, M["led"], "valance", bevel=0)
    elif val in ("flat_2", "flat_2_edge"):
        fr.box(f"{name}_valance", u0, v0 - 2.0, depth - 0.75, u1, v0, depth, M["front"], "valance", bevel=1 / 32)
