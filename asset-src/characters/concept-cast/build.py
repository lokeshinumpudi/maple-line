"""Maple Line concept cast: a VRM character built in Blender from three painted views.

    blender -b --factory-startup --python-exit-code 1 \\
      --python asset-src/characters/concept-cast/build.py -- --cast riko [--render <folder>]
    node asset-src/characters/vrm-cast/make-vrm.mjs --from asset-src/characters/concept-cast/build riko

Steps (each a function below): matte the front, side and back views and align them to
one height; carve a rounded body volume from the silhouettes and mesh it through an
OpenVDB grid, QuadriFlow and smoothing; model the head, hair and skirt from the same
silhouettes; unwrap and bake the painted views onto the meshes (Cycles bakes of position
and of sun visibility per view, blended by facing); draw the face as layered decals with
VRM expression shape keys; fit the humanoid skeleton to landmarks measured from the
silhouettes, skin it with heat weights and clean them; turn the A-pose into the VRM
T-pose; export a GLB and a sidecar for make-vrm.mjs. Blender coordinates: Z up, the
character faces -Y, her left is +X.
"""

import json
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "lib"))
import maple_assets as ma  # noqa: E402
import matte as mt  # noqa: E402
import parts  # noqa: E402
import bake  # noqa: E402
import face as fc  # noqa: E402
import rig  # noqa: E402
import shape as sh  # noqa: E402

BUILD = os.path.join(HERE, "build")
ARGS = ma.parse_args({}, {"--cast": {"default": "riko"}, "--stage": {"default": "all"}})
CELL = 0.003  # voxel size in metres
SLEEVE_DEPTH = 1.2  # the sleeve is puffier seen from the side than from the front
ARM_GAP = 0.008  # half the gap between the torso side and the hanging arm


def log(*parts):
    print("[concept-cast]", *parts, flush=True)


# ---------------------------------------------------------------------------------------
# Images in and out.


def load_rgb(path):
    image = bpy.data.images.load(path, check_existing=False)
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(h, w, 4)[::-1, :, :3].copy()


def save_rgb(array, path, alpha=None):
    h, w = array.shape[:2]
    if array.ndim == 2:
        array = np.repeat(array[:, :, None], 3, axis=2)
    a = np.ones((h, w, 1), np.float32) if alpha is None else alpha[:, :, None].astype(np.float32)
    rgba = np.concatenate([array.astype(np.float32), a], axis=2)[::-1]
    image = bpy.data.images.new(os.path.basename(path), w, h, alpha=alpha is not None)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def hex_rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_hex(value):
    return tuple(srgb_to_linear(hex_rgb(value)).tolist()) + (1.0,)


# ---------------------------------------------------------------------------------------
# 1. Matte and alignment.


class Views:
    """The three painted views, their masks and world frames."""

    def __init__(self, cfg):
        self.cfg = cfg
        H = cfg["height"]
        self.img = {k: load_rgb(os.path.join(HERE, p)) for k, p in cfg["views"].items()}
        self.mask = {}
        self.alpha = {}
        for k, img in self.img.items():
            self.mask[k], self.alpha[k] = mt.matte(img, ground_shadow=cfg.get("groundShadow", False))
        # Paper the matte closed over (between feet set close together) is cut back out.
        for k, polys in cfg.get("maskCuts", {}).items():
            for poly in polys:
                self.mask[k] &= ~mt.polygon_mask(self.mask[k].shape, poly)
        shape = self.mask["side"].shape
        self.side_cut = np.zeros(shape, dtype=bool)
        for poly in cfg.get("sideCuts", []):
            self.side_cut |= mt.polygon_mask(shape, poly)
        self.side_clip = mt.polygon_mask(shape, cfg["sideClip"]) if cfg.get("sideClip") else np.zeros(shape, bool)
        self.front_clip = mt.polygon_mask(shape, cfg["frontClip"]) if cfg.get("frontClip") else np.zeros(shape, bool)
        self.mask["side"] = mt.largest_component(self.mask["side"] & ~self.side_cut)
        # A neckerchief hanging in front of the chest is not body depth.
        if cfg.get("neckerchief"):
            self.side_depth = strip_front_red(self.img["side"], self.mask["side"], cfg["rows"])
        else:
            self.side_depth = self.mask["side"]
        # Axis rows: the lower legs (knee to shin), clear of the bag and the hair.
        rows = (0.72, 0.76, 0.8, 0.84)
        self.frame = {k: mt.frame_for(self.mask[k], H, rows) for k in self.mask}
        f, b = self.frame["front"], self.frame["back"]
        self.sym = {
            "front": mt.symmetric_from_half(self.mask["front"], f.axis, cfg["keepHalf"]["front"]),
            "back": mt.symmetric_from_half(self.mask["back"], b.axis, cfg["keepHalf"]["back"]),
        }
        # Mirror check: the back view seen from the front, in world units, against the front.
        self.mirror_iou = self.compare_front_back()

    def compare_front_back(self, cell=0.004):
        hs = np.arange(-0.45, 0.45, cell)
        zs = np.arange(cell / 2, self.cfg["height"], cell)
        front = sh.sample_view(self.sym["front"], self.frame["front"], hs, zs)
        back = sh.sample_view(self.sym["back"], self.frame["back"], -hs, zs)
        return mt.iou(front, back)

    def px(self, view, h, z):
        return self.frame[view].to_pixel(h, z)

    def world(self, view, x, y):
        return self.frame[view].to_world(x, y)

    def z_of_row(self, view, row):
        return float(self.frame[view].to_world(0, row)[1])

    def h_of_col(self, view, col):
        return float(self.frame[view].to_world(col, 0)[0])


