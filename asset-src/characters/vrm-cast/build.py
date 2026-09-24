"""Maple Line VRM test cast: soft, anime-proportioned people built entirely from data.

This is the pipeline test for the anime character direction (docs/research/ANIME-CHARACTERS.md).
It proves the VRM path end to end before any outside avatar is approved: a VRM 1.0 humanoid
skeleton in T-pose, smooth skin-modifier bodies, clothes as material regions plus a few
extra meshes, a face made of layered decals whose shape keys follow the VRM expression
presets, strand hair with spring-bone chains, and MToon parameters in a sidecar file.

    blender -b --factory-startup --python-exit-code 1 \\
      --python asset-src/characters/vrm-cast/build.py -- --cast sato
    node asset-src/characters/vrm-cast/make-vrm.mjs sato

Riko's test profile is retired: asset-src/characters/concept-cast builds her VRM. The school
outfit and ponytail branches below were hers and stay unused until another profile needs them.

`--cast all` builds every profile. Blender writes `<cast>.glb` and `<cast>.vrm.json` into
the build folder beside this script (ignored by git) and a report beside this script;
make-vrm.mjs adds the VRM extensions and writes apps/game/public/models/characters/vrm/.
Coordinates here are Blender's: Z up, the character faces -Y and its left is +X.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "lib"))
import maple_assets as ma  # noqa: E402

BUILD = os.path.join(HERE, "build")

# ---------------------------------------------------------------------------------------
# Profiles. Measurements below are written for a 1.58 m teenage girl and scaled per profile.
# `shoulders`, `hips` and `limbs` widen or narrow the body; `head` scales the head against
# the body (adults have smaller heads relative to height).

PROFILES = {
    # Mr. Sato, 44, office commuter. Stands in for commuter-1.
    "sato": {
        "person": "commuter-1",
        "title": "Mr. Sato (test)",
        "height": 1.72,
        "shoulders": 1.2,
        "hips": 0.95,
        "chest": 1.12,
        "limbs": 1.18,
        "head": 0.93,
        "hair": "short",
        "outfit": "suit",
        "brows": 1.0,
        "blush": False,
        "eyes": {"height": 0.72, "iris": "#3a2a22", "irisLight": "#6e5040", "lash": "#1e1616"},
        "colors": {
            "skin": "#eccaa8",
            "hair": "#1e1a1c",
            "top": "#3a4150",
            "shirt": "#eef0f2",
            "ribbon": "#2f4f7a",
            "lower": "#343844",
            "socks": "#22242a",
            "shoes": "#1c1a1a",
            "mouth": "#9a5a52",
            "blush": "#e8a08a",
            "brow": "#221c1c",
        },
    },
    # Mr. Ishida, 70s, reads the paper on the Momiji bench every evening. Stands in for reader-1.
    "ishida": {
        "person": "reader-1",
        "title": "Mr. Ishida (test)",
        "height": 1.64,
        "shoulders": 1.12,
        "hips": 1.0,
        "chest": 1.1,
        "limbs": 1.1,
        "head": 0.95,
        "hair": "elder",
        "outfit": "cardigan",
        "brows": 1.0,
        "blush": False,
        "glasses": True,
        "newspaper": True,
        "posture": {"stoop": 9},
        "eyes": {"height": 0.6, "iris": "#3e3028", "irisLight": "#6a5448", "lash": "#3a302c"},
        "colors": {
            "skin": "#e6c2a0",
            "hair": "#c9c4bc",
            "top": "#8a6a4a",
            "shirt": "#e6e0d2",
            "ribbon": "#7a5a3a",
            "lower": "#5a5854",
            "socks": "#3a3632",
            "shoes": "#3e2e24",
            "mouth": "#9a6258",
            "blush": "#e4a490",
            "brow": "#bdb6ac",
            "glasses": "#3a302a",
            "paper": "#ece6d6",
            "print": "#8a847a",
        },
    },
    # Grandma Fusae, 80, The 17:42. A staged drama role (apps/game/src/drama/drama-roles.js):
    # grey hair in a bun, round glasses, a knitted cardigan over a long blue dress.
    "fusae": {
        "person": "fusae",
        "title": "Grandma Fusae (test)",
        "height": 1.47,
        "shoulders": 1.02,
        "hips": 1.12,
        "chest": 1.08,
        "limbs": 1.04,
        "head": 0.97,
        "hair": "bun",
        "outfit": "cardigan",
        "skirt": True,
        "hem": 0.4,
        "brows": 1.0,
        "blush": False,
        "glasses": True,
        "posture": {"stoop": 7},
        "eyes": {"height": 0.62, "iris": "#3e3028", "irisLight": "#6a5448", "lash": "#3a302c"},
        "colors": {
            "skin": "#eac6a6",
            "hair": "#bdb8b0",
            "top": "#8c4b37",
            "shirt": "#3e5f93",
            "ribbon": "#6b3a2a",
            "lower": "#34518a",
            "socks": "#5a4e46",
            "shoes": "#3a2a22",
            "mouth": "#a0625a",
            "blush": "#e4a490",
            "brow": "#aca69e",
            "glasses": "#8a6a3a",
        },
    },
    # Aoi, 24, drives the Aonuma bus in The 17:42 (drama-roles.js `aoi`): ponytail, teal
    # uniform jacket over a cream shirt, a peaked cap.
    "aoi": {
        "person": "aoi",
        "title": "Aoi (test)",
        "height": 1.6,
        "shoulders": 1.04,
        "hips": 1.0,
        "chest": 1.02,
        "limbs": 1.03,
        "head": 0.98,
        "hair": "ponytail",
        "outfit": "suit",
        "cap": True,
        "brows": 0.3,
        "eyes": {"height": 0.95, "iris": "#4a3024", "irisLight": "#9a6a44", "lash": "#261a1a"},
        "colors": {
            "skin": "#f2d4bc",
            "hair": "#2e2220",
            "hairTie": "#1f8a86",
            "top": "#1f7d79",
            "shirt": "#efe6cf",
            "ribbon": "#145c5a",
            "lower": "#2c3a48",
            "socks": "#22242a",
            "shoes": "#1c1a1a",
            "mouth": "#b8505a",
            "blush": "#f08a8a",
            "brow": "#3a2828",
            "cap": "#1f7d79",
            "capBand": "#efe6cf",
            "capBrim": "#1b1f1f",
        },
    },
}

# Parsed in the main block, so asset-src/characters/crowd-kit/build.py can import this file.
ARGS = None
P = None
S = 1.0  # height scale against the 1.58 m base


def use_profile(name):
    global P, S
    P = PROFILES[name]
    S = P["height"] / 1.58


def has_skirt():
    """School uniforms and dresses have a skirt part; everything else has trousers."""
    return P.get("skirt", P["outfit"] == "school")


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


# ---------------------------------------------------------------------------------------
# Skeleton: VRM 1.0 humanoid bone names, T-pose, facing -Y (glTF +Z).


def joints():
    """name -> (head, tail, parent, radius). Radii are the flesh around the bone."""
    sw, hw, lw = P["shoulders"], P["hips"], P["limbs"]

    def v(x, y, z):
        return Vector((x * S, y * S, z * S))

    j = {}

    def bone(name, head, tail, parent, radius):
        j[name] = (head, tail, parent, radius * S)

    bone("hips", v(0, 0.005, 0.86), v(0, 0.005, 0.96), None, 0.13 * hw)
    bone("spine", v(0, 0.005, 0.96), v(0, 0, 1.06), "hips", 0.1)
    bone("chest", v(0, 0, 1.06), v(0, -0.004, 1.17), "spine", 0.1 * P["chest"])
    bone("upperChest", v(0, -0.004, 1.17), v(0, 0, 1.27), "chest", 0.1 * P["chest"])
    bone("neck", v(0, 0.004, 1.27), v(0, 0.008, 1.345), "upperChest", 0.04 * lw)
    head_z = 1.345 + 0.225 * P["head"]
    bone("head", v(0, 0.008, 1.345), v(0, 0.008, head_z), "neck", 0.1 * P["head"])
    for side, sx in (("left", 1), ("right", -1)):
        L = "Left" if side == "left" else "Right"
        ax = lambda x: x * sx * sw  # noqa: E731
        bone(f"{side}Shoulder", v(ax(0.02), 0, 1.255), v(ax(0.135), 0, 1.26), "upperChest", 0.045 * lw)
        arm_len = 0.245 * (1 + (sw - 1) * 0.4)
        x0 = 0.135 * sw
        bone(f"{side}UpperArm", v(sx * x0, 0, 1.26), v(sx * (x0 + arm_len), 0, 1.26), f"{side}Shoulder", 0.036 * lw)
        x1 = x0 + arm_len
        x2 = x1 + 0.225 * (1 + (sw - 1) * 0.4)
        bone(f"{side}LowerArm", v(sx * x1, 0, 1.26), v(sx * x2, 0, 1.26), f"{side}UpperArm", 0.027 * lw)
        bone(f"{side}Hand", v(sx * x2, 0, 1.26), v(sx * (x2 + 0.07), 0, 1.259), f"{side}LowerArm", 0.02 * lw)
        hx = x2 + 0.07
        for finger, fy, ln in (("Index", -0.02, 1.0), ("Middle", -0.0068, 1.08), ("Ring", 0.0068, 1.0), ("Little", 0.019, 0.8)):
            a = hx
            for seg, length in (("Proximal", 0.028), ("Intermediate", 0.018), ("Distal", 0.016)):
                b = a + length * ln
                bone(f"{side}{finger}{seg}", v(sx * a, fy * lw, 1.257), v(sx * b, fy * lw, 1.256),
                     f"{side}Hand" if seg == "Proximal" else f"{side}{finger}{prev}", 0.0068 * lw)
                prev = seg
                a = b
        tb = [(x2 + 0.012, -0.016), (x2 + 0.035, -0.036), (x2 + 0.055, -0.049), (x2 + 0.071, -0.057)]
        for i, seg in enumerate(("Metacarpal", "Proximal", "Distal")):
            (a, ay), (b, by) = tb[i], tb[i + 1]
            bone(f"{side}Thumb{seg}", v(sx * a, ay * lw, 1.252 - i * 0.003), v(sx * b, by * lw, 1.249 - i * 0.003),
                 f"{side}Hand" if i == 0 else f"{side}Thumb{('Metacarpal', 'Proximal')[i - 1]}", 0.008 * lw)
        lx = 0.082 * hw
        bone(f"{side}UpperLeg", v(sx * lx, 0.005, 0.84), v(sx * (lx + 0.006), 0, 0.46), "hips", 0.068 * lw)
        bone(f"{side}LowerLeg", v(sx * (lx + 0.006), 0, 0.46), v(sx * (lx + 0.008), 0.012, 0.075), f"{side}UpperLeg", 0.045 * lw)
        bone(f"{side}Foot", v(sx * (lx + 0.008), 0.012, 0.075), v(sx * (lx + 0.008), -0.075, 0.022), f"{side}LowerLeg", 0.03 * lw)
        bone(f"{side}Toes", v(sx * (lx + 0.008), -0.075, 0.022), v(sx * (lx + 0.008), -0.125, 0.022), f"{side}Foot", 0.024 * lw)
        del L
    return j


def head_center():
    return Vector((0, 0.006, (1.333 + 0.118 * P["head"]) * S))


def head_radii():
    k = P["head"] * S
    return Vector((0.094 * k, 0.1 * k, 0.107 * k))


# ---------------------------------------------------------------------------------------
# Body: a skin-modifier graph through the joints, subdivided once and shaded smooth.


def body_graph(j):
    V, E, R = [], [], []

    def node(co, r, parent=None):
        V.append(Vector(co))
        R.append(r if isinstance(r, tuple) else (r, r))
        if parent is not None:
            E.append((parent, len(V) - 1))
        return len(V) - 1

    sw, hw, ch, lw = P["shoulders"], P["hips"], P["chest"], P["limbs"]
    s = S
    p0 = node((0, 0.005 * s, 0.8 * s), (0.112 * s * hw, 0.088 * s))
    p1 = node((0, 0.005 * s, 0.9 * s), (0.128 * s * hw, 0.094 * s), p0)
    waist = 0.09 if has_skirt() else 0.1
    p2 = node((0, 0, 1.03 * s), (waist * s * max(1, sw * 0.92), 0.072 * s * ch), p1)
    p3 = node((0, -0.005 * s, 1.15 * s), (0.106 * s * sw * 0.97, 0.082 * s * ch), p2)
    p4 = node((0, 0, 1.235 * s), (0.11 * s * sw, 0.072 * s * ch), p3)
    p5 = node((0, 0.005 * s, 1.285 * s), (0.038 * s * lw, 0.037 * s * lw), p4)
    node((0, 0.01 * s, 1.37 * s), (0.029 * s * lw, 0.031 * s * lw), p5)
    for side, sx in (("left", 1), ("right", -1)):
        up, low, foot = j[f"{side}UpperLeg"], j[f"{side}LowerLeg"], j[f"{side}Foot"]
        trousers = not has_skirt()
        tk = 1.08 if trousers else 1.0
        l0 = node(up[0] + Vector((0, 0, -0.04 * s)), 0.07 * s * lw * tk, p0)
        l1 = node(up[0].lerp(up[1], 0.45), 0.06 * s * lw * tk, l0)
        l2 = node(up[1], 0.043 * s * lw * tk, l1)
        l3 = node(low[0].lerp(low[1], 0.33), 0.046 * s * lw * tk, l2)
        l4 = node(low[1] + Vector((0, 0, 0.01 * s)), (0.028 * s * lw * (1.25 if trousers else 1)), l3)
        l5 = node(foot[1] + Vector((0, -0.01 * s, 0.008 * s)), 0.031 * s * lw, l4)
        node(j[f"{side}Toes"][1] + Vector((0, 0.005 * s, 0.006 * s)), 0.023 * s * lw, l5)
        sh, ua, la, hand = j[f"{side}Shoulder"], j[f"{side}UpperArm"], j[f"{side}LowerArm"], j[f"{side}Hand"]
        a0 = node(Vector((sx * 0.07 * s * sw, 0, 1.25 * s)), 0.05 * s * lw, p4)
        a1 = node(ua[0] + Vector((sx * 0.005 * s, 0, 0)), 0.043 * s * lw, a0)
        a2 = node(la[0], 0.03 * s * lw, a1)
        a3 = node(la[1], 0.02 * s * lw, a2)
        a4 = node(hand[0].lerp(hand[1], 0.6), (0.011 * s * lw, 0.026 * s * lw), a3)
        for finger in ("Index", "Middle", "Ring", "Little"):
            f0 = node(j[f"{side}{finger}Proximal"][0], 0.0074 * s * lw, a4)
            f1 = node(j[f"{side}{finger}Intermediate"][0], 0.0068 * s * lw, f0)
            node(j[f"{side}{finger}Distal"][1], 0.0058 * s * lw, f1)
        t0 = node(j[f"{side}ThumbMetacarpal"][0].lerp(j[f"{side}ThumbMetacarpal"][1], 0.4), 0.0095 * s * lw, a3)
        t1 = node(j[f"{side}ThumbProximal"][0], 0.0078 * s * lw, t0)
        node(j[f"{side}ThumbDistal"][1], 0.0064 * s * lw, t1)
        del sh
    return V, E, R


def build_body_mesh(j):
    V, E, R = body_graph(j)
    mesh = bpy.data.meshes.new("Body")
    mesh.from_pydata([tuple(v) for v in V], E, [])
    obj = bpy.data.objects.new("Body", mesh)
    bpy.context.scene.collection.objects.link(obj)
    activate(obj)
    skin = obj.modifiers.new("skin", "SKIN")
    skin.use_smooth_shade = True
    skin.branch_smoothing = 0.5
    for i, r in enumerate(R):
        mesh.skin_vertices[0].data[i].radius = r
    mesh.skin_vertices[0].data[0].use_root = True
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    bpy.ops.object.modifier_apply(modifier="skin")
    bpy.ops.object.modifier_apply(modifier="sub")
    return obj


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def build_head_bm():
    """Anime head: a round cranium, a narrow chin, a flat-ish face."""
    C, Rr = head_center(), head_radii()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=28, radius=1.0)
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
    # Ears, mostly under the hair for long styles.
    for sx in (1, -1):
        ear = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1.0)
        for vert in ear["verts"]:
            x, y, z = vert.co
            vert.co = C + Vector((sx * (Rr.x * 0.9 + x * 0.012 * S), 0.012 * S + y * 0.016 * S, -0.018 * S + z * 0.026 * S))
    return bm


# ---------------------------------------------------------------------------------------
# Materials. Base colours are sRGB hex; MToon settings go into the sidecar for make-vrm.mjs.

MATERIALS = {}


def material(name, color, double=False, mtoon=None):
    if name in MATERIALS:
        return MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = ma.hex_color(color)
    principled.inputs["Roughness"].default_value = 1.0
    principled.inputs["Metallic"].default_value = 0.0
    mat.use_backface_culling = not double
    mat.diffuse_color = ma.hex_color(color)
    MATERIALS[name] = mat
    mat["mtoon"] = mtoon or "cloth"
    return mat


def mat_index(obj, mat):
    mats = obj.data.materials
    for i, m in enumerate(mats):
        if m == mat:
            return i
    mats.append(mat)
    return len(mats) - 1


def body_materials():
    c = P["colors"]
    return {
        "skin": material("skin", c["skin"], mtoon="skin"),
        "top": material("top", c["top"]),
        "shirt": material("shirt", c["shirt"]),
        "lower": material("lower", c["lower"], double=has_skirt()),
        "socks": material("socks", c["socks"]),
        "shoes": material("shoes", c["shoes"], mtoon="shoes"),
        "ribbon": material("ribbon", c["ribbon"]),
    }


def nearest_bone(co, j, names):
    best = None
    for name in names:
        head, tail, _parent, radius = j[name]
        axis = tail - head
        t = max(0.0, min(1.0, (co - head).dot(axis) / axis.length_squared))
        d = (co - (head + axis * t)).length - radius
        if best is None or d < best[0]:
            best = (d, name, t)
    return best


def region(co, bone, t):
    """Which clothing material covers a body point (face centre in Blender space)."""
    outfit = P["outfit"]
    z = co.z / S
    if bone in ("head", "neck"):
        if bone == "neck" and z < 1.3 and outfit != "school":
            return "shirt"
        return "skin"
    if "Thumb" in bone or any(f in bone for f in ("Index", "Middle", "Ring", "Little")) or bone.endswith("Hand"):
        return "skin"
    if bone.endswith("LowerArm") and t > 0.9:
        return "shirt" if outfit != "cardigan" else "top"
    if bone.endswith(("Shoulder", "UpperArm", "LowerArm")):
        return "top"
    if bone.endswith(("Foot", "Toes")) or z < 0.1:
        return "shoes"
    if bone.endswith(("UpperLeg", "LowerLeg")):
        if outfit == "school":
            if z < 0.43:
                return "socks"
            return "skin" if z < 0.66 else "lower"
        if has_skirt():
            # Stockings below a long dress.
            return "socks" if z < P.get("hem", 0.61) + 0.04 else "lower"
        return "lower"
    # Torso.
    front = co.y < 0
    if front and z > 1.1:
        opening = (z - 1.1) / 0.17 * 0.05 * S * P["shoulders"]
        if abs(co.x) < opening:
            return "shirt"
    if outfit == "school":
        return "top" if z > 0.99 else "lower"
    if outfit == "suit":
        return "top" if z > 0.8 else "lower"
    return "top" if z > 0.84 else "lower"


# ---------------------------------------------------------------------------------------
# Weights: nearest bone by distance to its flesh surface, blended with the parent or the
# nearest child across each joint so elbows and knees bend smoothly.


def children_of(j):
    kids = {}
    for name, (_h, _t, parent, _r) in j.items():
        if parent:
            kids.setdefault(parent, []).append(name)
    return kids


def body_weights(co, j, names, kids):
    d, bone, t = nearest_bone(co, j, names)
    parent = j[bone][2]
    if t < 0.3 and parent in names:
        w = 0.5 * (1 - t / 0.3)
        return {bone: 1 - w, parent: w}
    options = [k for k in kids.get(bone, []) if k in names]
    if t > 0.7 and options:
        child = nearest_bone(co, j, options)[1]
        w = 0.5 * (t - 0.7) / 0.3
        return {bone: 1 - w, child: w}
    return {bone: 1.0}


def assign(obj, weights_fn):
    groups = {}
    for vert in obj.data.vertices:
        for name, w in weights_fn(obj.matrix_world @ vert.co).items():
            if w <= 0:
                continue
            if name not in groups:
                groups[name] = obj.vertex_groups.new(name=name)
            groups[name].add([vert.index], w, "REPLACE")


# ---------------------------------------------------------------------------------------
# Clothing extras: skirt, collar, ribbon or tie, glasses, newspaper.


def add_part(bm, mat, name):
    """A bmesh as a new object; joined into the body later."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def ring_loft(bm, rings, closed=True):
    """rings: list of vertex lists with equal length; connects consecutive rings with quads."""
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n if closed else n - 1):
            k = (i + 1) % n
            bm.faces.new((a[i], a[k], b[k], b[i]))


