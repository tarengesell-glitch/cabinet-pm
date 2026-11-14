"""Reads the render's multi-part EXR into numpy arrays keyed by pass name ('Combined', 'Object Index', ...)."""
import OpenEXR
import numpy as np


def read_passes(path) -> dict[str, np.ndarray]:
    out = {}
    with OpenEXR.File(str(path)) as f:
        for part in f.parts:
            name = part.name().removeprefix("ViewLayer.")
            for ch_name, ch in part.channels.items():
                arr = np.asarray(ch.pixels, dtype=np.float32)
                out[name] = arr if arr.ndim == 3 else arr
    return out


def region_mask(passes, index: int) -> np.ndarray:
    idx = passes["Object Index"]
    if idx.ndim == 3:
        idx = idx[..., 0]
    return np.rint(idx).astype(np.int32) == index