def strip_front_red(img, mask, rows, reach=45):
    """The side silhouette without the neckerchief that hangs in front of the chest. Rows
    whose front edge is red get a front edge interpolated from the nearest rows above and
    below that show the blouse itself."""
    out = mask.copy()
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    red = (r > 0.5) & (g < 0.42) & (b < 0.42) & (r - g > 0.25)
    front = {}
    covered = []
    for row in range(rows["neck"], rows["waist"]):
        cols = np.nonzero(mask[row])[0]
        if not len(cols):
            continue
        front[row] = cols[0]
        if red[row, cols[0] : cols[0] + reach].any():
            covered.append(row)
    if not covered:
        return out
    top, bottom = min(covered) - 2, max(covered) + 2
    above = next((front[r_] for r_ in range(top, rows["neck"] - 1, -1) if r_ in front), None)
    below = next((front[r_] for r_ in range(bottom, rows["waist"]) if r_ in front), None)
    if above is None or below is None:
        return out
    for row in range(top, bottom + 1):
        t = (row - top) / max(bottom - top, 1)
        edge = int(round(above + (below - above) * t))
        out[row, :edge] = False
    return out


# ---------------------------------------------------------------------------------------
# 2. Landmarks and the body volume.


def measure(views, grid, F, S):
    cfg = views.cfg
    H = cfg["height"]
    fz = lambda row: views.z_of_row("front", row)  # noqa: E731
    sz = lambda row: views.z_of_row("side", row)  # noqa: E731
    runs = [sh.runs_m(F[:, k], grid.xs) for k in range(len(grid.zs))]
    zs = grid.zs
    # The hem: the lowest row with a run over the centre line (legs leave a gap at x = 0).
    if "hem" in cfg["rows"]:  # a long dress over feet set close together: given by hand
        hem = views.z_of_row("front", cfg["rows"]["hem"])
    else:
        hem = min(z for k, z in enumerate(zs) if sh.containing(runs[k], 0.0) and z > cfg.get("hemMin", 0.3))
    z_shoulder = fz(cfg["rows"]["shoulder"])
    armpit = mt.find_armpit(runs, zs, zmin=cfg.get("armpitMin", 0.58) * H, zmax=z_shoulder)
    m = {"z_hem": hem, "z_armpit": armpit}
    m["z_waist"] = fz(cfg["rows"]["waist"])
    m["z_skirt_top"] = fz(cfg["rows"]["skirtTop"])
    m["z_shoulder"] = fz(cfg["rows"]["shoulder"])
    m["z_neck"] = fz(cfg["rows"]["neck"])
    hc = cfg["head"]
    m["z_chin"] = 0.5 * (fz(hc["front"]["chin"][1]) + sz(hc["side"]["chin"][1]))
    m["z_neck_top"] = m["z_chin"] + 0.01
    # Where a baggy sleeve lies against the body all the way down (a cardigan), the side
    # line between them is drawn by hand: `torsoLine` rows and half widths in front pixels.
    line = cfg.get("torsoLine")
    if line:
        lz = np.array([fz(r) for r, _h in line])
        lh = np.array([h * views.frame["front"].scale for _r, h in line])
        order_l = np.argsort(lz)
        m["torso_line"] = lambda z: float(np.interp(z, lz[order_l], lh[order_l]))  # noqa: E731
    # Torso half width just under the armpit: arms beyond it are swept separately.
    k_arm = int(np.searchsorted(zs, armpit - 0.012))
    t = sh.containing(runs[k_arm], 0.0)
    m["torso_half_armpit"] = m["torso_line"](armpit) if line else max(abs(t[0]), abs(t[1]))

    def torso_x_limit(z):
        if z > z_shoulder - 0.035:
            return 1.0  # the shoulder line: the whole centre run
        if z > armpit - 0.012:
            # Leave a gap between the blouse side and the sleeve so the arm can lift.
            return (m["torso_line"](z) if line else m["torso_half_armpit"]) - ARM_GAP
        k = int(np.clip(np.searchsorted(zs, z), 0, len(zs) - 1))
        c = sh.containing(runs[k], 0.0)
        half = max(abs(c[0]), abs(c[1])) if c else 0.3
        # Hands touching a baggy hem merge into the body run; the drawn line keeps them out.
        return min(half, m["torso_line"](z)) if line else half

    m["torso_x_limit"] = torso_x_limit
    # Neck: front width and side depth a little under the hair line.
    k_neck = int(np.searchsorted(zs, m["z_neck"]))
    n = sh.containing(runs[k_neck], 0.0)
    ny0 = views.h_of_col("side", hc["side"]["neckFront"])
    ny1 = views.h_of_col("side", hc["side"]["neckBack"])
    m["neck"] = (0.0, (n[1] - n[0]) / 2 * cfg.get("neckWidth", 0.68), (ny0 + ny1) / 2, (ny1 - ny0) / 2 * 0.85)
    # Legs just under the hem.
    k_leg = int(np.searchsorted(zs, hem - 0.02))
    legs = [r for r in runs[k_leg] if (r[0] + r[1]) / 2 > 0]
    leg = min(legs, key=lambda r: (r[0] + r[1]) / 2)
    s = sh.widest(sh.runs_m(S[:, k_leg], grid.ys))
    depth = (s[1] - s[0]) * 0.9
    m["leg_hem"] = ((leg[0] + leg[1]) / 2, (leg[1] - leg[0]) / 2, s[1] - depth / 2, depth / 2)
    # Hips and crotch by proportion (hidden under the skirt): VRM hips at 0.545 H, which
    # is also how the game reads a VRM's height back from its hips.
    m["z_hips"] = 0.545 * H
    m["z_crotch"] = m["z_hips"] - 0.085 * H
    # Ankle: the top of the shoe, found as the lowest row whose leg runs are sock-white.
    m["z_ankle"] = ankle_height(views)
    return m, runs


