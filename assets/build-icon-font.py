# Rebuild NanoClawIcons.ttf (one glyph, U+E000) from nanoclaw-logo.png next to
# this script. Arguments tune how much inner linework is cut out: 40 3.
#   uv run --with potracer --with fonttools --with pillow --with numpy --with scipy python assets/build-icon-font.py 40 3
import os
import numpy as np, potrace, sys
HERE = os.path.dirname(os.path.abspath(__file__))
from PIL import Image, ImageFilter, ImageDraw, ImageFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

im = np.asarray(Image.open(os.path.join(HERE, "nanoclaw-logo.png")).convert("RGB")).astype(int)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
fg = (r + g + b) < 600                     # anything not near-white
navy = (r < 80) & (g < 80) & (b > 40) & (b < 140)
# fill holes in the silhouette (white highlights inside the body)
from scipy.ndimage import binary_fill_holes, binary_opening, label
sil = binary_fill_holes(fg)
sil = binary_opening(sil, iterations=2)
lab, n = label(sil); sizes = np.bincount(lab.ravel()); sizes[0] = 0
sil = lab == sizes.argmax()               # keep the shrimp, drop specks
# cut the inner navy linework (eyes, smile, segments, claw) out of the fill;
# the outer outline stays solid because it touches the background
from scipy.ndimage import binary_erosion, binary_dilation
interior = binary_erosion(sil, iterations=int(sys.argv[1]) if len(sys.argv) > 1 else 22)
holes = binary_dilation(navy & interior, iterations=int(sys.argv[2]) if len(sys.argv) > 2 else 4)
ys, xs = np.nonzero(sil); top, bot = ys.min(), ys.max(); left, right = xs.min(), xs.max()
glyph = sil & ~holes

bm = potrace.Bitmap(~glyph[::-1])          # flip: font y goes up
path = bm.trace(turdsize=40, alphamax=1.0, opticurve=True, opttolerance=0.3)
size = max(bot - top, right - left)
UPM = 1000; pad = 20; sc = (UPM - 2 * pad) / size
h = glyph.shape[0]
ox = pad - left * sc + ((UPM - 2 * pad) - (right - left) * sc) / 2
oy = pad - (h - 1 - bot) * sc + ((UPM - 2 * pad) - (bot - top) * sc) / 2 - 100   # sit on baseline-ish
T = lambda p: (round(p.x * sc + ox), round(p.y * sc + oy))

pen = TTGlyphPen(None); cp = Cu2QuPen(pen, 1.0, reverse_direction=False)
for c in path:
    cp.moveTo(T(c.start_point))
    for s in c.segments:
        if s.is_corner: cp.lineTo(T(s.c)); cp.lineTo(T(s.end_point))
        else: cp.curveTo(T(s.c1), T(s.c2), T(s.end_point))
    cp.closePath()
g = pen.glyph()

CP = 0xE000
fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder([".notdef", "nanoclaw"])
fb.setupCharacterMap({CP: "nanoclaw"})
fb.setupGlyf({".notdef": TTGlyphPen(None).glyph(), "nanoclaw": g})
fb.setupHorizontalMetrics({".notdef": (UPM, 0), "nanoclaw": (UPM, 0)})
fb.setupHorizontalHeader(ascent=880, descent=-120)
fb.setupNameTable({"familyName": "NanoClaw Icons", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=880, sTypoDescender=-120, usWinAscent=880, usWinDescent=120)
fb.setupPost()
fb.save(os.path.join(HERE, "NanoClawIcons.ttf"))

# preview at menu sizes
out = Image.new("RGB", (260, 70), "#1e1e2e"); d = ImageDraw.Draw(out)
x = 5
for px in (16, 20, 28, 48):
    f = ImageFont.truetype(os.path.join(HERE, "NanoClawIcons.ttf"), px); d.text((x, 5), chr(CP), font=f, fill="#cdd6f4"); x += px + 15
out = out.resize((1040, 280), Image.NEAREST); out.save(os.path.join(os.environ.get("TMPDIR", "/tmp"), "nanoclaw-glyph-preview.png"))
print("ok", len(path), "contours")
