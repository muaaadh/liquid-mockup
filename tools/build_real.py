"""Real product photos, Maldives photography and the machine film.

  python tools/build_real.py <scratch dir holding src/ and catalogues/>
"""
import os, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
import wash as W
from coffees import COFFEES

SP = sys.argv[1]
only = set(sys.argv[2:])
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = ROOT + "/assets"
want = lambda k: not only or k in only
for d in ("pods", "machines", "maldives", "film"):
    os.makedirs(f"{A}/{d}", exist_ok=True)


def square(im, margin=.05):
    """Trim to the object, then centre it, so every capsule sits at the same size."""
    im = im.convert("RGBA")
    box = im.getchannel("A").point(lambda v: 255 if v > 90 else 0).getbbox()
    if box:
        im = im.crop(box)
    side = round(max(im.size) * (1 + margin * 2))
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return out


PRO = {"forte-pro": "forte.png", "leggero-pro": "leggero.png", "intenso-pro": "intenso.png", "finezzo-pro": "finezzo.png",
       "decaffeinato-pro": "decaf.jpeg", "ristresso-pro": "ristresso.png", "ristresso-intenso-pro": "rist_int.png",
       "lungo-origin-guatemala-pro": "guatemala.png"}

if want("pods"):
    for co in COFFEES:
        cid = co["id"]
        src = f"{SP}/src/pods/{cid}.png"
        if co["line"] == "Professional":
            src = f"{SP}/src/b2b/images-live/images/pods/{PRO[cid]}"
        if cid == "decaffeinato-pro":
            # The only copy is a small JPEG on white: cut the round pod out of it.
            rgb = Image.open(src).convert("RGB")
            ink = (np.asarray(rgb, np.float32).min(axis=2) < 238)
            ys, xs = np.where(ink)
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
            k = 4
            big = rgb.crop((int(x0), int(y0), int(x1) + 1, int(y1) + 1)).resize(((x1 - x0 + 1) * k, (y1 - y0 + 1) * k), Image.LANCZOS)
            yy, xx = np.mgrid[0:big.height, 0:big.width].astype(np.float32)
            r = np.sqrt(((xx / big.width - .5) * 2) ** 2 + ((yy / big.height - .5) * 2) ** 2)
            mask = Image.fromarray((W.smooth(1.0, .975, r) * 255).astype(np.uint8))
            big.putalpha(mask)
            im = square(big)
        elif not os.path.exists(src):
            # Paris: every Nespresso source differs from the client's catalogue, so the
            # catalogue photo stays, enlarged gently.
            im = square(Image.open(f"{ROOT}/tools/paris-catalogue.webp"))
            im = im.resize((480, 480), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.6, 70, 2))
        else:
            im = square(Image.open(src))
        im.resize((640, 640), Image.LANCZOS).save(f"{A}/pods/{cid}.webp", "WEBP", quality=84, alpha_quality=92, method=6)
        im.resize((240, 240), Image.LANCZOS).save(f"{A}/pods/{cid}-s.webp", "WEBP", quality=82, alpha_quality=90, method=6)
    print("pods", len(COFFEES))


MACHINES = ["essenza-mini", "inissia", "pixie", "citiz", "citiz-milk", "lattissima-one", "creatista-plus",
            "aguila-220", "gemini", "zenius", "momento-100", "momento-200", "momento-120"]
if want("machines"):
    for m in MACHINES:
        im = Image.open(f"{SP}/src/machines/{m}.png").convert("RGBA")
        box = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
        im = im.crop(box)
        for suffix, size in (("", 760), ("-m", 420)):
            k = size / max(im.size)
            r = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            r.save(f"{A}/machines/{m}{suffix}.webp", "WEBP", quality=84, alpha_quality=92, method=6)
        print(m, r.size)


