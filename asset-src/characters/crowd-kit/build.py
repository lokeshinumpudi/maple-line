"""Maple Line crowd kit: base bodies with interchangeable hair, outfits and accessories.

Each base body (adult woman, adult man, elder woman, elder man, teen, child) is one VRM 1.0
file with two skinned meshes on the same VRM humanoid skeleton the UAL clips use:

- `Kit_LOD0`: the near tier. Full face decals with the expression shape keys (blink, smile,
  visemes, look), every hairstyle, outfit extra and accessory.
- `Kit_LOD1`: the mid tier. Lower segment counts, no finger weights, one `blink` key.

Every part is in the mesh; the game shows a person's parts by a mask, so one draw call
draws any look. Colour is not in the file: each face carries palette-slot numbers, one
per outfit, and a part id, written as integer texture coordinates:

    TEXCOORD_0 = (slot under outfit 0, slot under outfit 1)
    TEXCOORD_1 = (slot under outfit 2, slot under outfit 3)
    TEXCOORD_2 = (part id, 0)

glTF export stores v as 1 - v; the game undoes that. Slot names, part order, the bodies
and their hair and outfit lists come from apps/game/src/characters/crowd/kit-spec.json,
which the game reads too. Geometry helpers (skeleton, skin-modifier body, anime head,
face decals, hair strands, weights) are imported from ../vrm-cast/build.py.

    blender -b --factory-startup --python-exit-code 1 \\
      --python asset-src/characters/crowd-kit/build.py -- --body all [--render <folder>]
    node asset-src/characters/crowd-kit/make-kit.mjs

Coordinates are Blender's: Z up, the character faces -Y and its left is +X.
"""

import importlib.util
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "..", "lib"))
import maple_assets as ma  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "vrm_cast_build", os.path.join(HERE, "..", "vrm-cast", "build.py")
)
vb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vb)

KIT = json.load(open(os.path.join(ROOT, "apps/game/src/characters/crowd/kit-spec.json"), encoding="utf-8"))
SLOT = {name: i for i, name in enumerate(KIT["slots"])}
BUILD = os.path.join(HERE, "build")
UV_NAMES = ("KitA", "KitB", "KitC")
FINGERS = ("Thumb", "Index", "Middle", "Ring", "Little")

ARGS = None
BODY = None  # the kit-spec entry being built
NAME = None


def S():
    return vb.S


def K():
    """Head-relative scale: hair and hats follow the head, which is larger on a child."""
    return vb.S * vb.P["head"]


def smoothstep(a, b, x):
    return vb.smoothstep(a, b, x)


def lerp(a, b, t):
    return a + (b - a) * t


DUMMY_COLORS = {
    key: "#808080"
    for key in ("skin", "hair", "hairTie", "top", "shirt", "ribbon", "lower", "socks", "shoes",
                "mouth", "blush", "brow", "glasses", "paper", "print")
}


def use_body(name):
    global BODY, NAME
    NAME = name
    BODY = KIT["bodies"][name]
    pr = BODY["profile"]
    vb.P = {
        "person": name,
        "title": f"Crowd kit / {name}",
        "height": pr["height"],
        "shoulders": pr["shoulders"],
        "hips": pr["hips"],
        "chest": pr["chest"],
        "limbs": pr["limbs"],
        "head": pr["head"],
        "hair": "short",
        # Not "school": the body graph keeps the fuller waist and trouser legs.
        "outfit": "kit",
        "brows": pr["brows"],
        "blush": pr["blush"],
        "eyes": {"height": pr["eyes"], "iris": "#000000", "irisLight": "#000000", "lash": "#000000"},
        "colors": dict(DUMMY_COLORS),
        "posture": {"stoop": pr["stoop"]} if pr.get("stoop") else {},
    }
    vb.S = pr["height"] / 1.58
    vb.MATERIALS.clear()


def part_ids():
    ids = {}
    n = 1
    for hair in BODY["hair"]:
        ids[f"hair:{hair}"] = n
        n += 1
    for outfit in BODY["outfits"]:
        ids[f"outfit:{outfit}"] = n
        n += 1
    for acc in KIT["accessories"]:
        ids[f"acc:{acc}"] = n
        n += 1
    assert n <= 24, "part masks are 24-bit"
    return ids


# ---------------------------------------------------------------------------------------
# Tags: palette slots per outfit and the part id, as integer UVs.


def tag(obj, fn):
    """fn(poly) -> ((slot0, slot1, slot2, slot3), part)."""
    mesh = obj.data
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    layers = [mesh.uv_layers.new(name=name) for name in UV_NAMES]
    for poly in mesh.polygons:
        slots, part = fn(poly)
        values = ((slots[0], slots[1]), (slots[2], slots[3]), (part, 0))
        for li in poly.loop_indices:
            for layer, value in zip(layers, values):
                layer.data[li].uv = value


def tag_uniform(obj, slot, part):
    s = SLOT[slot]
    tag(obj, lambda _p: ((s, s, s, s), part))


def outfit_slots(fn):
    """One slot per outfit column (padded to four by repeating the last outfit)."""
    outfits = list(BODY["outfits"])
    while len(outfits) < 4:
        outfits.append(outfits[-1])
    return lambda *args: tuple(SLOT[fn(outfit, *args)] for outfit in outfits)


def new_object(name, bm, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    return obj


# ---------------------------------------------------------------------------------------
# Body and head.


def build_body(j, lod):
    V, E, R = vb.body_graph(j)
    mesh = bpy.data.meshes.new("Body")
    mesh.from_pydata([tuple(v) for v in V], E, [])
    obj = bpy.data.objects.new("Body", mesh)
    bpy.context.scene.collection.objects.link(obj)
    vb.activate(obj)
    skin = obj.modifiers.new("skin", "SKIN")
    skin.use_smooth_shade = True
    skin.branch_smoothing = 0.5
    for i, r in enumerate(R):
        mesh.skin_vertices[0].data[i].radius = r
    mesh.skin_vertices[0].data[0].use_root = True
    bpy.ops.object.modifier_apply(modifier="skin")
    if lod == 0:
        sub = obj.modifiers.new("sub", "SUBSURF")
        sub.levels = 1
        sub.render_levels = 1
        bpy.ops.object.modifier_apply(modifier="sub")
    else:
        # The raw skin hull is blocky; a smooth-shaded low hull reads as round at 15 m.
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def build_head(lod):
    """vb.build_head_bm with a segment count per detail level."""
    C, Rr = vb.head_center(), vb.head_radii()
    bm = bmesh.new()
    u, v = (40, 28) if lod == 0 else (18, 12)
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    for vert in bm.verts:
        x, y, z = vert.co
        jaw = smoothstep(-0.12, -1.0, z)
        cheek = smoothstep(0.2, -0.35, z) * (1 - jaw)
        x *= (1 - 0.34 * jaw) * (1 + 0.03 * cheek)
        if y < 0:
            y *= 1 - 0.1 * (1 - abs(z)) - 0.04 * jaw
        else:
            y *= 1 + 0.04 * (1 - abs(z)) - 0.32 * jaw
        z *= 1 - 0.04 * jaw
        vert.co = C + Vector((x * Rr.x, y * Rr.y, z * Rr.z))
    if lod == 0:
        for sx in (1, -1):
            ear = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1.0)
            for vert in ear["verts"]:
                x, y, z = vert.co
                vert.co = C + Vector((sx * (Rr.x * 0.9 + x * 0.012 * S()), 0.012 * S() + y * 0.016 * S(), -0.018 * S() + z * 0.026 * S()))
    return new_object("head", bm)


