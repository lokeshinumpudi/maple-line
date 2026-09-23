"""Head, hair and skirt for the concept cast, fitted to the aligned painted views.

The body volume (shape.py) is poor at faces and thin cloth, so these parts are modelled
directly: a rounded anime head from face landmarks, a hair shell whose outline is cut by
the hair silhouettes of all three views, and a pleated skirt lofted through the skirt
silhouette. Blender coordinates: Z up, facing -Y, her left at +X.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import matte as mt


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def to_object(bm, name, material=None):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


# ---------------------------------------------------------------------------------------
# Head.


def head_params(views, m):
    """Head centre and radii in metres from the face landmarks of the front and side views."""
    hc = views.cfg["head"]
    fz = lambda row: views.z_of_row("front", row)  # noqa: E731
    sy = lambda col: views.h_of_col("side", col)  # noqa: E731
    s = views.frame["front"].scale
    z_eye = fz(hc["front"]["eyeRow"])
    z_chin = m["z_chin"]
    y_face = sy(hc["side"]["forehead"][0]) + 0.004
    y_ear = sy(hc["side"]["ear"][0])
    zc = z_eye + 0.012
    ry = (y_ear + 0.004) - y_face
    return {
        "centre": Vector((0.0, y_ear + 0.004, zc)),
        "rx": hc["front"]["faceHalfWidth"] * s * 1.1,
        "ry_front": ry,
        "ry_back": ry * 1.02,
        "rz_top": views.cfg["height"] - 0.042 - zc,
        "rz_bottom": zc - z_chin,
        "z_eye": z_eye,
        "z_mouth": fz(hc["front"]["mouth"][1]),
        "z_brow": fz(hc["front"]["brow"]),
        "eye_x": hc["front"]["eyeSpacing"] * s / 2,
        "y_chin": sy(hc["side"]["chin"][0]),
        "y_ear": y_ear,
        "z_ear": fz(hc["front"]["earRow"]),
    }


def build_head(hp, material):
    """A soft anime head: round cranium, flat-ish face plane, a small tapered chin, ears."""
    C = hp["centre"]
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=1.0)
    chin_back = hp["y_chin"] - (C.y - hp["ry_front"])  # how far the chin sits behind the brow
    for v in bm.verts:
        x, y, z = v.co
        if z < 0:
            # Fuller lower face: a superellipse profile keeps the cheeks wide to the mouth.
            circle = math.sqrt(max(1e-6, 1 - z * z))
            fuller = max(0.0, 1 - abs(z) ** 2.6) ** (1 / 2.6)
            x, y = x * fuller / circle, y * fuller / circle
        jaw = smoothstep(-0.4, -1.0, z)
        cheek = smoothstep(0.25, -0.4, z) * (1 - jaw)
        # Soft anime jaw: round cheeks narrowing late into a small chin.
        X = x * hp["rx"] * (1 - 0.42 * jaw ** 1.2) * (1 + 0.05 * cheek)
        if y < 0:
            # The face: flatter than the skull, and the chin tucks back under the brow.
            flat = 1 - 0.18 * (1 - abs(z)) * (1 - jaw)
            Y = y * hp["ry_front"] * flat + jaw * chin_back * 0.55 * (-y) ** 0.5
        else:
            Y = y * hp["ry_back"] * (1 - 0.35 * jaw)
        Z = z * (hp["rz_top"] if z > 0 else hp["rz_bottom"])
        v.co = C + Vector((X, Y, Z))
    # Scalp: everything above the hairline and behind the ears is hair-coloured, so any
    # gap between hair locks shows hair, not a bald patch.
    for f in bm.faces:
        c = f.calc_center_median()
        behind = c.y > hp["y_ear"] + 0.006 and c.z > hp["z_ear"] - 0.03
        above = c.z > hp["z_brow"] + 0.004 or (c.z > hp["z_eye"] and abs(c.x) > hp["rx"] * 0.72)
        f.material_index = 1 if (behind or above) else 0
    for sx in (1, -1):
        ear = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1.0)
        for v in ear["verts"]:
            x, y, z = v.co
            v.co = Vector((sx * (hp["rx"] * 0.84 + (x + 0.4) * 0.009), hp["y_ear"] + y * 0.014, hp["z_ear"] + 0.004 + z * 0.021))
    obj = to_object(bm, "Head", material)
    return obj


# ---------------------------------------------------------------------------------------
# Hair: a shell cut by the hair silhouettes.


def hair_masks(views):
    """Dark-hair pixels of each view: the biggest dark piece above the neck, minus the eyes."""
    cfg = views.cfg
    hc = cfg["head"]
    out = {}
    raw = {}
    for view in ("front", "side", "back"):
        img, mask = views.img[view], views.mask[view]
        dark = mask & (img.mean(axis=2) < 0.33) & (np.abs(img[..., 2] - img[..., 0]) < 0.12)
        dark[cfg["rows"]["neck"] - 4 :, :] = False
        raw[view] = dark.copy()
        if view == "front":
            ax = int(views.frame["front"].axis)
            w = hc["front"]["faceHalfWidth"]
            dark[hc["front"]["brow"] + 6 : hc["front"]["chin"][1], ax - int(w * 0.85) : ax + int(w * 0.85)] = False
        if view == "side":
            ex = hc["side"]["ear"][0] - 14
            dark[hc["front"]["brow"] + 8 : hc["side"]["chin"][1] + 2, : ex] = False
        # Close the gaps between painted strands (the bangs show forehead between them).
        dark = mt.closing(dark, 4 if view == "front" else 2)
        dark = mt.largest_component(dark)
        dark = mt.fill_holes(dark)
        # A solid fringe: above the brow line every row is hair from edge to edge, so the
        # forehead showing between painted strands does not cut holes in the shell.
        for row in range(0, hc["front"]["brow"] + 3):
            cols = np.nonzero(dark[row])[0]
            if len(cols) > 1:
                dark[row, cols[0] : cols[-1] + 1] = True
        out[view] = dark
    # Symmetric front and back: the parting and the clip are painted, not modelled.
    out["front"] = mt.symmetric_from_half(out["front"], views.frame["front"].axis, "right")
    out["back"] = mt.symmetric_from_half(out["back"], views.frame["back"].axis, "left")
    # Painted hair pixels as drawn (strands only, no filling), for colour lookups.
    out["raw"] = {v: raw[v] & mt.dilate(out[v], 2) for v in raw}
    return out


def hair_extents(views, masks, z):
    """Outer front half width and side (front, back) extents of the hair at height z."""
    res = {}
    for view in ("front", "side"):
        fr = views.frame[view]
        row = int(np.floor(fr.to_pixel(0, z)[1]))
        row = int(np.clip(row, 0, masks[view].shape[0] - 1))
        cols = np.nonzero(masks[view][row])[0]
        if not len(cols):
            return None
        a, b = fr.to_world(cols[0], 0)[0], fr.to_world(cols[-1] + 1, 0)[0]
        res[view] = (float(a), float(b))
    return res


def in_hair(views, masks, p, pad=1):
    """Is world point p inside the hair of the view that faces it (front or back) and of
    the side view?"""
    x, y, z = p

    def hit(v, hh):
        px, py = views.frame[v].to_pixel(hh, z)
        xi, yi = int(np.floor(px)), int(np.floor(py))
        mk = masks[v]
        if not (0 <= yi < mk.shape[0] and 0 <= xi < mk.shape[1]):
            return False
        return bool(mk[max(0, yi - pad) : yi + pad + 1, max(0, xi - pad) : xi + pad + 1].any())

    # Front half: the front view decides; back half: the back view; near the ears, where
    # the two painted outlines disagree by a few pixels, either will do.
    band = 0.03
    if y < masks["cy"] - band:
        facing = hit("front", x)
    elif y > masks["cy"] + band:
        facing = hit("back", -x)
    else:
        facing = hit("front", x) or hit("back", -x)
    return facing and hit("side", y)


def build_hair(views, hp, material, rows=20, cols=48, thickness=0.012, locks=30):
    masks = hair_masks(views)
    top = views.cfg["height"]
    # Lowest hair row in any view.
    lows = []
    for v in ("front", "side", "back"):
        r0, r1 = mt.extent_rows(masks[v])
        lows.append(views.z_of_row(v, r1 + 1))
    z_low = min(lows) - 0.004
    zs = np.linspace(top - 0.003, z_low, rows + 1)
    C = hp["centre"]
    masks["cy"] = C.y
    rings = []
    for z in zs:
        e = hair_extents(views, masks, z)
        if e is None:
            e = rings[-1][1] if rings else {"front": (-0.01, 0.01), "side": (C.y - 0.01, C.y + 0.01)}
        rings.append((z, e))
    # Near the crown the silhouette closes to a point; keep a minimum ring so the top is a dome.
    grid = np.zeros((len(zs), cols, 3))
    for i, (z, e) in enumerate(rings):
        ax = max(0.5 * (e["front"][1] - e["front"][0]), 0.004)
        y0, y1 = e["side"]
        cy, ay = C.y, max(y1 - C.y, C.y - y0, 0.004)
        ayf, ayb = max(C.y - y0, 0.004), max(y1 - C.y, 0.004)
        for j in range(cols):
            a = 2 * math.pi * j / cols
            s, c = math.sin(a), -math.cos(a)  # a = 0 faces -Y (front)
            r = 1.0 / ((abs(s) ** 2.3 + abs(c) ** 2.3) ** (1 / 2.3))
            grid[i, j] = (s * r * ax, cy + c * r * (ayf if c < 0 else ayb), z)
        del cy, ay
    keep = np.zeros((len(zs), cols), dtype=bool)
    for i in range(len(zs)):
        for j in range(cols):
            keep[i, j] = in_hair(views, masks, grid[i, j])
    # Each column keeps its hair rows; where a run of hair ends (the hem, the fringe, the
    # top of the ear) the last step is refined by bisection so the edge follows the painted
    # outline, not the ring spacing. Hair can start again below a gap (behind the ear).
    bm = bmesh.new()
    verts = {}
    ends = set()
    for j in range(cols):
        for i in range(len(zs)):
            if not keep[i, j]:
                continue
            verts[(i, j)] = bm.verts.new(Vector(grid[i, j]))
            if i + 1 < len(zs) and not keep[i + 1, j]:
                a, b = grid[i, j], grid[i + 1, j]
                for _ in range(6):
                    mid = (a + b) / 2
                    if in_hair(views, masks, mid):
                        a = mid
                    else:
                        b = mid
                verts[(i + 1, j)] = bm.verts.new(Vector(a))
                ends.add((i + 1, j))
    for j in range(cols):
        k = (j + 1) % cols
        for i in range(len(zs) - 1):
            if (i, j) in ends or (i, k) in ends:
                continue  # an edge vertex only closes the quad above it
            quad = [(i, j), (i + 1, j), (i + 1, k), (i, k)]  # counter-clockwise from outside
            have = [q in verts for q in quad]
            if all(have):
                bm.faces.new([verts[q] for q in quad])
            elif sum(have) == 3:
                bm.faces.new([verts[q] for q, h in zip(quad, have) if h])
    # Crown: the first complete ring closes onto one vertex on top; the rows above it,
    # where the outline is only a few pixels wide, are dropped.
    i0 = next(i for i in range(rows) if all((i, j) in verts and (i, j) not in ends for j in range(cols)))
    for f in [f for f in bm.faces if any(v in {verts.get((i, j)) for i in range(i0) for j in range(cols)} for v in f.verts)]:
        bm.faces.remove(f)
    cap = bm.verts.new(Vector((C.x, C.y + 0.004, top)))
    for j in range(cols):
        bm.faces.new((cap, verts[(i0, j)], verts[(i0, (j + 1) % cols)]))
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    # Close pinholes where a ring step missed a thin painted strand, and the gap over the
    # ear the painted side view leaves between strands; the face opening and
    # the hem are far longer loops and stay open.
    bmesh.ops.holes_fill(bm, edges=bm.edges, sides=30)
    obj = to_object(bm, "Hair", material)
    # Thickness inwards, so the outside keeps the silhouette.
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    sub = obj.modifiers.new("smooth", "SMOOTH")
    sub.factor = 0.5
    sub.iterations = 4
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = -1
    sol.use_even_offset = True
    sol.use_rim = True
    for mod in ("smooth", "thick"):
        bpy.ops.object.modifier_apply(modifier=mod)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    lock_obj = build_locks(views, masks, grid, keep, rings, C, material, locks)
    bpy.ops.object.select_all(action="DESELECT")
    lock_obj.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    return obj, masks


def column_runs(keep_col):
    """(start, end) row index pairs of consecutive True rows."""
    runs, start = [], None
    for i, k in enumerate(keep_col):
        if k and start is None:
            start = i
        if not k and start is not None:
            runs.append((start, i - 1))
            start = None
    if start is not None:
        runs.append((start, len(keep_col) - 1))
    return runs


def refine_end(views, masks, a, b):
    for _ in range(6):
        mid = (a + b) / 2
        if in_hair(views, masks, mid):
            a = mid
        else:
            b = mid
    return a


def build_locks(views, masks, grid, keep, rings, C, material, n_locks):
    """Tapered locks laid over the shell from the crown down: each follows one shell
    column to where the painted hair ends and runs on into a pointed tip, so the fringe and
    the bob hem read as separate locks of hair instead of a cut edge."""
    rows, cols = keep.shape
    bm = bmesh.new()
    z_crown = C.z + 0.075
    for n in range(n_locks):
        # Lock columns sit between shell columns; sample the column nearest the lock angle.
        j = int(round((n + 0.5) * cols / n_locks)) % cols
        for r0, r1 in column_runs(keep[:, j]):
            if r1 - r0 < 2:
                continue
            start = r0
            while start < r1 and grid[start, j][2] > z_crown:
                start += 1
            pts = [Vector(grid[i, j]) for i in range(max(r0, start - 1), r1 + 1)]
            if r1 + 1 < rows:
                pts.append(Vector(refine_end(views, masks, grid[r1, j], grid[r1 + 1, j])))
            # Relax the path sideways only (keep each point's distance from the head axis),
            # so a lock falls in one curve without sinking into the shell.
            for _ in range(2):
                relaxed = [pts[0]]
                for k in range(1, len(pts) - 1):
                    q = (pts[k - 1] + pts[k] * 2 + pts[k + 1]) / 4
                    r_old = Vector((pts[k].x - C.x, pts[k].y - C.y, 0)).length
                    d = Vector((q.x - C.x, q.y - C.y, 0))
                    if d.length > 1e-6:
                        d = d.normalized() * max(r_old, d.length)
                        q = Vector((C.x + d.x, C.y + d.y, q.z))
                    relaxed.append(q)
                pts = relaxed + [pts[-1]]
            if len(pts) < 3:
                continue
            front = pts[-1].y < C.y - 0.4 * (C.y - rings[r1][1]["side"][0])
            last = not keep[r1 + 1 :, j].any()
            if not (front or last):
                continue  # the upper edge of the ear gap: no lock tip there
            tip = (0.016 if front else 0.008) * (0.7 + 0.3 * ((n * 7) % 5) / 4)
            d = (pts[-1] - pts[-2]).normalized()
            pts.append(pts[-1] + (d * 0.5 + Vector((0, 0, -0.5))).normalized() * tip)
            lift = 0.0012 + 0.001 * (n % 2)
            radius = (grid[r1, j][0] ** 2 + (grid[r1, j][1] - C.y) ** 2) ** 0.5
            half = math.pi * radius / n_locks * 1.25  # neighbours overlap a little
            ring = []
            for k, p in enumerate(pts):
                t = k / (len(pts) - 1)
                out = Vector((p.x - C.x, p.y - C.y, 0.0))
                out = out.normalized() if out.length > 1e-6 else Vector((0, 0, 1))
                if k + 1 < len(pts):
                    along = (pts[k + 1] - p).normalized()
                else:
                    along = (p - pts[k - 1]).normalized()
                across = along.cross(out).normalized()
                w = half * (1.0 if t < 0.65 else max(0.0, (1 - t) / 0.35) ** 0.6)
                base = p + out * lift
                ring.append((base + across * w, base + out * (0.0018 + 0.0015 * (1 - t)), base - across * w))
            vs = [[bm.verts.new(q) for q in trio] for trio in ring]
            for a_, b_ in zip(vs, vs[1:]):
                # Counter-clockwise from outside: left, mid, right across; downward along.
                bm.faces.new((a_[0], a_[1], b_[1], b_[0]))
                bm.faces.new((a_[1], a_[2], b_[2], b_[1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
    return to_object(bm, "HairLocks", material)


# ---------------------------------------------------------------------------------------
# Skirt: rings through the front and side skirt silhouette, with pleats toward the hem.


def build_skirt(views, m, material, rows=10, cols=48, pleats=24):
    front, side = views.sym["front"], views.mask["side"]
    z_top = m["z_skirt_top"]
    # Hem height: where the skirt's centre run ends in the front view (legs part at x = 0).
    z_hem = m["z_hem"] + 0.004
    zs = np.linspace(z_top, z_hem, rows + 1)
    ff, fs = views.frame["front"], views.frame["side"]
    bm = bmesh.new()
    rings = []
    for i, z in enumerate(zs):
        zq = min(z, z_top - 0.006) if i == 0 else z
        zq = max(zq, z_hem + 0.016)  # the painted hem is ragged with pleat tips
        prow = int(np.floor(ff.to_pixel(0, zq)[1]))
        cols_f = np.nonzero(front[prow])[0]
        runs = mt.row_runs(front[prow])
        ax_px = next(((a, b) for a, b in runs if a <= ff.axis <= b), (cols_f[0], cols_f[-1] + 1))
        ax = (ax_px[1] - ax_px[0]) / 2 * ff.scale
        srow = int(np.floor(fs.to_pixel(0, zq)[1]))
        cs = np.nonzero(side[srow])[0]
        y0, y1 = fs.to_world(cs[0], 0)[0], fs.to_world(cs[-1] + 1, 0)[0]
        cy, ay = (y0 + y1) / 2, (y1 - y0) / 2
        t = i / rows
        flare = 1 + 0.035 * max(0.0, (z_hem + 0.03 - z) / 0.03)
        ax, ay = ax * flare, ay * flare
        amp = 0.004 + 0.02 * t ** 1.2  # pleat depth grows toward the hem
        ring = []
        for j in range(cols):
            a = 2 * math.pi * j / cols
            s, c = math.sin(a), -math.cos(a)
            r = 1.0 / ((abs(s) ** 2.2 + abs(c) ** 2.2) ** (1 / 2.2))
            fold = 1 - amp * (1 if j % 2 else -0.3)
            ring.append(bm.verts.new((s * r * ax * fold, cy + c * r * ay * fold, z)))
        rings.append(ring)
    del pleats
    for a, b in zip(rings, rings[1:]):
        for j in range(cols):
            k = (j + 1) % cols
            bm.faces.new((a[j], b[j], b[k], a[k]))
    obj = to_object(bm, "Skirt", material)
    return obj


# ---------------------------------------------------------------------------------------
# Hair clip: a small rounded bar lying on the hair where the side view paints it.


def build_clip(views, hp, hair, material, length=0.036, width=0.009, depth=0.004):
    from mathutils.bvhtree import BVHTree

    cx, cz = views.cfg["clipSide"]
    y = views.h_of_col("side", cx)
    z = views.z_of_row("side", cz)
    bvh = BVHTree.FromObject(hair, bpy.context.evaluated_depsgraph_get())
    hit, normal, _i, _d = bvh.ray_cast(Vector((1.0, y, z)), Vector((-1, 0, 0)), 2.0)
    if hit is None:
        hit, normal = Vector((hp["rx"] * 1.3, y, z)), Vector((1, 0, 0))
    # Long axis: backward along the hair surface, tipped up at the back a little.
    back = Vector((0, 1, 0.25))
    along = (back - normal * back.dot(normal)).normalized()
    across = normal.cross(along).normalized()
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        a, b, c = v.co
        v.co = hit + normal * (depth * 0.5 + 0.001) + along * a * length + across * b * width + normal * c * depth
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.0018, segments=2, affect="EDGES")
    return to_object(bm, "HairClip", material)