def build_skirt():
    bm = bmesh.new()
    pleats = 32
    top, hem = 1.0 * S, P.get("hem", 0.61) * S
    rows = 7 if hem > 0.55 * S else 10
    rings = []
    for r in range(rows + 1):
        t = r / rows
        z = lerp(top, hem, t)
        rx = lerp(0.098, 0.2, t ** 0.9) * S * P["hips"]
        ry = lerp(0.078, 0.165, t ** 0.9) * S
        ring = []
        for i in range(pleats * 2):
            a = 2 * math.pi * i / (pleats * 2)
            fold = (1 if i % 2 == 0 else -1) * lerp(0.012, 0.06, t)
            ring.append(bm.verts.new((math.sin(a) * rx * (1 + fold), -math.cos(a) * ry * (1 + fold), z)))
        rings.append(ring)
    ring_loft(bm, rings)
    return add_part(bm, MATERIALS["lower"], "skirt")


def surface_y(bvh, x, z, front=True):
    """Front (or back) surface depth of a mesh at (x, z), by a ray along ±Y."""
    origin = Vector((x, -2.0 if front else 2.0, z))
    hit = bvh.ray_cast(origin, Vector((0, 1 if front else -1, 0)), 4.0)
    return hit[0], hit[1]


def build_collar_and_tie(body_bvh):
    s = S * P["shoulders"]
    outfit = P["outfit"]
    bm = bmesh.new()

    def surface_out(z, d, extra):
        origin = Vector((0, 0.004 * S, z))
        # Short rays: sideways at shoulder height a long ray runs down the arm to the hand.
        hit = body_bvh.ray_cast(origin, Vector((d[0], d[1], 0)), 0.09 * S * P["shoulders"])
        base = hit[0] if hit[0] is not None else origin + Vector((d[0], d[1], 0)) * 0.06 * S
        return base + Vector((d[0], d[1], 0)) * extra

    # The shirt collar: a band round the neck base, open at the front, lying on the shoulders.
    n = 18
    inner, outer = [], []
    for i in range(n + 1):
        a = math.radians(lerp(24, 336, i / n))
        d = (math.sin(a), -math.cos(a))
        front = smoothstep(70, 24, min(math.degrees(a), 360 - math.degrees(a)))
        inner.append(bm.verts.new(surface_out(1.3 * S, d, 0.003 * S) + Vector((0, 0, 0.006 * S))))
        outer.append(bm.verts.new(surface_out((1.28 - 0.035 * front) * S, d, 0.004 * S)))
    for k in range(n):
        bm.faces.new((inner[k], inner[k + 1], outer[k + 1], outer[k]))
    collar = add_part(bm, material("collar", P["colors"]["shirt"], double=True, mtoon="thin"), "collar")
    parts = [collar]
    ribbon = bmesh.new()
    front_hit, _n = surface_y(body_bvh, 0, 1.24 * S)
    fy = (front_hit.y if front_hit else -0.08 * S) - 0.005 * S
    if outfit == "school":
        # A bow: two loops and two tails either side of a knot.
        for sx in (1, -1):
            loop = bmesh.ops.create_uvsphere(ribbon, u_segments=10, v_segments=6, radius=1.0)
            for vert in loop["verts"]:
                x, y, z = vert.co
                vert.co = Vector((sx * 0.02 * S + x * 0.019 * S, fy + y * 0.006 * S, 1.245 * S + z * 0.011 * S - sx * x * 0.003 * S))
            tail = bmesh.ops.create_uvsphere(ribbon, u_segments=8, v_segments=6, radius=1.0)
            for vert in tail["verts"]:
                x, y, z = vert.co
                vert.co = Vector((sx * 0.011 * S + x * 0.008 * S - sx * z * 0.006 * S, fy - 0.001 * S + y * 0.004 * S, 1.218 * S + z * 0.024 * S))
        knot = bmesh.ops.create_uvsphere(ribbon, u_segments=8, v_segments=6, radius=1.0)
        for vert in knot["verts"]:
            x, y, z = vert.co
            vert.co = Vector((x * 0.008 * S, fy - 0.004 * S + y * 0.006 * S, 1.245 * S + z * 0.009 * S))
    elif outfit == "suit":
        rows = []
        for i in range(9):
            t = i / 8
            z = lerp(1.275, 1.02, t) * S
            hit, _ = surface_y(body_bvh, 0, z)
            y = (hit.y if hit else -0.08 * S) - 0.004 * S
            w = lerp(0.008, 0.017, min(1.0, t * 1.6)) * S
            rows.append([ribbon.verts.new((-w, y, z)), ribbon.verts.new((w, y, z))])
        tip_hit, _ = surface_y(body_bvh, 0, 0.995 * S)
        tip = ribbon.verts.new((0, (tip_hit.y if tip_hit else -0.08 * S) - 0.004 * S, 0.995 * S))
        for a, b in zip(rows, rows[1:]):
            ribbon.faces.new((a[0], a[1], b[1], b[0]))
        ribbon.faces.new((rows[-1][0], rows[-1][1], tip))
    if len(ribbon.verts):
        parts.append(add_part(ribbon, MATERIALS["ribbon"], "ribbon"))
    else:
        ribbon.free()
    del s
    return parts