# Where each outfit's top ends on the torso and what the legs show (base units: 1.58 m).
WAIST = {
    "suit": 0.8, "office-f": 0.97, "sailor": 0.99, "gakuran": 0.8, "cardigan-school": 0.9,
    "casual": 0.9, "work": 0.88, "farmer": 0.88, "staff": 0.82, "coat": 0.3, "apron": 0.9,
    "casual-f": 0.97, "cardigan": 0.84, "cardigan-skirt": 0.86, "kid-casual": 0.86,
    "kid-school": 0.8, "kid-coat": 0.3,
}
OPEN_FRONT = {"suit", "office-f", "sailor", "staff", "cardigan", "cardigan-skirt", "cardigan-school", "coat", "kid-coat", "kid-school"}
HIGH_COLLAR = {"gakuran", "coat", "kid-coat"}
COLLARED = {"suit", "office-f", "staff", "cardigan", "cardigan-skirt", "kid-school"}
CUFFS = {"suit", "staff", "office-f", "cardigan", "cardigan-school"}
SHORT_SLEEVES = {"casual", "kid-casual"}
BOOTS = {"work", "farmer"}


def legs(outfit, z):
    if outfit in BOOTS and z < 0.27:
        return "shoes"
    if outfit in ("coat", "kid-coat") and z > 0.52:
        return "top"
    if outfit == "office-f":
        return "legwear" if z < 0.55 else "lower"
    if outfit in ("sailor", "cardigan-school"):
        return "legwear" if z < 0.43 else "skin" if z < 0.64 else "lower"
    if outfit == "casual-f":
        return "legwear" if z < 0.42 else "lower"
    if outfit == "cardigan-skirt":
        return "legwear" if z < 0.3 else "lower"
    if outfit in ("kid-casual", "kid-school"):
        return "legwear" if z < 0.22 else "skin" if z < 0.64 else "lower"
    return "lower"


def region(outfit, co, bone, t):
    z = co.z / S()
    if bone == "head":
        return "skin"
    if bone == "neck":
        if z < 1.3 and outfit in HIGH_COLLAR:
            return "top"
        if z < 1.29 and outfit in COLLARED:
            return "inner"
        return "skin"
    if bone.endswith("Hand") or any(f in bone for f in FINGERS):
        # Station staff wear white gloves.
        return "inner" if outfit == "staff" else "skin"
    if bone.endswith(("Foot", "Toes")) or z < 0.1:
        return "shoes"
    if bone.endswith(("Shoulder", "UpperArm", "LowerArm")):
        if outfit in SHORT_SLEEVES and (bone.endswith("LowerArm") or (bone.endswith("UpperArm") and t > 0.55)):
            return "skin"
        if bone.endswith("LowerArm") and t > 0.9 and outfit in CUFFS:
            return "inner"
        return "top"
    if bone.endswith(("UpperLeg", "LowerLeg")):
        return legs(outfit, z)
    if co.y < 0 and z > 1.1 and outfit in OPEN_FRONT:
        opening = (z - 1.1) / 0.17 * 0.05 * S() * vb.P["shoulders"]
        if abs(co.x) < opening:
            return "inner"
    return "top" if z > WAIST[outfit] else "lower"


# ---------------------------------------------------------------------------------------
# Outfit extras.


def build_skirt(top, hem, lod, flare=1.0, name="skirt"):
    bm = bmesh.new()
    pleats, rows = (32, 7) if lod == 0 else (12, 3)
    rings = []
    for r in range(rows + 1):
        t = r / rows
        z = lerp(top, hem, t) * S()
        rx = lerp(0.1, 0.1 + 0.1 * flare * (top - hem) / 0.39, t ** 0.9) * S() * vb.P["hips"]
        ry = lerp(0.08, 0.08 + 0.085 * flare * (top - hem) / 0.39, t ** 0.9) * S()
        ring = []
        for i in range(pleats * 2):
            a = 2 * math.pi * i / (pleats * 2)
            fold = (1 if i % 2 == 0 else -1) * lerp(0.012, 0.05, t) * (1 if lod == 0 else 0)
            ring.append(bm.verts.new((math.sin(a) * rx * (1 + fold), -math.cos(a) * ry * (1 + fold), z)))
        rings.append(ring)
    vb.ring_loft(bm, rings)
    obj = new_object(name, bm)
    obj["weights"] = "skirt"
    return obj


def build_apron(body_bvh, lod):
    """A front panel from the chest to the knees, following the body front."""
    bm = bmesh.new()
    cols, rows = (6, 10) if lod == 0 else (3, 4)
    grid = []
    for r in range(rows + 1):
        t = r / rows
        z = lerp(1.2, 0.5, t) * S()
        half = lerp(0.075, 0.16, smoothstep(0.0, 0.35, t)) * S() * vb.P["hips"]
        row = []
        for c in range(cols + 1):
            x = lerp(-half, half, c / cols)
            hit, _n = vb.surface_y(body_bvh, x, max(z, 0.62 * S()))
            y = (hit.y if hit else -0.1 * S()) - 0.008 * S()
            if z < 0.62 * S():
                y -= (0.62 * S() - z) * 0.25
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for a, b in zip(grid, grid[1:]):
        for c in range(cols):
            bm.faces.new((a[c], a[c + 1], b[c + 1], b[c]))
    obj = new_object("apron", bm)
    obj["weights"] = "skirt"
    return obj


