"""Proves the QA checks catch what they're meant to catch (CLAUDE.md: break each check on purpose).

Run: .venv/bin/python -I qa/selftest.py
"""
import sys
import pathlib

import cv2
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check  # noqa: E402
from metrics import delta_e2000, drift, srgb_to_lab  # noqa: E402


def expect(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    return cond


def main() -> int:
    rng = np.random.default_rng(0)
    base = rng.integers(60, 200, (200, 300, 3), dtype=np.uint8)
    noisy = np.clip(base.astype(int) + rng.integers(-4, 5, base.shape), 0, 255).astype(np.uint8)
    allowed = np.zeros((200, 300), bool)
    allowed[50:150, 50:150] = True
    ok = True

    inside = noisy.copy()
    inside[60:140, 60:140] = 255
    r = drift(base, inside, allowed)
    ok &= expect(r["changed_outside_pct"] <= check.DRIFT_LIMIT_PCT, f"change inside the region passes ({r['changed_outside_pct']}%)")

    outside = noisy.copy()
    outside[10:40, 200:290] = 255  # something moved where it shouldn't
    r = drift(base, outside, allowed)
    ok &= expect(r["changed_outside_pct"] > check.DRIFT_LIMIT_PCT, f"change outside the region fails ({r['changed_outside_pct']}%)")

    # handle length: a 120 px bar drawn into an index image, measured against 120 and against 100
    idx = np.zeros((200, 300), np.int32)
    cv2.rectangle(idx, (50, 99), (169, 101), 2, -1)  # pixels 50..169: exactly 120 px long
    meta = {"pulls": [{"name": "p", "length_in": 8, "ends_px": [[50.0, 100.5, 1], [170.0, 100.5, 1]]}]}
    h = check.handle_lengths(meta, idx)
    ok &= expect(bool(h) and h[0]["ok"], f"a bar of the right length passes ({h[0]['error_px'] if h else 'none'} px)")
    meta["pulls"][0]["ends_px"][1][0] = 150.0  # claims 100 px; the bar is 120
    h = check.handle_lengths(meta, idx)
    ok &= expect(bool(h) and not h[0]["ok"], f"a bar 20 px too long fails ({h[0]['error_px'] if h else 'none'} px)")

    hidden = idx.copy()
    hidden[95:105, 100:120] = 0  # something in front of the middle of the bar
    meta["pulls"][0]["ends_px"][1][0] = 170.0
    h = check.handle_lengths(meta, hidden)
    ok &= expect(h == [], "a partly hidden bar is skipped, not mis-measured")

    # layout lock: an object moving outside the allowed regions fails; inside it passes
    a = np.zeros((200, 300), np.int32)
    a[20:60, 20:80] = 3  # counter
    a[100:180, 150:250] = 1  # cabinet fronts
    b = a.copy()
    b[110:170, 160:240] = 2  # hardware changed inside the fronts
    ok &= expect(check.layout_lock(a, b, {1, 2})["ok"], "a change inside the allowed regions passes")
    c = a.copy()
    c[20:60, 20:80] = 0
    c[20:60, 40:100] = 3  # the counter slid 20 px
    r = check.layout_lock(a, c, {1, 2})
    ok &= expect(not r["ok"], f"a counter that slid 20 px fails ({r['moved_pct']}% moved)")

    # CIEDE2000 against published reference pairs (Sharma, Wu and Dalal 2005)
    pairs = [((50, 2.6772, -79.7751), (50, 0, -82.7485), 2.0425),
             ((50, -1.3802, -84.2814), (50, 0, -82.7485), 1.0000),
             ((50, 2.5, 0), (73, 25, -18), 27.1492)]
    for l1, l2, want in pairs:
        got = float(delta_e2000(np.array(l1, float), np.array(l2, float)))
        ok &= expect(abs(got - want) < 1e-3, f"CIEDE2000 {l1} vs {l2} = {got:.4f} (published {want})")
    white = srgb_to_lab(np.array([[[255, 255, 255]]], np.uint8))[0, 0]
    ok &= expect(abs(white[0] - 100) < 0.01 and abs(white[1]) < 0.01, f"sRGB white is Lab 100,0,0 ({white.round(3)})")
    print("all checks behave" if ok else "SELF-TEST FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
