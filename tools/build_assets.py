"""Builds everything in assets/ from the source photos and catalogue PDF extracts.

  python tools/build_assets.py <scratch dir holding photos/, catalogues/raw, geo/>
"""
import json, os, subprocess, sys, zlib
import cv2
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import wash as W
from beans import paint_bean
from coffees import COFFEES, MILK_TONE

SP = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = ROOT + "/assets"
only = set(sys.argv[2:])
for d in ("beans", "capsules", "paint", "machines", "rings"):
    os.makedirs(f"{A}/{d}", exist_ok=True)


def want(k):
    return not only or k in only


# ---- paintings -------------------------------------------------------------
PAINT = {
    "drip":   ("1616388761741-a5936c6f61f6", dict(width=1500, seed=5, crop=(0, .03, 1, .78), spot=(.5, .42, .5, .56), gamma=1.25)),
    "glass":  ("1610889556528-9a770e32642f", dict(width=1500, seed=8, crop=(.25, .1, .75, 1), spot=(.5, .52, .48, .48), gamma=1.0, white=.86)),
    "cup":    ("1572286258217-40142c1c6a70", dict(width=1400, seed=9, crop=(.15, .2, .85, .8), spot=(.5, .5, .55, .55), gamma=1.0, white=.9)),
    "branch": ("1677123617592-5c30e34f40e9", dict(width=1700, seed=21, spot=(.52, .5, .46, .6), gamma=1.4)),
    "swirl":  ("1461023058943-07fcbe16d735", dict(width=1300, seed=31, crop=(.16, .12, .64, 1), spot=(.5, .56, .34, .5), gamma=1.35, ragged=.3, fade=.2)),
}
if want("paint"):
    for name, (src, k) in PAINT.items():
        r = W.paint_photo(f"{SP}/photos/{src}.jpg", **k)
        W.save(r, f"{A}/paint/{name}.webp", quality=82)
        print("paint", name, r.shape)


# ---- beans -----------------------------------------------------------------
if want("beans"):
    for co in COFFEES:
        seed = zlib.crc32(co["id"].encode()) % 100000
        tone = co["intensity"] or MILK_TONE[co["name"]]
        rgba = paint_bean(seed, co["species"], tone, 640)
        W.save(rgba, f"{A}/beans/{co['id']}.webp", quality=82)
        W.save(rgba, f"{A}/beans/{co['id']}-s.webp", quality=80, width=208)
    print("beans", len(COFFEES))


# ---- capsules from the catalogue -------------------------------------------
# Keyed by coffee id. Checked row by row against the catalogue pages.
OC = {"capriccio":2,"volluto":6,"volluto-decaffeinato":12,"cosi":14,"napoli":16,"kazaar":22,"ristretto":38,
      "ristretto-decaffeinato":46,"arpeggio":56,"arpeggio-decaffeinato":58,"arpeggio-extra":64,"roma":74,"venezia":76,
      "livanto":80,"india":94,"indonesia":92,"colombia":100,"nicaragua":112,"ethiopia":106,"rio-de-janeiro":126,
      "istanbul":128,"paris":132,"shanghai":136,"buenos-aires":142,"cape-town":144,"stockholm":154,"tokyo":160,
      "vienna":168,"vienna-decaffeinato":166,"corto":176,"scuro":174,"chiaro":194,"caramello":192,"vaniglia":196,
      "cioccolatino":206,"nocciola":208}
VC = {"voltesso":16,"altissio":18,"altissio-decaffeinato":20,"il-caffe":10,"ristretto-intenso":14,"stormio":24,
      "melozio":42,"roasted-hazelnut":36,"golden-caramel":38,"costa-rica":50}


def with_mask(pre, pdf, n):
    rows = [l.split() for l in subprocess.run(["pdfimages", "-list", f"{SP}/catalogues/{pdf}.pdf"], capture_output=True, text=True).stdout.splitlines()[2:]]
    idx = next(i for i, r in enumerate(rows) if int(r[1]) == n)
    im = Image.open(f"{SP}/catalogues/raw/{pre}-{n:03d}.png").convert("RGB")
    if idx + 1 < len(rows) and rows[idx + 1][2] == "smask":
        im.putalpha(Image.open(f"{SP}/catalogues/raw/{pre}-{int(rows[idx+1][1]):03d}.png").convert("L"))
    else:
        im = im.convert("RGBA")
    return im


if want("capsules"):
    for co in COFFEES:
        src = ("oc", "original-coffee", OC[co["id"]]) if co["id"] in OC else ("vc", "vertuo-coffee", VC[co["id"]])
        im = with_mask(*src)
        if co["id"] in ("vaniglia", "cioccolatino"):   # the catalogue stacks these two in one image
            half = im.height // 2
            im = im.crop((0, 0, im.width, half)) if co["id"] == "vaniglia" else im.crop((0, half, im.width, im.height))
        box = im.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
        if box:
            im = im.crop(box)
        im.save(f"{A}/capsules/{co['id']}.webp", "WEBP", quality=90, alpha_quality=95, method=6)
    print("capsules", len(COFFEES))


