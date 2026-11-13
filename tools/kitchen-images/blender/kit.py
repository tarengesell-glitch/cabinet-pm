"""Small helpers shared by every part builder: inches, boxes, regions and bevels.

Lengths in the scene file and in these helpers are inches; Blender works in metres.
"""
import bmesh
import bpy

IN = 0.0254  # metres per inch

# Region -> object pass index. The render's object-index pass turns these into exact masks.
REGIONS = {
    "room": 0,
    "cabinet_fronts": 1,
    "hardware": 2,
    "counter": 3,
    "island_back": 4,
    "island_ends": 5,
    "top_trim": 6,
    "valance": 7,
    "appliance": 8,
    "carcass": 9,
}


def collection(name: str) -> bpy.types.Collection:
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def tag(obj: bpy.types.Object, region: str, part: str = "") -> bpy.types.Object:
    if region not in REGIONS:
        raise ValueError(f"unknown region {region!r}")
    obj.pass_index = REGIONS[region]
    obj["region"] = region
    if part:
        obj["part"] = part
    return obj


def box(name: str, x0, y0, z0, x1, y1, z1, mat, region: str, bevel: float = 1 / 32, part: str = "",
        col: str = "kitchen") -> bpy.types.Object:
    """An axis-aligned box between two corners given in inches, with a small rounded edge."""
    xs, ys, zs = sorted((x0, x1)), sorted((y0, y1)), sorted((z0, z1))
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = (xs[0] if v.co.x < 0 else xs[1]) * IN
        v.co.y = (ys[0] if v.co.y < 0 else ys[1]) * IN
        v.co.z = (zs[0] if v.co.z < 0 else zs[1]) * IN
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection(col).objects.link(obj)
    if mat is not None:
        mesh.materials.append(mat)
    if bevel:
        add_bevel(obj, bevel)
    return tag(obj, region, part)


def add_bevel(obj, width_in: float, segments: int = 2):
    m = obj.modifiers.new("bevel", "BEVEL")
    m.width = width_in * IN
    m.segments = segments
    m.limit_method = "ANGLE"
    m.harden_normals = False
    for p in obj.data.polygons:
        p.use_smooth = True
    return m


def mesh_object(name: str, bm: bmesh.types.BMesh, mat, region: str, part: str = "", col: str = "kitchen",
                bevel: float = 0.0):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection(col).objects.link(obj)
    if mat is not None:
        mesh.materials.append(mat)
    if bevel:
        add_bevel(obj, bevel)
    return tag(obj, region, part)


def cylinder(name: str, start, end, radius_in: float, mat, region: str, part: str = "", segments: int = 24):
    """A round bar between two points given in inches."""
    from mathutils import Vector

    a, b = Vector(start) * IN, Vector(end) * IN
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius_in * IN, radius2=radius_in * IN,
                          depth=(b - a).length)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    collection("kitchen").objects.link(obj)
    obj.location = (a + b) / 2
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
    if mat is not None:
        mesh.materials.append(mat)
    return tag(obj, region, part)


class Frame:
    """A cabinet run's own axes: u along the run, v up, w out of the cabinet face toward the room.

    kind: '+y' (on the back wall, facing +y), '+x' (on the left wall, facing +x) or
    '-y' (an island facing -y). origin is the world point (inches) where u = w = 0, v = 0 is the floor.
    """

    def __init__(self, kind: str, origin):
        if kind not in ("+y", "+x", "-y"):
            raise ValueError(f"unknown frame {kind!r}")
        self.kind, self.ox, self.oy = kind, origin[0], origin[1]

    def world(self, u, v, w):
        if self.kind == "+y":
            return (self.ox + u, self.oy + w, v)
        if self.kind == "+x":
            return (self.ox + w, self.oy + u, v)
        return (self.ox - u, self.oy - w, v)

    def box(self, name, u0, v0, w0, u1, v1, w1, mat, region, **kw):
        a, b = self.world(u0, v0, w0), self.world(u1, v1, w1)
        return box(name, a[0], a[1], a[2], b[0], b[1], b[2], mat, region, **kw)

    def bar(self, name, p0, p1, radius, mat, region, part=""):
        return cylinder(name, self.world(*p0), self.world(*p1), radius, mat, region, part)
