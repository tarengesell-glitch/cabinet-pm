"""Door and drawer fronts in each style, built to size in a run's frame.

Rail and stile widths (PROPOSED, typical shop sizes until the shop gives its own):
slim shaker 1 1/4", shaker and raised panel 2 1/4"; centre panel recessed 3/8".
"""
import bmesh
from mathutils import Vector

from kit import IN, mesh_object

STILE = {"slim_shaker": 1.25, "shaker": 2.25, "raised_panel": 2.25}
T = 0.75  # front thickness


def front(fr, name, u0, v0, u1, v1, w0, style, mat, drawer=False):
    """One front between (u0, v0) and (u1, v1); its back face sits at w0. Returns the face plane w."""
    W, H = u1 - u0, v1 - v0
    if style in ("slab", "slab_handleless"):
        fr.box(name, u0, v0, w0, u1, v1, w0 + T, mat, "cabinet_fronts", bevel=1 / 32, part="front")
        return w0 + T
    s = STILE[style]
    if drawer and H < 2 * s + 2.5:  # short drawer: narrower rails so a panel still shows
        s = max(0.75, (H - 2.5) / 2) if H > 4 else 0
        if s == 0:
            fr.box(name, u0, v0, w0, u1, v1, w0 + T, mat, "cabinet_fronts", bevel=1 / 32, part="front")
            return w0 + T
    kw = dict(bevel=1 / 32, part="front")
    fr.box(f"{name}_stileL", u0, v0, w0, u0 + s, v1, w0 + T, mat, "cabinet_fronts", **kw)
    fr.box(f"{name}_stileR", u1 - s, v0, w0, u1, v1, w0 + T, mat, "cabinet_fronts", **kw)
    fr.box(f"{name}_railT", u0 + s, v1 - s, w0, u1 - s, v1, w0 + T, mat, "cabinet_fronts", **kw)
    fr.box(f"{name}_railB", u0 + s, v0, w0, u1 - s, v0 + s, w0 + T, mat, "cabinet_fronts", **kw)
    pu0, pv0, pu1, pv1 = u0 + s, v0 + s, u1 - s, v1 - s
    if style == "raised_panel" and not drawer:
        _raised_panel(fr, f"{name}_panel", pu0, pv0, pu1, pv1, w0, mat)
    else:
        fr.box(f"{name}_panel", pu0 - 0.01, pv0 - 0.01, w0, pu1 + 0.01, pv1 + 0.01, w0 + T - 0.375, mat,
               "cabinet_fronts", bevel=0, part="front")
    return w0 + T


def _raised_panel(fr, name, u0, v0, u1, v1, w0, mat):
    """A panel whose centre field rises on a bevel: 1 1/2" bevel, field 1/8" below the frame face."""
    base_t, field_rise = 0.25, 0.25
    bm = bmesh.new()
    a, b = Vector(fr.world(u0, v0, w0)) * IN, Vector(fr.world(u1, v1, w0 + base_t)) * IN
    bmesh.ops.create_cube(bm, size=1.0)
    lo = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))
    hi = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
    for v in bm.verts:
        v.co = Vector(tuple(lo[i] if v.co[i] < 0 else hi[i] for i in range(3)))
    out = Vector(fr.world(0, 0, 1)) - Vector(fr.world(0, 0, 0))
    bm.normal_update()
    top = max(bm.faces, key=lambda f: f.normal.dot(out))
    bmesh.ops.inset_region(bm, faces=[top], thickness=1.5 * IN, depth=field_rise * IN, use_even_offset=True)
    obj = mesh_object(name, bm, mat, "cabinet_fronts", part="front")
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj
