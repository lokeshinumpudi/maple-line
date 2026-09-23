"""Momiji cast for Maple Line: stylized, low-poly people for director close-ups.

One builder, one skeleton, one set of clips; each cast member is a row in PROFILES
(height, width, clothing, hair, colours, props, posture). Everything is built from data so
an agent can change a hat or a proportion and rebuild: body and face rings, a
Mixamo-named game skeleton, weights written per ring, four face shape keys, and in-place
clips named after the NPC minds' intents. Blender 5.2; see asset-src/lib/maple_assets.py.

    blender -b --factory-startup --python-exit-code 1 \\
      --python asset-src/characters/momiji-cast/build.py -- --cast sato

`--cast all` builds every profile. Each build writes a GLB into
apps/game/public/models/characters/ and a report beside this script.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "lib"))
import maple_assets as ma  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

# Geometry below is written for a 1.71 m figure; each profile is scaled to its height after
# the mesh, weights and face keys exist. `width` narrows or widens the torso and arms.
BASE_HEIGHT = 1.71
WALK_SPEED = 1.15  # m/s at 1.71 m: the residents' walking speed in the game
HURRY_SPEED = 1.75  # m/s at 1.71 m
SEAT_HEIGHT = 0.42  # seat surface under the thighs in the `sit` clip, at 1.71 m

BASE_COLORS = {
    "skin": "#e3b995",
    "skin-shade": "#cf9f7c",
    "jacket": "#2f4150",
    "shirt": "#e9e3d3",
    "trousers": "#34363a",
    "skirt": "#3b4056",
    "socks": "#ecebe6",
    "shoes": "#4a3326",
    "hair": "#1d1a19",
    "sclera": "#f3eee4",
    "iris": "#2a1d17",
    "mouth": "#8a4b45",
    "brow": "#241c19",
    "bag": "#9a7a52",
    "phone": "#1f2327",
    "ribbon": "#9b2f33",
    "radio": "#c2ab7f",
    "radio-grille": "#3b3531",
    "glasses": "#2b2622",
    "paper": "#e4dfd0",
    "print": "#8f8a80",
}

PROFILES = {
    # Mr. Sato, 44, office commuter. Stands in for commuter-1.
    "sato": {
        "asset": "commuter-hero",
        "person": "commuter-1",
        "height": 1.71,
        "width": 1.0,
        "lower": "trousers",
        "hair": "short",
        "props": ["shoulder-bag", "phone"],
        "stoop": 0,
        "colors": {},
    },
    # Riko, 17, carrying her grandmother's repaired radio home. Stands in for commuter-2.
    "riko": {
        "asset": "student-riko",
        "person": "commuter-2",
        "height": 1.58,
        "width": 0.9,
        "lower": "skirt",
        "hair": "bob",
        "props": ["school-bag", "phone", "radio", "ribbon"],
        "stoop": 0,
        "colors": {
            "skin": "#e8c0a0",
            "skin-shade": "#d6a888",
            "jacket": "#27324a",
            "shirt": "#f1efe8",
            "shoes": "#2b221d",
            "hair": "#171213",
            "brow": "#1c1515",
            "bag": "#5e3a2b",
            "mouth": "#a0544f",
        },
    },
    # Mr. Ishida, 70s, reads the paper on the Momiji bench every evening. Stands in for reader-1.
    "ishida": {
        "asset": "reader-ishida",
        "person": "reader-1",
        "height": 1.66,
        "width": 0.97,
        "lower": "trousers",
        "hair": "thin",
        "props": ["glasses", "newspaper"],
        "stoop": 7,
        "colors": {
            "skin": "#d9ab86",
            "skin-shade": "#c49473",
            "jacket": "#6b6356",
            "shirt": "#d9d4c6",
            "trousers": "#4d4b47",
            "shoes": "#3a2c22",
            "hair": "#bdb8af",
            "brow": "#8f8a82",
        },
    },
}

ARGS = ma.parse_args(
    {},
    {"--cast": {"default": "sato", "choices": [*PROFILES, "all"], "help": "Profile to build."}},
)

PROFILE = None
COLORS = {}
W = 1.0  # torso and arm width factor of the current profile


def use_profile(name):
    global PROFILE, COLORS, W
    PROFILE = PROFILES[name]
    COLORS = {key: ma.hex_color(value) for key, value in {**BASE_COLORS, **PROFILE["colors"]}.items()}
    W = PROFILE["width"]


# Blender axes: +Z up, the character faces -Y, and its left side is +X.
def bone_table():
    arm = lambda p: (p[0] * W, p[1], p[2])  # noqa: E731
    bones = [
        # name, head, tail, parent
        ("Hips", (0, 0, 0.93), (0, 0, 1.02), None),
        ("Spine", (0, 0, 1.02), (0, 0, 1.13), "Hips"),
        ("Spine1", (0, 0, 1.13), (0, 0, 1.25), "Spine"),
        ("Spine2", (0, 0, 1.25), (0, 0, 1.39), "Spine1"),
        ("Neck", (0, 0, 1.39), (0, 0, 1.49), "Spine2"),
        ("Head", (0, 0, 1.49), (0, 0, 1.66), "Neck"),
        ("LeftShoulder", arm((0.03, 0, 1.36)), arm((0.17, 0, 1.37)), "Spine2"),
        ("LeftArm", arm((0.17, 0, 1.37)), arm((0.2, 0.01, 1.1)), "LeftShoulder"),
        ("LeftForeArm", arm((0.2, 0.01, 1.1)), arm((0.215, -0.01, 0.86)), "LeftArm"),
        ("LeftHand", arm((0.215, -0.01, 0.86)), arm((0.222, -0.018, 0.72)), "LeftForeArm"),
        ("LeftUpLeg", arm((0.09, 0, 0.93)), arm((0.095, 0, 0.5)), "Hips"),
        ("LeftLeg", arm((0.095, 0, 0.5)), arm((0.095, 0.02, 0.09)), "LeftUpLeg"),
        ("LeftFoot", arm((0.095, 0.02, 0.09)), arm((0.095, -0.09, 0.035)), "LeftLeg"),
        ("LeftToeBase", arm((0.095, -0.09, 0.035)), arm((0.095, -0.17, 0.035)), "LeftFoot"),
    ]
    bones += [
        (n.replace("Left", "Right"), (-h[0], h[1], h[2]), (-t[0], t[1], t[2]), p and p.replace("Left", "Right"))
        for n, h, t, p in bones
        if n.startswith("Left")
    ]
    bones += [
        ("eye-l", (EYE_X, -0.075, EYE_Z), (EYE_X, -0.1, EYE_Z), "Head"),
        ("eye-r", (-EYE_X, -0.075, EYE_Z), (-EYE_X, -0.1, EYE_Z), "Head"),
    ]
    return bones


HEAD_CENTER = Vector((0, -0.005, 1.585))
HEAD_RADII = Vector((0.088, 0.098, 0.112))
EYE_Z = 1.598
EYE_X = 0.031


def head_surface_y(x, z, lift=0.0):
    """Front surface of the head ellipsoid at (x, z), pushed out by `lift` metres."""
    k = 1 - (x / HEAD_RADII.x) ** 2 - ((z - HEAD_CENTER.z) / HEAD_RADII.z) ** 2
    return HEAD_CENTER.y - HEAD_RADII.y * math.sqrt(max(k, 0.0)) - lift


class Builder:
    """Accumulates geometry, per-face colours, per-vertex weights and named vertex sets."""

    def __init__(self):
        self.bm = bmesh.new()
        self.colors = []
        self.weights = {}
        self.sets = {}
        self.smooth = []

    def vertex(self, co, weights, sets=()):
        v = self.bm.verts.new(co)
        self.weights[len(self.bm.verts) - 1] = dict(weights)
        for name in sets:
            self.sets.setdefault(name, []).append(len(self.bm.verts) - 1)
        return v

    def face(self, verts, color, smooth=True):
        f = self.bm.faces.new(verts)
        self.colors.append(COLORS[color])
        self.smooth.append(smooth)
        return f

    def tube(self, points, radii, sides, color, ring_weights, cap_start=False, cap_end=False, up=(0, -1, 0), sets=()):
        """Rings along a polyline; radii are (across u, across v) with v toward `up`.
        `color` is one name, or one name per segment between rings."""
        rings = []
        for i, point in enumerate(points):
            p = Vector(point)
            ahead = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])
            tangent = ahead.normalized()
            v_axis = (Vector(up) - tangent * tangent.dot(Vector(up))).normalized()
            u_axis = tangent.cross(v_axis).normalized()
            rx, ry = radii[i]
            ring = []
            for k in range(sides):
                a = 2 * math.pi * k / sides
                co = p + u_axis * (math.cos(a) * rx) + v_axis * (math.sin(a) * ry)
                ring.append(self.vertex(co, ring_weights[i], sets))
            rings.append(ring)
        colors = [color] * (len(rings) - 1) if isinstance(color, str) else color
        for i, (a_ring, b_ring) in enumerate(zip(rings, rings[1:])):
            for k in range(sides):
                self.face([a_ring[k], a_ring[(k + 1) % sides], b_ring[(k + 1) % sides], b_ring[k]], colors[i])
        if cap_start:
            self.face(list(reversed(rings[0])), colors[0])
        if cap_end:
            self.face(rings[-1], colors[-1])
        return rings

    def ellipsoid(self, center, radii, rings, sides, color_fn, weights, keep=None, sets_fn=None, flip=False):
        """Latitude/longitude ellipsoid; `keep(theta, phi)` trims faces; colours per face."""
        grid = []
        for i in range(rings + 1):
            theta = math.pi * i / rings
            row = []
            for k in range(sides):
                phi = 2 * math.pi * k / sides
                co = Vector(
                    (
                        center[0] + radii[0] * math.sin(theta) * math.sin(phi),
                        center[1] - radii[1] * math.sin(theta) * math.cos(phi),
                        center[2] + radii[2] * math.cos(theta),
                    )
                )
                sets = sets_fn(co) if sets_fn else ()
                row.append(self.vertex(co, weights, sets))
            grid.append(row)
        for i in range(rings):
            for k in range(sides):
                theta = math.pi * (i + 0.5) / rings
                phi = 2 * math.pi * (k + 0.5) / sides
                if keep and not keep(theta, phi):
                    continue
                quad = [grid[i][k], grid[i + 1][k], grid[i + 1][(k + 1) % sides], grid[i][(k + 1) % sides]]
                if flip:
                    quad.reverse()
                # Poles collapse to triangles.
                unique = []
                for v in quad:
                    if all((v.co - u.co).length > 1e-7 for u in unique):
                        unique.append(v)
                if len(unique) >= 3:
                    self.face(unique, color_fn(theta, phi))
        return grid


def blend(*pairs):
    return {bone: weight for bone, weight in pairs}


def build_legs(b):
    skirt = PROFILE["lower"] == "skirt"
    for side, s in (("Left", 1), ("Right", -1)):
        up, low, foot = f"{side}UpLeg", f"{side}Leg", f"{side}Foot"
        zs = [0.97, 0.86, 0.72, 0.58, 0.52, 0.47, 0.34, 0.18, 0.1]
        rs = [0.095, 0.088, 0.078, 0.066, 0.06, 0.056, 0.054, 0.047, 0.043]
        if skirt:
            # Thighs are skirt-coloured so a seated pose still reads as a skirt; bare knees
            # below the hem; knee socks from mid-shin.
            rs = [r * f for r, f in zip(rs, (0.92, 0.9, 0.84, 0.8, 0.78, 0.8, 0.84, 0.8, 0.82))]
            colors = ["skirt", "skirt", "skirt", "skin", "skin", "socks", "socks", "socks"]
        else:
            colors = "trousers"
        weights = []
        for z in zs:
            if z >= 0.95:
                weights.append(blend(("Hips", 0.5), (up, 0.5)))
            elif z >= 0.56:
                weights.append({up: 1})
            elif z >= 0.5:
                weights.append(blend((up, 0.6), (low, 0.4)))
            elif z >= 0.45:
                weights.append(blend((up, 0.2), (low, 0.8)))
            elif z > 0.12:
                weights.append({low: 1})
            else:
                weights.append(blend((low, 0.6), (foot, 0.4)))
        points = [(s * 0.093 * W, 0.02 * (0.97 - z) / 0.87, z) for z in zs]
        b.tube(points, [(r, r * 0.95) for r in rs], 10, colors, weights, up=(0, -1, 0), sets=("leg",))
        # Shoe: heel to toe along -Y.
        toe = f"{side}ToeBase"
        shoe_points = [(s * 0.095 * W, y, z) for y, z in ((0.065, 0.05), (0.0, 0.052), (-0.085, 0.045), (-0.15, 0.038), (-0.178, 0.032))]
        shoe_radii = [(0.044, 0.044), (0.05, 0.05), (0.05, 0.043), (0.045, 0.034), (0.028, 0.02)]
        if skirt:
            shoe_radii = [(rx * 0.9, ry * 0.9) for rx, ry in shoe_radii]
        shoe_weights = [{foot: 1}, {foot: 1}, blend((foot, 0.5), (toe, 0.5)), {toe: 1}, {toe: 1}]
        b.tube(shoe_points, shoe_radii, 10, "shoes", shoe_weights, cap_start=True, cap_end=True, up=(0, 0, 1))
    if skirt:
        build_skirt(b)


def build_skirt(b):
    """A pleated skirt from under the blazer hem to just above the knee."""
    zs = [0.92, 0.84, 0.76, 0.68, 0.6]
    rx = [0.165, 0.2, 0.215, 0.228, 0.238]
    ry = [0.118, 0.14, 0.152, 0.162, 0.17]
    sides = 16
    rings = []
    for i, z in enumerate(zs):
        ring = []
        # Lower rings follow the thighs more, so the hem swings with the stride.
        leg = (0.0, 0.25, 0.45, 0.6, 0.7)[i]
        for k in range(sides):
            a = 2 * math.pi * k / sides
            pleat = 1 + (0.035 if k % 2 else -0.02) * (i / (len(zs) - 1))
            x, y = math.sin(a) * rx[i] * W * pleat, -math.cos(a) * ry[i] * pleat
            share = min(1.0, abs(x) / (0.12 * W))  # 0 at the centre line, 1 at the side
            side = "LeftUpLeg" if x >= 0 else "RightUpLeg"
            other = "RightUpLeg" if x >= 0 else "LeftUpLeg"
            weights = {"Hips": 1 - leg}
            weights[side] = leg * (0.5 + 0.5 * share)
            weights[other] = leg * (0.5 - 0.5 * share)
            ring.append(b.vertex((x, y + 0.01, z), {bone: w for bone, w in weights.items() if w > 1e-4}))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(sides):
            b.face([rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]], "skirt")


def build_body(b):
    build_legs(b)

    # Torso: a buttoned jacket (or blazer, or cardigan), wider at the hem and shoulders.
    zs = [0.84, 0.92, 1.02, 1.12, 1.22, 1.3, 1.36, 1.405, 1.44]
    rx = [0.19, 0.18, 0.17, 0.165, 0.175, 0.19, 0.2, 0.15, 0.07]
    ry = [0.13, 0.125, 0.115, 0.11, 0.115, 0.12, 0.115, 0.1, 0.06]
    base = [
        {"Hips": 1},
        {"Hips": 1},
        blend(("Hips", 0.5), ("Spine", 0.5)),
        {"Spine": 1},
        {"Spine1": 1},
        blend(("Spine1", 0.4), ("Spine2", 0.6)),
        {"Spine2": 1},
        blend(("Spine2", 0.6), ("Neck", 0.4)),
        blend(("Spine2", 0.3), ("Neck", 0.7)),
    ]
    sides = 16
    rings = []
    for i, z in enumerate(zs):
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            x, y = math.sin(a) * rx[i] * W, -math.cos(a) * ry[i]
            weights = dict(base[i])
            if z >= 1.28 and abs(x) > 0.12 * W:
                shoulder = "LeftShoulder" if x > 0 else "RightShoulder"
                weights = {bone: w * 0.5 for bone, w in weights.items()}
                weights[shoulder] = 0.5
            ring.append(b.vertex((x, y, z), weights))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(sides):
            # A pale shirt triangle shows at the open collar on the front.
            front = k in (0, 15) and zs[i] >= 1.3
            b.face(
                [rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]],
                "shirt" if front else "jacket",
            )

    # Sleeves and hands.
    for side, s in (("Left", 1), ("Right", -1)):
        sh, arm, fore, hand = f"{side}Shoulder", f"{side}Arm", f"{side}ForeArm", f"{side}Hand"
        points = [(s * 0.175 * W, 0, 1.365), (s * 0.19 * W, 0.005, 1.24), (s * 0.2 * W, 0.01, 1.1), (s * 0.207 * W, 0.0, 0.98), (s * 0.214 * W, -0.008, 0.87)]
        radii = [(0.058, 0.058), (0.052, 0.052), (0.045, 0.047), (0.042, 0.043), (0.04, 0.04)]
        weights = [
            blend((sh, 0.4), (arm, 0.6)),
            {arm: 1},
            blend((arm, 0.5), (fore, 0.5)),
            {fore: 1},
            blend((fore, 0.7), (hand, 0.3)),
        ]
        b.tube(points, radii, 10, "jacket", weights, up=(0, -1, 0))
        hand_points = [(s * 0.215 * W, -0.01, 0.875), (s * 0.219 * W, -0.014, 0.81), (s * 0.222 * W, -0.018, 0.75), (s * 0.222 * W, -0.02, 0.715)]
        hand_radii = [(0.017, 0.028), (0.02, 0.041), (0.018, 0.037), (0.011, 0.02)]
        b.tube(hand_points, hand_radii, 8, "skin", [blend((fore, 0.3), (hand, 0.7)), {hand: 1}, {hand: 1}, {hand: 1}], cap_end=True, up=(0, -1, 0))
        thumb = [(s * 0.212 * W, -0.035, 0.835), (s * 0.207 * W, -0.052, 0.8), (s * 0.204 * W, -0.057, 0.78)]
        b.tube(thumb, [(0.01, 0.01), (0.009, 0.009), (0.006, 0.006)], 6, "skin", [{hand: 1}] * 3, cap_end=True, up=(1, 0, 0))

    # Neck.
    b.tube(
        [(0, 0.0, 1.4), (0, 0.004, 1.47), (0, 0.006, 1.53)],
        [(0.048, 0.046), (0.046, 0.044), (0.045, 0.043)],
        10,
        "skin",
        [blend(("Spine2", 0.3), ("Neck", 0.7)), {"Neck": 1}, blend(("Neck", 0.4), ("Head", 0.6))],
        up=(0, -1, 0),
    )
    build_props(b)


def build_props(b):
    props = PROFILE["props"]
    hand_x = 0.222 * W
    if "shoulder-bag" in props:
        # Office bag at the right hip.
        box(b, Vector((-0.235 * W, 0.02, 0.94)), Vector((0.07, 0.26, 0.2)), "bag", {"Hips": 1})
    if "school-bag" in props:
        # A flat school bag worn at the right hip, with its strap across the back.
        box(b, Vector((-0.225 * W, 0.03, 0.9)), Vector((0.06, 0.3, 0.22)), "bag", {"Hips": 1})
        box(b, Vector((-0.2 * W, 0.045, 1.02)), Vector((0.02, 0.03, 0.14)), "bag", {"Hips": 0.5, "Spine": 0.5})
    if "phone" in props:
        box(b, Vector((-(hand_x + 0.013), -0.028, 0.78)), Vector((0.012, 0.04, 0.075)), "phone", {"RightHand": 1})
    if "radio" in props:
        # The repaired radio, carried by its handle in the left hand.
        radio = Vector((hand_x + 0.012, -0.03, 0.64))
        box(b, radio, Vector((0.06, 0.17, 0.1)), "radio", {"LeftHand": 1})
        box(b, radio + Vector((0.031, -0.03, 0.0)), Vector((0.004, 0.07, 0.06)), "radio-grille", {"LeftHand": 1})
        box(b, radio + Vector((0.0, 0.0, 0.065)), Vector((0.016, 0.1, 0.012)), "radio-grille", {"LeftHand": 1})
    if "ribbon" in props:
        # Uniform ribbon at the collar.
        box(b, Vector((0, -0.118, 1.365)), Vector((0.05, 0.012, 0.022)), "ribbon", {"Spine2": 1})
    if "glasses" in props:
        for s in (1, -1):
            x = s * EYE_X
            y = head_surface_y(x, EYE_Z) - 0.012
            for dx, dz, sx, sz in ((0, 0.012, 0.03, 0.003), (0, -0.011, 0.03, 0.003), (0.015, 0, 0.003, 0.024), (-0.015, 0, 0.003, 0.024)):
                box(b, Vector((x + s * dx, y, EYE_Z + dz)), Vector((sx, 0.003, sz)), "glasses", {"Head": 1})
        box(b, Vector((0, head_surface_y(0, EYE_Z) - 0.014, EYE_Z + 0.004)), Vector((0.014, 0.003, 0.003)), "glasses", {"Head": 1})


def box(b, center, size, color, weights, sets=()):
    hx, hy, hz = size.x / 2, size.y / 2, size.z / 2
    corners = [b.vertex(center + Vector((x * hx, y * hy, z * hz)), weights, sets) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    for quad in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        b.face([corners[i] for i in quad], color, smooth=False)


def build_newspaper(b):
    """An open broadsheet held between both hands, as its own mesh so the game can show it
    only while the reader sits. Edges follow one hand each; the fold follows both."""
    hand_x = 0.222 * W
    columns = [-hand_x - 0.01, -hand_x * 0.5, 0.0, hand_x * 0.5, hand_x + 0.01]
    rows = [0.68, 0.8, 0.92, 1.04]
    grid = []
    for x in columns:
        right = min(1.0, max(0.0, (hand_x + 0.01 - x) / (2 * hand_x + 0.02)))
        weights = {bone: w for bone, w in (("RightHand", right), ("LeftHand", 1 - right)) if w > 1e-4}
        # The fold at the centre sits back toward the reader.
        y = -0.06 + 0.035 * (1 - abs(x) / (hand_x + 0.01))
        grid.append(
            (
                [b.vertex((x, y, z), weights) for z in rows],
                # The back page, 2 mm behind, so both sides render with one-sided faces.
                [b.vertex((x, y + 0.002, z), weights) for z in rows],
            )
        )
    for i in range(len(columns) - 1):
        for j in range(len(rows) - 1):
            front = [grid[i][0][j], grid[i + 1][0][j], grid[i + 1][0][j + 1], grid[i][0][j + 1]]
            back = [grid[i][1][j], grid[i][1][j + 1], grid[i + 1][1][j + 1], grid[i + 1][1][j]]
            b.face(front, "print" if j == 1 and i in (0, 3) else "paper", smooth=False)
            b.face(back, "print" if j == 2 and i in (1, 2) else "paper", smooth=False)


def build_head(b):
    def jaw_set(co):
        return ("jaw",) if co.z < 1.555 and co.y < HEAD_CENTER.y - 0.02 else ()

    # Face: a slightly narrower jaw and fuller cheeks come from scaling rings below the eyes.
    grid = b.ellipsoid(HEAD_CENTER, HEAD_RADII, 14, 20, lambda t, p: "skin", {"Head": 1}, sets_fn=jaw_set)
    for row in grid:
        for v in row:
            if v.co.z < HEAD_CENTER.z:
                t = (HEAD_CENTER.z - v.co.z) / HEAD_RADII.z
                v.co.x = HEAD_CENTER.x + (v.co.x - HEAD_CENTER.x) * (1 - 0.18 * t * t)

    style = PROFILE["hair"]

    def hair_keep(theta, phi):
        front = math.cos(phi)  # 1 at the face, -1 at the back
        if style == "bob":
            # A straight fringe above the brows and a bob to the jaw at the sides and back.
            return theta < math.radians(50 if front > 0.55 else 132)
        if style == "thin":
            # Receding at the temples, trimmed short at the back.
            return theta < math.radians(52 + 50 * (1 - front) / 2)
        return theta < math.radians(64 + 44 * (1 - front) / 2)

    b.ellipsoid(
        HEAD_CENTER + Vector((0, 0.004, 0.006)),
        HEAD_RADII * {"bob": 1.11, "thin": 1.055}.get(style, 1.075),
        12,
        20,
        lambda t, p: "hair",
        {"Head": 1},
        keep=hair_keep,
    )

    # Eyes with dark irises on eye bones; eyelids are skin shells that the blink keys close.
    for side, s in (("l", 1), ("r", -1)):
        x = s * EYE_X
        y = head_surface_y(x, EYE_Z) + 0.006
        center = Vector((x, y, EYE_Z))
        b.ellipsoid(center, (0.0125, 0.0125, 0.0125), 6, 10, lambda t, p: "sclera", {f"eye-{side}": 1})
        b.ellipsoid(center + Vector((0, -0.0105, 0.001)), (0.0072, 0.0035, 0.0078), 4, 8, lambda t, p: "iris", {f"eye-{side}": 1})
        lid = b.ellipsoid(
            center,
            (0.0146, 0.0146, 0.0146),
            6,
            12,
            lambda t, p: "skin-shade",
            {"Head": 1},
            keep=lambda theta, phi: theta < math.pi / 2 and math.cos(phi) > -0.35,
            sets_fn=lambda co, side=side: (f"lid-{side}",),
        )
        b.sets.setdefault(f"lid-center-{side}", []).append(center.copy())
        # Retract the lid up and back so the eye is open at rest.
        rest = Matrix.Rotation(math.radians(-72), 4, "X")
        for row in lid:
            for v in row:
                v.co = center + (rest @ (v.co - center))
        # Brow.
        brow_center = Vector((x + s * 0.002, head_surface_y(x, EYE_Z + 0.03, 0.003), EYE_Z + 0.03))
        box(b, brow_center, Vector((0.03, 0.006, 0.0065)), "brow", {"Head": 1}, sets=(f"brow-{side}",))

    # Nose: a small wedge.
    top = b.vertex((0, head_surface_y(0, 1.598, -0.002), 1.598), {"Head": 1})
    left = b.vertex((0.012, head_surface_y(0.012, 1.566, 0.0), 1.566), {"Head": 1})
    right = b.vertex((-0.012, head_surface_y(-0.012, 1.566, 0.0), 1.566), {"Head": 1})
    tip = b.vertex((0, head_surface_y(0, 1.568, 0.016), 1.568), {"Head": 1})
    b.face([top, left, tip], "skin-shade", smooth=False)
    b.face([top, tip, right], "skin-shade", smooth=False)
    b.face([left, right, tip], "skin-shade", smooth=False)

    # Mouth: a thin dark shape on the face surface; the jaw and smile keys reshape it.
    columns = [-0.022, -0.011, 0.0, 0.011, 0.022]
    upper, lower = [], []
    for x in columns:
        edge = abs(x) > 0.02
        z_up = 1.5385 + (0 if edge else 0.0012)
        z_low = 1.5385 if edge else 1.5348
        upper.append(b.vertex((x, head_surface_y(x, z_up, 0.0012), z_up), {"Head": 1}, sets=("mouth-upper",)))
        lower.append(b.vertex((x, head_surface_y(x, z_low, 0.0012), z_low), {"Head": 1}, sets=("mouth-lower", "jaw")))
    for i in range(len(columns) - 1):
        b.face([upper[i], lower[i], lower[i + 1], upper[i + 1]], "mouth", smooth=False)


def create_armature(name, bones):
    data = bpy.data.armatures.new(f"{name}-rig")
    armature = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, head, tail, parent in bones:
        bone = data.edit_bones.new(bone_name)
        bone.head, bone.tail = Vector(head), Vector(tail)
        bone.roll = 0
        bone.use_deform = True
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def skin(obj, armature, builder, bones):
    groups = {name: obj.vertex_groups.new(name=name) for name, *_ in bones}
    for index, bone_weights in builder.weights.items():
        total = sum(bone_weights.values())
        for bone, weight in bone_weights.items():
            groups[bone].add([index], weight / total, "REPLACE")
    obj.parent = armature
    modifier = obj.modifiers.new("rig", "ARMATURE")
    modifier.object = armature


def add_shape_keys(obj, b):
    mesh = obj.data
    obj.shape_key_add(name="Basis", from_mix=False)
    base = [v.co.copy() for v in mesh.vertices]

    def key(name, offsets):
        block = obj.shape_key_add(name=name, from_mix=False)
        # New keys start at 1.0 in Blender 5.2; the rest face and the exported default
        # morph weights must be neutral.
        block.value = 0.0
        for index, delta in offsets.items():
            block.data[index].co = base[index] + delta

    for side in ("l", "r"):
        center = b.sets[f"lid-center-{side}"][0]
        close = Matrix.Rotation(math.radians(128), 4, "X")
        key(
            f"blink-{side}",
            {i: (center + close @ (base[i] - center)) - base[i] for i in b.sets[f"lid-{side}"]},
        )
    jaw = {}
    for i in set(b.sets["jaw"]):
        depth = min(1.0, max(0.0, (1.552 - base[i].z) / 0.035))
        jaw[i] = Vector((0, 0.002 * depth, -0.011 * (0.35 + 0.65 * depth)))
    key("jaw-open", jaw)
    smile = {}
    for i in b.sets["mouth-upper"] + b.sets["mouth-lower"]:
        edge = abs(base[i].x) / 0.022
        smile[i] = Vector((math.copysign(0.0028 * edge, base[i].x), 0.001 * edge, 0.0055 * edge * edge))
    key("smile", smile)


# ---- animation -------------------------------------------------------------------------
# A clip function maps t in [0, 1] to {bone: [(axis, degrees), ...]} in armature space,
# plus an optional "_hips" (x, y, z) offset in metres at 1.71 m. Positive x turns lean the
# spine forward and swing a limb forward-up; positive y turns move the left arm inward and
# the right arm outward.

AX = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}
HIPS_OFFSET = "_hips"


def pose_rotation(armature, bone_name, turns):
    """Compose armature-space turns [(axis, degrees)] into the bone's local rotation."""
    rest = armature.data.bones[bone_name].matrix_local.to_quaternion()
    q = Quaternion()
    for axis, degrees in turns:
        q = Quaternion(AX[axis], math.radians(degrees)) @ q
    return rest.inverted() @ q @ rest


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def clip_idle(t):
    w = 2 * math.pi * t
    return {
        "Spine1": [("x", 1.2 * math.sin(w))],
        "Spine2": [("x", 0.8 * math.sin(w + 0.4))],
        "Head": [("x", 1.6 * math.sin(w + 1.1)), ("z", 2.5 * math.sin(w * 1 + 2.0))],
        "LeftArm": [("y", -1.5 + 1.2 * math.sin(w + 0.3))],
        "RightArm": [("y", 1.5 - 1.2 * math.sin(w + 0.3))],
        "LeftForeArm": [("x", -8)],
        "RightForeArm": [("x", -10)],
    }


