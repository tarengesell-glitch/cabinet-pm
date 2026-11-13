"""Stainless appliances, simple but believable: they stay the same in every image."""


def build(kind, fr, name, u0, u1, H, M):
    st, blk = M["steel"], M["black_glass"]
    d = H["base_depth"]
    if kind == "dishwasher":
        fr.box(f"{name}_toe", u0, 0, 0, u1, H["toe"], d - 3, M["toe"], "appliance", bevel=0)
        fr.box(f"{name}_door", u0 + 0.06, H["toe"], 0, u1 - 0.06, H["base_top"] - 0.25, d, st, "appliance",
               bevel=1 / 16)
        fr.bar(f"{name}_handle", (u0 + 2, H["base_top"] - 3, d + 1.2), (u1 - 2, H["base_top"] - 3, d + 1.2), 0.3, st,
               "appliance")
    elif kind == "range":
        top = H["base_top"] + 1.25
        fr.box(f"{name}_body", u0 + 0.06, 0, 0, u1 - 0.06, top - 0.5, d + 1.0, st, "appliance", bevel=1 / 16)
        fr.box(f"{name}_cooktop", u0 + 0.06, top - 0.5, 0, u1 - 0.06, top, d + 0.5, blk, "appliance", bevel=1 / 16)
        fr.box(f"{name}_window", u0 + 4, 9, d + 1.0, u1 - 4, 22, d + 1.05, blk, "appliance", bevel=0)
        fr.box(f"{name}_panel", u0 + 0.06, top - 6, d + 1.0, u1 - 0.06, top - 0.5, d + 1.3, st, "appliance",
               bevel=1 / 16)
        for i in range(5):
            cu = u0 + 4 + i * (u1 - u0 - 8) / 4
            fr.bar(f"{name}_knob{i}", (cu, top - 3.2, d + 1.3), (cu, top - 3.2, d + 2.1), 0.7, M["black_metal"],
                   "appliance")
        fr.bar(f"{name}_handle", (u0 + 2.5, 25.5, d + 2.4), (u1 - 2.5, 25.5, d + 2.4), 0.4, st, "appliance")
        for i, (cu, cw) in enumerate([(u0 + 8, 0), (u1 - 8, 0), (u0 + 8, 1), (u1 - 8, 1)]):
            cv = d * 0.3 if cw == 0 else d * 0.75
            fr.bar(f"{name}_burner{i}", (cu, top, cv), (cu, top + 0.25, cv), 2.2, M["black_metal"], "appliance")
    elif kind == "fridge":
        h, dd = 70.0, 30.0
        split = 28.0
        fr.box(f"{name}_body", u0 + 0.25, 0, 0, u1 - 0.25, h, dd - 1, st, "appliance", bevel=1 / 8)
        fr.box(f"{name}_drawer", u0 + 0.25, 1, dd - 1, u1 - 0.25, split - 0.25, dd, st, "appliance", bevel=1 / 8)
        mid = (u0 + u1) / 2
        fr.box(f"{name}_doorL", u0 + 0.25, split + 0.25, dd - 1, mid - 0.1, h, dd, st, "appliance", bevel=1 / 8)
        fr.box(f"{name}_doorR", mid + 0.1, split + 0.25, dd - 1, u1 - 0.25, h, dd, st, "appliance", bevel=1 / 8)
        for cu in (mid - 1.5, mid + 1.5):
            fr.bar(f"{name}_h{cu}", (cu, split + 6, dd + 2), (cu, h - 6, dd + 2), 0.4, st, "appliance")
        fr.bar(f"{name}_hd", (u0 + 6, split - 3, dd + 2), (u1 - 6, split - 3, dd + 2), 0.4, st, "appliance")
    elif kind == "hood":
        # the common wall-mount pyramid chimney hood: a thin front band, a sloped canopy rising to a
        # narrow chimney that runs to the ceiling, and a dark baffle filter underneath
        bottom, band, slope_top, depth = 66.0, 2.5, 76.0, 20.0
        cu, cw, cd = (u0 + u1) / 2, 6.0, 10.0  # chimney centre, half-width, depth
        fr.box(f"{name}_band", u0, bottom, 0, u1, bottom + band, depth, st, "appliance", bevel=1 / 16)
        fr.box(f"{name}_filter", u0 + 1.5, bottom - 0.05, 1.5, u1 - 1.5, bottom, depth - 1.5,
               M["black_metal"], "appliance", bevel=0)
        _frustum(fr, f"{name}_canopy", (u0, u1, 0, depth, bottom + band),
                 (cu - cw, cu + cw, 0, cd, slope_top), st)
        fr.box(f"{name}_chimney", cu - cw, slope_top, 0, cu + cw, H["ceiling"], cd, st, "appliance",
               bevel=1 / 32)
        fr.box(f"{name}_controls", cu - 4, bottom + 0.6, depth, cu + 4, bottom + band - 0.6, depth + 0.05,
               M["black_glass"], "appliance", bevel=0)
    else:
        raise ValueError(f"unknown appliance {kind!r}")


def _frustum(fr, name, lo, hi, mat):
    """A closed tapered box between two level rectangles, each (u0, u1, w0, w1, v) in the run's frame."""
    import bmesh

    from kit import IN, mesh_object

    bm = bmesh.new()
    vs = []
    for a0, a1, b0, b1, v in (lo, hi):
        for u, w in ((a0, b0), (a1, b0), (a1, b1), (a0, b1)):
            vs.append(bm.verts.new(tuple(c * IN for c in fr.world(u, v, w))))
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_object(name, bm, mat, "appliance", bevel=1 / 32)
