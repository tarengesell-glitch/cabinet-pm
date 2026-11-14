"""Camera finish: what a real camera adds and a renderer doesn't.

A render is optically perfect, and that perfection is part of what reads as "CG". A photo has:
- a little glow around bright lights and the window (lens bloom);
- slightly darker corners (lens vignetting);
- fine sensor grain;
- the light capture sharpening every camera or editor applies.

No colour-fringe step: it resamples the image and costs definition (round 5).

This runs on the finished image only, after QA has checked the raw render, so the layout, handle and
colour checks still measure the render itself. It is deterministic: fixed settings and a fixed grain seed,
so every variant gets exactly the same finish and the images stay comparable.
"""
import cv2
import numpy as np

BLOOM_THRESHOLD = 0.82   # share of full brightness above which light blooms
BLOOM_RADIUS = 0.012     # of the image width
BLOOM_STRENGTH = 0.06
VIGNETTE = 0.10          # corner darkening, 0..1
GRAIN = 0.006            # grain standard deviation, share of full brightness
SHARPEN_AMOUNT = 0.45    # unsharp mask strength
SHARPEN_RADIUS = 0.9     # pixels
GRAIN_SEED = 0


def finish(img_bgr: np.ndarray) -> np.ndarray:
    img = img_bgr.astype(np.float32) / 255.0
    h, w = img.shape[:2]
    # bloom from the brightest parts only
    lum = img.mean(axis=2, keepdims=True)
    bright = img * np.clip((lum - BLOOM_THRESHOLD) / (1 - BLOOM_THRESHOLD), 0, 1)
    sigma = BLOOM_RADIUS * w
    img = img + BLOOM_STRENGTH * cv2.GaussianBlur(bright, (0, 0), sigma)
    # capture sharpening (unsharp mask), before grain so the grain itself is not sharpened
    soft = cv2.GaussianBlur(img, (0, 0), SHARPEN_RADIUS)
    img = img + SHARPEN_AMOUNT * (img - soft)
    # vignette: smooth cos^4-like falloff to the corners
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / np.sqrt(2)
    img *= (1 - VIGNETTE * r ** 2.2)[:, :, None]
    # grain: fixed seed, slightly soft, strongest in the mid-tones like a sensor
    rng = np.random.default_rng(GRAIN_SEED)
    g = rng.standard_normal((h, w)).astype(np.float32)
    lum = img.mean(axis=2)
    img += (GRAIN * g * (0.4 + 2.4 * lum * (1 - lum)))[:, :, None]
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