def ankle_height(views):
    """Top of the shoes: going up from the sole, the first row after the shoe rows where
    most of the silhouette is light (sock or skin) rather than dark leather."""
    img, mask = views.img["front"], views.sym["front"]
    top, sole = mt.extent_rows(mask)
    seen_shoe = False
    for row in range(sole, int(sole - 0.2 * (sole - top)), -1):
        cols = np.nonzero(mask[row])[0]
        if len(cols) < 4:
            continue
        light = (img[row, cols].mean(axis=1) > 0.72).mean()
        if light < 0.3:
            seen_shoe = True
        elif seen_shoe and light > 0.6:
            return views.z_of_row("front", row)
    return 0.08


def skin_like(colours, skin=(0.97, 0.8, 0.64)):
    return np.linalg.norm(colours - np.array(skin), axis=-1) < 0.2


def arm_path(views, grid, F, m):
    """Centre line, perpendicular radius and depth ratio of her left arm (+x), shoulder to
    fingertips, from the symmetric front silhouette. Below the armpit the arm is its own
    silhouette run; above it the sleeve lies against the blouse, so the arm is the part of
    the centre run beyond the torso's side line."""
    lim = m["torso_half_armpit"]
    zs_a, cs, ws = mt.arm_line(
        F.T, grid.xs, grid.zs, +1, m["z_armpit"] - 0.004, 0.3,
        lambda z: m["torso_x_limit"](z) if z < m["z_armpit"] - 0.012 else lim,
    )
    upper = []
    for k, z in enumerate(grid.zs):
        if not (m["z_armpit"] - 0.004 <= z <= m["z_shoulder"] + 0.02):
            continue
        run = sh.containing(sh.runs_m(F[:, k], grid.xs), 0.0)
        inner = (m["torso_line"](z) if "torso_line" in m else lim) + ARM_GAP
        if run and run[1] - inner > 0.024:
            upper.append((z, (inner + run[1]) / 2, (run[1] - inner) / 2))
    if upper:
        u = np.array(upper)
        zs_a = np.concatenate([u[:, 0], zs_a])
        cs = np.concatenate([u[:, 1], cs])
        ws = np.concatenate([u[:, 2], ws])
    order = np.argsort(-zs_a)  # shoulder downwards
    zs_a, cs, ws = zs_a[order], cs[order], ws[order]
    # The arm ends where the rows stop being continuous (below the fingertips the outermost
    # run is a pleat tip of the skirt, not the hand).
    n = mt.continuous_prefix(zs_a, cs, max_dz=0.03, max_dc=0.05)
    zs_a, cs, ws = zs_a[:n], cs[:n], ws[:n]
    cs_s = sh.smooth_series(cs, 9)
    ws_s = sh.smooth_series(ws, 5)
    dc = np.gradient(cs_s, zs_a)
    radius = ws_s * np.cos(np.arctan(dc))
    # Wrist: the first row down the arm whose run is mostly skin in the painted front view.
    img = views.img["front"]
    wrist_i = len(zs_a) - 1
    for i, (z, c, w) in enumerate(zip(zs_a, cs_s, ws_s)):
        if i < len(zs_a) * 0.4:
            continue
        px, py = views.px("front", np.linspace(c - w * 0.6, c + w * 0.6, 7), np.full(7, z))
        cols = np.clip(px.astype(int), 0, img.shape[1] - 1)
        rowi = int(np.clip(py[0], 0, img.shape[0] - 1))
        if skin_like(img[rowi, cols]).mean() > 0.6:
            wrist_i = i
            break
    y_arm = views.h_of_col("side", views.cfg["armDepthPx"])
    pts = np.stack([cs_s, np.full_like(cs_s, y_arm), zs_a], axis=1)
    rad = radius.copy()
    depth = np.where(np.arange(len(zs_a)) < wrist_i, SLEEVE_DEPTH, 0.5)
    # Round the shoulder cap and the fingertips instead of cutting them flat.
    for i in range(1, 5):
        rad[-i] *= 0.55 + 0.45 * (i - 1) / 4
    z_joint = m["z_shoulder"] - 0.04
    j = int(np.argmin(np.abs(zs_a - z_joint)))
    return {
        "points": pts,
        "radius": rad,
        "depth": depth,
        "wrist": pts[wrist_i],
        "shoulder": pts[j],
        "tip": pts[-1],
        "zs": zs_a,
        "wrist_i": wrist_i,
    }