def build_collar(body_bvh, style):
    """vb.build_collar_and_tie: 'school' gives the bow, 'suit' the tie, 'plain' the band only."""
    vb.P["outfit"] = "school" if style == "bow" else "suit" if style == "tie" else "plain"
    vb.body_materials()
    parts = vb.build_collar_and_tie(body_bvh)
    vb.P["outfit"] = "kit"
    out = []
    for obj in parts:
        obj["slot"] = "inner" if obj.name.startswith("collar") else "accent"
        obj["weights"] = "chest"
        out.append(obj)
    return out


OUTFIT_EXTRAS = {
    "office-f": lambda bvh, lod: [build_skirt(1.0, 0.55, lod, 0.8)] + build_collar(bvh, "plain")[:1],
    "apron": lambda bvh, lod: [build_apron(bvh, lod)],
    "casual-f": lambda bvh, lod: [build_skirt(1.0, 0.42, lod, 0.7)],
    "coat": lambda bvh, lod: [build_skirt(0.95, 0.5, lod, 0.55, "coat-hem")],
    "kid-coat": lambda bvh, lod: [build_skirt(0.95, 0.52, lod, 0.55, "coat-hem")],
    "suit": lambda bvh, lod: build_collar(bvh, "tie"),
    "staff": lambda bvh, lod: build_collar(bvh, "tie"),
    "cardigan-skirt": lambda bvh, lod: [build_skirt(0.99, 0.3, lod, 0.6)] + build_collar(bvh, "plain")[:1],
    "cardigan": lambda bvh, lod: build_collar(bvh, "plain")[:1],
    "sailor": lambda bvh, lod: [build_skirt(1.0, 0.61, lod)] + build_collar(bvh, "bow"),
    "cardigan-school": lambda bvh, lod: [build_skirt(1.0, 0.6, lod, 0.9)] + build_collar(bvh, "bow"),
    "kid-school": lambda bvh, lod: build_collar(bvh, "plain")[:1],
}
EXTRA_SLOT = {"skirt": "lower", "apron": "apron", "coat-hem": "top"}


# ---------------------------------------------------------------------------------------
# Hair: a scalp shell plus strands (vb.strand_path / vb.strand_mesh), per style.


def shell(style, head_bvh, lod):
    C, R = vb.head_center(), vb.head_radii()
    bm = bmesh.new()
    u, v = (40, 24) if lod == 0 else (18, 11)
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    lift, back, front = style["lift"], style["back"], style.get("front", "full")
    kill = []
    for vert in bm.verts:
        d = vert.co.normalized()
        theta = math.degrees(math.acos(max(-1, min(1, d.z))))
        phi = math.degrees(math.atan2(d.x, -d.y))
        if front == "thin":
            front_line = 40 + 30 * (abs(phi) / 180)
        elif front == "crop":
            front_line = 46 + 40 * smoothstep(20, 95, abs(phi))
        else:
            front_line = 40 + 44 * smoothstep(20, 95, abs(phi))
        if abs(phi) < 100:
            limit = front_line if abs(phi) < 80 else lerp(front_line, back, (abs(phi) - 80) / 20)
        else:
            limit = back
        if theta > limit:
            kill.append(vert)
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    for vert in bm.verts:
        d = vert.co.normalized()
        vert.co = vb.scalp(head_bvh, d, lift * K() * (0.7 + 0.5 * max(0, d.z)))
    return bm


def bangs(phis, t0, t1s, w, lift=0.016, th=0.006, sweep=0.0, taper=2.2, hang=0.0):
    out = []
    for i, phi in enumerate(phis):
        t1 = t1s[i % len(t1s)] if isinstance(t1s, (list, tuple)) else t1s
        out.append(dict(phi=phi, t0=t0, t1=t1, hang=hang, lift=lift, w=w, th=th, sweep=sweep, taper=taper))
    return out


def ring_strands(phis, t0, t1, hang, w=0.044, lift=0.012, th=0.007, curl=0.0):
    return [dict(phi=p, t0=t0, t1=t1, hang=hang, lift=lift, w=w, th=th, curl=curl) for p in phis]


HAIR = {
    "short": {
        "lift": 0.01, "back": 116,
        "strands": bangs((-34, -14, 6, 26, 44), 28, (66, 70, 68, 62, 70), 0.031, lift=0.012, th=0.007, sweep=-18, taper=1.6)
        + ring_strands((-80, 80), 30, 96, 0.0, w=0.036, lift=0.01, th=0.006)
        + ring_strands(range(100, 261, 26), 24, 114, 0.006, w=0.045, lift=0.011),
    },
    "side-part": {
        "lift": 0.012, "back": 114,
        "strands": bangs((-52, -36, -20, -4, 12, 28, 42), 22, (60, 64, 66, 64, 60, 58, 64), 0.034, lift=0.018, th=0.007, sweep=34, taper=1.8)
        + ring_strands((-82, 82), 30, 94, 0.0, w=0.036, lift=0.011, th=0.006)
        + ring_strands(range(100, 261, 26), 24, 114, 0.006, w=0.045, lift=0.012),
    },
    "buzz": {"lift": 0.004, "back": 118, "front": "crop", "strands": []},
    "bob": {
        "lift": 0.012, "back": 120,
        "strands": bangs(range(-40, 41, 10), 28, (78, 82, 80, 84, 80, 83, 79, 82, 78), 0.03)
        + ring_strands((-100, -80, -60, 60, 80, 100), 30, 100, 0.07, w=0.04, curl=0.45)
        + ring_strands(range(110, 251, 20), 28, 116, 0.06, w=0.046, curl=0.35),
    },
    "ponytail": {
        "lift": 0.012, "back": 124,
        "strands": bangs(range(-44, 45, 11), 30, (78, 84, 80, 86, 82, 87, 80, 84, 77), 0.03, lift=0.017)
        + [dict(phi=sx * 62, t0=30, t1=94, hang=0.085, lift=0.012, w=0.018, th=0.005, curl=0.3) for sx in (1, -1)]
        + ring_strands((-82, 82), 34, 104, 0.03, w=0.04, th=0.007)
        + ring_strands(range(100, 261, 20), 28, 118, 0.018, w=0.042),
        "tails": [dict(phi=180, theta=102, length=0.2, lift=0.016, spread=0.012)],
    },
    "low-ponytail": {
        "lift": 0.011, "back": 122,
        "strands": bangs((-40, -20, 0, 20, 40), 20, (58, 62, 60, 62, 58), 0.036, lift=0.016, sweep=0)
        + ring_strands((-76, 76), 30, 100, 0.0, w=0.04)
        + ring_strands(range(100, 261, 20), 28, 120, 0.012, w=0.044),
        "tails": [dict(phi=180, theta=128, length=0.15, lift=0.012, spread=0.01)],
    },
    "long": {
        "lift": 0.013, "back": 124,
        "strands": bangs(range(-44, 45, 11), 30, (78, 84, 80, 86, 82, 87, 80, 84, 77), 0.03, lift=0.017)
        + [dict(phi=sx * 62, t0=30, t1=96, hang=0.2, lift=0.012, w=0.022, th=0.005, curl=0.1) for sx in (1, -1)]
        + ring_strands((-84, 84), 32, 104, 0.2, w=0.046, th=0.008, curl=0.05)
        + ring_strands(range(100, 261, 16), 28, 118, 0.28, w=0.05, th=0.008, curl=0.05),
    },
    "bun": {
        "lift": 0.01, "back": 118,
        "strands": bangs((-50, -25, 0, 25, 50), 20, (56, 60, 58, 60, 56), 0.038, lift=0.014)
        + ring_strands((-80, 80), 30, 96, 0.0, w=0.036)
        + ring_strands(range(100, 261, 26), 24, 112, 0.004, w=0.045),
        "bun": dict(phi=180, theta=46, radius=0.048),
    },
    "elder-thin": {
        "lift": 0.004, "back": 112, "front": "thin",
        "strands": ring_strands((-70, 70, -95, 95), 58, 104, 0.0, w=0.03, lift=0.006, th=0.005)
        + ring_strands(range(120, 241, 30), 50, 112, 0.004, w=0.045, lift=0.006, th=0.005),
    },
    "twin-tails": {
        "lift": 0.012, "back": 120,
        "strands": bangs(range(-40, 41, 10), 28, (76, 80, 78, 82, 78, 81, 77, 80, 76), 0.03)
        + ring_strands((-80, 80), 30, 100, 0.0, w=0.04)
        + ring_strands(range(100, 261, 20), 28, 115, 0.01, w=0.044),
        "tails": [dict(phi=125, theta=72, length=0.17, lift=0.016, spread=0.01, out=0.4),
                  dict(phi=-125, theta=72, length=0.17, lift=0.016, spread=0.01, out=0.4)],
    },
}


