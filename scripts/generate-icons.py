#!/usr/bin/env python3
"""Regenerates the Onest paw raster assets from the canonical vector geometry.

Cross-platform equivalent of scripts/generate-icons.ps1 (which needs Windows
+ System.Drawing). Outputs must stay byte-comparable in spirit (same sizes,
colors, geometry); exact bytes may differ per renderer.

Assets (into apps/web/public/images):
  - paw-192.png, paw-512.png  (PWA / touch icons: dark badge + amber paw)
  - og.png (+ og-vi.png, og-zh.png copies)  (1200x630 share banner)

Usage:  python3 scripts/generate-icons.py [--icons-only | --og-only]
Requires: Pillow  (pip install pillow)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("generate-icons.py needs Pillow: pip install pillow")

OUT_DIR = Path(__file__).resolve().parent.parent / "apps" / "web" / "public" / "images"

# Same 24x24 viewBox geometry as BrandMark.tsx / paw-icon.svg. The glyph
# bounds are x 2.5..22.5 / y 2.5..21, i.e. 0.5 right and 0.25 high of center,
# so shift it to optical center before drawing.
SHIFT_X = -0.5
SHIFT_Y = 0.25

PAW_COLOR = (245, 158, 11, 255)
BADGE_COLOR = (18, 18, 20, 255)
OG_BG = (31, 25, 21, 255)

# Paw glyph width (20 viewBox units) as a fraction of the icon canvas.
# ~0.66 keeps a soft dark gap inside the badge; 0.83 filled it edge to edge.
PAW_CANVAS_FRACTION = 0.66

# Pad outline: 4 cubic beziers, same control points as generate-icons.ps1.
PAD_BEZIERS = [
    ((12, 10.5), (8.5, 10.5), (5.5, 12.7), (5.5, 16)),
    ((5.5, 16), (5.5, 18.8), (8, 21), (12, 21)),
    ((12, 21), (16, 21), (18.5, 18.8), (18.5, 16)),
    ((18.5, 16), (18.5, 12.7), (15.5, 10.5), (12, 10.5)),
]
TOE_CENTERS = ((5, 8), (10, 5), (15, 5), (20, 8))
TOE_R = 2.5

# Render this many times larger, then downscale for smooth antialiased edges.
SUPERSAMPLE = 4


def _cubic(p0, p1, p2, p3, n=48):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((
            u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
        ))
    return pts


def _map(pt, cx, cy, scale):
    """ viewBox point -> pixel: center + scale * (p + shift - 12)."""
    return (
        cx + scale * (pt[0] + SHIFT_X - 12),
        cy + scale * (pt[1] + SHIFT_Y - 12),
    )


def draw_paw(draw: ImageDraw.ImageDraw, cx: float, cy: float, scale: float) -> None:
    pad: list[tuple[float, float]] = []
    for bez in PAD_BEZIERS:
        pad.extend(_map(p, cx, cy, scale) for p in _cubic(*bez))
    draw.polygon(pad, fill=PAW_COLOR)
    for toe in TOE_CENTERS:
        x, y = _map(toe, cx, cy, scale)
        r = TOE_R * scale
        draw.ellipse((x - r, y - r, x + r, y + r), fill=PAW_COLOR)


def new_icon(size: int) -> Image.Image:
    big = size * SUPERSAMPLE
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    margin = round(big * 0.026)
    r = big / 2.0 - margin
    d.ellipse(
        (big / 2.0 - r, big / 2.0 - r, big / 2.0 + r, big / 2.0 + r),
        fill=BADGE_COLOR,
    )
    draw_paw(d, big / 2.0, big / 2.0, big * PAW_CANVAS_FRACTION / 20.0)
    return img.resize((size, size), Image.LANCZOS)


def new_og() -> Image.Image:
    w, h = 1200, 630
    img = Image.new("RGBA", (w, h), OG_BG)
    # Warm halo: one smooth radial gradient (alpha 30 -> 0), not stacked
    # circles, which accumulate alpha into a bright blob.
    glow_r = 300.0
    grad = Image.radial_gradient("L").resize(
        (int(glow_r * 2), int(glow_r * 2)), Image.BICUBIC
    )
    # radial_gradient is black-center -> white-edge, so invert: alpha 30 at
    # the center fading to 0 at the edge (matches the ps1 PathGradientBrush).
    alpha = grad.point(lambda v: round((255 - v) / 255 * 30))
    halo = Image.new("RGBA", grad.size, PAW_COLOR[:3] + (0,))
    halo.putalpha(alpha)
    img.alpha_composite(halo, (int(w / 2 - glow_r), int(h / 2 - glow_r)))
    # Paw at supersample for clean edges, then composited at 1x.
    ss = SUPERSAMPLE
    layer = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
    draw_paw(ImageDraw.Draw(layer), w * ss / 2.0, h * ss / 2.0, ss * 170.0 / 20.0)
    img.alpha_composite(layer.resize((w, h), Image.LANCZOS))
    return img


def save(img: Image.Image, name: str) -> None:
    img.save(OUT_DIR / name, "PNG")
    print(f"wrote {name}")


def main() -> None:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--icons-only", action="store_true")
    g.add_argument("--og-only", action="store_true")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not args.og_only:
        save(new_icon(192), "paw-192.png")
        save(new_icon(512), "paw-512.png")
    if not args.icons_only:
        og = new_og()
        save(og, "og.png")
        save(og, "og-vi.png")
        save(og, "og-zh.png")
    print("done")


if __name__ == "__main__":
    main()