def gait(t, thigh_amp, knee_amp, arm_amp, lean, bob):
    w = 2 * math.pi * t
    thigh = thigh_amp * math.sin(w)
    knee_l = 5 + knee_amp * max(0.0, math.cos(w)) ** 1.5
    knee_r = 5 + knee_amp * max(0.0, -math.cos(w)) ** 1.5
    return {
        "LeftUpLeg": [("x", -thigh)],
        "RightUpLeg": [("x", thigh)],
        "LeftLeg": [("x", knee_l)],
        "RightLeg": [("x", knee_r)],
        "LeftFoot": [("x", 0.45 * (thigh - knee_l) + 4)],
        "RightFoot": [("x", 0.45 * (-thigh - knee_r) + 4)],
        "LeftArm": [("x", arm_amp * math.sin(w)), ("y", -2)],
        "RightArm": [("x", -arm_amp * math.sin(w)), ("y", 2)],
        "LeftForeArm": [("x", -14 - arm_amp * 0.4 * max(0.0, -math.sin(w)))],
        "RightForeArm": [("x", -14 - arm_amp * 0.4 * max(0.0, math.sin(w)))],
        "Spine": [("z", 4 * math.sin(w)), ("x", lean)],
        "Hips": [("z", -4 * math.sin(w))],
        "Head": [("z", -2 * math.sin(w)), ("x", -lean * 0.6)],
        HIPS_OFFSET: (0, 0, -bob * (1 - math.cos(4 * math.pi * t)) / 2),
    }


