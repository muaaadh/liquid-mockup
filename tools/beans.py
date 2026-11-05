"""One painted bean per coffee. Shape is species, wash depth is roast."""
import sys, zlib
import cv2
import numpy as np
from wash import fbm, blur, smooth, warp, glazes, finish, pigment_to_rgba, save


def one_bean(S, seed, oval=True, roast=0.5, cx=0.5, cy=0.5, scale=1.0, tilt=0.0):
    """Returns the density of a single bean drawn on an S x S sheet."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    x, y = (xx / S - cx) * 2 / scale, (yy / S - cy) * 2 / scale
    ca, sa = np.cos(tilt), np.sin(tilt)
    x, y = x * ca + y * sa, -x * sa + y * ca
    wob = (fbm(S, S, S / 2.6, seed, 3) - 0.5) * 0.11
    if oval:   # Arabica: long oval, S-curved crease
        a, b = 0.56 + rng.uniform(-0.02, 0.02), 0.84 + rng.uniform(-0.03, 0.02)
        amp, width = rng.uniform(0.12, 0.17), 0.05
    else:      # Robusta: round and small, nearly straight crease
        a, b = 0.6 + rng.uniform(-0.02, 0.02), 0.68 + rng.uniform(-0.02, 0.02)
        amp, width = rng.uniform(0.015, 0.035), 0.05
    # A bean is flatter on the crease side, so use a squarer profile than an ellipse.
    r = (np.abs(x / a) ** 2.35 + np.abs(y / b) ** 2.35) ** (1 / 2.35) + wob
    inside = smooth(1.0, 0.985, r)
    dome = np.sqrt(np.clip(1 - np.clip(r, 0, 1) ** 2.6, 0, 1))
    phase = rng.uniform(-0.3, 0.3)
    crease_x = amp * np.sin(y / b * 3.1 + phase) + (fbm(S, S, S / 5, seed + 4, 2) - 0.5) * 0.03
    dist = x - crease_x
    taper = np.sqrt(np.clip(1 - (y / (b * 0.97)) ** 2, 0, 1))
    groove = np.exp(-((dist / (width * (0.45 + 0.75 * taper))) ** 2)) * taper
    lobes = 0.8 + 0.2 * smooth(0.0, 0.3, np.abs(dist))
    height = (dome * lobes - groove * 0.42).astype(np.float32)

    gx = cv2.Sobel(height, cv2.CV_32F, 1, 0, ksize=5) * (S / 170)
    gy = cv2.Sobel(height, cv2.CV_32F, 0, 1, ksize=5) * (S / 170)
    nz = 1 / np.sqrt(gx * gx + gy * gy + 1)
    lx, ly, lz = -0.52, -0.62, 0.59
    lit = np.clip((-gx * lx - gy * ly + lz) * nz, 0, 1)
    shade = 1 - lit
    # Oil sheen grows with roast, and the paper is left bare for it.
    spec = np.clip(lit, 0, 1) ** 26 * (0.45 + 0.55 * roast)

    base = 0.2 + 2.5 * roast ** 1.5
    d = base * (0.34 + 1.05 * shade ** 1.25)
    d += groove * (0.7 + 2.1 * roast)
    d *= 1 - spec * 0.92
    d *= inside
    return d.astype(np.float32), inside.astype(np.float32), groove


def paint_bean(coffee_seed, species, tone, S=768):
    """tone is the intensity 1..13. Blends get both shapes on one sheet."""
    roast = np.clip((tone - 2) / 11, 0.03, 1)
    seed = coffee_seed
    if species == "Arabica and Robusta":
        d1, m1, _ = one_bean(S, seed, True, roast, 0.385, 0.47, 0.72, 0.2)
        d2, m2, _ = one_bean(S, seed + 7, False, roast, 0.665, 0.6, 0.6, -0.5)
        d = np.where(m2 > 0.5, d2, d1)
        m = np.maximum(m1, m2)
    elif species == "Robusta":
        d, m, _ = one_bean(S, seed, False, roast, 0.5, 0.5, 0.8)
    else:
        d, m, _ = one_bean(S, seed, True, roast, 0.5, 0.5, 0.96)

    top = float(max(d.max(), 1e-3))
    n = (d / top).astype(np.float32)
    layers = [(0.12, 0.09), (0.3, 0.12), (0.5, 0.18), (0.72, 0.26)]
    g = glazes(n, layers, seed + 2, edge_r=S / 170, wobble=0.03) * top * 0.75 + blur(d, S / 360) * 0.72
    # Pigment gathers at the outline where the bean dried.
    outline = np.clip(m - blur(m, S / 90), 0, 1)
    g += outline * (0.25 + 0.9 * roast)
    # A breath of water let the outline bleed in one or two places.
    bleed = blur(m, S / 26) * smooth(0.52, 0.8, fbm(S, S, S / 4, seed + 9, 3))
    g = np.maximum(g, bleed * (0.05 + 0.12 * roast))
    g = warp(g.astype(np.float32), S / 240, S / 18, seed + 3)
    g = finish(g, seed + 6, tooth=0.1)
    return pigment_to_rgba(g)


if __name__ == "__main__":
    from coffees import COFFEES, MILK_TONE
    out = sys.argv[1]
    for co in COFFEES:
        seed = zlib.crc32(co["id"].encode()) % 100000
        tone = co["intensity"] or MILK_TONE[co["name"]]
        rgba = paint_bean(seed, co["species"], tone, 640)
        save(rgba, f"{out}/{co['id']}.webp", quality=84)
        save(rgba, f"{out}/{co['id']}-s.webp", quality=80, width=200)
    print(len(COFFEES), "beans")
