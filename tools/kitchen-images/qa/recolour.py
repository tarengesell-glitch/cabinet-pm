"""Re-colours the painted surfaces of one render from its passes, without rendering again.

Runs inside Blender so the result goes through exactly the same view transform as a real render:
  blender -b --factory-startup --python qa/recolour.py -- --exr base/passes.exr --old "#EDECE6" \
      --new "#D1CBC1" --regions 1,4,5,6 --exposure -0.4 --out variant/recolour.png

In the painted area: light = (combined - gloss - emission - environment) / diffuse colour, from the
denoised combined pass; new = gloss + emission + environment + new diffuse colour x light.
The new diffuse colour is the old one scaled by new/old base colour (linear), so texture and
coat effects carry over.
"""
import argparse
import pathlib
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "blender"))
from materials import hex_rgba  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    p = argparse.ArgumentParser()
    for k in ("--exr", "--old", "--new", "--regions", "--out"):
        p.add_argument(k, required=True)
    p.add_argument("--exposure", type=float, default=0.0)
    a = p.parse_args(argv)

    # numpy EXR reading through OpenEXR isn't available in Blender's Python, so the pass arrays are
    # handed over as .npy files by qa/check.py (written next to the EXR).
    t0 = time.time()
    d = pathlib.Path(a.exr).parent
    P = {k: np.load(d / f"{k}.npy") for k in ("combined", "diff_col", "gloss", "emit_env", "index")}
    regions = [int(r) for r in a.regions.split(",")]
    mask = np.isin(np.rint(P["index"]).astype(int), regions)
    old = np.array(hex_rgba(a.old)[:3])
    new = np.array(hex_rgba(a.new)[:3])
    comb = P["combined"][..., :3]
    dcol = P["diff_col"]
    rest = P["gloss"] + P["emit_env"]
    light = np.where(dcol > 1e-4, (comb - rest) / np.maximum(dcol, 1e-4), 0.0)
    new_dcol = dcol * (new / old)
    out = comb.copy()
    out[mask] = (rest + new_dcol * light)[mask]
    h, w = out.shape[:2]
    rgba = np.concatenate([out, P["combined"][..., 3:4]], axis=-1)
    img = bpy.data.images.new("recolour", w, h, alpha=False, float_buffer=True)
    img.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
    scene = bpy.context.scene
    for name in ("AgX", "Filmic", "Standard"):
        try:
            scene.view_settings.view_transform = name
            break
        except TypeError:
            continue
    scene.view_settings.exposure = a.exposure
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    s = scene.render.image_settings
    s.media_type = "IMAGE"
    s.file_format = "PNG"
    s.color_mode = "RGB"
    s.color_depth = "8"
    img.save_render(filepath=str(a.out), scene=scene)
    print(f"RECOLOURED in {time.time() - t0:.2f}s -> {a.out}")


main()
