"""Handles and knobs, placed by the owner's rules (catalog `hardware` group).

A handle's length is its overall length (PROPOSED: the owner's 5 1/2", 8", 12" are read as overall,
not centre-to-centre). Bar 7/16" round on two posts with 1 1/4" standoff (PROPOSED, typical).
"""
LENGTH = {"len_5_5": 5.5, "len_8": 8.0, "len_12": 12.0}
BAR_R, POST_R, STANDOFF = 0.22, 0.17, 1.25
EDGE = 1.5   # distance from a door's opening edge to the handle's centre line (slab)
FROM_END = 3.0  # distance from a door's top (base) or bottom (upper) to the handle's near end


def _pull(fr, name, centre_u, centre_v, w_face, horizontal, length, mat):
    cu, cv = centre_u, centre_v
    half = length / 2
    post = half - min(1.0, length * 0.15)
    out = w_face + STANDOFF
    if horizontal:
        a, b = (cu - half, cv, out), (cu + half, cv, out)
        posts = [(cu - post, cv), (cu + post, cv)]
    else:
        a, b = (cu, cv - half, out), (cu, cv + half, out)
        posts = [(cu, cv - post), (cu, cv + post)]
    bar = fr.bar(f"{name}_bar", a, b, BAR_R, mat, "hardware", part="pull")
    bar["end_a"], bar["end_b"] = fr.world(*a), fr.world(*b)
    bar["length_in"] = length
    for i, (pu, pv) in enumerate(posts):
        fr.bar(f"{name}_post{i}", (pu, pv, w_face), (pu, pv, out), POST_R, mat, "hardware", part="post")


def _knob(fr, name, centre_u, centre_v, w_face, mat):
    fr.bar(f"{name}_stem", (centre_u, centre_v, w_face), (centre_u, centre_v, w_face + 0.9), 0.2, mat, "hardware")
    fr.bar(f"{name}_head", (centre_u, centre_v, w_face + 0.8), (centre_u, centre_v, w_face + 1.25), 0.62, mat,
           "hardware", part="knob")


def place(fr, name, rect, w_face, kind, picks, mat, ctx):
    """Hardware for one front. kind: 'door' or 'drawer'. ctx: opening ('lo'|'hi' in u), upper (bool),
    stile (inches; 0 for slab), top_offset (drawer: distance from the top edge, for top-aligned)."""
    cfg = picks["hardware_config"]
    if picks["door_style"] == "slab_handleless" or cfg is None:
        return
    door_kind, drawer_kind = {
        "all_handles": ("handle", "handle"),
        "all_knobs": ("knob", "knob"),
        "knobs_doors_handles_drawers": ("knob", "handle"),
        "handles_doors_knobs_drawers": ("handle", "knob"),
    }[cfg]
    u0, v0, u1, v1 = rect
    length = LENGTH[picks["handle_length"]]
    if kind == "door":
        edge = ctx["stile"] / 2 if ctx["stile"] else EDGE
        cu = u0 + edge if ctx["opening"] == "lo" else u1 - edge
        vertical = picks["door_handle_orientation"] != "horizontal" or door_kind == "knob"
        if door_kind == "knob":
            cv = (v0 + 3.0) if ctx["upper"] else (v1 - 3.0)
            _knob(fr, name, cu, cv, w_face, mat)
            return
        if vertical:
            cv = (v0 + FROM_END + length / 2) if ctx["upper"] else (v1 - FROM_END - length / 2)
        else:
            cv = (v0 + FROM_END) if ctx["upper"] else (v1 - FROM_END)
            cu = (u0 + edge + length / 2) if ctx["opening"] == "lo" else (u1 - edge - length / 2)
        _pull(fr, name, cu, cv, w_face, not vertical, length, mat)
        return
    # drawer
    if picks["drawer_hardware_position"] == "top_aligned" and ctx.get("top_offset") is not None:
        cv = v1 - ctx["top_offset"]
    else:
        cv = (v0 + v1) / 2
    W = u1 - u0
    us = [u0 + W / 4, u0 + 3 * W / 4] if picks["drawer_hardware_count"] == "double" else [(u0 + u1) / 2]
    for i, cu in enumerate(us):
        if drawer_kind == "knob":
            _knob(fr, f"{name}_{i}", cu, cv, w_face, mat)
        else:
            _pull(fr, f"{name}_{i}", cu, cv, w_face, True, length, mat)
