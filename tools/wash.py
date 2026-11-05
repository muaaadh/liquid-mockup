"""Coffee-on-paper watercolour engine.

Everything painted on the Liquid site goes through this file so that photographs,
beans, rings and catalogue machines share one hand.

The model:
  density  how much pigment sits on the paper at each pixel
  glazes   the density is built from a few transparent layers, like a painter
           working light to dark, and each layer pools at its own wet edge
  colour   Beer-Lambert absorption through coffee, so a thin wash is pale honey
           and a thick one is near-black, with no hand-picked colour ramp
  alpha    the result is stored as colour + alpha that composites to the same
           picture over white paper, so paintings sit on the page with no box
"""
import cv2
import numpy as np
from PIL import Image

# Absorption of coffee per unit density for R, G, B. Blue dies first, red last.
COFFEE_K = np.array([0.74, 1.0, 1.3], dtype=np.float32)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def fbm(h, w, scale, seed=0, octaves=4, gain=0.5):
    """Fractal noise in 0..1 built from upsampled random grids."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, total, s = 1.0, 0.0, float(scale)
    for _ in range(octaves):
        gh, gw = max(2, int(h / s) + 2), max(2, int(w / s) + 2)
        g = rng.random((gh, gw)).astype(np.float32)
        out += amp * cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)
        total += amp
        amp *= gain
        s = max(1.5, s / 2)
    out /= total
    return np.clip((out - out.mean()) / (out.std() * 4.2 + 1e-6) + 0.5, 0, 1)


def blur(a, r):
    return cv2.GaussianBlur(a, (0, 0), max(r, 0.1))


def warp(a, amp, scale, seed):
    """Nudge pixels around so no edge is ruler-straight."""
    h, w = a.shape[:2]
    dx = (fbm(h, w, scale, seed, 3) - 0.5) * 2 * amp
    dy = (fbm(h, w, scale, seed + 1, 3) - 0.5) * 2 * amp
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return cv2.remap(a, xx + dx, yy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def paper_grain(h, w, seed=11):
    """Cold-press tooth: fine bumps plus a slower undulation."""
    fine = fbm(h, w, 5, seed, 3, 0.6)
    mid = fbm(h, w, 22, seed + 5, 3)
    return np.clip(fine * 0.72 + mid * 0.28, 0, 1)


def glazes(density, layers, seed=3, edge_r=None, wobble=0.05):
    """Rebuild a continuous density as stacked transparent washes."""
    h, w = density.shape
    edge_r = edge_r or max(1.6, w / 520)
    low = fbm(h, w, w / 5, seed, 4)
    jitter = fbm(h, w, w / 26, seed + 2, 4)
    out = np.zeros_like(density)
    for i, (t, strength) in enumerate(layers):
        th = t + (jitter - 0.5) * wobble * 2
        soft = 0.012 + 0.02 * low
        m = smooth(th - soft, th + soft, density)
        pool = np.clip(m - blur(m, edge_r * (1.6 + i * 0.3)), 0, 1)
        body = 0.82 + 0.36 * fbm(h, w, w / 9, seed + 9 + i, 3)
        out += m * strength * body + pool * strength * 1.55
    return out


def blooms(h, w, seed, count=5, reach=0.2):
    """Backruns: where a wetter patch pushed pigment outward into a ragged rim."""
    rng = np.random.default_rng(seed)
    field = np.zeros((h, w), np.float32)
    rim = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    n = fbm(h, w, w / 12, seed + 1, 5)
    for _ in range(count):
        cx, cy = rng.uniform(0.12, 0.88) * w, rng.uniform(0.12, 0.88) * h
        r = rng.uniform(0.35, 1.0) * reach * w
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r + (n - 0.5) * 0.9
        inside = 1 - smooth(0.86, 1.0, d)
        field = np.maximum(field, inside)
        rim += np.exp(-(((d - 1.0) / 0.035) ** 2))
    return field, np.clip(rim, 0, 1)


def soft_mask(h, w, seed=7, spot=(0.5, 0.5, 0.62, 0.62), ragged=0.5, fade=0.3):
    """Where the wash lives: a watery pool around the subject that thins to bare paper.

    Returns (coverage 0..1, tide) where tide is the fine dried line a wash leaves at
    its limit. The tide comes and goes along the edge the way a real one does.
    """
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy, rx, ry = spot
    u, v = (xx / w - cx) / rx, (yy / h - cy) / ry
    r = np.sqrt(u * u + v * v)
    big = fbm(h, w, w / 2.4, seed, 3)
    mid = fbm(h, w, w / 9, seed + 1, 3, 0.45)
    field = 1 - r + (big - 0.5) * ragged + (mid - 0.5) * ragged * 0.22
    # Whatever the noise does, the wash must die before it reaches the sheet's edge.
    margin = np.minimum(np.minimum(xx, w - 1 - xx) / (w * 0.07), np.minimum(yy, h - 1 - yy) / (h * 0.07))
    coverage = smooth(0.0, fade, field) * smooth(0.0, 1.0, margin)
    line = np.exp(-((field / 0.007) ** 2))
    tide = line * smooth(0.54, 0.74, fbm(h, w, w / 4, seed + 2, 3)) * smooth(0.0, 1.0, margin)
    return coverage, tide


def pigment_to_rgba(density, k=COFFEE_K):
    """Density -> straight-alpha RGBA that lands on the same colour over white."""
    T = np.exp(-density[..., None] * k[None, None, :])
    alpha = 1 - T.min(axis=2)
    a = np.maximum(alpha, 1e-4)[..., None]
    rgb = np.clip((T - (1 - a)) / a, 0, 1)
    return np.dstack([rgb, alpha]).astype(np.float32)


def finish(density, seed=11, tooth=0.14):
    """Pigment settles into the paper's valleys, most visibly in mid tones."""
    h, w = density.shape
    g = paper_grain(h, w, seed)
    settle = 1 + (g - 0.5) * 2 * tooth * smooth(0.02, 0.7, density)
    return density * settle


def save(rgba, path, quality=86, width=None):
    im = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    if width and im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(path, "WEBP", quality=quality, alpha_quality=92, method=6)
    return im


def paint_photo(src, width=1500, seed=5, gamma=1.3, black=0.04, white=0.93, depth=1.0,
                spot=(0.5, 0.5, 0.62, 0.62), ragged=0.5, fade=0.3, crop=None, bloom=0.16):
    """Photograph -> coffee wash on paper."""
    im = Image.open(src).convert("RGB")
    if crop:
        W, H = im.size
        im = im.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
    h = round(im.height * width / im.width)
    a = np.array(im.resize((width, h), Image.LANCZOS))
    a = cv2.bilateralFilter(a, 0, 26, max(4, width / 170))
    lum = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    lum = warp(lum, width / 420, width / 30, seed)
    d = np.clip((1 - lum - (1 - white)) / (white - black), 0, 1) ** gamma

    layers = [(0.1, 0.1), (0.24, 0.13), (0.4, 0.18), (0.57, 0.26), (0.74, 0.38), (0.88, 0.5)]
    g = glazes(d, layers, seed, wobble=0.022) * 0.62 + blur(d, width / 800) * 1.28
    field, rim = blooms(h, width, seed + 3, count=5, reach=0.17)
    g = g * (1 - bloom * field) + rim * 0.05 * smooth(0.1, 0.4, d)

    cover, tide = soft_mask(h, width, seed + 4, spot=spot, ragged=ragged, fade=fade)
    g = g * cover + tide * 0.1 * smooth(0.02, 0.2, blur(d, 8))
    g = finish(g * depth, seed + 6)
    return pigment_to_rgba(g * 1.5)