def wash_photo(name, src, width, crop=None, spot=(.5, .5, .62, .62), seed=3, ragged=.32, fade=.22, ratio=None):
    """A real photograph, kept in full colour, whose edges thin out into the paper."""
    im = Image.open(src).convert("RGB")
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    if ratio:   # centre-crop, so a row of pictures shares one shape
        w, h = im.size
        if w / h > ratio:
            cut = (w - h * ratio) / 2
            im = im.crop((int(cut), 0, int(w - cut), h))
        else:
            cut = (h - w / ratio) / 2
            im = im.crop((0, int(cut), w, int(h - cut)))
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    cover, tide = W.soft_mask(h, width, seed, spot=spot, ragged=ragged, fade=fade)
    a = np.clip(cover, 0, 1) ** .8
    rgba = np.dstack([np.asarray(im, np.float32) / 255, a]).astype(np.float32)
    W.save(rgba, f"{A}/maldives/{name}.webp", quality=80)
    W.save(rgba, f"{A}/maldives/{name}-m.webp", quality=76, width=max(640, width // 2))
    print(name, width, h, os.path.getsize(f"{A}/maldives/{name}.webp") // 1024, "KB")


M = f"{SP}/src/maldives"
if want("maldives"):
    wash_photo("island", f"{M}/aerial-1599832976672-5923b10683d4.jpg", 2000, crop=(0, .1, 1, .94), spot=(.5, .52, .66, .8), seed=4, ragged=.38, fade=.28)
    wash_photo("deck", f"{M}/room-2549018.jpg", 1200, crop=(.06, .02, 1, 1), spot=(.5, .5, .76, .78), seed=9, fade=.22, ragged=.4, ratio=1.5)
    wash_photo("restaurant", f"{M}/dining-1722137148792-e3d166247290.jpg", 1200, crop=(.05, 0, .9, 1), spot=(.5, .5, .76, .8), seed=13, fade=.22, ragged=.4, ratio=1.5)
    wash_photo("cup", f"{M}/cup-1546869134-cf00bc9f79fc.jpg", 1200, crop=(0, .24, 1, .684), spot=(.5, .5, .76, .78), seed=17, fade=.22, ragged=.4, ratio=1.5)


if want("film"):
    # The film's edges thin out like every other picture on the page.
    cover, _ = W.soft_mask(450, 800, 23, spot=(.5, .5, .68, .72), ragged=.3, fade=.2)
    m = Image.new("RGBA", (800, 450), (0, 0, 0, 255))
    m.putalpha(Image.fromarray((np.clip(cover, 0, 1) * 255).astype(np.uint8)))
    m.save(f"{A}/film/mask.webp", "WEBP", quality=70, alpha_quality=80)
    F = f"{SP}/src/footage"
    tmp = f"{SP}/film"
    os.makedirs(tmp, exist_ok=True)
    # Soft sides for the pour, so its crop melts into the black frame.
    xs = np.linspace(-1, 1, 1280)[None, :]
    edge = np.clip((1 - np.abs(xs)) / .34 - .55, 0, 1)
    edge = edge * edge * (3 - 2 * edge)
    Image.fromarray((np.repeat(edge, 720, 0) * 255).astype(np.uint8)).save(f"{tmp}/mask.png")
    fc = (
        "[0:v]trim=start=4.7:duration=7.9,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p,"
        "eq=contrast=1.03:saturation=1.04,fade=t=in:st=0:d=0.5[a];"
        "[1:v]trim=start=0.4:duration=33,setpts=(PTS-STARTPTS)/2.6,fps=30,"
        "crop=720:800:0:300,scale=648:720,pad=1280:720:316:0:black,format=rgba[p];"
        "[2:v]format=gray,loop=-1:size=1:start=0,fps=30[m];"
        "[p][m]alphamerge[pm];"
        "color=c=black:s=1280x720:r=30:d=13[bg];"
        "[bg][pm]overlay=shortest=1,format=yuv420p,fade=t=out:st=12:d=0.8[b];"
        "[a][b]xfade=transition=fade:duration=0.9:offset=7,format=yuv420p[v]"
    )
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", f"{F}/01-capsule-in-lever-nespresso-zenius-coverr-3001.mp4",
                    "-i", f"{F}/02-pour-glass-nespresso-pixie-portrait-pexels-7876121.mp4", "-i", f"{tmp}/mask.png",
                    "-filter_complex", fc, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "25",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{A}/film/machine.mp4"], check=True)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", f"{A}/film/machine.mp4", "-vf", "scale=720:-2", "-an",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-movflags", "+faststart", f"{A}/film/machine-m.mp4"], check=True)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", "3.1", "-i", f"{A}/film/machine.mp4", "-frames:v", "1", "-q:v", "4", f"{tmp}/poster.jpg"], check=True)
    Image.open(f"{tmp}/poster.jpg").save(f"{A}/film/poster.webp", "WEBP", quality=76)
    for f in ("machine.mp4", "machine-m.mp4", "poster.webp"):
        print(f, os.path.getsize(f"{A}/film/{f}") // 1024, "KB")
