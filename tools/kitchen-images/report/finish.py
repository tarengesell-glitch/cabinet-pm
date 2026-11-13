"""Camera finish: what a real camera adds and a renderer doesn't.

A render is optically perfect, and that perfection is part of what reads as "CG". A photo has:
- a little glow around bright lights and the window (lens bloom);
- slightly darker corners (lens vignetting);
- a faint colour fringe toward the edges (chromatic aberration);
- fine sensor grain.

This runs on the finished image only, after QA has checked the raw render, so the layout, handle and
colour checks still measure the render itself. It is deterministic: fixed settings and a fixed grain seed,
so every variant gets exactly the same finish and the images stay comparable.
"""
import cv2
import numpy as np

BLOOM_THRESHOLD = 0.82   # share of full brightness above which light blooms
BLOOM_RADIUS = 0.012     # of the image width
BLOOM_STRENGTH = 0.10
VIGNETTE = 0.14          # corner darkening, 0..1
FRINGE = 0.0007          # red/blue scale difference toward the edges
GRAIN = 0.008            # grain standard deviation, share of full brightness
GRAIN_SEED = 0


def finish(img_bgr: np.ndarray) -> np.ndarray:
    img = img_bgr.astype(np.float32) / 255.0
    h, w = img.shape[:2]
    # bloom from the brightest parts only
    lum = img.mean(axis=2, keepdims=True)
    bright = img * np.clip((lum - BLOOM_THRESHOLD) / (1 - BLOOM_THRESHOLD), 0, 1)
    sigma = BLOOM_RADIUS * w
    img = img + BLOOM_STRENGTH * cv2.GaussianBlur(bright, (0, 0), sigma)
    # chromatic aberration: red a touch larger, blue a touch smaller, about the centre
    centre = (w / 2, h / 2)
    for ch, k in ((2, 1 + FRINGE), (0, 1 - FRINGE)):
        m = cv2.getRotationMatrix2D(centre, 0, k)
        img[:, :, ch] = cv2.warpAffine(img[:, :, ch], m, (w, h), flags=cv2.INTER_LINEAR,
                                       borderMode=cv2.BORDER_REPLICATE)
    # vignette: smooth cos^4-like falloff to the corners
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / np.sqrt(2)
    img *= (1 - VIGNETTE * r ** 2.2)[:, :, None]
    # grain: fixed seed, slightly soft, strongest in the mid-tones like a sensor
    rng = np.random.default_rng(GRAIN_SEED)
    g = cv2.GaussianBlur(rng.standard_normal((h, w)).astype(np.float32), (0, 0), 0.6)
    g /= g.std()
    lum = img.mean(axis=2)
    img += (GRAIN * g * (0.4 + 2.4 * lum * (1 - lum)))[:, :, None]
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