def build_glasses(head_bvh):
    bm = bmesh.new()
    C, R = head_center(), head_radii()
    k = S * P["head"]
    ez = C.z - 0.011 * k
    hit, _n = surface_y(head_bvh, 0.037 * k, ez)
    fy = (hit.y if hit else C.y - R.y) - 0.009 * k
    for sx in (1, -1):
        cx = sx * 0.037 * k
        n = 20
        inner, outer = [], []
        for i in range(n):
            a = 2 * math.pi * i / n
            inner.append(bm.verts.new((cx + math.cos(a) * 0.0165 * k, fy + abs(math.cos(a)) * 0.002 * k, ez + math.sin(a) * 0.0115 * k)))
            outer.append(bm.verts.new((cx + math.cos(a) * 0.019 * k, fy + abs(math.cos(a)) * 0.002 * k, ez + math.sin(a) * 0.0138 * k)))
        for i in range(n):
            bm.faces.new((inner[i], inner[(i + 1) % n], outer[(i + 1) % n], outer[i]))
        # Temple arm back to the ear.
        a0 = bm.verts.new((sx * 0.055 * k, fy + 0.002 * k, ez + 0.004 * k))
        a1 = bm.verts.new((sx * 0.055 * k, fy + 0.002 * k, ez + 0.0005 * k))
        b0 = bm.verts.new((sx * R.x * 1.04, C.y + 0.01 * k, ez + 0.002 * k))
        b1 = bm.verts.new((sx * R.x * 1.04, C.y + 0.01 * k, ez - 0.0015 * k))
        bm.faces.new((a0, a1, b1, b0))
    # Bridge.
    q = [bm.verts.new((x * 0.0205 * k, fy - 0.001 * k, ez + dz * k)) for x, dz in ((-1, 0.004), (1, 0.004), (1, 0.0015), (-1, 0.0015))]
    bm.faces.new(q)
    return add_part(bm, material("glasses", P["colors"]["glasses"], double=True, mtoon="line"), "glasses")


