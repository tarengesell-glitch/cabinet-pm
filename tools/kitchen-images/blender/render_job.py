"""Renders one variant of a job, headless:

  blender -b --factory-startup --python blender/render_job.py -- --job jobs/pilot.json --variant base --out output/pilot

Writes <out>/<variant>/image.png (what people see), passes.exr (combined, object index and the
diffuse/gloss passes for the re-colour test) and meta.json (picks, render time, and each handle's
end points projected to pixels for the length check).
"""
import argparse
import json
import pathlib
import sys
import time

import bpy

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_scene  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from kit import IN, REGIONS  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--job", required=True)
    p.add_argument("--variant", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--samples", type=int)
    p.add_argument("--scale", type=float, default=1.0, help="resolution scale for quick looks")
    return p.parse_args(argv)


def configure(scene, job, a):
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "METAL"
    if not any(d.use for d in prefs.devices):
        raise RuntimeError("No Metal GPU found; refusing to fall back to a slow CPU render silently.")
    scene.cycles.device = "GPU"
    scene.cycles.samples = a.samples or job["samples"]
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.seed = 0
    scene.cycles.max_bounces = 8
    scene.render.resolution_x = int(job["resolution"][0] * a.scale)
    scene.render.resolution_y = int(job["resolution"][1] * a.scale)
    scene.render.resolution_percentage = 100
    for name in ("AgX", "Filmic", "Standard"):
        try:
            scene.view_settings.view_transform = name
            break
        except TypeError:
            continue
    scene.view_settings.exposure = job.get("exposure", 0.0)
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    vl = scene.view_layers[0]
    for p in ("use_pass_object_index", "use_pass_diffuse_color", "use_pass_diffuse_direct",
              "use_pass_diffuse_indirect", "use_pass_glossy_color", "use_pass_glossy_direct",
              "use_pass_glossy_indirect", "use_pass_emit", "use_pass_environment"):
        setattr(vl, p, True)


def save(scene, path, kind):
    s = scene.render.image_settings
    if kind == "exr":
        s.media_type = "MULTI_LAYER_IMAGE"
        s.file_format = "OPEN_EXR_MULTILAYER"
        s.color_depth = "32"
        s.exr_codec = "ZIP"
    else:
        s.media_type = "IMAGE"
        s.file_format = "PNG"
        s.color_mode = "RGB"
        s.color_depth = "8"
    bpy.data.images["Render Result"].save_render(filepath=str(path), scene=scene)


def main():
    a = args()
    job = json.loads(pathlib.Path(a.job).read_text())
    variant = next((v for v in job["variants"] if v["id"] == a.variant), None)
    if variant is None:
        raise SystemExit(f"job has no variant {a.variant!r}")
    picks = {**job["base"], **variant["picks"]}
    spec = json.loads((HERE.parent / "scenes" / f"{job['scene']}.json").read_text())
    build_scene.build(spec, picks, job["looks"])
    scene = bpy.context.scene
    configure(scene, job, a)
    out = pathlib.Path(a.out) / a.variant
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    bpy.ops.render.render(write_still=False)
    seconds = time.time() - t0
    save(scene, out / "passes.exr", "exr")
    save(scene, out / "image.png", "png")
    W, Hh = scene.render.resolution_x, scene.render.resolution_y
    cam = scene.camera
    pulls = []
    for o in bpy.data.objects:
        if o.get("part") == "pull":
            from mathutils import Vector
            ends = []
            for key in ("end_a", "end_b"):
                p = world_to_camera_view(scene, cam, Vector(o[key]) * IN)
                ends.append([p.x * W, (1 - p.y) * Hh, p.z])
            pulls.append({"name": o.name, "length_in": o["length_in"], "ends_px": ends})
    meta = {"variant": a.variant, "test": variant["test"], "region": variant["region"], "picks": picks,
            "render_seconds": round(seconds, 1), "samples": scene.cycles.samples, "resolution": [W, Hh],
            "blender": bpy.app.version_string, "regions": REGIONS, "pulls": pulls,
            "view_transform": scene.view_settings.view_transform}
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"RENDERED {a.variant} in {seconds:.1f}s -> {out}")


main()
