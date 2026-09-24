"""Recolour the painted skin in a character atlas, in Blender, without rebuilding the mesh.

    blender -b --factory-startup --python-exit-code 1 \\
      --python asset-src/characters/concept-cast/retint_skin.py -- \\
      --src atlas.jpg --dst atlas-new.jpg --from "#f7d9c1" --to "#cf8c5b"

Texels whose hue, saturation and brightness look like the painted skin (`--from`) take the
new tone (`--to`), keeping their own light and shade: each texel keeps its brightness
relative to the old skin tone. Pale socks, navy cloth, red ribbons and dark shoes fall
outside the skin range and are left alone. Pair it with vrm-cast/retint.mjs, which pulls
the atlas out of a VRM and puts the new one back.
"""

import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "lib"))
import maple_assets as ma  # noqa: E402

ARGS = ma.parse_args({}, {"--src": {}, "--dst": {}, "--from": {"default": "#f7d9c1"}, "--to": {}})


def hex_rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def hsv(rgb):
    top = rgb.max(axis=-1)
    low = rgb.min(axis=-1)
    delta = np.maximum(top - low, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(top == r, ((g - b) / delta) % 6, np.where(top == g, (b - r) / delta + 2, (r - g) / delta + 4)) * 60
    return hue, (top - low) / np.maximum(top, 1e-6), top


def main():
    image = bpy.data.images.load(os.path.abspath(ARGS.src), check_existing=False)
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    rgb = px[..., :3]
    old, new = hex_rgb(getattr(ARGS, "from")), hex_rgb(ARGS.to)
    hue, sat, val = hsv(rgb)
    _h0, s0, v0 = hsv(old)
    # Soft membership: hue near the skin's, saturation and brightness in its band.
    in_hue = np.clip(1 - np.abs(hue - 24) / 18, 0, 1)
    in_sat = np.clip((sat - 0.08) / 0.06, 0, 1) * np.clip((0.62 - sat) / 0.08, 0, 1)
    in_val = np.clip((val - 0.45) / 0.1, 0, 1)
    weight = (in_hue * in_sat * in_val)[..., None]
    shade = (val / max(float(v0), 1e-6))[..., None]
    toned = np.clip(new[None, None, :] * shade, 0, 1)
    px[..., :3] = rgb * (1 - weight) + toned * weight
    print("[retint] skin texels", int((weight[..., 0] > 0.5).sum()), "of", w * h, "old sat", round(float(s0), 3))
    out = bpy.data.images.new("retinted", w, h, alpha=False)
    out.pixels.foreach_set(px.ravel())
    out.filepath_raw = os.path.abspath(ARGS.dst)
    out.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 88
    out.save()
    print("[retint] wrote", ARGS.dst)


main()