def build_cap(head_bvh):
    """A peaked uniform cap: crown, a cream band and a dark brim over the forehead."""
    C, R = head_center(), head_radii()
    k = S * P["head"]
    colors = P["colors"]
    n = 28
    base = C.z + 0.018 * k
    rings = []
    # Band, then a crown that flares a little toward its flat top, like a uniform cap.
    for z, grow in ((base, 1.08), (base + 0.02 * k, 1.09), (C.z + 0.09 * k, 1.13), (C.z + 0.116 * k, 1.15)):
        rings.append([Vector((math.sin(2 * math.pi * i / n) * R.x * grow, C.y - math.cos(2 * math.pi * i / n) * R.y * grow, z)) for i in range(n)])
    crown = bmesh.new()
    verts = [[crown.verts.new(p) for p in ring] for ring in rings[1:]]
    ring_loft(crown, verts)
    top = crown.verts.new(Vector((0, C.y, C.z + 0.126 * k)))
    for i in range(n):
        crown.faces.new((verts[-1][i], verts[-1][(i + 1) % n], top))
    band = bmesh.new()
    band_verts = [[band.verts.new(p) for p in ring] for ring in rings[:2]]
    ring_loft(band, band_verts)
    brim = bmesh.new()
    arc_pts = []
    for i in range(13):
        a = math.radians(lerp(-80, 80, i / 12))
        inner = Vector((math.sin(a) * R.x * 1.08, C.y - math.cos(a) * R.y * 1.08, base))
        outer = Vector((math.sin(a) * R.x * 1.14, C.y - math.cos(a) * (R.y * 1.08 + 0.06 * k), base - 0.024 * k))
        arc_pts.append((brim.verts.new(inner), brim.verts.new(outer)))
    for (a0, b0), (a1, b1) in zip(arc_pts, arc_pts[1:]):
        brim.faces.new((a0, a1, b1, b0))
    return [
        add_part(crown, material("cap", colors["cap"], double=True), "cap"),
        add_part(band, material("cap-band", colors["capBand"], double=True), "cap-band"),
        add_part(brim, material("cap-brim", colors["capBrim"], double=True), "cap-brim"),
    ]


def build_newspaper():
    bm = bmesh.new()
    w, h = 0.2 * S, 0.28 * S
    cols = 6
    verts = []
    for i in range(cols + 1):
        u = i / cols
        # A folded broadsheet, slightly V-shaped at the spine.
        x = lerp(-w, w, u)
        y = -abs(x) * 0.25
        verts.append((bm.verts.new((x, y, -h / 2)), bm.verts.new((x, y, h / 2))))
    for a, b in zip(verts, verts[1:]):
        bm.faces.new((a[0], b[0], b[1], a[1]))
    obj = add_part(bm, material("paper", P["colors"]["paper"], double=True, mtoon="thin"), "newspaper")
    hand = joints()["rightHand"]
    obj.location = hand[1] + Vector((-0.1 * S, -0.06 * S, 0))
    bpy.context.view_layer.update()
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return obj


# ---------------------------------------------------------------------------------------
# Face: layered decals projected onto the head, with VRM expression shape keys.
# Face-plane coordinates: u across (character's left positive), v up from the head centre.


def eye_curves(side, p):
    """Upper and lower lid points (inner to outer) for one eye under expression params."""
    k = S * P["head"]
    eh = P["eyes"]["height"]
    cu = side * 0.037 * k
    cv = -0.012 * k
    width = 0.021 * k
    n = 9
    close = p.get(f"blink{'L' if side > 0 else 'R'}", 0.0)
    happy = p.get("happy", 0.0)
    relaxed = p.get("relaxed", 0.0)
    surprised = p.get("surprised", 0.0)
    up, low, shut = [], [], []
    for i in range(n):
        t = i / (n - 1)
        a = lerp(-1.0, 1.0, t)  # inner (-1) to outer (+1)
        u = cu + side * a * width
        tilt = a * 0.003 * k  # outer corner lifts
        top = (0.021 * math.sin(math.pi * (0.08 + 0.84 * t)) ** 0.7 - 0.002) * k * eh
        bottom = -(0.017 * math.sin(math.pi * (0.1 + 0.8 * t)) ** 1.2 - 0.002) * k * eh
        top *= 1 + 0.25 * surprised
        bottom *= 1 + 0.2 * surprised
        up.append((u, cv + tilt + top))
        low.append((u, cv + tilt + bottom))
        # A closed eye is a gentle curve at the lower third; a happy eye arcs upward.
        blink_line = cv + tilt - 0.006 * k * eh - 0.003 * k * math.sin(math.pi * t)
        happy_line = cv + tilt - 0.002 * k * eh + 0.008 * k * math.sin(math.pi * t) ** 0.8
        shut.append((u, blink_line, happy_line))
    amount = min(1.0, close + happy)
    mix_h = happy / amount if amount > 0 else 0
    lid = 0.45 * relaxed  # relaxed lowers the upper lid
    out_up, out_low = [], []
    for (u, vu), (_u, vl), (_u2, bl, hl) in zip(up, low, shut):
        line = lerp(bl, hl, mix_h)
        vu = lerp(vu, lerp(vl, vu, 0.55), lid)
        out_up.append((u, lerp(vu, line, amount)))
        out_low.append((u, lerp(vl, line - 0.0004 * k, amount)))
    return up, low, out_up, out_low


