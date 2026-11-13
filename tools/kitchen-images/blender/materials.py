"""Materials. Paint colours come from hex values; wood comes from real CC0 veneer scans."""
import pathlib

import bpy

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(hex_value: str):
    h = hex_value.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def _principled(name: str):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    return mat, bsdf, mat.node_tree


def paint(name: str, hex_value: str, roughness: float = 0.38):
    """Sprayed cabinet paint with a satin lacquer."""
    mat, b, _ = _principled(name)
    b.inputs["Base Color"].default_value = hex_rgba(hex_value)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Coat Weight"].default_value = 0.15
    b.inputs["Coat Roughness"].default_value = 0.25
    return mat


def matte(name: str, hex_value: str, roughness: float = 0.85):
    mat, b, _ = _principled(name)
    b.inputs["Base Color"].default_value = hex_rgba(hex_value)
    b.inputs["Roughness"].default_value = roughness
    return mat


def wall_paint(name: str, hex_value: str, roughness: float = 0.88, scale_in: float = 40, bump: float = 0.12):
    """Flat wall paint over real plaster: a scanned normal map, faint, so the wall isn't a perfect CG plane."""
    mat, b, nt = _principled(name)
    b.inputs["Base Color"].default_value = hex_rgba(hex_value)
    b.inputs["Roughness"].default_value = roughness
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    s = 1 / (scale_in * 0.0254)
    mapping.inputs["Scale"].default_value = (s, s, s)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nor = _image(nt, "painted_plaster_wall_nor.jpg", True)
    nt.links.new(mapping.outputs["Vector"], nor.inputs["Vector"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = bump
    nt.links.new(nor.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return mat


def metal(name: str, hex_value: str, roughness: float = 0.28, anisotropic: float = 0.0):
    mat, b, _ = _principled(name)
    b.inputs["Base Color"].default_value = hex_rgba(hex_value)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Anisotropic"].default_value = anisotropic
    return mat


def emission(name: str, hex_value: str, strength: float):
    mat, b, _ = _principled(name)
    b.inputs["Base Color"].default_value = hex_rgba(hex_value)
    b.inputs["Emission Color"].default_value = hex_rgba(hex_value)
    b.inputs["Emission Strength"].default_value = strength
    return mat


def _image(nt, file: str, non_color: bool):
    path = ASSETS / file
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing: run fetch_assets.py first")
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    node.projection = "BOX"
    node.projection_blend = 0.15
    return node


def textured(name: str, asset: str, scale_in: float, tint_hex: str | None = None, tint_strength: float = 0.0,
             darken: float = 0.0, roughness_scale: float = 1.0, coat: float = 0.3, rotate_grain: bool = False,
             saturation: float = 1.0, value: float = 1.0):
    """A real texture scan (veneer, floor) mapped at real-world size. Stain: a tint multiplied over the scan.

    scale_in: how many inches one tile of the texture covers.
    """
    from math import radians

    mat, b, nt = _principled(name)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    s = 1 / (scale_in * 0.0254)
    mapping.inputs["Scale"].default_value = (s, s, s)
    if rotate_grain:  # for a scan whose grain runs sideways (the Poly Haven veneers already run up)
        mapping.inputs["Rotation"].default_value = (radians(90), 0, 0)
    # Per-part grain: a part may carry "grain_rot" (radians) and "grain_offset" (metres). A rail turns its
    # grain to run across; every stile, rail and panel gets its own patch of the scan, as real parts are
    # cut from different boards. Parts without them read 0 and keep the shared mapping.
    part = nt.nodes.new("ShaderNodeMapping")
    part.vector_type = "POINT"
    for attr, sock in (("grain_rot", "Rotation"), ("grain_offset", "Location")):
        a = nt.nodes.new("ShaderNodeAttribute")
        a.attribute_type = "OBJECT"
        a.attribute_name = attr
        nt.links.new(a.outputs["Vector"], part.inputs[sock])
    nt.links.new(coord.outputs["Object"], part.inputs["Vector"])
    nt.links.new(part.outputs["Vector"], mapping.inputs["Vector"])
    diff = _image(nt, f"{asset}_diff.jpg", False)
    rough = _image(nt, f"{asset}_rough.jpg", True)
    nor = _image(nt, f"{asset}_nor.jpg", True)
    for n in (diff, rough, nor):
        nt.links.new(mapping.outputs["Vector"], n.inputs["Vector"])
    colour_out = diff.outputs["Color"]
    if tint_hex:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = tint_strength
        nt.links.new(colour_out, mix.inputs["A"])
        mix.inputs["B"].default_value = hex_rgba(tint_hex)
        colour_out = mix.outputs["Result"]
    if saturation != 1.0 or value != 1.0:
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = saturation
        hsv.inputs["Value"].default_value = value
        nt.links.new(colour_out, hsv.inputs["Color"])
        colour_out = hsv.outputs["Color"]
    if darken:
        gamma = nt.nodes.new("ShaderNodeGamma")
        gamma.inputs["Gamma"].default_value = 1 + darken
        nt.links.new(colour_out, gamma.inputs["Color"])
        colour_out = gamma.outputs["Color"]
    nt.links.new(colour_out, b.inputs["Base Color"])
    rmath = nt.nodes.new("ShaderNodeMath")
    rmath.operation = "MULTIPLY"
    rmath.inputs[1].default_value = roughness_scale
    nt.links.new(rough.outputs["Color"], rmath.inputs[0])
    nt.links.new(rmath.outputs["Value"], b.inputs["Roughness"])
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.4
    nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.2
    return mat


def quartz(name: str, base_hex: str, vein_hex: str, pattern: str):
    """Procedural quartz: 'minimal' fine speckle, 'medium' soft veins, 'heavy' bold veins."""
    mat, b, nt = _principled(name)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    # speckle (all patterns)
    speck = nt.nodes.new("ShaderNodeTexVoronoi")
    speck.inputs["Scale"].default_value = 900.0
    nt.links.new(coord.outputs["Object"], speck.inputs["Vector"])
    speck_ramp = nt.nodes.new("ShaderNodeValToRGB")
    speck_ramp.color_ramp.elements[0].position = 0.0
    speck_ramp.color_ramp.elements[1].position = 0.12
    nt.links.new(speck.outputs["Distance"], speck_ramp.inputs["Fac"])
    base = nt.nodes.new("ShaderNodeMix")
    base.data_type = "RGBA"
    base.inputs["A"].default_value = hex_rgba(vein_hex)
    base.inputs["B"].default_value = hex_rgba(base_hex)
    strength = {"minimal": 0.25, "medium": 0.35, "heavy": 0.45}[pattern]
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(speck_ramp.outputs["Color"], inv.inputs[1])
    fac = nt.nodes.new("ShaderNodeMath")
    fac.operation = "MULTIPLY"
    fac.inputs[1].default_value = strength
    nt.links.new(inv.outputs["Value"], fac.inputs[0])
    one_minus = nt.nodes.new("ShaderNodeMath")
    one_minus.operation = "SUBTRACT"
    one_minus.inputs[0].default_value = 1.0
    nt.links.new(fac.outputs["Value"], one_minus.inputs[1])
    nt.links.new(one_minus.outputs["Value"], base.inputs["Factor"])
    colour = base.outputs["Result"]
    if pattern in ("medium", "heavy"):
        # veins are the iso-lines of a fractal noise: thin, branching, never blotchy
        heavy = pattern == "heavy"
        for k, (scale, width, mix_f) in enumerate(((1.4 if heavy else 2.2, 0.018 if heavy else 0.010, 0.95),
                                                   (4.0, 0.006, 0.5 if heavy else 0.35))):
            noise = nt.nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value = scale
            noise.inputs["Detail"].default_value = 10.0
            noise.inputs["Roughness"].default_value = 0.55
            noise.inputs["Distortion"].default_value = 0.6 + k
            nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
            sub = nt.nodes.new("ShaderNodeMath")
            sub.operation = "SUBTRACT"
            sub.inputs[1].default_value = 0.5
            nt.links.new(noise.outputs["Fac"], sub.inputs[0])
            ab = nt.nodes.new("ShaderNodeMath")
            ab.operation = "ABSOLUTE"
            nt.links.new(sub.outputs["Value"], ab.inputs[0])
            ramp = nt.nodes.new("ShaderNodeValToRGB")
            ramp.color_ramp.elements[0].position = 0.0
            ramp.color_ramp.elements[0].color = (mix_f, mix_f, mix_f, 1)
            ramp.color_ramp.elements[1].position = width
            ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
            nt.links.new(ab.outputs["Value"], ramp.inputs["Fac"])
            vein_mix = nt.nodes.new("ShaderNodeMix")
            vein_mix.data_type = "RGBA"
            nt.links.new(ramp.outputs["Color"], vein_mix.inputs["Factor"])
            nt.links.new(colour, vein_mix.inputs["A"])
            vein_mix.inputs["B"].default_value = hex_rgba(vein_hex)
            colour = vein_mix.outputs["Result"]
    nt.links.new(colour, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.12
    b.inputs["Coat Weight"].default_value = 0.0
    return mat


def subway_tile(name: str):
    mat, b, nt = _principled(name)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.inputs["Color1"].default_value = hex_rgba("#F3F2EE")
    brick.inputs["Color2"].default_value = hex_rgba("#EEEDE8")
    brick.inputs["Mortar"].default_value = hex_rgba("#BDBAB2")
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Brick Width"].default_value = 6 * 0.0254
    brick.inputs["Row Height"].default_value = 3 * 0.0254
    brick.inputs["Mortar Size"].default_value = 0.0025
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (1.5708, 0, 0)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], brick.inputs["Vector"])
    nt.links.new(brick.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    nt.links.new(brick.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.08
    return mat