def clip_walk(t):
    return gait(t, 16.3, 40, 15, 0, 0)


def clip_hurry(t):
    return gait(t, 20, 52, 26, 7, 0.018)


def clip_wave(t):
    raise_amount = ease(t / 0.22) * (1 - ease((t - 0.8) / 0.2))
    swing = math.sin(2 * math.pi * 3 * t) * raise_amount
    return {
        "RightShoulder": [("y", 10 * raise_amount)],
        "RightArm": [("y", 138 * raise_amount), ("x", -12 * raise_amount)],
        "RightForeArm": [("y", 22 * raise_amount + 24 * swing)],
        "RightHand": [("y", 8 * swing)],
        "Head": [("z", -6 * raise_amount), ("x", -3 * raise_amount)],
        "Spine2": [("y", -3 * raise_amount)],
        "LeftForeArm": [("x", -8)],
    }


def clip_check_phone(t):
    w = 2 * math.pi * t
    return {
        "RightArm": [("x", -30), ("y", -14)],
        "RightForeArm": [("x", -96 + 3 * math.sin(w * 2)), ("y", -8)],
        "RightHand": [("x", 12 + 4 * math.sin(w * 3))],
        "Head": [("x", 20 + 2 * math.sin(w)), ("z", 3 * math.sin(w * 0.5 * 2))],
        "Neck": [("x", 6)],
        "Spine2": [("x", 4)],
        "LeftArm": [("x", -4), ("y", -2)],
        "LeftForeArm": [("x", -12)],
    }