def vertical_map(u, v, up0, low0, up1, low1):
    """Move a point inside the rest eye into the same relative place in the posed eye."""
    def at(curve, u):
        pts = sorted(curve)
        if u <= pts[0][0]:
            return pts[0][1]
        for (ua, va), (ub, vb) in zip(pts, pts[1:]):
            if ua <= u <= ub:
                return lerp(va, vb, (u - ua) / (ub - ua) if ub > ua else 0)
        return pts[-1][1]

    a0, b0 = at(low0, u), at(up0, u)
    a1, b1 = at(low1, u), at(up1, u)
    s = (v - a0) / (b0 - a0) if abs(b0 - a0) > 1e-6 else 0.5
    return (u, a1 + s * (b1 - a1))


def ellipse_pts(cu, cv, ru, rv, n):
    return [(cu + ru * math.cos(2 * math.pi * i / n), cv + rv * math.sin(2 * math.pi * i / n)) for i in range(n)]


def face_layout(p):
    """Every decal polygon for one set of expression params: [(material, layer, [(u, v)])]."""
    k = S * P["head"]
    eh = P["eyes"]["height"]
    polys = []
    look_u = (p.get("lookLeft", 0) - p.get("lookRight", 0)) * 0.0055 * k
    look_v = (p.get("lookUp", 0) - p.get("lookDown", 0)) * 0.004 * k
    for side in (1, -1):
        up0, low0, up1, low1 = eye_curves(side, p)
        # Sclera: upper lid points then lower lid points reversed (a fan from its centre).
        polys.append(("eye-white", 1, up1 + list(reversed(low1))))
        cu = side * 0.037 * k + look_u
        cv = -0.0105 * k * (0.7 + 0.3 * eh) + look_v
        iris_r = (0.0118 * k, 0.0158 * k * (0.55 + 0.45 * eh))

        def inside(pts):
            return [vertical_map(u, v, up0, low0, up1, low1) for u, v in pts]

        polys.append(("iris", 2, inside(ellipse_pts(cu, cv, *iris_r, 20))))
        polys.append(("iris-light", 3, inside(ellipse_pts(cu, cv - 0.0062 * k * eh, iris_r[0] * 0.72, iris_r[1] * 0.45, 14))))
        polys.append(("pupil", 4, inside(ellipse_pts(cu, cv + 0.001 * k, iris_r[0] * 0.42, iris_r[1] * 0.5, 12))))
        polys.append(("eye-highlight", 5, inside(ellipse_pts(cu - side * 0.0042 * k, cv + 0.0068 * k * eh, 0.0036 * k, 0.0042 * k * eh, 10))))
        polys.append(("eye-highlight", 5, inside(ellipse_pts(cu + side * 0.0045 * k, cv - 0.006 * k * eh, 0.0016 * k, 0.0016 * k, 8))))
        # Upper lash: a band over the upper lid, thicker at the outer corner, with a flick.
        n = len(up1)
        band_top, band_bottom = [], []
        for i, (u, v) in enumerate(up1):
            t = i / (n - 1)
            thick = lerp(0.0022, 0.0048, t ** 1.4) * k
            band_top.append((u, v + thick * 0.6))
            band_bottom.append((u, v - thick * 0.4))
        last_u, last_v = up1[-1]
        flick = (last_u + side * 0.0045 * k, last_v - 0.001 * k)
        polys.append(("lash", 6, band_top + [flick] + list(reversed(band_bottom))))
        # Lower lash: a short thin line under the outer half.
        lower_half = low1[n // 2 :]
        polys.append(("lash", 6, [(u, v + 0.0004 * k) for u, v in lower_half] + [(u, v - 0.0009 * k) for u, v in reversed(lower_half)]))
        # Brow.
        brow_lift = (0.006 * p.get("surprised", 0) + 0.0015 * p.get("happy", 0)) * k
        bthick = lerp(0.0022, 0.0042, P["brows"]) * k
        brow = []
        for i in range(8):
            t = i / 7
            u = side * lerp(0.018, 0.058, t) * k
            v = (0.028 + 0.004 * math.sin(math.pi * t) - 0.004 * t) * k + brow_lift + (0.004 * k if P["brows"] == 0 else 0)
            brow.append((u, v, bthick * (1 - 0.6 * abs(t - 0.35))))
        polys.append(("brow", 6, [(u, v + t) for u, v, t in brow] + [(u, v - t) for u, v, t in reversed(brow)]))
        # Blush.
        if P.get("blush", True):
            polys.append(("blush", 1, ellipse_pts(side * 0.052 * k, -0.042 * k, 0.014 * k, 0.006 * k, 12)))
    # Mouth: an outline whose height opens with the visemes.
    open_ = 0.0
    wide = 0.0
    round_ = 0.0
    for name, (o, w, r) in {"aa": (1.0, 0.1, 0), "ih": (0.35, 0.55, 0), "ou": (0.5, 0, 1.0), "ee": (0.42, 0.75, 0), "oh": (0.78, 0, 0.6)}.items():
        weight = p.get(name, 0)
        open_ += o * weight
        wide += w * weight
        round_ += r * weight
    smile = p.get("happy", 0) * 1.0 + p.get("relaxed", 0) * 0.5
    open_ += 0.3 * p.get("happy", 0) + 0.5 * p.get("surprised", 0)
    round_ += 0.6 * p.get("surprised", 0)
    mw = 0.0078 * k * (1 + 0.5 * wide - 0.35 * round_ + 0.15 * smile + 0.25 * open_)
    mv = -0.071 * k
    n = 10
    top, bottom = [], []
    for i in range(n):
        t = i / (n - 1)
        a = lerp(-1, 1, t)
        u = a * mw
        curve = (a * a) * (0.0025 * smile - 0.0006) * k
        roundness = math.sqrt(max(0.0, 1 - a * a))
        shape = lerp(1 - a ** 4, roundness, min(1.0, round_))
        top.append((u, mv + curve + (0.0006 + 0.002 * open_) * k * shape))
        bottom.append((u, mv + curve - (0.0006 + 0.015 * open_) * k * shape * (1 - 0.2 * smile)))
    polys.append(("mouth", 3, top + list(reversed(bottom))))
    # Nose: a small shadow tick.
    polys.append(("nose", 2, [(0.0, -0.036 * k), (0.0025 * k, -0.043 * k), (-0.0012 * k, -0.0428 * k)]))
    return polys


FACE_KEYS = [
    "blinkL",
    "blinkR",
    "happy",
    "relaxed",
    "surprised",
    "aa",
    "ih",
    "ou",
    "ee",
    "oh",
    "lookUp",
    "lookDown",
    "lookLeft",
    "lookRight",
]


def build_face(head_bvh):
    C = head_center()
    face_mats = {
        "eye-white": material("eye-white", "#fbf8f4", double=True, mtoon="flat"),
        "iris": material("iris", P["eyes"]["iris"], double=True, mtoon="flat"),
        "iris-light": material("iris-light", P["eyes"]["irisLight"], double=True, mtoon="flat"),
        "pupil": material("pupil", "#1a1012", double=True, mtoon="flat"),
        "eye-highlight": material("eye-highlight", "#ffffff", double=True, mtoon="glint"),
        "lash": material("lash", P["eyes"]["lash"], double=True, mtoon="flat"),
        "brow": material("brow", P["colors"]["brow"], double=True, mtoon="flat"),
        "mouth": material("mouth", P["colors"]["mouth"], double=True, mtoon="flat"),
        "blush": material("blush", P["colors"]["blush"], double=True, mtoon="blush"),
        "nose": material("nose", P["colors"]["skin"], double=True, mtoon="nose"),
    }

    def project(polys):
        out = []
        for mat, layer, pts in polys:
            placed = []
            for u, v in pts:
                x, z = C.x + u, C.z + v
                hit, normal = surface_y(head_bvh, x, z)
                if hit is None:
                    hit, normal = Vector((x, C.y - head_radii().y * 0.9, z)), Vector((0, -1, 0))
                placed.append(hit + normal * (0.00045 * layer * S + 0.0003 * S))
            out.append((mat, placed))
        return out

    base = project(face_layout({}))
    bm = bmesh.new()
    faces_mats = []
    for mat, placed in base:
        centre = sum(placed, Vector()) / len(placed)
        verts = [bm.verts.new(p) for p in placed]
        hub = bm.verts.new(centre)
        for a, b in zip(verts, verts[1:] + verts[:1]):
            f = bm.faces.new((hub, b, a))
            faces_mats.append(mat)
    mesh = bpy.data.meshes.new("Face")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("Face", mesh)
    bpy.context.scene.collection.objects.link(obj)
    for mat in face_mats.values():
        mesh.materials.append(mat)
    names = list(face_mats)
    for poly, mat in zip(mesh.polygons, faces_mats):
        poly.material_index = names.index(mat)
        poly.use_smooth = False
    obj.shape_key_add(name="Basis", from_mix=False)

    def flat(project_out):
        coords = []
        for _mat, placed in project_out:
            centre = sum(placed, Vector()) / len(placed)
            coords.extend(placed)
            coords.append(centre)
        return coords

    for key in FACE_KEYS:
        params = {key: 1.0}
        coords = flat(project(face_layout(params)))
        assert len(coords) == len(mesh.vertices), key
        block = obj.shape_key_add(name=key, from_mix=False)
        for i, co in enumerate(coords):
            block.data[i].co = co
        block.value = 0.0
    return obj


# ---------------------------------------------------------------------------------------
# Hair: a shell cap plus tapered strands that follow the scalp and then hang. Hanging
# strands that should sway get a bone chain for VRM spring bones.


def direction(phi, theta):
    p, t = math.radians(phi), math.radians(theta)
    return Vector((math.sin(t) * math.sin(p), -math.sin(t) * math.cos(p), math.cos(t)))


def scalp(bvh, d, lift=0.0):
    C = head_center()
    hit = bvh.ray_cast(C, d, 1.0)
    r = (hit[0] - C).length if hit[0] is not None else head_radii().x
    return C + d * (r + lift)


def strand_path(bvh, phi, theta0, theta1, hang, lift, n_surface=7, n_hang=6, sweep=0.0, curl=0.0):
    pts = []
    for i in range(n_surface):
        t = i / (n_surface - 1)
        theta = lerp(theta0, theta1, t)
        # Extra lift near the crown gives the hair volume.
        pts.append(scalp(bvh, direction(phi + sweep * t, theta), lift * (1.35 - 0.35 * t)))
    if hang > 0:
        last = pts[-1]
        out = Vector((last.x, last.y, 0)) - Vector((head_center().x, head_center().y, 0))
        out = out.normalized() if out.length > 1e-6 else Vector((0, 1, 0))
        for i in range(1, n_hang + 1):
            t = i / n_hang
            drop = hang * t
            flare = 0.12 * hang * t - curl * hang * t * t
            pts.append(last + Vector((0, 0, -drop)) + out * flare)
    return pts


def strand_mesh(bm, pts, width, thick, sides=6, taper=1.6, tip=True, root_scale=1.0):
    """A flattened, tapered tube along pts. Returns the rings' params (0 root .. 1 tip) per vertex."""
    C = head_center()
    rings = []
    params = []
    total = sum((b - a).length for a, b in zip(pts, pts[1:]))
    run = 0.0
    for i, p in enumerate(pts):
        if i:
            run += (pts[i] - pts[i - 1]).length
        s = run / total if total else 0
        prev = pts[max(0, i - 1)]
        nxt = pts[min(len(pts) - 1, i + 1)]
        tangent = (nxt - prev).normalized()
        outward = (p - C)
        outward = (outward - tangent * outward.dot(tangent)).normalized()
        side = tangent.cross(outward).normalized()
        shape = (1 - s ** taper) if tip else 1.0
        shape = max(shape, 0.0) * lerp(root_scale, 1.0, min(1.0, s * 4))
        w = width * max(shape, 0.02)
        th = thick * max(shape, 0.05)
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            # Crescent section: the outer face is rounder than the inner one.
            ca, sa = math.cos(a), math.sin(a)
            depth = th * (sa if sa > 0 else sa * 0.35)
            ring.append(bm.verts.new(p + side * (ca * w) + outward * depth))
            params.append(s)
        rings.append(ring)
    ring_loft(bm, rings)
    tip_vert = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.004 * S)
    params.append(1.0)
    for k in range(sides):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % sides], tip_vert))
    return params


