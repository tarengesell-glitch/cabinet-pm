"""Checks every rendered variant of a job against the base render and writes <out>/qa.json.

Run: .venv/bin/python -I qa/check.py jobs/pilot.json output/pilot

1. Layout lock: outside the regions a test may change, every pixel must still show the same object as
   in the base (the object-index pass; exact, no lighting involved). Proves the camera and the rest
   of the kitchen stay put. Light change: how much the rest of the picture got lighter or darker
   (dark cabinets darken the room, as in life). Reported, not pass/fail.
2. Handle length: each visible pull's measured length in the hardware mask must be within 2 px of
   its exact 3D length projected through the camera.
3. Re-colour (paint variants): the base render re-coloured from its passes is compared with the full
   render of that colour (CIEDE2000 inside the painted area), and timed.
"""
import json
import pathlib
import subprocess
import sys
import time

import cv2
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from exr import read_passes  # noqa: E402
from metrics import delta_e2000, drift, srgb_to_lab  # noqa: E402

BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
# Which object-index regions each test is allowed to change (kit.REGIONS). Front-material regions:
# fronts 1, island back 4, island ends 5, top trim 6. Hardware 2 moves with the door's stile width.
ALLOWED = {"paint": {1, 4, 5, 6}, "stain": {1, 4, 5, 6}, "door": {1, 2}, "handle": {2}, "waterfall": {3, 5}}
MARGIN_PX = 8   # shadow margin for the light-change figure
EDGE_PX = 2     # an object's edge pixels may flip when its neighbour changes shape
LAYOUT_LIMIT_PCT = 0.05
DRIFT_LIMIT_PCT = 0.5  # used by the self-test's pixel drift cases
LENGTH_TOL_PX = 2.0      # at LENGTH_TOL_WIDTH; scaled with the image so it means the same real accuracy
LENGTH_TOL_WIDTH = 1600  # the pilot plan set +/-2 px at 1600 px wide (round 5 renders at 3840)


def length_tol_px(width: int) -> float:
    return LENGTH_TOL_PX * max(1.0, width / LENGTH_TOL_WIDTH)


def png(path):
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(path)
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def index_of(passes):
    idx = passes["Object Index"]
    return np.rint(idx[..., 0] if idx.ndim == 3 else idx).astype(np.int32)


def allowed_area(idx_a, idx_b, regions):
    m = np.isin(idx_a, list(regions)) | np.isin(idx_b, list(regions))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * MARGIN_PX + 1, 2 * MARGIN_PX + 1))
    return cv2.dilate(m.astype(np.uint8), k) > 0


def layout_lock(idx_a, idx_b, regions):
    allowed = np.isin(idx_a, list(regions)) | np.isin(idx_b, list(regions))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * EDGE_PX + 1, 2 * EDGE_PX + 1))
    allowed = cv2.dilate(allowed.astype(np.uint8), k) > 0
    moved = (idx_a != idx_b) & ~allowed
    n = int((~allowed).sum())
    pct = round(100 * moved.sum() / max(n, 1), 4)
    return {"pixels_checked": n, "moved": int(moved.sum()), "moved_pct": pct, "ok": bool(pct <= LAYOUT_LIMIT_PCT)}


def handle_lengths(meta, idx, hw_index=2):
    hw = idx == hw_index
    tol = length_tol_px(idx.shape[1])
    results = []
    for p in meta["pulls"]:
        (x0, y0, z0), (x1, y1, _) = p["ends_px"]
        if z0 <= 0:
            continue
        a, b = np.array([x0, y0]), np.array([x1, y1])
        expected = float(np.linalg.norm(b - a))
        if expected < 25:  # too small to measure to 2 px honestly
            continue
        d = (b - a) / expected
        n = np.array([-d[1], d[0]])
        # measure only a pull that is fully in view: every point along it must be hardware
        h_, w_ = hw.shape
        samples = [a + d * t for t in np.linspace(2, expected - 2, 24)]
        if not all(0 <= int(q[1]) < h_ and 0 <= int(q[0]) < w_ and hw[int(q[1]), int(q[0])] for q in samples):
            continue
        ys, xs = np.nonzero(hw)
        pts = np.stack([xs + 0.5, ys + 0.5], axis=1) - a
        along, across = pts @ d, pts @ n
        slack = max(10.0, 0.5 * expected)
        band = (np.abs(across) <= 2.5) & (along > -slack) & (along < expected + slack)
        if band.sum() < 0.6 * expected:  # mostly hidden behind something; not measurable
            continue
        # the unbroken stretch of bar around its middle; other hardware beyond a gap is not part of it
        bins = np.zeros(int(expected + 2 * slack) + 2, bool)
        bins[np.clip((along[band] + slack).astype(int), 0, len(bins) - 1)] = True
        mid = int(expected / 2 + slack)
        if not bins[mid]:
            continue
        lo = mid
        while lo > 0 and (bins[lo - 1] or (lo > 1 and bins[lo - 2])):
            lo -= 1
        hi = mid
        while hi < len(bins) - 1 and (bins[hi + 1] or (hi < len(bins) - 2 and bins[hi + 2])):
            hi += 1
        measured = float(hi - lo + 1)
        results.append({"pull": p["name"], "length_in": p["length_in"], "expected_px": round(expected, 1),
                        "measured_px": round(measured, 1), "error_px": round(measured - expected, 1),
                        "ok": bool(abs(measured - expected) <= tol)})
    return results


