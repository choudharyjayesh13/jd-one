#!/usr/bin/env python3
"""Generate every JD Group icon/logo asset from brand/jd-group-logo.png (the original
orange-circle JD GROUP logo Jayesh provided). Run: python3 scripts/make-brand-icons.py
Outputs: public/icons/*, public/portal/jd-logo.svg, src/app/favicon.ico,
desktop-mac/icon-512.png, and (if present) ../jdgroup-website/assets/*."""
import base64, io, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "brand", "jd-group-logo.png")
ORANGE = (241, 137, 33, 255)  # sampled from the logo circle

logo = Image.open(SRC).convert("RGBA")
# sample the circle colour from the centre-top of the disc
from collections import Counter
_pts = [logo.getpixel((int(logo.width * x), int(logo.height * y))) for x, y in
        [(0.12, 0.5), (0.88, 0.5), (0.5, 0.06), (0.5, 0.94), (0.2, 0.3), (0.8, 0.3)]]
_solid = [p for p in _pts if p[3] > 250]
if _solid:
    ORANGE = Counter(_solid).most_common(1)[0][0]

def square(size, bg=None, scale=1.0):
    im = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    s = int(size * scale)
    l = logo.resize((s, s), Image.LANCZOS)
    im.alpha_composite(l, ((size - s) // 2, (size - s) // 2))
    return im

def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    print("wrote", os.path.relpath(path, ROOT), im.size)

def svg_wrapper(path, size=512):
    """SVG that embeds the PNG so every existing <img src=...svg> keeps working."""
    buf = io.BytesIO(); square(size).save(buf, "PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
           f'viewBox="0 0 {size} {size}" width="{size}" height="{size}">'
           f'<title>JD Group</title><image width="{size}" height="{size}" '
           f'xlink:href="data:image/png;base64,{b64}"/></svg>')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(svg); print("wrote", os.path.relpath(path, ROOT), len(svg), "bytes")

icons = os.path.join(ROOT, "public", "icons")
save(square(512), f"{icons}/icon-512.png")
save(square(192), f"{icons}/icon-192.png")
save(square(180, bg=(255, 255, 255, 255)), f"{icons}/apple-touch-icon.png")
save(square(512, bg=ORANGE, scale=0.82), f"{icons}/icon-maskable-512.png")   # full-bleed orange, logo in safe zone
svg_wrapper(f"{icons}/icon.svg")
svg_wrapper(os.path.join(ROOT, "public", "portal", "jd-logo.svg"))
save(square(512), os.path.join(ROOT, "desktop-mac", "icon-512.png"))
fav = square(64, bg=(255, 255, 255, 0))
fav.save(os.path.join(ROOT, "src", "app", "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("wrote src/app/favicon.ico")

site = os.path.join(os.path.dirname(ROOT), "jdgroup-website")
for target in [site] + [a for a in sys.argv[1:]]:
    if os.path.isdir(os.path.join(target, "assets")):
        save(square(512), os.path.join(target, "assets", "icon-512.png"))
        save(square(192), os.path.join(target, "assets", "icon-192.png"))
        svg_wrapper(os.path.join(target, "assets", "jd-logo.svg"))