def clip_sit(t):
    """Seated on a bench, holding something open at chest height (the reader's paper)."""
    w = 2 * math.pi * t
    turn = math.sin(w) * 0.5 + 0.5  # a slow look across the page
    return {
        HIPS_OFFSET: (0, 0.05, -(0.93 - SEAT_HEIGHT - 0.085)),
        "LeftUpLeg": [("x", -86), ("z", 4)],
        "RightUpLeg": [("x", -86), ("z", -4)],
        "LeftLeg": [("x", 84)],
        "RightLeg": [("x", 84)],
        "LeftFoot": [("x", 2)],
        "RightFoot": [("x", 2)],
        "Spine": [("x", -4)],
        "Spine1": [("x", 2 + 0.6 * math.sin(w))],
        "Spine2": [("x", 5 + 0.6 * math.sin(w + 0.5))],
        "Head": [("x", 14 + 1.5 * math.sin(w * 2)), ("z", -6 + 12 * turn)],
        "LeftArm": [("x", -28), ("y", 14)],
        "RightArm": [("x", -28), ("y", -14)],
        "LeftForeArm": [("x", -70), ("z", -18)],
        "RightForeArm": [("x", -70), ("z", 18)],
        # Wrists bent back so a held sheet stands up, its top tipped toward the reader.
        "LeftHand": [("x", 84)],
        "RightHand": [("x", 84)],
    }