def hair_weights(co):
    """Roots follow the head; long hair below the neck follows the chest a little."""
    neck_top = vb.head_center().z - vb.head_radii().z * 0.9
    w = 0.7 * smoothstep(neck_top, neck_top - 0.14 * S(), co.z)
    return {"head": 1 - w, "upperChest": w} if w > 0.01 else {"head": 1.0}


def build_hair(style_name, head_bvh, lod):
    style = HAIR[style_name]
    k = K()
    bm = shell(style, head_bvh, lod)
    sides = 6 if lod == 0 else 4
    for index, sd in enumerate(style["strands"]):
        # Mid distance: every other strand, drawn wider, reads the same silhouette.
        if lod == 1 and (index % 2 or (sd["hang"] == 0 and sd["w"] < 0.025)):
            continue
        pts = vb.strand_path(head_bvh, sd["phi"], sd["t0"], sd["t1"], sd["hang"] * k, sd["lift"] * k,
                             n_surface=7 if lod == 0 else 4, n_hang=6 if lod == 0 else 3,
                             sweep=sd.get("sweep", 0), curl=sd.get("curl", 0))
        vb.strand_mesh(bm, pts, sd["w"] * k * (1.0 if lod == 0 else 1.9), sd["th"] * k, sides=sides, taper=sd.get("taper", 1.6))
    for tail in style.get("tails", []):
        d = vb.direction(tail["phi"], tail["theta"])
        tie = vb.scalp(head_bvh, d, tail["lift"] * k)
        out = Vector((d.x, d.y, 0))
        out = out.normalized() if out.length > 1e-6 else Vector((0, 1, 0))
        spread = tail.get("out", 0.0)
        steps = 7 if lod == 0 else 3
        pts = [tie + out * 0.01 * k]
        for i in range(1, steps + 1):
            t = i / steps
            pts.append(tie + out * ((0.03 + 0.03 * t + spread * 0.12 * t) * k) + Vector((0, 0, -tail["length"] * t * k)))
        widths = ((0.0, 0.034), (0.012, 0.022), (-0.012, 0.022)) if lod == 0 else ((0.0, 0.04),)
        side = Vector((-out.y, out.x, 0))
        for dx, w in widths:
            strand = [p + side * (dx * k * (0.3 + i / steps)) for i, p in enumerate(pts)]
            vb.strand_mesh(bm, strand, w * k, 0.014 * k, sides=8 if lod == 0 else 4, taper=2.2, root_scale=0.55)
        knot = bmesh.ops.create_uvsphere(bm, u_segments=10 if lod == 0 else 6, v_segments=6 if lod == 0 else 4, radius=1.0)
        for vert in knot["verts"]:
            x, y, z = vert.co
            vert.co = tie + Vector((x * 0.017 * k, y * 0.014 * k, z * 0.014 * k))
    if "bun" in style:
        b = style["bun"]
        at = vb.scalp(head_bvh, vb.direction(b["phi"], b["theta"]), b["radius"] * k * 0.55)
        ball = bmesh.ops.create_uvsphere(bm, u_segments=14 if lod == 0 else 8, v_segments=10 if lod == 0 else 6, radius=1.0)
        for vert in ball["verts"]:
            x, y, z = vert.co
            vert.co = at + Vector((x * b["radius"] * k, y * b["radius"] * k * 0.9, z * b["radius"] * k * 0.85))
    obj = new_object(f"hair-{style_name}", bm)
    obj["weights"] = "hair"
    return obj


# ---------------------------------------------------------------------------------------
# Accessories.


def lathe(bm, profile, segments, centre, axis_z=True, transform=None):
    """Revolve [(radius, height)] around Z at `centre`; returns the rings."""
    rings = []
    for r, h in profile:
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            p = Vector((math.cos(a) * r, math.sin(a) * r, h))
            if transform:
                p = transform(p)
            ring.append(bm.verts.new(centre + p))
        rings.append(ring)
    vb.ring_loft(bm, rings)
    return rings


