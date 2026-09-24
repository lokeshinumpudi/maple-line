"""Anime face decals drawn in Blender, with VRM expression shape keys.

Eyes, lashes, brows, mouth, blush and a nose tick are flat polygons laid in layers just
off the head surface (a ray cast along +Y places each point). Every expression is the same
polygons with moved points, so each becomes a shape key: blinkL/R, happy, relaxed,
surprised, the visemes aa/ih/ou/ee/oh and lookUp/Down/Left/Right. The proportions follow
the painted front view: large round dark-brown eyes with two highlights, a heavy upper
lash with an outer flick, soft brows under the fringe, a small smiling mouth and pink
cheeks. Face-plane coordinates: u across (her left positive), v up from the head centre.
"""

import math

import bmesh
import bpy
from mathutils import Vector


def lerp(a, b, t):
    return a + (b - a) * t


FACE_KEYS = [
    "blinkL", "blinkR", "happy", "relaxed", "surprised",
    "aa", "ih", "ou", "ee", "oh",
    "lookUp", "lookDown", "lookLeft", "lookRight",
]


def dims(hp):
    """Face measurements in metres, relative to the head centre, from the head params."""
    c = hp["centre"]
    f = hp.get("face", {})
    # Eye and mouth sizes as shares of the half eye spacing; the defaults are Riko's.
    return {
        "eye_u": hp["eye_x"],
        "eye_v": hp["z_eye"] - c.z,
        "eye_w": hp["eye_x"] * f.get("eyeWidth", 0.44),  # half width of one eye
        "eye_top": hp["eye_x"] * f.get("eyeTop", 0.5),
        "eye_bottom": hp["eye_x"] * f.get("eyeBottom", 0.36),
        "iris": f.get("iris", 1.0),
        "glint": f.get("glint", 1.0),
        "brow_v": hp["z_brow"] - c.z - 0.007,
        "brow_w": f.get("browWidth", 1.0),
        "mouth_v": hp["z_mouth"] - c.z,
        "mouth_w": hp["eye_x"] * f.get("mouthWidth", 0.2),
        "smile": f.get("smile", 0.5),
        "blush": f.get("blush", True),
        # Age lines (smile folds, crow's feet) drawn in the soft nose colour.
        "lines": f.get("lines", False),
        "nose_v": (hp["z_nose"] - c.z) if hp.get("z_nose") is not None else None,
        "k": hp["eye_x"] / 0.042,
    }


def eye_curves(side, p, d):
    """Upper and lower lid points (inner to outer) for one eye under expression params."""
    k = d["k"]
    cu, cv, width = side * d["eye_u"], d["eye_v"], d["eye_w"]
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
        tilt = a * 0.002 * k
        top = (d["eye_top"] * math.sin(math.pi * (0.06 + 0.88 * t)) ** 0.6 - 0.002 * k)
        bottom = -(d["eye_bottom"] * math.sin(math.pi * (0.08 + 0.84 * t)) ** 0.9 - 0.002 * k)
        top *= 1 + 0.18 * surprised
        bottom *= 1 + 0.15 * surprised
        up.append((u, cv + tilt + top))
        low.append((u, cv + tilt + bottom))
        # A closed eye is a gentle downward curve; a happy eye arcs upward (^ ^).
        blink_line = cv + tilt - 0.004 * k - 0.003 * k * math.sin(math.pi * t)
        happy_line = cv + tilt - 0.002 * k + 0.008 * k * math.sin(math.pi * t) ** 0.8
        shut.append((u, blink_line, happy_line))
    amount = min(1.0, close + happy)
    mix_h = happy / amount if amount > 0 else 0
    lid = 0.4 * relaxed
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
    s = min(1.0, max(0.0, s))
    return (u, a1 + s * (b1 - a1))


def stroke(pts, half):
    """A thin band along a polyline, as one polygon (there and back)."""
    top, bottom = [], []
    for i, (u, v) in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        du, dv = b[0] - a[0], b[1] - a[1]
        n = math.hypot(du, dv) or 1.0
        nu, nv = -dv / n * half, du / n * half
        top.append((u + nu, v + nv))
        bottom.append((u - nu, v - nv))
    return top + list(reversed(bottom))


def ellipse(cu, cv, ru, rv, n):
    return [(cu + ru * math.cos(2 * math.pi * i / n), cv + rv * math.sin(2 * math.pi * i / n)) for i in range(n)]