def recolour(base_dir, var_dir, var_meta, job, base_hex, new_hex, regions):
    P = read_passes(base_dir / "passes.exr")
    np.save(base_dir / "combined.npy", P["Combined"])
    np.save(base_dir / "diff_col.npy", P["Diffuse Color"])
    # The gloss passes aren't denoised by the renderer; satin paint's sheen is soft, so an
    # edge-preserving smooth removes the grain without blurring edges.
    gloss = ((P["Glossy Direct"] + P["Glossy Indirect"]) * P["Glossy Color"]).astype(np.float32)
    gloss = cv2.bilateralFilter(gloss, 9, 0.08, 4)
    np.save(base_dir / "gloss.npy", gloss)
    np.save(base_dir / "emit_env.npy", P["Emission"] + P["Environment"])
    np.save(base_dir / "index.npy", index_of(P).astype(np.float32))
    out = var_dir / "recolour.png"
    t0 = time.time()
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "--python", str(HERE / "recolour.py"), "--",
                        "--exr", str(base_dir / "passes.exr"), "--old", base_hex, "--new", new_hex,
                        "--regions", ",".join(str(i) for i in sorted(regions)),
                        "--exposure", str(job.get("exposure", 0.0)), "--out", str(out)],
                       capture_output=True, text=True)
    if r.returncode != 0 or not out.exists():
        raise RuntimeError(f"re-colour failed:\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")
    wall = time.time() - t0
    inner = [l for l in r.stdout.splitlines() if l.startswith("RECOLOURED")]
    full, rec = png(var_dir / "image.png"), png(out)
    var_idx = index_of(read_passes(var_dir / "passes.exr"))
    painted = np.isin(var_idx, list(regions))
    de = delta_e2000(srgb_to_lab(full), srgb_to_lab(rec))
    return {"recolour_png": "recolour.png", "seconds_total": round(wall, 1),
            "seconds_compute": float(inner[0].split()[2].rstrip("s")) if inner else None,
            "de2000_painted_mean": round(float(de[painted].mean()), 2),
            "de2000_painted_p95": round(float(np.percentile(de[painted], 95)), 2),
            "de2000_elsewhere_mean": round(float(de[~painted].mean()), 2)}


def colour_hex(colour_id):
    d = json.loads((HERE.parent.parent.parent / "src/modules/visual-library/data/colours/sherwin-williams.json")
                   .read_text())
    return next(c["hex"] for c in d["colours"] if c["id"] == colour_id)


def main() -> int:
    job = json.loads(pathlib.Path(sys.argv[1]).read_text())
    out = pathlib.Path(sys.argv[2])
    base_dir = out / "base"
    base_img = png(base_dir / "image.png")
    base_idx = index_of(read_passes(base_dir / "passes.exr"))
    base_meta = json.loads((base_dir / "meta.json").read_text())
    report = {"base": {"render_seconds": base_meta["render_seconds"],
                       "handles": handle_lengths(base_meta, base_idx)}, "variants": []}
    failures = []
    for v in job["variants"]:
        if v["id"] == "base":
            continue
        d = out / v["id"]
        meta = json.loads((d / "meta.json").read_text())
        img, idx = png(d / "image.png"), index_of(read_passes(d / "passes.exr"))
        regions = ALLOWED[v["test"]]
        row = {"id": v["id"], "test": v["test"], "render_seconds": meta["render_seconds"],
               "layout": layout_lock(base_idx, idx, regions),
               "light_change": drift(base_img, img, allowed_area(base_idx, idx, regions))}
        if not row["layout"]["ok"]:
            failures.append(f"{v['id']}: {row['layout']['moved_pct']}% of the kitchen outside its region moved")
        if v["test"] == "handle":
            row["handles"] = handle_lengths(meta, idx)
            bad = [h for h in row["handles"] if not h["ok"]]
            if not row["handles"]:
                failures.append(f"{v['id']}: no handle was measurable")
            for h in bad:
                failures.append(f"{v['id']}: {h['pull']} is {h['error_px']} px off")
        if v.get("recolour_from"):
            src_meta = json.loads((out / v["recolour_from"] / "meta.json").read_text())
            row["recolour"] = recolour(out / v["recolour_from"], d, meta, job, colour_hex(src_meta["picks"]["colour"]),
                                       colour_hex(meta["picks"]["colour"]), regions)
            row["recolour"]["from"] = v["recolour_from"]
        report["variants"].append(row)
        print(json.dumps(row))
    report["failures"] = failures
    (out / "qa.json").write_text(json.dumps(report, indent=2))
    print(f"{len(failures)} failure(s)" + "".join(f"\n  - {f}" for f in failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