def build_cap(lod):
    C, R = vb.head_center(), vb.head_radii()
    k = K()
    bm = bmesh.new()
    seg = 20 if lod == 0 else 10
    top = C + Vector((0, 0.004 * k, 0.018 * k))
    # Wide enough to sit over the hair shell and strand lift of any style.
    crown = [(R.x * 1.2, -0.01 * k), (R.x * 1.19, 0.035 * k), (R.x * 1.06, 0.085 * k), (R.x * 0.74, 0.122 * k), (R.x * 0.24, 0.136 * k), (0.001, 0.137 * k)]
    lathe(bm, crown, seg, top, transform=lambda p: Vector((p.x, p.y * R.y / R.x, p.z)))
    # The bill: a flat half-disc in front, tipped down a little.
    n = 10 if lod == 0 else 5
    front = []
    back = []
    for i in range(n + 1):
        a = math.pi * (0.1 + 0.8 * i / n)
        edge = Vector((math.cos(a) * R.x * 1.18, -math.sin(a) * R.y * 1.22 - 0.002 * k, 0))
        tip = Vector((math.cos(a) * R.x * 1.1, -math.sin(a) * R.y * 1.22 - 0.075 * k * math.sin(a), -0.016 * k * math.sin(a)))
        back.append(bm.verts.new(top + edge + Vector((0, 0, -0.008 * k))))
        front.append(bm.verts.new(top + tip + Vector((0, 0, -0.008 * k))))
    for i in range(n):
        bm.faces.new((back[i], back[i + 1], front[i + 1], front[i]))
    obj = new_object("cap", bm)
    obj["slot"] = "hat"
    obj["weights"] = "head"
    return obj


def build_straw_hat(lod):
    C, R = vb.head_center(), vb.head_radii()
    k = K()
    bm = bmesh.new()
    seg = 24 if lod == 0 else 10
    top = C + Vector((0, 0.004 * k, 0.03 * k))
    profile = [(0.2 * k, -0.035 * k), (0.16 * k, -0.012 * k), (R.x * 1.24, 0.0), (R.x * 1.17, 0.075 * k), (R.x * 1.0, 0.11 * k), (0.001, 0.116 * k)]
    lathe(bm, profile, seg, top)
    obj = new_object("straw-hat", bm)
    obj["slot"] = "hat"
    obj["weights"] = "head"
    band = bmesh.new()
    lathe(band, [(R.x * 1.245, 0.004 * k), (R.x * 1.232, 0.024 * k)], seg, top)
    band_obj = new_object("straw-hat-band", band)
    band_obj["slot"] = "hatBand"
    band_obj["weights"] = "head"
    return [obj, band_obj]


def build_glasses(head_bvh):
    obj = vb.build_glasses(head_bvh)
    obj["slot"] = "frame"
    obj["weights"] = "head"
    return obj


def tube(bm, pts, radius, sides):
    rings = []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        t = (b - a).normalized()
        n = t.cross(Vector((0, 0, 1)))
        if n.length < 1e-4:
            n = t.cross(Vector((1, 0, 0)))
        n.normalize()
        m = t.cross(n).normalized()
        ring = [bm.verts.new(p + (n * math.cos(2 * math.pi * s / sides) + m * math.sin(2 * math.pi * s / sides)) * radius) for s in range(sides)]
        rings.append(ring)
    vb.ring_loft(bm, rings)


def rounded_box(bm, centre, size, bevel=0.3, seg=6):
    """A soft box: a UV sphere pushed toward a box (superellipse)."""
    ball = bmesh.ops.create_uvsphere(bm, u_segments=seg * 2, v_segments=seg, radius=1.0)
    for vert in ball["verts"]:
        x, y, z = vert.co
        f = lambda c: math.copysign(abs(c) ** bevel, c)  # noqa: E731
        vert.co = centre + Vector((f(x) * size.x / 2, f(y) * size.y / 2, f(z) * size.z / 2))


def build_shoulder_bag(body_bvh, lod):
    s = S()
    bm = bmesh.new()
    hx = 0.17 * s * vb.P["hips"]
    rounded_box(bm, Vector((hx + 0.03 * s, 0.0, 0.84 * s)), Vector((0.07 * s, 0.22 * s, 0.17 * s)), seg=6 if lod == 0 else 3)
    bag = new_object("shoulder-bag", bm)
    bag["slot"] = "bag"
    bag["weights"] = "hips"
    strap = bmesh.new()
    # Over the right shoulder, across the chest to the bag on the left hip.
    path = []
    for i in range(9 if lod == 0 else 5):
        t = i / (8 if lod == 0 else 4)
        x = lerp(-0.1 * s * vb.P["shoulders"], hx + 0.02 * s, t)
        z = lerp(1.25 * s, 0.9 * s, t)
        hit, _ = vb.surface_y(body_bvh, x, z)
        y = (hit.y if hit else -0.09 * s) - 0.006 * s
        path.append(Vector((x, y, z)))
    back = []
    for i in range(5 if lod == 0 else 3):
        t = i / (4 if lod == 0 else 2)
        x = lerp(hx + 0.02 * s, -0.1 * s * vb.P["shoulders"], t)
        z = lerp(0.9 * s, 1.25 * s, t)
        hit, _ = vb.surface_y(body_bvh, x, z, front=False)
        y = (hit.y if hit else 0.09 * s) + 0.006 * s
        back.append(Vector((x, y, z)))
    top = Vector((-0.1 * s * vb.P["shoulders"], 0, 1.3 * s))
    tube(strap, back + [top] + path, 0.006 * s, 4 if lod == 0 else 3)
    strap_obj = new_object("shoulder-bag-strap", strap)
    strap_obj["slot"] = "bag"
    strap_obj["weights"] = "chest"
    return [bag, strap_obj]


def build_umbrella(lod):
    """Resting on the right shoulder, canopy tipped back: rigid to the chest, so any clip works."""
    s = S()
    grip = Vector((-0.1 * s, -0.13 * s, 1.02 * s))
    apex = Vector((-0.2 * s, 0.2 * s, 1.92 * s))
    axis = (apex - grip).normalized()
    bm = bmesh.new()
    tube(bm, [grip + axis * (0.95 * s) * t for t in (0.0, 0.5, 1.0)], 0.007 * s, 5 if lod == 0 else 3)
    shaft = new_object("umbrella-shaft", bm)
    shaft["slot"] = "metal"
    shaft["weights"] = "chest"
    canopy = bmesh.new()
    ribs = 8
    radius = 0.47 * s
    tip = grip + axis * 0.98 * s
    n = axis.cross(Vector((1, 0, 0))).normalized()
    m = axis.cross(n).normalized()
    rows = (0.0, 0.35, 0.7, 1.0) if lod == 0 else (0.0, 1.0)
    rings = []
    for r in rows:
        ring = []
        for i in range(ribs * (2 if lod == 0 else 1)):
            a = 2 * math.pi * i / (ribs * (2 if lod == 0 else 1))
            scallop = 1.0 if i % 2 == 0 or lod == 1 else 0.93
            drop = (r ** 1.6) * 0.26 * s
            p = tip + (n * math.cos(a) + m * math.sin(a)) * radius * r * (scallop if r == 1.0 else 1.0) - axis * drop
            ring.append(canopy.verts.new(p))
        rings.append(ring)
    vb.ring_loft(canopy, rings)
    canopy_obj = new_object("umbrella", canopy)
    canopy_obj["slot"] = "umbrella"
    canopy_obj["weights"] = "chest"
    return [shaft, canopy_obj]