def layout(p, d):
    """Every decal polygon for one set of expression params: [(material, layer, [(u, v)])]."""
    k = d["k"]
    polys = []
    look_u = (p.get("lookLeft", 0) - p.get("lookRight", 0)) * 0.005 * k
    look_v = (p.get("lookUp", 0) - p.get("lookDown", 0)) * 0.004 * k
    for side in (1, -1):
        up0, low0, up1, low1 = eye_curves(side, p, d)
        polys.append(("eye-white", 1, up1 + list(reversed(low1))))
        cu = side * d["eye_u"] + look_u - side * 0.001 * k
        cv = d["eye_v"] - 0.001 * k + look_v
        iris = (d["eye_w"] * 0.72 * d["iris"], (d["eye_top"] + d["eye_bottom"]) * 0.47 * d["iris"])

        def inside(pts):
            return [vertical_map(u, v, up0, low0, up1, low1) for u, v in pts]

        polys.append(("iris", 2, inside(ellipse(cu, cv, *iris, 20))))
        polys.append(("iris-light", 3, inside(ellipse(cu, cv - iris[1] * 0.42, iris[0] * 0.7, iris[1] * 0.42, 14))))
        polys.append(("pupil", 4, inside(ellipse(cu, cv + 0.001 * k, iris[0] * 0.42, iris[1] * 0.5, 12))))
        # Highlights: one light for the whole face, so both glints sit to the same side.
        g = d["glint"]
        polys.append(("eye-highlight", 5, inside(ellipse(cu + iris[0] * 0.3, cv + iris[1] * 0.42, 0.0038 * k * g, 0.0044 * k * g, 10))))
        polys.append(("eye-highlight", 5, inside(ellipse(cu - iris[0] * 0.35, cv - iris[1] * 0.45, 0.0017 * k * g, 0.0017 * k * g, 8))))
        # Upper lash: a band over the upper lid, thicker toward the outer corner, a flick.
        n = len(up1)
        band_top, band_bottom = [], []
        for i, (u, v) in enumerate(up1):
            t = i / (n - 1)
            thick = lerp(0.0024, 0.0052, t ** 1.3) * k
            band_top.append((u, v + thick * 0.62))
            band_bottom.append((u, v - thick * 0.38))
        last_u, last_v = up1[-1]
        flick = (last_u + side * 0.0046 * k, last_v + 0.0012 * k)
        polys.append(("lash", 6, band_top + [flick] + list(reversed(band_bottom))))
        lower_half = low1[n // 2 :]
        polys.append(("lash", 6, [(u, v + 0.0003 * k) for u, v in lower_half] + [(u, v - 0.0008 * k) for u, v in reversed(lower_half)]))
        # Brow: a soft thin arc.
        lift = (0.005 * p.get("surprised", 0) + 0.0015 * p.get("happy", 0)) * k
        brow = []
        for i in range(8):
            t = i / 7
            u = side * lerp(1 - 0.65 * d["brow_w"], 1 + 0.45 * d["brow_w"], t) * d["eye_u"]
            v = d["brow_v"] + 0.003 * k * math.sin(math.pi * t) - 0.003 * k * t + lift
            brow.append((u, v, 0.0016 * k * (1 - 0.55 * abs(t - 0.35))))
        polys.append(("brow", 6, [(u, v + t) for u, v, t in brow] + [(u, v - t) for u, v, t in reversed(brow)]))
        if d["blush"]:
            polys.append(("blush", 1, ellipse(side * d["eye_u"] * 1.02, d["eye_v"] - 0.027 * k, 0.0095 * k, 0.0048 * k, 14)))
        if d["lines"]:
            # Crow's feet: two short strokes fanning from the outer eye corner.
            ou = side * (d["eye_u"] + d["eye_w"] * 1.25)
            for dv, du in ((0.003, 0.006), (-0.004, 0.0055)):
                a = (ou, d["eye_v"] + dv * 0.3 * k)
                b = (ou + side * du * k, d["eye_v"] + dv * k)
                polys.append(("nose", 2, stroke([a, b], 0.0006 * k)))
            # Smile folds: an arc from beside the nose round the mouth corner.
            nv = d["nose_v"] if d["nose_v"] is not None else d["eye_v"] - 0.026 * k
            pts = []
            for i in range(6):
                t = i / 5
                u = side * d["mouth_w"] * lerp(0.9, 1.35, math.sin(math.pi * t * 0.6))
                pts.append((u, lerp(nv - 0.002 * k, d["mouth_v"] - 0.004 * k, t)))
            polys.append(("nose", 2, stroke(pts, 0.0007 * k)))
    # Mouth: a small curved line that opens with the visemes and curls up in a smile.
    open_ = wide = round_ = 0.0
    for name, (o, w, r) in {"aa": (1.0, 0.1, 0), "ih": (0.35, 0.55, 0), "ou": (0.5, 0, 1.0), "ee": (0.42, 0.75, 0), "oh": (0.78, 0, 0.6)}.items():
        weight = p.get(name, 0)
        open_ += o * weight
        wide += w * weight
        round_ += r * weight
    smile = d["smile"] + p.get("happy", 0) * 0.8 + p.get("relaxed", 0) * 0.3
    open_ += 0.35 * p.get("happy", 0) + 0.5 * p.get("surprised", 0)
    round_ += 0.6 * p.get("surprised", 0)
    mw = d["mouth_w"] * (1 + 0.5 * wide - 0.3 * round_ + 0.2 * smile + 0.25 * open_)
    mv = d["mouth_v"]
    n = 10
    top, bottom = [], []
    for i in range(n):
        t = i / (n - 1)
        a = lerp(-1, 1, t)
        u = a * mw
        curve = (a * a) * (0.0022 * smile - 0.0004) * k
        roundness = math.sqrt(max(0.0, 1 - a * a))
        shape = lerp(1 - a ** 4, roundness, min(1.0, round_))
        top.append((u, mv + curve + (0.0005 + 0.0018 * open_) * k * shape))
        bottom.append((u, mv + curve - (0.0005 + 0.012 * open_) * k * shape * (1 - 0.2 * min(smile, 1))))
    polys.append(("mouth", 3, top + list(reversed(bottom))))
    nv = d["nose_v"] + 0.006 * k if d["nose_v"] is not None else d["eye_v"] - 0.022 * k
    polys.append(("nose", 2, [(0.0, nv), (0.0022 * k, nv - 0.006 * k), (-0.001 * k, nv - 0.0058 * k)]))
    return polys


def build_face(head, hp, materials, layer_gap=0.00035):
    """The decal mesh 'Face' with one shape key per expression. `materials` maps the decal
    names (eye-white, iris, iris-light, pupil, eye-highlight, lash, brow, mouth, blush,
    nose) to Blender materials."""
    from mathutils.bvhtree import BVHTree

    bvh = BVHTree.FromObject(head, bpy.context.evaluated_depsgraph_get())
    C = hp["centre"]
    d = dims(hp)

    def project(polys):
        out = []
        for mat, layer, pts in polys:
            placed = []
            for u, v in pts:
                x, z = C.x + u, C.z + v
                hit, normal, _i, _d = bvh.ray_cast(Vector((x, -2.0, z)), Vector((0, 1, 0)), 4.0)
                if hit is None:
                    hit, normal = Vector((x, C.y - hp["ry_front"] * 0.9, z)), Vector((0, -1, 0))
                placed.append(hit + normal * (layer_gap * layer + 0.00025))
            out.append((mat, placed))
        return out

    base = project(layout({}, d))
    bm = bmesh.new()
    face_mats = []
    for mat, placed in base:
        centre = sum(placed, Vector()) / len(placed)
        verts = [bm.verts.new(p) for p in placed]
        hub = bm.verts.new(centre)
        for a, b in zip(verts, verts[1:] + verts[:1]):
            bm.faces.new((hub, b, a))
            face_mats.append(mat)
    mesh = bpy.data.meshes.new("Face")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("Face", mesh)
    bpy.context.scene.collection.objects.link(obj)
    names = list(materials)
    for name in names:
        mesh.materials.append(materials[name])
    for poly, mat in zip(mesh.polygons, face_mats):
        poly.material_index = names.index(mat)
        poly.use_smooth = False
    obj.shape_key_add(name="Basis", from_mix=False)

    def flat(projected):
        coords = []
        for _mat, placed in projected:
            coords.extend(placed)
            coords.append(sum(placed, Vector()) / len(placed))
        return coords

    for key in FACE_KEYS:
        coords = flat(project(layout({key: 1.0}, d)))
        assert len(coords) == len(mesh.vertices), key
        block = obj.shape_key_add(name=key, from_mix=False)
        for i, co in enumerate(coords):
            block.data[i].co = co
        block.value = 0.0
    return obj