def clip_watch_train(t):
    """Head and shoulders turned down the line, following something that is not there yet."""
    w = 2 * math.pi * t
    look = 34 + 8 * math.sin(w)
    return {
        "Spine1": [("z", look * 0.12)],
        "Spine2": [("z", look * 0.2), ("x", 0.8 * math.sin(w + 0.4))],
        "Neck": [("z", look * 0.25)],
        "Head": [("z", look * 0.45), ("x", -3 + 1.2 * math.sin(w * 2))],
        "LeftArm": [("y", -1.5)],
        "RightArm": [("y", 1.5)],
        "LeftForeArm": [("x", -8)],
        "RightForeArm": [("x", -10)],
        "Hips": [("z", 3)],
    }


def clip_shelter(t):
    """Hunched against the weather, shoulders up and arms folded."""
    w = 2 * math.pi * t
    shiver = 1.2 * math.sin(w * 6)
    return {
        "Spine1": [("x", 5)],
        "Spine2": [("x", 8 + 0.5 * shiver)],
        "Neck": [("x", 6)],
        "Head": [("x", 8 + 1.5 * math.sin(w))],
        "LeftShoulder": [("y", -9 + shiver)],
        "RightShoulder": [("y", 9 - shiver)],
        "LeftArm": [("x", -22), ("y", 22)],
        "RightArm": [("x", -22), ("y", -22)],
        "LeftForeArm": [("x", -98), ("z", -58)],
        "RightForeArm": [("x", -98), ("z", 58)],
    }