def build_scarf(lod):
    s = S()
    lw = vb.P["limbs"]
    bm = bmesh.new()
    centre = Vector((0, 0.006 * s, 1.275 * s))
    seg, sides = (18, 6) if lod == 0 else (9, 4)
    ring_pts = []
    for i in range(seg + 1):
        a = 2 * math.pi * i / seg
        ring_pts.append(centre + Vector((math.sin(a) * 0.066 * s * lw, -math.cos(a) * 0.062 * s * lw, -0.01 * s * math.cos(a))))
    tube(bm, ring_pts, 0.024 * s, sides)
    tail = [centre + Vector((0.035 * s, -0.075 * s - 0.004 * s * t, -0.02 * s - 0.16 * s * t)) for t in (0.0, 0.5, 1.0)]
    tube(bm, tail, 0.018 * s, sides)
    obj = new_object("scarf", bm)
    obj["slot"] = "scarf"
    obj["weights"] = "neck"
    return obj


def build_backpack(lod):
    s = S()
    bm = bmesh.new()
    rounded_box(bm, Vector((0, 0.13 * s * vb.P["chest"], 1.05 * s)), Vector((0.24 * s, 0.1 * s, 0.28 * s)), bevel=0.25, seg=6 if lod == 0 else 3)
    obj = new_object("backpack", bm)
    obj["slot"] = "bag"
    obj["weights"] = "chest"
    return obj


def build_accessories(head_bvh, body_bvh, lod):
    out = {}
    out["cap"] = [build_cap(lod)]
    out["straw-hat"] = build_straw_hat(lod)
    out["glasses"] = [build_glasses(head_bvh)]
    out["shoulder-bag"] = build_shoulder_bag(body_bvh, lod)
    out["umbrella"] = build_umbrella(lod)
    out["scarf"] = [build_scarf(lod)]
    out["backpack"] = [build_backpack(lod)]
    return out


# ---------------------------------------------------------------------------------------
# Face decals as palette slots (vb.face_layout), with shape keys.

FACE_SLOT = {
    "eye-white": "eyeWhite", "iris": "iris", "iris-light": "irisLight", "pupil": "pupil",
    "eye-highlight": "glint", "lash": "line", "brow": "brow", "mouth": "mouth", "blush": "blush",
    "nose": "nose",
}
MID_FACE = {"eye-white", "iris", "pupil", "lash", "brow", "mouth", "blush"}


def build_face(head_bvh, lod):
    C = vb.head_center()
    k = vb.S

    def keep(polys):
        if lod == 0:
            return polys
        out = []
        seen = {}
        for mat, layer, pts in polys:
            if mat not in MID_FACE:
                continue
            seen[mat] = seen.get(mat, 0) + 1
            # Lower lashes are the second lash polygon per eye; skip them at mid distance.
            if mat == "lash" and seen[mat] % 2 == 0:
                continue
            step = 2 if len(pts) > 8 else 1
            out.append((mat, layer, pts[::step]))
        return out

    def project(polys):
        placed_all = []
        for mat, layer, pts in polys:
            placed = []
            for u, v in pts:
                x, z = C.x + u, C.z + v
                hit, normal = vb.surface_y(head_bvh, x, z)
                if hit is None:
                    hit, normal = Vector((x, C.y - vb.head_radii().y * 0.9, z)), Vector((0, -1, 0))
                placed.append(hit + normal * (0.00045 * layer * k + 0.0003 * k) * (1 if lod == 0 else 2.2))
            placed_all.append((mat, placed))
        return placed_all

    base = project(keep(vb.face_layout({})))
    bm = bmesh.new()
    face_slots = []
    for mat, placed in base:
        centre = sum(placed, Vector()) / len(placed)
        verts = [bm.verts.new(p) for p in placed]
        hub = bm.verts.new(centre)
        for a, b in zip(verts, verts[1:] + verts[:1]):
            bm.faces.new((hub, b, a))
            face_slots.append(SLOT[FACE_SLOT[mat]])
    obj = new_object("Face", bm, smooth=False)
    tag(obj, lambda poly: ((face_slots[poly.index],) * 4, 0))
    obj.shape_key_add(name="Basis", from_mix=False)

    def flat(out):
        coords = []
        for _mat, placed in out:
            coords.extend(placed)
            coords.append(sum(placed, Vector()) / len(placed))
        return coords

    keys = vb.FACE_KEYS if lod == 0 else ["blink"]
    for key in keys:
        params = {"blinkL": 1.0, "blinkR": 1.0} if key == "blink" else {key: 1.0}
        coords = flat(project(keep(vb.face_layout(params))))
        assert len(coords) == len(obj.data.vertices), key
        block = obj.shape_key_add(name=key, from_mix=False)
        for i, co in enumerate(coords):
            block.data[i].co = co
        block.value = 0.0
    obj["weights"] = "head"
    return obj


# ---------------------------------------------------------------------------------------
# Assembly.


def weights_for(kind, j, deform, kids):
    s = S()
    if kind == "head":
        return lambda co: {"head": 1.0}
    if kind == "hair":
        return hair_weights
    if kind == "hips":
        return lambda co: {"hips": 1.0}
    if kind == "neck":
        return lambda co: {"neck": 0.4, "upperChest": 0.6} if co.z > 1.24 * s else {"upperChest": 1.0}
    if kind == "chest":
        return lambda co: vb.body_weights(co, j, ["upperChest", "neck", "chest", "spine"], kids)
    if kind == "skirt":
        def skirt_w(co):
            t = smoothstep(1.0 * s, 0.55 * s, co.z)
            if co.z > 1.0 * s:
                return vb.body_weights(co, j, ["upperChest", "chest", "spine", "hips"], kids)
            side = max(0.0, min(1.0, 0.5 + co.x / (0.24 * s)))
            leg = 0.6 * t
            return {"hips": 1 - leg, "leftUpperLeg": leg * side, "rightUpperLeg": leg * (1 - side)}
        return skirt_w
    return lambda co: vb.body_weights(co, j, deform, kids)


