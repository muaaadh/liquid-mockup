"""The coffee sea: one frame of real drone footage, graded so the water is coffee and the
wake is crema, with the far water already fading to the page's cream. js/sea.js makes
it move.

  python tools/build_sea.py <source clip> <scratch dir>
"""
import os, subprocess, sys
import cv2
import numpy as np
from PIL import Image

SRC, TMP = sys.argv[1:3]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = f"{ROOT}/assets/sea"
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
CREAM = np.array([250, 243, 225], np.float64) / 255
RAMP = [(0, "#1f1008"), (.10, "#3c2211"), (.22, "#664022"), (.40, "#9c6e42"), (.60, "#cfab7c"), (.80, "#efdcb9"), (1, "#fffaf0")]
xs = [s[0] for s in RAMP]
cs = np.array([[int(s[1][i:i + 2], 16) for i in (1, 3, 5)] for s in RAMP], np.float64) / 255

subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", "1.4", "-i", SRC, "-frames:v", "1", f"{TMP}/frame.png"], check=True)
a = np.asarray(Image.open(f"{TMP}/frame.png").convert("RGB"), np.float64) / 255
H, W = a.shape[:2]
y = a @ np.array([.2126, .7152, .0722])
y = cv2.bilateralFilter(y.astype(np.float32), 0, .03, 1.4).astype(np.float64)   # settle the compression noise
y = np.clip((y - .2) * 1.72, 0, 1) ** 1.32
rgb = np.stack([np.interp(y, xs, cs[:, k]) for k in range(3)], -1)

# The far water thins to cream.
t = np.clip(1 - np.linspace(0, 1, H)[:, None] / .3, 0, 1)
fog = ((t * t * (3 - 2 * t)) ** .8)[..., None]
rgb = rgb * (1 - fog) + CREAM * fog

# Where the boat is, for the shader to hold it still.
g = (a @ np.array([.2126, .7152, .0722]) * 255).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats((g > 205).astype(np.uint8))
big = 1 + np.argmax(st[1:, 4])
ys, xs_ = np.where(lab == big)
top = np.argmin(ys)
print("boat uv", round(xs_[top] / W, 4), round(ys[top] / H, 4), "wake end", round(xs_[np.argmax(ys)] / W, 4), round(ys.max() / H, 4))

im = Image.fromarray((np.clip(rgb, 0, 1) * 255 + .5).astype(np.uint8))
im.resize((1600, 900), Image.LANCZOS).save(f"{OUT}/sea.webp", "WEBP", quality=82, method=6)
im.resize((960, 540), Image.LANCZOS).save(f"{OUT}/sea-m.webp", "WEBP", quality=78, method=6)

# Link preview: the wordmark on cream above the coffee sea.
og = Image.new("RGB", (1200, 630), tuple(int(c * 255) for c in CREAM))
sea = im.resize((1200, 675), Image.LANCZOS).crop((0, 150, 1200, 525))
og.paste(sea, (0, 255))
ramp = Image.fromarray(np.repeat((np.linspace(255, 0, 140))[:, None], 1200, 1).astype(np.uint8))
og.paste(Image.new("RGB", (1200, 140), tuple(int(c * 255) for c in CREAM)), (0, 255), ramp)
og.save(f"{OUT}/og-base.png")
for f in ("sea.webp", "sea-m.webp"):
    print(f, os.path.getsize(f"{OUT}/{f}") // 1024, "KB")