def body_volume(views, cfg):
    H = cfg["height"]
    grid = sh.Grid((-0.44, 0.44), (-0.22, 0.24), (0.0, H + 0.004), CELL)
    F = sh.sample_view(views.sym["front"], views.frame["front"], grid.xs, grid.zs)
    S = sh.sample_view(views.side_depth, views.frame["side"], grid.ys, grid.zs)
    m, _runs = measure(views, grid, F, S)
    rows = sh.slices(grid, F, S, m)
    occ = sh.fill_slices(grid, rows)
    arm = arm_path(views, grid, F, m)
    for sx in (1, -1):
        pts = arm["points"] * np.array([sx, 1, 1])
        sh.sweep(occ, grid, pts, arm["radius"], arm["depth"])
        # Deltoid: joins the top of the sleeve to the shoulder line.
        top = pts[0]
        r = float(arm["radius"][: max(3, len(pts) // 10)].max()) * 1.05
        sh.add_ellipsoid(occ, grid, (top[0] - sx * r * 0.2, top[1], top[2] - r * 0.3), (r * 1.1, r, r * 1.2))
    m["arm"] = arm
    m["rows"] = rows
    return grid, occ, m, F, S


def mesh_from_field(name, grid, field, threshold=0.5):
    """Iso-surface of a float field through an OpenVDB grid and Volume to Mesh."""
    import openvdb

    vgrid = openvdb.FloatGrid()
    vgrid.copyFromArray(np.ascontiguousarray(field.astype(np.float32)))
    transform = openvdb.createLinearTransform(voxelSize=grid.cell)
    transform.postTranslate(tuple(float(v) for v in grid.origin + grid.cell / 2))
    vgrid.transform = transform
    vgrid.name = "density"
    os.makedirs(BUILD, exist_ok=True)
    path = os.path.join(BUILD, f"{name}.vdb")
    openvdb.write(path, grids=[vgrid])
    volume = bpy.data.volumes.new(name + "-vol")
    volume.filepath = path
    vobj = bpy.data.objects.new(name + "-vol", volume)
    bpy.context.scene.collection.objects.link(vobj)
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mod = obj.modifiers.new("v2m", "VOLUME_TO_MESH")
    mod.object = vobj
    mod.grid_name = "density"
    mod.threshold = threshold
    mod.resolution_mode = "GRID"
    mod.use_smooth_shade = True
    activate(obj)
    bpy.ops.object.modifier_apply(modifier="v2m")
    bpy.data.objects.remove(vobj, do_unlink=True)
    bpy.data.volumes.remove(volume)
    return obj


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def mesh_volume(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    v = bm.calc_volume(signed=False)
    bm.free()
    return v


def retopo(obj, faces, smooth=0):
    """QuadriFlow to about `faces` quads. QuadriFlow sometimes gives up or folds a thin
    limb; the volume check catches that and falls back to edge-collapse decimation."""
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=CELL * 0.05)
    bpy.ops.object.mode_set(mode="OBJECT")
    backup = obj.data.copy()
    before, vol0 = len(obj.data.polygons), mesh_volume(obj)
    ok = False
    for seed in (7, 11):
        result = bpy.ops.object.quadriflow_remesh(
            use_mesh_symmetry=False, use_preserve_sharp=False, use_preserve_boundary=False,
            preserve_attributes=False, smooth_normals=True, mode="FACES", target_faces=faces, seed=seed,
        )
        vol1 = mesh_volume(obj)
        ok = "FINISHED" in result and len(obj.data.polygons) < before and abs(vol1 - vol0) < 0.06 * vol0
        log("quadriflow", obj.name, "seed", seed, result, before, "->", len(obj.data.polygons), "volume", round(vol0, 5), round(vol1, 5), "ok" if ok else "retry")
        if ok:
            break
        old = obj.data
        obj.data = backup.copy()
        bpy.data.meshes.remove(old)
    if not ok:
        mod = obj.modifiers.new("dec", "DECIMATE")
        mod.ratio = faces * 2 / max(1, len(obj.data.polygons) * (2 if len(obj.data.polygons[0].vertices) == 4 else 1))
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier="dec")
    bpy.data.meshes.remove(backup)
    if smooth:
        mod = obj.modifiers.new("relax", "SMOOTH")
        mod.factor = 0.5
        mod.iterations = smooth
        bpy.ops.object.modifier_apply(modifier="relax")
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


# ---------------------------------------------------------------------------------------
# 3. Texture: bake the painted views into one atlas.


def paint(views, objs, occluders, hair_masks, size=1024):
    """Atlas for [body, skirt, hair]: hair texels take colour only from hair pixels and
    everything else never does, so the neck gets no hair and the fringe no forehead. The
    hair clip is masked out of every view; it is its own mesh."""
    bake.unwrap(objs)
    pos, nrm, vis, covered, ids = bake.bake_maps(objs, occluders, size=size)
    hair_id = len(objs) - 1  # the hair is the last object
    clip = {"front": views.front_clip, "back": np.zeros_like(views.front_clip), "side": views.side_clip}
    hair = {v: hair_masks[v] | mt.dilate(clip[v], 2) for v in ("front", "side", "back")}
    hair_only = {v: hair_masks["raw"][v] & ~mt.dilate(clip[v], 3) for v in hair}
    body_rgb, body_ok = bake.project(views, pos, nrm, vis, covered & (ids != hair_id), exclude=hair)
    hair_rgb, hair_ok = bake.project(views, pos, nrm, vis, covered & (ids == hair_id), only=hair_only)
    is_hair = ids == hair_id
    # The neck is plain skin: the painted views hide it behind hair and chin shadow.
    skin = hex_rgb(views.cfg["colors"]["skin"])
    rows = views.cfg["rows"]
    z_collar = views.z_of_row("front", rows.get("collar", rows["shoulder"])) + 0.012
    neck = (ids == 0) & (pos[..., 2] > z_collar)
    # Shade under the chin, lighter toward the collar, as the painted views have it.
    shade = hex_rgb(views.cfg["colors"]["skinShade"])
    t = np.clip((pos[..., 2] - z_collar) / 0.025, 0, 1)[..., None]
    neck_rgb = skin * (1 - 0.8 * t) + shade * 0.8 * t
    body_rgb[neck] = neck_rgb[neck]
    # Shoe soles face the ground in every painted view: plain dark leather.
    sole = (ids == 0) & (pos[..., 2] < 0.02) & (nrm[..., 2] < -0.3)
    body_rgb[sole] = hex_rgb("#3a2419")
    body_ok |= sole
    body_ok |= neck
    rgb = np.where(is_hair[..., None], hair_rgb, body_rgb)
    ok = np.where(is_hair, hair_ok, body_ok)
    log("atlas texels", int(covered.sum()), "painted", int(ok.sum()))
    # Fill unpainted texels from their own object's neighbours, then pad the seams.
    rgb, have = bake.dilate_fill(rgb, ok & is_hair, steps=40, allowed=is_hair)
    rgb2, have2 = bake.dilate_fill(rgb, ok & ~is_hair & covered, steps=40, allowed=covered & ~is_hair)
    rgb = np.where(is_hair[..., None], rgb, rgb2)
    # Hair: calm the painted strokes (blur in the atlas, then pull toward the art's hair
    # colour) so the hair reads as one soft near-black mass with gentle streaks; under the
    # game light the painted browns alone came out too warm and light.
    base = hex_rgb(views.cfg["colors"]["hair"])
    soft = bake.masked_blur(rgb, is_hair & have, 3)
    share = views.cfg.get("hair", {}).get("paint", 0.55)  # how much of the painted strokes stays
    rgb[is_hair] = (soft * share + base * (1 - share))[is_hair]
    rgb, _ = bake.dilate_fill(rgb, (have & is_hair) | (have2 & ~is_hair), steps=16)
    os.makedirs(BUILD, exist_ok=True)
    return bake.texture_image("atlas", rgb, os.path.join(BUILD, f"{ARGS.cast}-atlas.png"))


def textured_material(name, image, role):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    mat["mtoon"] = role
    return mat


def flat_material(name, color, role, double=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = linear_hex(color)
    bsdf.inputs["Roughness"].default_value = 1.0
    mat.diffuse_color = linear_hex(color)
    mat.use_backface_culling = not double
    mat["mtoon"] = role
    return mat


def face_materials(c):
    return {
        "eye-white": flat_material("eye-white", "#fbf8f4", "flat", True),
        "iris": flat_material("iris", c["iris"], "flat", True),
        "iris-light": flat_material("iris-light", c["irisLight"], "flat", True),
        "pupil": flat_material("pupil", "#1c1012", "flat", True),
        "eye-highlight": flat_material("eye-highlight", "#ffffff", "glint", True),
        "lash": flat_material("lash", c["lash"], "flat", True),
        "brow": flat_material("brow", c["brow"], "flat", True),
        "mouth": flat_material("mouth", c["mouth"], "flat", True),
        "blush": flat_material("blush", c["blush"], "blush", True),
        "nose": flat_material("nose", c["skinShade"], "nose", True),
        "lines": flat_material("lines", c.get("lines", c["skinShade"]), "lines", True),
        "bindi": flat_material("bindi", c.get("bindi", "#a8252a"), "flat", True),
    }


def set_texture_materials(atlas, body, skirt, hair):
    cloth = textured_material("body", atlas, "painted")
    skirt_mat = textured_material("skirt", atlas, "painted")
    skirt_mat.use_backface_culling = False
    hair_mat = textured_material("hair", atlas, "painted-hair")
    hair_mat.use_backface_culling = False
    for obj, mat in ((body, cloth), (skirt, skirt_mat), (hair, hair_mat)):
        if obj is None:
            continue
        obj.data.materials.clear()
        obj.data.materials.append(mat)


# ---------------------------------------------------------------------------------------
# 4. Rig, weights, T-pose and export.


def join(objs, name):
    activate(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def skin(views, grid, m, hp, body, skirt, hair, head, face, extras=(), bun=None, jewellery=None):
    cfg = views.cfg
    joints = rig.fit_joints(m, m["rows"], grid, hp, views)
    chains = rig.hair_chains(hp, hair, n_chains=cfg.get("hair", {}).get("chains", 6))
    hanging = list(chains)
    if bun is not None:
        # The bun swings on a short chain from the back of the head through its centre.
        centre, radii = bun
        attach = Vector((0.0, centre.y - radii[1] * 0.9, centre.z + radii[2] * 0.2))
        chains["bun"] = [attach, centre, centre + Vector((0, radii[1] * 0.9, -radii[2] * 0.2))]
    arm = rig.create_armature(joints, chains)
    names = list(joints)
    log("joints", len(names), "symmetry error m", round(rig.check_symmetry(joints), 5))
    ok = rig.bind_auto(body, arm, set(names))
    for n in names:
        if n not in body.vertex_groups:
            body.vertex_groups.new(name=n)
    gnames, W = rig.get_weights(body)
    if not ok or W.sum(axis=1).min() <= 0:
        log("heat weights incomplete; nearest-bone fallback for", int((W.sum(axis=1) <= 0).sum()), "vertices")
        empty = W.sum(axis=1) <= 0
        Wf = rig.fallback_weights(body, joints, gnames)
        W[empty] = Wf[empty]
    W = rig.clean_body(body, joints, m, gnames, W)
    rig.set_weights(body, gnames, W)
    if skirt is not None:
        share = (cfg.get("skirt") or {}).get("legShare", 0.92)  # a long dress follows the thighs less
        blend = (cfg.get("skirt") or {}).get("legBlend", 0.0)
        rig.set_weights(skirt, names, rig.skirt_weights(skirt, m, names, share, blend))
    hair_names = ["head"] + [f"{p}_{i}" for p, pts in chains.items() for i in range(len(pts) - 1)]
    W = rig.hair_weights(hair, {k: chains[k] for k in hanging}, hair_names, hp)
    if bun is not None:
        centre, radii = bun
        co = np.array([v.co[:] for v in hair.data.vertices])
        d = ((co - np.array(centre[:])) / (np.array(radii) * 1.2)) ** 2
        inside = d.sum(axis=1) <= 1.0
        W[inside] = 0
        W[inside, hair_names.index("bun_0")] = 1
    rig.set_weights(hair, hair_names, W)
    rig.rigid(head, "head")
    rig.rigid(face, "head")
    for obj in extras:
        rig.rigid(obj, "head")
    if jewellery is not None:
        obj, bones = jewellery
        for g in list(obj.vertex_groups):
            obj.vertex_groups.remove(g)
        for name in sorted(set(bones)):
            obj.vertex_groups.new(name=name).add([i for i, b in enumerate(bones) if b == name], 1.0, "REPLACE")
        extras = [*extras, obj]
    meshes = [o for o in (body, skirt, hair, head, face, *extras) if o is not None]
    for obj in meshes:
        rig.attach(obj, arm)
    rig.to_t_pose(arm, meshes)
    # Joint positions after the T-pose, for the sidecar.
    rest = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones}
    return arm, rest, chains


def to_gltf(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


MTOON_ROLES = {
    # shadeTint multiplies the base colour (or the texture) on the shaded side.
    "painted": {"shadeTint": [0.8, 0.72, 0.8], "toony": 0.9, "shift": -0.05, "outline": 0.0018, "rim": 0.25, "outlineColor": [0.16, 0.12, 0.16]},
    "painted-hair": {"shadeTint": [0.72, 0.66, 0.78], "toony": 0.9, "shift": 0.0, "outline": 0.0011, "rim": 0.35, "outlineColor": [0.1, 0.07, 0.08]},
    "skin": {"shadeTint": [0.95, 0.76, 0.74], "toony": 0.92, "shift": -0.1, "outline": 0.0014, "rim": 0.3, "outlineColor": [0.42, 0.25, 0.22]},
    "scalp": {"shadeTint": [0.7, 0.66, 0.76], "toony": 0.9, "shift": 0.0, "outline": 0.0, "rim": 0.2},
    "cloth": {"shadeTint": [0.62, 0.6, 0.72], "toony": 0.9, "shift": -0.02, "outline": 0.0012, "rim": 0.3},
    "wire": {"shadeTint": [0.75, 0.7, 0.72], "toony": 0.9, "shift": -0.2, "outline": 0.0, "rim": 0.2},
    "flat": {"shadeTint": [0.92, 0.9, 0.94], "toony": 1.0, "shift": -0.4, "outline": 0.0, "rim": 0.0},
    "glint": {"shadeTint": [1, 1, 1], "toony": 1.0, "shift": -1.0, "outline": 0.0, "rim": 0.0, "emissive": 0.6},
    "blush": {"shadeTint": [0.95, 0.9, 0.9], "toony": 1.0, "shift": -0.4, "outline": 0.0, "rim": 0.0, "alpha": 0.4},
    "lines": {"shadeTint": [0.9, 0.8, 0.8], "toony": 1.0, "shift": -0.4, "outline": 0.0, "rim": 0.0, "alpha": 0.8},
    "nose": {"shadeTint": [0.9, 0.8, 0.8], "toony": 1.0, "shift": -0.4, "outline": 0.0, "rim": 0.0, "alpha": 0.5},
}


def export(cfg, arm, meshes, joints, chains, hp, m):
    os.makedirs(BUILD, exist_ok=True)
    cast = cfg["cast"]
    glb = os.path.join(BUILD, f"{cast}.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm, *meshes]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
        export_extras=True, export_animation_mode="ACTIONS", export_def_bones=False,
        export_influence_nb=4, export_morph=True, export_morph_normal=False, export_morph_animation=False,
        export_try_sparse_sk=True, export_materials="EXPORT", export_image_format="JPEG",
        export_jpeg_quality=86, export_animations=False, export_skins=True,
        export_meshopt_compression_enable=True, export_meshopt_extension="EXT_meshopt_compression",
    )
    H = cfg["height"]
    C = hp["centre"]
    head_r = hp["rx"] * 1.05
    # No head sphere: the bob's chains hang at the skull, and a head collider would push
    # them out into wings. The neck and chest keep the hair from passing into the body.
    del head_r
    colliders = [
        {"bone": "neck", "center": to_gltf((joints["neck"][0] + joints["neck"][1]) / 2), "radius": 0.035},
        {"bone": "upperChest", "center": to_gltf(joints["upperChest"][0] + Vector((0, 0.02, 0.02))), "radius": 0.1},
        {"bone": "chest", "center": to_gltf(joints["chest"][0] + Vector((0, 0.015, 0))), "radius": 0.1},
    ]
    for side in ("left", "right"):
        colliders.append({"bone": f"{side}UpperArm", "center": to_gltf(joints[f"{side}UpperArm"][0]), "radius": 0.04})
    materials = {}
    for mat in bpy.data.materials:
        role = mat.get("mtoon")
        if role and mat.users:
            materials[mat.name] = {"role": role, **MTOON_ROLES[role]}
    feel = {"bun": {"stiffness": 2.6, "gravity": 0.1, "drag": 0.7, "hitRadius": 0.02}}
    default = {"stiffness": 1.4, "gravity": 0.3, "drag": 0.5, "hitRadius": 0.012}
    springs = [{"name": p, "joints": [f"{p}_{i}" for i in range(len(pts))], **feel.get(p, default)} for p, pts in chains.items()]
    human = [n for n in joints if not n.startswith("hair")]
    spec = {
        "cast": cast,
        "person": cfg["person"],
        "title": cfg["title"],
        "height": H,
        "copyright": "Built by asset-src/characters/concept-cast/build.py from concept art made with openai/gpt-image-2.5-flare (see asset-src/THIRD_PARTY.md).",
        "humanBones": human,
        "expressions": {
            "blink": ["blinkL", "blinkR"], "blinkLeft": ["blinkL"], "blinkRight": ["blinkR"],
            "happy": ["happy"], "relaxed": ["relaxed"], "surprised": ["surprised"],
            "aa": ["aa"], "ih": ["ih"], "ou": ["ou"], "ee": ["ee"], "oh": ["oh"],
            "lookUp": ["lookUp"], "lookDown": ["lookDown"], "lookLeft": ["lookLeft"], "lookRight": ["lookRight"],
        },
        "faceMesh": "Face",
        "lookAtOffset": round(C.z - joints["head"][0].z, 4),
        "springs": springs,
        "colliders": colliders,
        "materials": materials,
        "posture": cfg.get("posture", {}),
        "meshes": [o.name for o in meshes],
    }
    tris = {o.name: ma.triangle_count(o) for o in meshes}
    spec["triangles"] = tris
    ma.write_report(os.path.join(BUILD, f"{cast}.vrm.json"), spec)
    top = max(v.co.z for o in meshes for v in o.data.vertices)
    report = {
        "cast": cast,
        "blender": bpy.app.version_string,
        "triangles": sum(tris.values()),
        "trianglesPerMesh": tris,
        "heightMetres": round(top, 3),
        "hipsMetres": round(joints["hips"][0].z, 3),
        "materials": sorted(materials),
        "springs": [s["name"] for s in springs],
        "shapeKeys": fc.FACE_KEYS,
        "facing": "-Y in Blender, +Z in three.js (VRM 1.0)",
    }
    ma.write_report(os.path.join(HERE, f"{cast}.report.json"), report)
    log("exported", glb, "triangles", sum(tris.values()), tris)


# ---------------------------------------------------------------------------------------
# Review renders: orthographic, framed like each painted view, for side-by-side overlays.


def ortho_camera(views, view):
    fr = views.frame[view]
    size = views.img[view].shape[0]
    c = size / 2
    h, z = fr.to_world(c, c)
    h, z = float(h), float(z)
    cam = bpy.data.objects.get("ortho") or bpy.data.objects.new("ortho", bpy.data.cameras.new("ortho"))
    if cam.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = size * fr.scale
    cam.data.clip_end = 20
    if view == "front":
        cam.location = Vector((h, -6, z))
        target = Vector((h, 0, z))
    elif view == "back":
        cam.location = Vector((-h, 6, z))
        target = Vector((-h, 0, z))
    else:
        cam.location = Vector((6, h, z))
        target = Vector((0, h, z))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam, size


def render_ortho(views, view, path, color_type="MATERIAL", texture=False):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "TEXTURE" if texture else color_type
    shading.show_object_outline = False
    scene.render.film_transparent = True
    _cam, size = ortho_camera(views, view)
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def render_face(views, hp, face, folder):
    """Close-ups of the head, rest face and each expression, beside the painted face."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.film_transparent = False
    cam, _ = ortho_camera(views, "front")
    c = hp["centre"]
    cam.location = Vector((0, -2, c.z + 0.01))
    cam.rotation_euler = Vector((0, 1, 0)).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = 0.34
    scene.render.resolution_x = scene.render.resolution_y = 420
    keys = face.data.shape_keys.key_blocks
    for name in ["rest", "blinkL", "happy", "aa", "ou", "surprised"]:
        for kb in keys[1:]:
            kb.value = 1.0 if kb.name == name else 0.0
        scene.render.filepath = os.path.join(folder, f"face-{name}.png")
        bpy.ops.render.render(write_still=True)
    for kb in keys[1:]:
        kb.value = 0.0
    cam.location = Vector((0.9, -1.6, c.z + 0.02))
    cam.rotation_euler = (Vector((0, c.y, c.z)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(folder, "face-three.png")
    bpy.ops.render.render(write_still=True)
    cam.location = Vector((2, c.y, c.z + 0.01))
    cam.rotation_euler = Vector((-1, 0, 0)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(folder, "face-side.png")
    bpy.ops.render.render(write_still=True)


def overlay(views, view, render_path, out_path):
    """Concept view with the render's silhouette edge drawn over it, and side by side."""
    r = load_rgba(render_path)
    concept = views.img[view]
    a = r[..., 3] > 0.5
    edge = mt.dilate(a, 1) & ~mt.erode(a, 1)
    over = concept.copy()
    over[edge] = [0.9, 0.1, 0.4]
    side = np.where(a[..., None], r[..., :3], concept * 0.35 + 0.65)
    save_rgb(np.concatenate([over, side], axis=1), out_path)


def load_rgba(path):
    image = bpy.data.images.load(path, check_existing=False)
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(h, w, 4)[::-1].copy()


# ---------------------------------------------------------------------------------------


def main():
    cfg = json.load(open(os.path.join(HERE, f"{ARGS.cast}.json")))
    ma.reset_scene()
    # 1. Matte and align the painted views.
    views = Views(cfg)
    log("frames", {k: v.as_dict() for k, v in views.frame.items()}, "front/back mirror IoU", round(views.mirror_iou, 3))
    # 2. Body volume, iso-surface and retopology; head, hair and skirt.
    grid, occ, m, F, S = body_volume(views, cfg)
    log("landmarks", {k: round(float(v), 3) for k, v in m.items() if isinstance(v, (float, np.floating))})
    body = mesh_from_field("Body", grid, sh.blur3(occ, 4))
    log("iso-surface", len(body.data.vertices), "vertices")
    if ARGS.stage == "iso":
        return
    retopo(body, 3000)
    grey = bpy.data.materials.new("grey")
    hp = parts.head_params(views, m)
    head = parts.build_head(hp, grey)
    hair_cfg = cfg.get("hair", {})
    hair, hair_masks = parts.build_hair(
        views, hp, grey, thickness=hair_cfg.get("thickness", 0.012), locks=hair_cfg.get("locks", 30), shift=hair_cfg.get("ringShift", 0.0)
    )
    bun = None
    if cfg.get("bun"):
        # The bun is shaded in the flat hair colour: no painted view shows all of it.
        painted = parts.bun_colour(views, parts.hair_masks(views), cfg["bun"])
        bun_hex = "#%02x%02x%02x" % tuple(int(round(float(c) * 255)) for c in painted) if painted is not None else cfg["colors"]["hair"]
        bun_mat = flat_material("hair-bun", bun_hex, "painted-hair")
        bun_obj, bun_centre, bun_radii = parts.build_bun(views, hp, bun_mat, cfg["bun"])
        bun = (bun_centre, bun_radii)
    else:
        bun_obj = None
    skirt_cfg = cfg.get("skirt", {})
    skirt = parts.build_skirt(views, m, grey, depth=skirt_cfg.get("pleatDepth", 0.02)) if skirt_cfg is not None else None
    painted = [o for o in (body, skirt, hair) if o is not None]
    log("faces", {o.name: len(o.data.polygons) for o in (*painted, head)})
    # 3. Paint: bake the views into the atlas.
    atlas = paint(views, painted, [head], hair_masks)
    set_texture_materials(atlas, body, skirt, hair)
    parts.classify_scalp(head, views, hair_masks, hp)
    if bun_obj is not None:
        hair = join([hair, bun_obj], "Hair")
    head.data.materials.clear()
    head.data.materials.append(flat_material("skin", cfg["colors"]["skin"], "skin"))
    head.data.materials.append(flat_material("scalp", cfg["colors"]["hair"], "scalp"))
    # Soft anime shading on the face: normals from an ellipsoid round the head.
    C = hp["centre"]
    parts.smooth_normals(head, (hp["rx"] * 1.05, hp["ry_front"] * 1.02, 0.5 * (hp["rz_top"] + hp["rz_bottom"])), C)
    # 4. Face decals and expressions.
    face = fc.build_face(head, hp, face_materials(cfg["colors"]))
    if cfg.get("sideClip"):
        clip = parts.build_clip(views, hp, hair, flat_material("clip", cfg["colors"]["clip"], "cloth"))
        head = join([head, clip], "Head")
    extras = []
    if cfg.get("glasses"):
        extras.append(parts.build_glasses(hp, head, flat_material("glasses", cfg["colors"]["glasses"], "wire", True), cfg["glasses"], views))
    jewellery = None
    if cfg.get("jewellery"):
        jewellery = parts.build_jewellery(hp, m, flat_material("gold", cfg["colors"].get("gold", "#d9a24a"), "wire"), cfg["jewellery"])
    if ARGS.render:
        review(views, hp, face, hair_masks, ARGS.render)
    # 5. Rig, weights and T-pose; 6. export for make-vrm.mjs.
    arm, joints, chains = skin(views, grid, m, hp, body, skirt, hair, head, face, extras, bun, jewellery)
    if jewellery is not None:
        extras = [*extras, jewellery[0]]
    meshes = [o for o in (body, skirt, hair, head, face, *extras) if o is not None]
    export(cfg, arm, meshes, joints, chains, hp, m)


def review(views, hp, face, hair_masks, folder):
    """A-pose renders over the painted views, face close-ups and the hair masks."""
    os.makedirs(folder, exist_ok=True)
    for view in ("front", "side", "back"):
        p = render_ortho(views, view, os.path.join(folder, f"shape-{view}.png"), texture=True)
        overlay(views, view, p, os.path.join(folder, f"overlay-{view}.png"))
    render_face(views, hp, face, folder)
    for v in ("front", "side", "back"):
        img = views.img[v] * 0.5
        img[hair_masks[v]] = img[hair_masks[v]] * 0.4 + np.array([0.6, 0.1, 0.1])
        img[hair_masks["raw"][v]] += np.array([0, 0.3, 0])
        save_rgb(np.clip(img, 0, 1), os.path.join(folder, f"hairmask-{v}.png"))


main()