def build_lod(lod, j):
    ids = part_ids()
    kids = vb.children_of(j)
    deform = [n for n in j if lod == 0 or not any(f in n for f in FINGERS)]
    body = build_body(j, lod)
    head = build_head(lod)
    head_bvh = BVHTree.FromObject(head, bpy.context.evaluated_depsgraph_get())
    body_bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    body_names = list(j)
    slot_fn = outfit_slots(region)

    def body_tag(poly):
        _d, bone, t = vb.nearest_bone(poly.center, j, body_names)
        return slot_fn(poly.center, bone, t), 0

    tag(body, body_tag)
    tag_uniform(head, "skin", 0)
    vb.assign(body, weights_for("body", j, deform, kids))
    vb.assign(head, weights_for("head", j, deform, kids))
    parts = [body, head]
    per_part = {"body": 0}
    face = build_face(head_bvh, lod)
    vb.assign(face, weights_for("head", j, deform, kids))

    def add(obj, part, slot=None):
        tag_uniform(obj, slot or obj.get("slot"), part)
        vb.assign(obj, weights_for(obj.get("weights", "body"), j, deform, kids))
        parts.append(obj)

    for style in BODY["hair"]:
        add(build_hair(style, head_bvh, lod), ids[f"hair:{style}"], "hair")
    for outfit in BODY["outfits"]:
        for obj in OUTFIT_EXTRAS.get(outfit, lambda *_a: [])(body_bvh, lod):
            slot = obj.get("slot") or EXTRA_SLOT[obj.name.split(".")[0]]
            add(obj, ids[f"outfit:{outfit}"], slot)
    for acc, objs in build_accessories(head_bvh, body_bvh, lod).items():
        for obj in objs:
            add(obj, ids[f"acc:{acc}"])
    tris = {}
    for obj in [face, *parts]:
        uv = obj.data.uv_layers["KitC"]
        for poly in obj.data.polygons:
            part = int(round(uv.data[poly.loop_indices[0]].uv[0]))
            tris[part] = tris.get(part, 0) + len(poly.vertices) - 2
    for obj in [face, *parts]:
        obj.data.materials.clear()
    name = f"Kit_LOD{lod}"
    mesh_obj = vb.join([face, *parts], name)
    mat = bpy.data.materials.get("kit" if lod == 0 else "kit-mid") or bpy.data.materials.new("kit" if lod == 0 else "kit-mid")
    mat.use_backface_culling = False
    mesh_obj.data.materials.append(mat)
    for poly in mesh_obj.data.polygons:
        poly.material_index = 0
    return mesh_obj, tris


def build(name):
    use_body(name)
    ma.reset_scene()
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    j = vb.joints()
    lod0, tris0 = build_lod(0, j)
    lod1, tris1 = build_lod(1, j)
    arm = vb.create_armature(j)
    for obj in (lod0, lod1):
        vb.bind(obj, arm)
    os.makedirs(BUILD, exist_ok=True)
    glb = os.path.join(BUILD, f"{name}.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (arm, lod0, lod1):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_extras=True,
        export_animations=False,
        export_def_bones=True,
        export_influence_nb=4,
        export_morph=True,
        export_morph_normal=False,
        export_try_sparse_sk=True,
        export_texcoords=True,
        export_normals=True,
        export_meshopt_compression_enable=True,
        export_meshopt_extension="EXT_meshopt_compression",
        export_materials="EXPORT",
    )
    ids = part_ids()
    pr = BODY["profile"]
    spec = {
        "cast": name,
        "person": name,
        "title": f"Crowd kit / {name}",
        "height": pr["height"],
        "humanBones": list(j),
        "expressions": {
            "blink": ["blinkL", "blinkR"],
            "blinkLeft": ["blinkL"],
            "blinkRight": ["blinkR"],
            "happy": ["happy"],
            "relaxed": ["relaxed"],
            "surprised": ["surprised"],
            "aa": ["aa"],
            "ih": ["ih"],
            "ou": ["ou"],
            "ee": ["ee"],
            "oh": ["oh"],
            "lookUp": ["lookUp"],
            "lookDown": ["lookDown"],
            "lookLeft": ["lookLeft"],
            "lookRight": ["lookRight"],
        },
        "faceMesh": "Kit_LOD0",
        "springs": [],
        "colliders": [],
        "materials": {
            "kit": {"role": "cloth", **vb.MTOON_ROLES["cloth"]},
            "kit-mid": {"role": "cloth", **vb.MTOON_ROLES["cloth"], "outline": 0.0},
        },
        "posture": vb.P.get("posture", {}),
        "meshes": ["Kit_LOD0", "Kit_LOD1"],
    }
    ma.write_report(os.path.join(BUILD, f"{name}.vrm.json"), spec)
    names = {v: k for k, v in ids.items()}
    report = {
        "body": name,
        "blender": bpy.app.version_string,
        "heightMetres": pr["height"],
        "parts": ids,
        "trianglesPerPart": {
            "lod0": {names.get(p, "base"): n for p, n in sorted(tris0.items())},
            "lod1": {names.get(p, "base"): n for p, n in sorted(tris1.items())},
        },
        "triangles": {"lod0": ma.triangle_count(lod0), "lod1": ma.triangle_count(lod1)},
        "shapeKeys": {"lod0": vb.FACE_KEYS, "lod1": ["blink"]},
        "facing": "-Y in Blender, +Z in three.js (VRM 1.0)",
    }
    ma.write_report(os.path.join(HERE, f"{name}.report.json"), report)
    if ARGS is not None and ARGS.render:
        render_review(os.path.join(ARGS.render, name), lod0, lod1, ids)
    print("REPORT", json.dumps(report["triangles"]))


# ---------------------------------------------------------------------------------------
# Review renders: one sample look per outfit, coloured from a demo palette.

DEMO = {
    "skin": "#f2d4bc", "hair": "#4a3a30", "top": "#6a86b8", "inner": "#f1ede4", "lower": "#8a7a5c",
    "legwear": "#2a2c36", "shoes": "#3a2a22", "accent": "#b83440", "eyeWhite": "#fbf8f4",
    "iris": "#5a3524", "irisLight": "#a86a3e", "pupil": "#1a1012", "glint": "#ffffff",
    "line": "#2a1a1a", "brow": "#3a2828", "mouth": "#b8505a", "blush": "#f2b0a4", "nose": "#e6bca4",
    "hat": "#d8c07a", "hatBand": "#7a3a2a", "bag": "#8a5a3a", "frame": "#3a302a", "umbrella": "#5f8fb0",
    "scarf": "#c77a3a", "apron": "#e8dcc4", "metal": "#9a9a9a",
}