def build_hair_shell(style):
    C, R = head_center(), head_radii()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
    lift = {"ponytail": 0.012, "short": 0.01, "elder": 0.004, "bun": 0.008}[style] * S
    kill = []
    for vert in bm.verts:
        d = vert.co.normalized()
        theta = math.degrees(math.acos(max(-1, min(1, d.z))))
        phi = math.degrees(math.atan2(d.x, -d.y))  # 0 = front
        if style == "elder":
            # Thin on top: the shell sits close to the scalp and stops above the ears.
            front_line = 40 + 30 * (abs(phi) / 180)
        else:
            front_line = 40 + 44 * smoothstep(20, 95, abs(phi))
        back_line = {"ponytail": 124, "short": 116, "elder": 112, "bun": 120}[style]
        if abs(phi) < 100:
            limit = front_line if abs(phi) < 80 else lerp(front_line, back_line, (abs(phi) - 80) / 20)
        else:
            limit = back_line
        if theta > limit:
            kill.append(vert)
        vert.co = C + Vector((d.x * R.x, d.y * R.y, d.z * R.z)) * 1.0 + d * lift * (0.6 + 0.4 * max(0, d.z))
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    return bm


def build_hair(head_bvh, j):
    style = P["hair"]
    C = head_center()
    bm = build_hair_shell(style)
    # Push the shell out to the true scalp plus lift.
    for vert in bm.verts:
        d = (vert.co - C).normalized()
        lift = {"ponytail": 0.011, "short": 0.009, "elder": 0.003, "bun": 0.007}[style] * S * (0.7 + 0.5 * max(0, d.z))
        vert.co = scalp(head_bvh, d, lift)
    shell_count = len(bm.verts)
    chains = []  # (bone prefix, points, vertex range, params)
    strands = []
    k = S
    if style == "ponytail":
        for i, phi in enumerate(range(-44, 45, 11)):
            t1 = (78, 84, 80, 86, 82, 87, 80, 84, 77)[i]
            strands.append(dict(phi=phi, t0=30, t1=t1, hang=0.0, lift=0.017 * k, w=0.03 * k, th=0.006 * k, sweep=phi * 0.12, taper=2.2))
        for sx in (1, -1):
            strands.append(dict(phi=sx * 62, t0=30, t1=94, hang=0.085 * k, lift=0.012 * k, w=0.018 * k, th=0.005 * k, chain=f"hairSide{'L' if sx > 0 else 'R'}", curl=0.3))
            strands.append(dict(phi=sx * 82, t0=34, t1=104, hang=0.03 * k, lift=0.012 * k, w=0.04 * k, th=0.007 * k, taper=2.2))
            strands.append(dict(phi=sx * 50, t0=24, t1=88, hang=0.0, lift=0.013 * k, w=0.034 * k, th=0.006 * k, taper=2.4))
        for phi in range(100, 261, 20):
            strands.append(dict(phi=phi, t0=28, t1=118, hang=0.018 * k, lift=0.012 * k, w=0.042 * k, th=0.007 * k))
    elif style == "short":
        for phi, t1, w in ((-34, 66, 0.03), (-14, 70, 0.034), (6, 68, 0.034), (26, 62, 0.03), (44, 70, 0.026)):
            strands.append(dict(phi=phi, t0=28, t1=t1, hang=0.0, lift=0.012 * k, w=w * k, th=0.007 * k, sweep=-18))
        for phi in (-80, 80):
            strands.append(dict(phi=phi, t0=30, t1=96, hang=0.0, lift=0.01 * k, w=0.036 * k, th=0.006 * k))
        for phi in range(100, 261, 26):
            strands.append(dict(phi=phi, t0=24, t1=114, hang=0.006 * k, lift=0.011 * k, w=0.045 * k, th=0.007 * k))
    elif style == "bun":
        # Pulled back from the hairline all round, gathered into a bun high at the back.
        for phi in range(-160, 181, 20):
            t1 = lerp(44, 112, smoothstep(0, 180, abs(phi)))
            strands.append(dict(phi=phi, t0=12, t1=t1, hang=0.0, lift=0.009 * k, w=0.046 * k, th=0.006 * k, taper=1.3))
    else:  # elder: short, thinning, swept back
        for phi in (-70, 70, -95, 95):
            strands.append(dict(phi=phi, t0=58, t1=104, hang=0.0, lift=0.006 * k, w=0.03 * k, th=0.005 * k))
        for phi in range(120, 241, 30):
            strands.append(dict(phi=phi, t0=50, t1=112, hang=0.004 * k, lift=0.006 * k, w=0.045 * k, th=0.005 * k))
    params = [0.0] * shell_count
    owners = [None] * shell_count
    for sd in strands:
        pts = strand_path(head_bvh, sd["phi"], sd["t0"], sd["t1"], sd["hang"], sd["lift"], sweep=sd.get("sweep", 0), curl=sd.get("curl", 0))
        start = len(bm.verts)
        ps = strand_mesh(bm, pts, sd["w"], sd["th"], taper=sd.get("taper", 1.6))
        params.extend(ps)
        owners.extend([sd.get("chain")] * (len(bm.verts) - start))
        if sd.get("chain"):
            chains.append((sd["chain"], pts, sd))
    if style == "ponytail":
        # Tie and tail at the back of the head, a little above the nape.
        tie_d = direction(180, 102)
        tie = scalp(head_bvh, tie_d, 0.016 * k)
        tie_bm = bmesh.new()
        ring = bmesh.ops.create_uvsphere(tie_bm, u_segments=12, v_segments=6, radius=1.0)
        for vert in ring["verts"]:
            x, y, z = vert.co
            tie_bm_co = tie + Vector((x * 0.017 * k, y * 0.012 * k + 0.004 * k, z * 0.014 * k))
            vert.co = tie_bm_co
        tail_pts = [tie + Vector((0, 0.01 * k, 0))]
        for i in range(1, 8):
            t = i / 7
            tail_pts.append(tie + Vector((0, (0.03 + 0.03 * t) * k, (-0.2 * t) * k)))
        for dx, w in ((0.0, 0.034), (0.012, 0.022), (-0.012, 0.022)):
            pts = [p + Vector((dx * k * (0.3 + i / 7), 0.004 * k * (i % 2), 0)) for i, p in enumerate(tail_pts)]
            start = len(bm.verts)
            ps = strand_mesh(bm, pts, w * k, 0.014 * k, sides=8, taper=2.2, root_scale=0.55)
            params.extend(ps)
            owners.extend(["hairTail"] * (len(bm.verts) - start))
        chains.append(("hairTail", tail_pts, {"hang": 0.2 * k}))
    else:
        tie_bm = None
    if style == "bun":
        # The bun: a flattened ball on the upper back of the head, in the hair material.
        centre = scalp(head_bvh, direction(180, 64), 0.03 * k)
        before = len(bm.verts)
        ball = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
        for vert in ball["verts"]:
            x, y, z = vert.co
            vert.co = centre + Vector((x * 0.05 * k, y * 0.04 * k, z * 0.045 * k))
        params.extend([0.0] * (len(bm.verts) - before))
        owners.extend([None] * (len(bm.verts) - before))
    mesh = bpy.data.meshes.new("Hair")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("Hair", mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(material("hair", P["colors"]["hair"], double=True, mtoon="hair"))
    for poly in mesh.polygons:
        poly.use_smooth = True
    extra = []
    if tie_bm is not None:
        extra.append(add_part(tie_bm, material("hair-tie", P["colors"]["hairTie"]), "hair-tie"))
    return obj, chains, params, owners, extra


def chain_bones(chains, j):
    """Spring chains: joints along each hanging strand, ending in a short tip bone."""
    bones = {}
    springs = []
    for prefix, pts, sd in chains:
        if prefix == "hairTail":
            joints_at = [pts[0], pts[2], pts[4], pts[6], pts[7]]
        else:
            hang_start = len(pts) - 7
            joints_at = [pts[hang_start], pts[hang_start + 2], pts[hang_start + 4], pts[-1]]
        names = []
        for i in range(len(joints_at)):
            name = f"{prefix}{i}"
            head = joints_at[i]
            tail = joints_at[i + 1] if i + 1 < len(joints_at) else head + (head - joints_at[i - 1]).normalized() * 0.02 * S
            parent = names[-1] if names else "head"
            bones[name] = (head, tail, parent, 0.01 * S)
            names.append(name)
        springs.append({"name": prefix, "joints": names})
    return bones, springs


# ---------------------------------------------------------------------------------------
# Armature, export and the VRM sidecar.


def create_armature(j):
    data = bpy.data.armatures.new("rig")
    arm = bpy.data.objects.new("Armature", data)
    bpy.context.scene.collection.objects.link(arm)
    activate(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent, _r) in j.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        bone.roll = 0
        bone.use_deform = True
    for name, (_h, _t, parent, _r) in j.items():
        if parent:
            data.edit_bones[name].parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def bind(obj, arm):
    obj.parent = arm
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def join(objects, name):
    activate(objects[0])
    for obj in objects[1:]:
        obj.select_set(True)
    bpy.ops.object.join()
    objects[0].name = name
    objects[0].data.name = name
    return objects[0]


def to_gltf(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


MTOON_ROLES = {
    # shadeTint multiplies the base colour for the shaded side; toony is shadingToonyFactor.
    "skin": {"shadeTint": [0.94, 0.72, 0.7], "toony": 0.92, "shift": -0.06, "outline": 0.0016, "rim": 0.35},
    "cloth": {"shadeTint": [0.62, 0.6, 0.72], "toony": 0.9, "shift": -0.02, "outline": 0.002, "rim": 0.3},
    "hair": {"shadeTint": [0.55, 0.52, 0.66], "toony": 0.88, "shift": 0.0, "outline": 0.002, "rim": 0.45},
    "thin": {"shadeTint": [0.66, 0.64, 0.76], "toony": 0.9, "shift": -0.02, "outline": 0.0, "rim": 0.2},
    "shoes": {"shadeTint": [0.55, 0.5, 0.55], "toony": 0.8, "shift": 0.0, "outline": 0.0016, "rim": 0.2},
    "line": {"shadeTint": [0.8, 0.8, 0.8], "toony": 1.0, "shift": 0.0, "outline": 0.0, "rim": 0.0},
    "flat": {"shadeTint": [0.92, 0.9, 0.94], "toony": 1.0, "shift": -0.4, "outline": 0.0, "rim": 0.0},
    "glint": {"shadeTint": [1, 1, 1], "toony": 1.0, "shift": -1.0, "outline": 0.0, "rim": 0.0, "emissive": 0.6},
    "blush": {"shadeTint": [0.95, 0.9, 0.9], "toony": 1.0, "shift": -0.4, "outline": 0.0, "rim": 0.0, "alpha": 0.32},
    "nose": {"shadeTint": [0.8, 0.62, 0.6], "toony": 1.0, "shift": -0.4, "outline": 0.0, "rim": 0.0, "alpha": 0.45, "darken": 0.82},
}


def sidecar(cast, j, springs, meshes):
    c = head_center()
    colliders = [
        {"bone": "head", "center": to_gltf(c + Vector((0, 0.004 * S, -0.004 * S))), "radius": round(head_radii().x * 1.02, 4)},
        {"bone": "neck", "center": to_gltf(j["neck"][0].lerp(j["neck"][1], 0.5)), "radius": round(0.045 * S, 4)},
        {"bone": "upperChest", "center": to_gltf(j["upperChest"][0] + Vector((0, 0.02 * S, 0))), "radius": round(0.1 * S * P["shoulders"], 4)},
        {"bone": "chest", "center": to_gltf(j["chest"][0] + Vector((0, 0.02 * S, 0))), "radius": round(0.1 * S * P["chest"], 4)},
    ]
    for side in ("left", "right"):
        colliders.append({"bone": f"{side}UpperArm", "center": to_gltf(j[f"{side}UpperArm"][0]), "radius": round(0.045 * S, 4)})
    materials = {}
    for name, mat in MATERIALS.items():
        role = MTOON_ROLES[mat["mtoon"]]
        materials[name] = {"role": mat["mtoon"], **role}
    return {
        "cast": cast,
        "person": P["person"],
        "title": P["title"],
        "height": P["height"],
        "humanBones": [name for name in j if not name.startswith("hair")],
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
        "faceMesh": "Face",
        "springs": [
            {**spring, "stiffness": 1.1 if spring["name"] == "hairTail" else 1.6, "gravity": 0.35, "drag": 0.45, "hitRadius": round(0.012 * S, 4)}
            for spring in springs
        ],
        "colliders": colliders,
        "materials": materials,
        "posture": P.get("posture", {}),
        "meshes": meshes,
    }


def build(cast):
    use_profile(cast)
    MATERIALS.clear()
    ma.reset_scene()
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    j = joints()
    mats = body_materials()
    body = build_body_mesh(j)
    # Head joins the body; its faces are skin.
    head_bm = build_head_bm()
    head_mesh = bpy.data.meshes.new("head")
    head_bm.to_mesh(head_mesh)
    head_bm.free()
    head = bpy.data.objects.new("head", head_mesh)
    bpy.context.scene.collection.objects.link(head)
    for poly in head_mesh.polygons:
        poly.use_smooth = True
    head_bvh = BVHTree.FromObject(head, bpy.context.evaluated_depsgraph_get())
    # Clothing regions on the skin body.
    body_names = [n for n in j]
    for name in list(mats):
        mat_index(body, mats[name])
    order = list(mats)
    for poly in body.data.polygons:
        centre = poly.center
        _d, bone, t = nearest_bone(centre, j, body_names)
        poly.material_index = order.index(region(centre, bone, t))
    head_mesh.materials.append(mats["skin"])
    body_bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    parts = []
    if has_skirt():
        parts.append(build_skirt())
    parts += build_collar_and_tie(body_bvh)
    face = build_face(head_bvh)
    hair, chains, hair_params, hair_owners, hair_extra = build_hair(head_bvh, j)
    if P.get("glasses"):
        hair_extra.append(build_glasses(head_bvh))
    if P.get("cap"):
        hair_extra += build_cap(head_bvh)
    newspaper = build_newspaper() if P.get("newspaper") else None
    chain_j, springs = chain_bones(chains, j)
    all_j = {**j, **chain_j}
    arm = create_armature(all_j)
    kids = children_of(j)
    deform = [n for n in j]
    assign(body, lambda co: body_weights(co, j, deform, kids))
    assign(head, lambda co: {"head": 1.0})
    for part in parts:
        if part.name == "skirt":
            def skirt_w(co):
                t = smoothstep(1.0 * S, 0.62 * S, co.z)
                side = max(0.0, min(1.0, 0.5 + co.x / (0.24 * S)))
                legs = 0.6 * t
                return {"hips": 1 - legs, "leftUpperLeg": legs * side, "rightUpperLeg": legs * (1 - side)}
            assign(part, skirt_w)
        else:
            assign(part, lambda co: body_weights(co, j, ["upperChest", "neck", "chest", "spine"], kids))
    assign(face, lambda co: {"head": 1.0})
    for extra in hair_extra:
        assign(extra, lambda co: {"head": 1.0})
    # Hair: roots follow the head; hanging parts follow their chain by arc length.
    hair_groups = {"head": hair.vertex_groups.new(name="head")}
    chain_lookup = {prefix: [n for n in chain_j if n.startswith(prefix) and n[len(prefix):].isdigit()] for prefix, _p, _s in chains}
    for vert in hair.data.vertices:
        owner = hair_owners[vert.index]
        if not owner:
            hair_groups["head"].add([vert.index], 1.0, "REPLACE")
            continue
        names = chain_lookup[owner]
        co = vert.co
        best = nearest_bone(co, chain_j, names[:-1])
        _d, bone, t = best
        idx = names.index(bone)
        # Above the first joint the strand is still on the scalp.
        root = chain_j[names[0]][0]
        if owner != "hairTail" and co.z > root.z + 0.004 * S:
            weights = {"head": 1.0}
        elif idx == 0 and t < 0.35:
            w = 0.5 + 0.5 * t / 0.35
            weights = {bone: w, "head": 1 - w}
        elif t > 0.5 and idx + 1 < len(names) - 1:
            w = 0.5 * (t - 0.5) / 0.5
            weights = {bone: 1 - w, names[idx + 1]: w}
        else:
            weights = {bone: 1.0}
        for name, w in weights.items():
            if name not in hair_groups:
                hair_groups[name] = hair.vertex_groups.new(name=name)
            hair_groups[name].add([vert.index], w, "REPLACE")
    del hair_params
    body_parts = join([body, head, *parts, *hair_extra], "Body")
    meshes = [body_parts, face, hair]
    if newspaper is not None:
        paper_holder = "rightHand"
        assign(newspaper, lambda co: {paper_holder: 1.0})
        meshes.append(newspaper)
    for obj in meshes:
        bind(obj, arm)
    tris = {obj.name: ma.triangle_count(obj) for obj in meshes}
    os.makedirs(BUILD, exist_ok=True)
    glb = os.path.join(BUILD, f"{cast}.glb")
    ma.export_glb(glb, [arm, *meshes], apply=False)
    spec = sidecar(cast, all_j, springs, [m.name for m in meshes])
    spec["triangles"] = tris
    ma.write_report(os.path.join(BUILD, f"{cast}.vrm.json"), spec)
    top = max((obj.matrix_world @ v.co).z for obj in meshes for v in obj.data.vertices)
    report = {
        "cast": cast,
        "person": P["person"],
        "blender": bpy.app.version_string,
        "triangles": sum(tris.values()),
        "trianglesPerMesh": tris,
        "materials": sorted(MATERIALS),
        "humanBones": spec["humanBones"],
        "springs": springs,
        "shapeKeys": FACE_KEYS,
        "heightMetres": round(top, 3),
        "targetHeightMetres": P["height"],
        "facing": "-Y in Blender, +Z in three.js (VRM 1.0)",
    }
    ma.write_report(os.path.join(HERE, f"{cast}.report.json"), report)
    if ARGS is not None and ARGS.render:
        render(os.path.join(ARGS.render, cast), face)
    print("REPORT", report)


def review(folder, views, resolution=(900, 900)):
    """Workbench renders in material colours with outlines, from fixed cameras."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_object_outline = True
    shading.show_cavity = False
    scene.render.resolution_x, scene.render.resolution_y = resolution
    camera = bpy.data.objects.new("review", bpy.data.cameras.new("review"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, (eye, target, lens) in views.items():
        camera.location = Vector(eye)
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.lens = lens
        scene.render.filepath = os.path.join(folder, f"{name}.png")
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def render(folder, face):
    os.makedirs(folder, exist_ok=True)
    top = P["height"]
    c = tuple(head_center())
    mid = (0, 0, 0.55 * top)
    review(folder, {
        "front": ((0, -4.4, 0.6 * top), mid, 50),
        "three-quarter": ((2.8, -3.4, 0.7 * top), mid, 50),
        "side": ((4.4, 0, 0.6 * top), mid, 50),
        "back": ((-1.6, 4.0, 0.7 * top), mid, 50),
        "face": ((0.18 * S, -0.75 * S, c[2] + 0.02), c, 80),
        "face-side": ((0.62 * S, -0.4 * S, c[2] + 0.03), c, 80),
        "head-back": ((0.35 * S, 0.8 * S, c[2]), c, 60),
    })
    for key in face.data.shape_keys.key_blocks[1:]:
        key.value = 1.0
        review(folder, {f"face-{key.name}": ((0.08 * S, -0.55 * S, c[2]), c, 90)}, resolution=(480, 480))
        key.value = 0.0


if __name__ == "__main__":
    ARGS = ma.parse_args({}, {"--cast": {"default": "riko"}})
    for cast_name in PROFILES if ARGS.cast == "all" else [ARGS.cast]:
        build(cast_name)