def clip_chat(t):
    """Talking with someone nearby: an open right hand and small nods."""
    w = 2 * math.pi * t
    return {
        "RightArm": [("x", -14), ("y", 6)],
        "RightForeArm": [("x", -68 + 10 * math.sin(w * 2)), ("y", 10 * math.sin(w))],
        "RightHand": [("y", 12 * math.sin(w * 2 + 0.5))],
        "LeftForeArm": [("x", -10)],
        "Head": [("x", 3 * math.sin(w * 3)), ("z", 5 * math.sin(w))],
        "Spine2": [("z", 2 * math.sin(w))],
    }


def clip_stretch(t):
    """Arms up overhead and back down; starts and ends at rest."""
    reach = (1 - math.cos(2 * math.pi * t)) / 2
    return {
        "LeftArm": [("y", -158 * reach)],
        "RightArm": [("y", 158 * reach)],
        "LeftForeArm": [("y", -12 * reach)],
        "RightForeArm": [("y", 12 * reach)],
        "Spine2": [("x", -6 * reach)],
        "Head": [("x", -10 * reach)],
    }


def clip_board(t):
    """A single step up through a train door: right foot up, weight forward, left follows."""
    lift = ease(t / 0.35) * (1 - ease((t - 0.55) / 0.3))
    follow = ease((t - 0.45) / 0.35) * (1 - ease((t - 0.85) / 0.15))
    lean = ease(t / 0.4)
    return {
        HIPS_OFFSET: (0, -0.16 * ease((t - 0.3) / 0.6), 0.1 * ease((t - 0.35) / 0.4)),
        "RightUpLeg": [("x", -44 * lift)],
        "RightLeg": [("x", 58 * lift)],
        "LeftUpLeg": [("x", -30 * follow + 6 * lift)],
        "LeftLeg": [("x", 52 * follow)],
        "Spine": [("x", 9 * lean)],
        "Spine2": [("x", 3 * lean)],
        "Head": [("x", -6 * lean)],
        "LeftArm": [("x", -10 * lean)],
        "RightArm": [("x", 12 * lean)],
        "LeftForeArm": [("x", -20)],
        "RightForeArm": [("x", -16)],
    }