def render_review(folder, lod0, lod1, ids):
    os.makedirs(folder, exist_ok=True)
    slot_names = KIT["slots"]
    accs = KIT["accessories"]
    for lod, src in ((0, lod0), (1, lod1)):
        for index, outfit in enumerate(BODY["outfits"]):
            copy = src.copy()
            copy.data = src.data.copy()
            if copy.data.shape_keys:
                copy.shape_key_clear()
            bpy.context.scene.collection.objects.link(copy)
            hair = BODY["hair"][index % len(BODY["hair"])]
            acc = accs[index % len(accs)]
            show = {0, ids[f"hair:{hair}"], ids[f"outfit:{outfit}"], ids[f"acc:{acc}"]}
            bm = bmesh.new()
            bm.from_mesh(copy.data)
            uv_c = bm.loops.layers.uv["KitC"]
            uv_slot = bm.loops.layers.uv["KitA" if index < 2 else "KitB"]
            col = bm.loops.layers.color.new("Col")
            kill = []
            for f in bm.faces:
                loop = f.loops[0]
                part = int(round(loop[uv_c].uv[0]))
                if part not in show:
                    kill.append(f)
                    continue
                slot = int(round(loop[uv_slot].uv[index % 2]))
                c = ma.hex_color(DEMO[slot_names[slot]])
                for lp in f.loops:
                    lp[col] = c
            bmesh.ops.delete(bm, geom=kill, context="FACES")
            bm.to_mesh(copy.data)
            bm.free()
            copy.data.color_attributes.active_color = copy.data.color_attributes["Col"]
            copy.location = Vector((index * 0.9 * S() + (0 if lod == 0 else 5), 0, 0))
            copy.modifiers.clear()
    scene = bpy.context.scene
    lod0.hide_render = True
    lod1.hide_render = True
    ma.render_views(folder, (1.2 * S() + 2.5, 0, 0.8 * S()), {
        "lineup": ((1.2 * S() + 2.5, -9.5, 1.2 * S()), 50),
    }, resolution=(1600, 700))
    ma.render_views(folder, (0.0, 0, 1.4 * S()), {
        "face": ((0.1 * S(), -1.2 * S(), 1.42 * S()), 85),
    }, resolution=(700, 700))
    del scene


# ---------------------------------------------------------------------------------------
# Hand props for the story roles, in the canonical hand-socket frame (world/character-motion.js:
# origin at the palm centre, +Y along the fingers, +Z out of the palm). Each prop is its own
# node with `prop`, `hand` and `hold` extras, like models/characters/props/<cast>.glb, so
# hero-cast attaches it to a socket on any kit body.

PROPS = {
    "story-haru": [
        # The worn notebook, closed, held against the palm and hanging below the fingers.
        ("notebook", "left", [("box", (0.0, 0.07, -0.012), (0.14, 0.19, 0.018), "#564631"),
                              ("box", (0.0, 0.07, -0.012), (0.132, 0.182, 0.02), "#d1c09a")]),
        ("spanner", "right", [("box", (0.0, 0.05, 0.012), (0.02, 0.2, 0.012), "#9baba9"),
                              ("box", (0.0, 0.155, 0.012), (0.055, 0.02, 0.016), "#bac5bd")]),
    ],
    "story-emi": [
        ("recorder", "right", [("box", (0.0, 0.035, 0.03), (0.07, 0.11, 0.032), "#41464a"),
                               ("box", (0.0, 0.05, 0.047), (0.05, 0.035, 0.004), "#93a5a4")]),
    ],
    "story-mika": [
        ("cup", "right", [("cylinder", (0.0, 0.02, 0.055), (0.04, 0.09, 0.04), "#e5decb")]),
    ],
    "story-fumi": [
        ("rag", "right", [("box", (0.0, 0.06, 0.01), (0.09, 0.14, 0.02), "#7a7866")]),
    ],
    "story-yuta": [
        ("tape", "right", [("cylinder", (0.0, 0.02, 0.04), (0.05, 0.05, 0.05), "#c8b890")]),
    ],
}


def socket_point(x, y, z):
    """A socket-frame point as Blender coordinates (glTF export maps (x, y, z) to (x, z, -y))."""
    return Vector((x, -z, y))


def build_props():
    out_dir = os.path.join(ROOT, "apps/game/public/models/characters/props")
    os.makedirs(out_dir, exist_ok=True)
    report = {}
    for name, props in PROPS.items():
        ma.reset_scene()
        for block in list(bpy.data.materials):
            bpy.data.materials.remove(block)
        objects = []
        for prop, hand, shapes in props:
            bm = bmesh.new()
            materials = []
            for kind, centre, size, color in shapes:
                if kind == "box":
                    geom = bmesh.ops.create_cube(bm, size=1.0)
                else:
                    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.5, radius2=0.5, depth=1.0)
                for vert in geom["verts"]:
                    x, y, z = vert.co
                    if kind != "box":
                        # The cone's axis is Blender Z; the cup stands along the socket's Y.
                        x, y, z = x, z, y
                    vert.co = socket_point(centre[0] + x * size[0], centre[1] + y * size[1], centre[2] + z * size[2])
                for face in {f for v in geom["verts"] for f in v.link_faces}:
                    face.material_index = len(materials)
                materials.append(color)
            obj = new_object(prop, bm, smooth=False)
            for color in materials:
                mat = bpy.data.materials.new(f"{prop}-{color}")
                mat.use_nodes = True
                mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = ma.hex_color(color)
                mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.8
                obj.data.materials.append(mat)
            obj["prop"] = prop
            obj["hand"] = hand
            obj["hold"] = "one"
            objects.append(obj)
        path = os.path.join(out_dir, f"{name}.glb")
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                                  export_extras=True, export_animations=False, export_materials="EXPORT")
        report[name] = [p[0] for p in props]
    print("PROPS", json.dumps(report))


if __name__ == "__main__":
    ARGS = ma.parse_args({}, {"--body": {"default": "all"}, "--props": {"action": "store_true"}})
    if ARGS.props:
        build_props()
    else:
        for body_name in KIT["bodies"] if ARGS.body == "all" else ARGS.body.split(","):
            build(body_name)