# ---- machines: catalogue shots are ~230px wide, so they are painted, not shown raw
MACH = {"essenza": ("om", 0), "inissia": ("om", 1), "pixie": ("om", 41), "citiz": ("om", 26), "citiz-milk": ("om", 43), "lattissima": ("om", 44), "creatista": ("om", 61)}
if want("machines"):
    os.makedirs(f"{SP}/mach", exist_ok=True)
    for i, (name, (pre, n)) in enumerate(MACH.items()):
        im = with_mask(pre, "original-machines", n)
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
        pad = Image.new("RGB", (int(im.width * 1.24), int(im.height * 1.14)), "white")
        pad.paste(bg.convert("RGB"), ((pad.width - im.width) // 2, (pad.height - im.height) // 2))
        pad = pad.resize((pad.width * 3, pad.height * 3), Image.BICUBIC)
        f = f"{SP}/mach/{name}.png"; pad.save(f)
        r = W.paint_photo(f, width=820, seed=40 + i, spot=(.5, .5, .62, .62), gamma=.92, white=.9, bloom=.1, ragged=.25, fade=.2)
        W.save(r, f"{A}/machines/{name}.webp", quality=82)
    print("machines", len(MACH))


# ---- cup rings -------------------------------------------------------------
def ring(S, seed):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    x, y = xx / S - .5, yy / S - .5
    r = np.sqrt(x * x + y * y)
    th = np.arctan2(y, x)
    wob = (W.fbm(S, S, S / 3, seed, 3) - .5) * .018
    R = .405 + wob
    d = r - R
    # A dried cup leaves a hard outside edge and a long soft inside.
    outer = np.exp(-((np.maximum(d, 0) / .0032) ** 2))
    inner = np.exp(-((np.minimum(d, 0) / .0105) ** 2)) * .62 + np.exp(-((np.minimum(d, 0) / .05) ** 2)) * .2
    prof = np.where(d > 0, outer, inner)
    # The cup lifted unevenly, so pressure comes and goes around the ring.
    press = np.zeros((S, S), np.float32)
    for k, a in ((1, .55), (2, .3), (3, .15)):
        press += a * np.cos(th * k + rng.uniform(0, 6.28))
    press = W.smooth(-.75, .55, press + (W.fbm(S, S, S / 5, seed + 1, 3) - .5) * 1.1)
    # Pressure only means anything out at the ring; at the centre the angle is undefined.
    dens = prof * (.1 + press * 1.15) * W.smooth(.2, .32, r)
    dens += W.smooth(.41, .34, r) * .012 * W.fbm(S, S, S / 2.2, seed + 2, 3)
    dens = W.warp(dens.astype(np.float32), S / 420, S / 16, seed + 3)
    # A few flecks thrown when the cup came down.
    for _ in range(rng.integers(3, 7)):
        a, q = rng.uniform(0, 6.28), rng.uniform(.43, .47)
        cx, cy = (.5 + q * np.cos(a)) * S, (.5 + q * np.sin(a)) * S
        s = rng.uniform(.0016, .005) * S
        dens += np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (s * s))) * rng.uniform(.25, .55)
    return W.pigment_to_rgba(W.finish(dens.astype(np.float32) * 2.1, seed + 7, .1))


if want("rings"):
    for i in range(5):
        W.save(ring(1000, 50 + i * 3), f"{A}/rings/ring{i}.webp", quality=80)
    print("rings")


# ---- paper tooth, as a seamless tile ---------------------------------------
if want("paper"):
    n = 256
    rng = np.random.default_rng(4)
    f = np.fft.fft2(rng.standard_normal((n, n)))
    fy, fx = np.fft.fftfreq(n)[:, None], np.fft.fftfreq(n)[None, :]
    rad = np.sqrt(fx * fx + fy * fy) + 1e-4
    g = np.real(np.fft.ifft2(f * (np.exp(-((rad - .16) / .1) ** 2) + .4 / (1 + (rad / .03) ** 2))))
    g = (g - g.mean()) / g.std()
    a = np.clip(np.abs(g) * .0075, 0, .03)
    rgb = np.where(g[..., None] > 0, np.array([120, 92, 66]), np.array([255, 255, 255]))
    tile = np.dstack([rgb, a * 255]).astype(np.uint8)
    Image.fromarray(tile).save(f"{A}/paper.webp", "WEBP", quality=45, alpha_quality=40, method=6)
    print("paper", os.path.getsize(f"{A}/paper.webp"))