CLIPS = [
    # name, frames (30 fps), function, loops
    ("idle", 120, clip_idle, True),
    ("walk", 36, clip_walk, True),
    ("hurry", 27, clip_hurry, True),
    ("wave", 60, clip_wave, True),
    ("check-phone", 90, clip_check_phone, True),
    ("sit", 150, clip_sit, True),
    ("watch-train", 120, clip_watch_train, True),
    ("shelter", 90, clip_shelter, True),
    ("chat", 90, clip_chat, True),
    ("stretch", 120, clip_stretch, True),
    ("board", 36, clip_board, False),
]


def with_posture(turns):
    """Add the profile's stoop: the upper back rounds and the head lifts to compensate."""
    stoop = PROFILE["stoop"]
    if not stoop:
        return turns
    turns = {bone: list(value) if bone != HIPS_OFFSET else value for bone, value in turns.items()}
    for bone, degrees in (("Spine1", stoop * 0.4), ("Spine2", stoop * 0.6), ("Neck", stoop * 0.3), ("Head", -stoop * 0.7)):
        turns.setdefault(bone, []).append(("x", degrees))
    return turns


def evaluate(fn, t):
    return with_posture(fn(t))


def apply_pose(armature, turns, scale):
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_quaternion = pose_rotation(armature, pose_bone.name, turns.get(pose_bone.name, []))
    hips = armature.pose.bones["Hips"]
    offset = Vector(turns.get(HIPS_OFFSET, (0, 0, 0))) * scale
    hips.location = armature.data.bones["Hips"].matrix_local.to_quaternion().inverted() @ offset


def build_clips(armature, scale):
    animation = armature.animation_data_create()
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
    for name, frames, fn, _loop in CLIPS:
        action = bpy.data.actions.new(name)
        animation.action = action
        for frame in range(frames + 1):
            apply_pose(armature, evaluate(fn, frame / frames), scale)
            for pose_bone in armature.pose.bones:
                pose_bone.keyframe_insert("rotation_quaternion", frame=1 + frame, group=pose_bone.name)
            armature.pose.bones["Hips"].keyframe_insert("location", frame=1 + frame, group="Hips")
        track = animation.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.name = name
        animation.action = None
    reset_pose(armature)


def clip_report(armature, name, frames, fn, loop):
    first = evaluate(fn, 0.0)
    last = evaluate(fn, 1.0)
    worst = 0.0
    for bone in (set(first) | set(last)) - {HIPS_OFFSET}:
        a = pose_rotation(armature, bone, first.get(bone, []))
        b = pose_rotation(armature, bone, last.get(bone, []))
        worst = max(worst, math.degrees(a.rotation_difference(b).angle))
    gap = (Vector(first.get(HIPS_OFFSET, (0, 0, 0))) - Vector(last.get(HIPS_OFFSET, (0, 0, 0)))).length
    return {
        "frames": frames,
        "seconds": round(frames / 30, 3),
        "loop": loop,
        "loopErrorDegrees": round(worst, 4),
        "loopErrorMetres": round(gap, 4),
    }


def foot_speed(armature, fn, frames, scale):
    """Average backward speed of the left foot while it is on the ground during a gait."""
    positions = []
    for frame in range(frames + 1):
        apply_pose(armature, evaluate(fn, frame / frames), scale)
        bpy.context.view_layer.update()
        positions.append(armature.matrix_world @ armature.pose.bones["LeftFoot"].head)
    reset_pose(armature)
    lowest = min(p.z for p in positions)
    stance = [i for i, p in enumerate(positions) if p.z < lowest + 0.012 * scale]
    runs, current = [], [stance[0]]
    for i in stance[1:]:
        if i == current[-1] + 1:
            current.append(i)
        else:
            runs.append(current)
            current = [i]
    runs.append(current)
    run = max(runs, key=len)
    travel = positions[run[-1]].y - positions[run[0]].y
    seconds = (run[-1] - run[0]) / 30
    return round(travel / seconds, 3) if seconds else None


