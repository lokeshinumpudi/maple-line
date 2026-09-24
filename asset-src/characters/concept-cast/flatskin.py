"""Flat anime skin for the painted atlas, and seam clean-up for the painted clothes.

Anime characters are not painted skin: the skin is one even colour and the toon shader
draws the light. Projecting the painted views onto legs, hands and neck carries the
painting's pencil lines, paper grain and view seams into the texture, which reads as
grainy blotches in a close-up. So after the projection:

1. Each view gets a skin mask: pixels whose hue, saturation and brightness sit in the
   painted skin's band (`flatSkin.band` in the settings). The masks are projected onto
   the texels like the colours are, which gives each texel a skin weight.
2. Skin can only be where a body has bare skin: the hands (beyond the sleeve), under the
   hem (legs and feet), and the neck above the collar. That region test stops a hand
   painted over a cardigan in the front view from turning the cardigan into skin.
3. Skin texels become the flat skin colour. Cloth texels are painted again from pixels
   that are not skin, so a hand held against the cloth leaves no smear on it.
4. Cloth texels along UV island borders, where neighbouring views meet, are blurred a
   little so no stitch line shows.

Pure numpy; the projection and blur helpers come from bake.py (Blender), imported where
they are used so the colour tests run in plain Python too.
"""

import numpy as np

import matte as mt


def hsv(rgb):
    top = rgb.max(axis=-1)
    low = rgb.min(axis=-1)
    delta = np.maximum(top - low, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(top == r, ((g - b) / delta) % 6, np.where(top == g, (b - r) / delta + 2, (r - g) / delta + 4)) * 60
    return hue, (top - low) / np.maximum(top, 1e-6), top


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def skin_pixels(img, mask, band):
    """Pixels in the painted skin's hue, saturation and value band, cleaned of specks."""
    hue, sat, val = hsv(img)
    h0, h1 = band["hue"]
    s0, s1 = band["sat"]
    v0, v1 = band["val"]
    skin = mask & (hue >= h0) & (hue <= h1) & (sat >= s0) & (sat <= s1) & (val >= v0) & (val <= v1)
    # Pencil lines inside a hand or a shin are not a reason to stop being skin.
    return mt.opening(mt.closing(skin, 2), 1)


def bare_regions(pos, m, z_collar):
    """Soft 0..1 weight of where bare skin can be: hands, below the hem, the neck."""
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    arm = m["arm"]
    pts, rad = arm["points"], arm["radius"]
    i0 = max(0, int(arm["wrist_i"]) - 1)
    hand = np.zeros(x.shape, dtype=np.float32)
    for sx in (1.0, -1.0):
        for p, r in zip(pts[i0:], rad[i0:]):
            d = np.sqrt((x - sx * p[0]) ** 2 + ((y - p[1]) / 1.6) ** 2 + (z - p[2]) ** 2)
            hand = np.maximum(hand, 1 - smoothstep(r * 1.4, r * 1.4 + 0.012, d))
    legs = 1 - smoothstep(m["z_hem"] - 0.012, m["z_hem"] + 0.004, z)
    neck = smoothstep(z_collar - 0.004, z_collar + 0.006, z)
    return np.maximum(np.maximum(hand, legs), neck), neck


def island_border(covered, width=2):
    """Texels of `covered` within `width` texels of an uncovered one."""
    return covered & ~mt.erode(covered, width)


def apply(views, pos, nrm, vis, covered, ids, body_rgb, body_ok, hair, m, z_collar, cfg, log=print):
    """Returns (rgb, ok, skin weight) for the body texels (ids != hair) after the pass."""
    import bake
    band = cfg["band"]
    flat = np.array(cfg["colour"], dtype=np.float32)
    shade = np.array(cfg["shade"], dtype=np.float32)
    body = covered & (ids >= 0)
    masks = {v: skin_pixels(views.img[v], views.mask[v], band) for v in ("front", "side", "back")}
    images = {v: np.repeat(masks[v].astype(np.float32)[..., None], 3, axis=2) for v in masks}
    weight, _ok = bake.project(views, pos, nrm, vis, body, exclude=hair, images=images)
    bare, neck = bare_regions(pos, m, z_collar)
    s = smoothstep(0.4, 0.6, weight[..., 0]) * bare
    if cfg.get("clothBelow") is not None:
        # Knee socks: below their top the leg is cloth, even where no view shows it (the
        # inner sides of the shins took the other leg's skin otherwise).
        s = s * smoothstep(cfg["clothBelow"] - 0.004, cfg["clothBelow"] + 0.004, pos[..., 2])
    s = np.maximum(s, neck)  # the neck above the collar is always skin
    s = np.where(body, s, 0.0).astype(np.float32)
    log("flat skin texels", int((s > 0.5).sum()))
    # Cloth, painted again from pixels that are not skin: no hand smears on a cardigan.
    no_skin = {v: hair[v] | mt.dilate(masks[v], 3) for v in hair}
    cloth_rgb, cloth_ok = bake.project(views, pos, nrm, vis, body & (s < 0.5), exclude=no_skin)
    rgb = body_rgb.copy()
    ok = body_ok.copy()
    cloth = body & (s < 0.5)
    rgb[cloth & cloth_ok] = cloth_rgb[cloth & cloth_ok]
    ok[cloth & ~cloth_ok] = False
    # The skin colour, with at most a whisper of shade under the chin.
    t = np.clip((pos[..., 2] - z_collar) / 0.03, 0, 1)[..., None] * cfg.get("neckShade", 0.3)
    skin_rgb = flat * (1 - t) + shade * t
    rgb = rgb * (1 - s[..., None]) + skin_rgb * s[..., None]
    ok |= s > 0.5
    return rgb, ok, s


def clean_seams(rgb, cloth, width=2, radius=2):
    """Blur cloth texels along UV island borders (and only there) with cloth neighbours."""
    import bake
    band = island_border(cloth, width)
    soft = bake.masked_blur(rgb, cloth, radius)
    out = rgb.copy()
    out[band] = soft[band]
    return out