# ---- the footer: paper soaking through to espresso --------------------------
# Long, low swells, so it reads as a tide coming up the sheet.
if want("soak"):
    w, h = 2400, 620
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32) / h
    swell = W.fbm(h, w, w / 1.7, 71, 2, .35)
    d = np.zeros((h, w), np.float32)
    for k, (start, amount) in enumerate(((.3, .16), (.4, .26), (.5, .46), (.6, .8), (.7, 1.3))):
        own = W.fbm(h, w, w / 3.4, 80 + k, 3, .38)
        lap = W.fbm(h, w, w / 26, 95 + k, 3, .4)
        front = yy - start + (swell - .5) * .2 + (own - .5) * .15 + (lap - .5) * .022
        cover = W.smooth(0, .007, front)
        body = .6 + .4 * W.smooth(0, .13, front)
        back = 1 - .24 * W.fbm(h, w, w / 6, 90 + k, 4) * W.smooth(.02, .16, front)
        d += cover * body * back * amount
        d += np.exp(-(((front - .003) / .0034) ** 2)) * amount * .34
    d = W.warp(d, 3, w / 40, 77)
    d = np.maximum(d, 3.66 * W.smooth(.84, .985, yy))
    W.save(W.pigment_to_rgba(W.finish(d, 74, .07)), f"{A}/soak.webp", quality=80)
    print("soak", os.path.getsize(f"{A}/soak.webp"))


# ---- map: the coffee belt in one pale wash ----------------------------------
LON0, LON1, LAT0, LAT1 = -125.0, 150.0, -42.0, 48.0
if want("map"):
    topo = json.load(open(f"{SP}/geo/land-110m.json"))
    sc, tr = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0; pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
        arcs.append(pts)

    def ring_pts(idx):
        out = []
        for i in idx:
            p = arcs[i] if i >= 0 else arcs[~i][::-1]
            out += p if not out else p[1:]
        return out

    w = 2000; h = round(w * (LAT1 - LAT0) / (LON1 - LON0) * 1.12)
    m = np.zeros((h, w), np.uint8)
    land = topo["objects"]["land"]
    geoms = land.get("geometries", [land])
    for g in geoms:
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
        for poly in polys:
            for k, rg in enumerate(poly):
                lons = [q[0] for q in ring_pts(rg)]
                if max(lons) - min(lons) > 300:
                    continue
                pts = np.array([((lo - LON0) / (LON1 - LON0) * w, (LAT1 - la) / (LAT1 - LAT0) * h) for lo, la in ring_pts(rg)], np.float32)
                cv2.fillPoly(m, [pts.astype(np.int32)], 255 if k == 0 else 0, lineType=cv2.LINE_AA)
    land_m = W.warp(m.astype(np.float32) / 255, w / 400, w / 40, 81)
    land_m = W.blur(land_m, 1.4)
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32)
    lat = LAT1 - yy / h * (LAT1 - LAT0)
    belt = W.smooth(38, 12, np.abs(lat))       # the band coffee actually grows in
    base = land_m * (.11 + .2 * belt)
    pool = np.clip(land_m - W.blur(land_m, 5), 0, 1) * .3
    base = base * (.8 + .4 * W.fbm(h, w, w / 12, 83, 4)) + pool * (.1 + .14 * belt)
    edge = W.smooth(0, .09, np.minimum(np.minimum(np.mgrid[0:h, 0:w][1] / w, 1 - np.mgrid[0:h, 0:w][1] / w), np.minimum(yy / h, 1 - yy / h)))
    W.save(W.pigment_to_rgba(W.finish((base * edge).astype(np.float32), 84, .1)), f"{A}/map.webp", quality=78)
    print("map", w, h, os.path.getsize(f"{A}/map.webp"))

# ---- the pale pool behind the selected bean ----------------------------------
if want("pool"):
    w, h = 760, 620
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = (xx / w - .5) / .44, (yy / h - .5) / .42
    big, mid = W.fbm(h, w, w / 2.6, 15, 4), W.fbm(h, w, w / 12, 16, 4)
    f = 1 - np.sqrt(u * u + v * v) + (big - .5) * .62 + (mid - .5) * .16
    body = W.smooth(0, .012, f)
    rim = np.clip(body - W.blur(body, 5), 0, 1)
    d = body * (.13 + .1 * W.fbm(h, w, w / 5, 17, 4)) + rim * .2
    W.save(W.pigment_to_rgba(W.finish(d.astype(np.float32), 18, .1)), f"{A}/pool.webp", quality=82)
    print("pool", os.path.getsize(f"{A}/pool.webp"))

# ---- the little wash behind an active control -------------------------------
if want("swatch"):
    h, w = 120, 300
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = (xx / w - .5) / .46, (yy / h - .5) / .36
    n = W.fbm(h, w, 60, 5, 4)
    f = 1 - (np.abs(u) ** 2.6 + np.abs(v) ** 2.6) ** (1 / 2.6) + (n - .5) * .5
    body = W.smooth(0, .03, f)
    pool = np.clip(body - W.blur(body, 3), 0, 1)
    d = body * (.2 + .13 * W.fbm(h, w, 40, 6, 3)) + pool * .3
    W.save(W.pigment_to_rgba(d.astype(np.float32)), f"{A}/swatch.webp", quality=85)
    print("swatch")

# ---- site data --------------------------------------------------------------
if want("data"):
    with open(f"{ROOT}/js/data.js", "w") as f:
        f.write("// Generated by tools/build_assets.py from tools/coffees.py. Do not edit by hand.\n")
        f.write("window.LIQUID_COFFEES = " + json.dumps(COFFEES, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("data")