def seated_seat_height(armature, body, scale, leg_vertices):
    """Height of the lowest thigh vertex in the `sit` pose: where the bench surface must be."""
    apply_pose(armature, evaluate(clip_sit, 0.0), scale)
    bpy.context.view_layer.update()
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    groups = {g.index: g.name for g in body.vertex_groups}
    heights = []
    for index in leg_vertices:
        vertex = mesh.vertices[index]
        names = {groups[g.group] for g in body.data.vertices[index].groups if g.weight > 0.5}
        if names & {"LeftUpLeg", "RightUpLeg"}:
            heights.append((body.matrix_world @ vertex.co).z)
    evaluated.to_mesh_clear()
    reset_pose(armature)
    return round(min(heights), 3)


def reset_pose(armature):
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_quaternion = Quaternion()
        pose_bone.location = (0, 0, 0)
    bpy.context.view_layer.update()


def apply_height(objects, armature, scale):
    """Scale the finished rig and meshes to the profile's height and apply it to the data."""
    armature.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True, properties=False)


def build(cast):
    use_profile(cast)
    name = PROFILE["asset"]
    scale = PROFILE["height"] / BASE_HEIGHT
    out = ARGS.out if ARGS.out and ARGS.cast != "all" else os.path.join(ROOT, f"apps/game/public/models/characters/{name}.glb")
    report_path = ARGS.report if ARGS.report and ARGS.cast != "all" else os.path.join(HERE, f"{cast}.report.json")

    ma.reset_scene()
    bones = bone_table()
    builder = Builder()
    build_body(builder)
    build_head(builder)
    smooth_flags = list(builder.smooth)
    material = ma.vertex_color_material(name)
    body = ma.mesh_from_bmesh(f"{name}-body", builder.bm, builder.colors, material)
    for polygon in body.data.polygons:
        polygon.use_smooth = smooth_flags[polygon.index]
    armature = create_armature(name, bones)
    skin(body, armature, builder, bones)
    add_shape_keys(body, builder)
    meshes = [body]
    if "newspaper" in PROFILE["props"]:
        paper_builder = Builder()
        build_newspaper(paper_builder)
        paper = ma.mesh_from_bmesh("newspaper", paper_builder.bm, paper_builder.colors, material)
        skin(paper, armature, paper_builder, bones)
        meshes.append(paper)

    # Children first, so their parent inverse stays consistent, then the armature.
    apply_height([*meshes, armature], armature, scale)
    build_clips(armature, scale)

    walk_speed = foot_speed(armature, clip_walk, 36, scale)
    hurry_speed = foot_speed(armature, clip_hurry, 27, scale)
    seat = seated_seat_height(armature, body, scale, set(builder.sets["leg"]))
    # The game reads these from the armature node's extras.
    armature["cast"] = cast
    armature["walkSpeed"] = walk_speed
    armature["hurrySpeed"] = hurry_speed
    armature["seatHeight"] = seat

    height = max(v.co.z for v in body.data.vertices)
    lowest = min(v.co.z for v in body.data.vertices)
    report = {
        "asset": name,
        "cast": cast,
        "person": PROFILE["person"],
        "blender": bpy.app.version_string,
        "triangles": sum(ma.triangle_count(m) for m in meshes),
        "vertices": sum(len(m.data.vertices) for m in meshes),
        "meshes": [m.name for m in meshes],
        "materials": len(body.data.materials),
        "bones": [bone for bone, *_ in bones],
        "boneCount": len(bones),
        "shapeKeys": [k.name for k in body.data.shape_keys.key_blocks[1:]],
        "shapeKeyDefaults": {k.name: k.value for k in body.data.shape_keys.key_blocks[1:]},
        "clips": {clip: clip_report(armature, clip, frames, fn, loop) for clip, frames, fn, loop in CLIPS},
        "heightMetres": round(height, 4),
        "targetHeightMetres": PROFILE["height"],
        "lowestZ": round(lowest, 4),
        "walkFootSpeed": walk_speed,
        "walkTargetSpeed": round(WALK_SPEED * scale, 3),
        "hurryFootSpeed": hurry_speed,
        "hurryTargetSpeed": round(HURRY_SPEED * scale, 3),
        "seatHeight": seat,
        "heightWithinTwoCentimetres": abs(height - PROFILE["height"]) <= 0.02,
        "facing": "-Y in Blender, +Z in three.js",
    }
    os.makedirs(os.path.dirname(out), exist_ok=True)
    ma.export_glb(out, [armature, *meshes], apply=False)
    report["glbBytes"] = os.path.getsize(out)
    ma.write_report(report_path, report)
    if ARGS.render:
        render(os.path.join(ARGS.render, cast), armature, body, scale)
    print("REPORT", report)


def render(folder, armature, body, scale):
    os.makedirs(folder, exist_ok=True)
    top = PROFILE["height"]
    # Rest views: mute the clip tracks so the bind pose shows.
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    reset_pose(armature)
    ma.render_views(
        folder,
        (0, 0, 0.52 * top),
        {
            "front": ((0, -4.2, 0.58 * top), 50),
            "three-quarter": ((2.6, -3.2, 0.7 * top), 50),
            "side": ((4.2, 0, 0.58 * top), 50),
        },
    )
    face = (0, -0.02, 0.918 * top)
    ma.render_views(folder, face, {"face": ((0.25, -0.9, 0.935 * top), 85)})
    # One three-quarter view per clip at a third of the cycle, plus the face with each key.
    for name, frames, _fn, _loop in CLIPS:
        armature.animation_data.action = bpy.data.actions[name]
        bpy.context.scene.frame_set(1 + frames // 3)
        ma.render_views(folder, (0, 0, 0.5 * top), {f"clip-{name}": ((2.6, -3.2, 0.76 * top), 45)})
    armature.animation_data.action = None
    reset_pose(armature)
    keys = body.data.shape_keys.key_blocks
    for key in keys[1:]:
        key.value = 1.0
        ma.render_views(folder, face, {f"face-{key.name}": ((0.25, -0.9, 0.935 * top), 85)})
        key.value = 0.0


for cast_name in PROFILES if ARGS.cast == "all" else [ARGS.cast]:
    build(cast_name)
