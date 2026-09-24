"""Paint the concept views onto the meshes: one shared UV atlas, Cycles bakes of surface
position and of sun visibility per view, then a numpy blend of the four projections.

For each view a sun lamp shines along that view's direction and a white diffuse bake
records how much light each texel receives: facing times not-in-shadow, the weight that
view deserves at that texel (a hand held over the skirt shadows the skirt from the side,
so the side view does not paint the hand onto it). The position bake says where each
texel sits, so its pixel in every view is a direct orthographic lookup.
"""

import math

import bpy
import numpy as np

import matte as mt

# (name, painted view, direction the view looks along, horizontal axis of the image)
PROJECTIONS = (
    ("front", "front", (0, 1, 0), lambda p: p[..., 0]),
    ("back", "back", (0, -1, 0), lambda p: -p[..., 0]),
    ("left", "side", (-1, 0, 0), lambda p: p[..., 1]),
    ("right", "side", (1, 0, 0), lambda p: p[..., 1]),
)


def unwrap(objs, margin=0.004):
    """One UV space shared by several objects, islands at an even texel density."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=margin, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def _image(name, size, float_buffer):
    img = bpy.data.images.new(name, size, size, alpha=True, float_buffer=float_buffer)
    img.colorspace_settings.name = "Non-Color"
    img.generated_color = (0, 0, 0, 0)
    return img


def _bake_material(img, kind):
    mat = bpy.data.materials.new(f"bake-{kind}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    if kind == "id":
        em = nt.nodes.new("ShaderNodeEmission")
        em.name = "Emission"
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    elif kind in ("position", "normal"):
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(geo.outputs["Position" if kind == "position" else "Normal"], em.inputs["Color"])
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    else:
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
        diff.inputs["Color"].default_value = (1, 1, 1, 1)
        nt.links.new(diff.outputs["BSDF"], out.inputs["Surface"])
    nt.nodes.active = tex
    return mat


def _pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def bake_maps(objs, occluders, size=1024, samples=4):
    """Returns (position, normal, visibility per projection name, covered mask, object
    index per texel)."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 0
    scene.render.bake.use_clear = True
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Strength"].default_value = 0.0
    saved = {o.name: [s.material for s in o.material_slots] for o in objs}

    def assign(mat):
        for o in objs:
            o.data.materials.clear()
            o.data.materials.append(mat)

    def run(kind, img, **kw):
        mat = _bake_material(img, kind)
        assign(mat)
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.bake(**kw)
        bpy.data.materials.remove(mat)
        return _pixels(img)

    pos_img = _image("bake-pos", size, True)
    nrm_img = _image("bake-nrm", size, True)
    pos = run("position", pos_img, type="EMIT")
    nrm = run("normal", nrm_img, type="EMIT")
    covered = pos[..., 3] > 0.5
    # Object id per texel: each object emits its own grey level.
    id_img = _image("bake-id", size, True)
    for i, o in enumerate(objs):
        mat = _bake_material(id_img, "id")
        mat.node_tree.nodes["Emission"].inputs["Color"].default_value = ((i + 1) / 16, 0, 0, 1)
        o.data.materials.clear()
        o.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type="EMIT")
    ids = np.rint(_pixels(id_img)[..., 0] * 16).astype(int) - 1
    for o in objs:
        bpy.data.materials.remove(o.data.materials[0])
    bpy.data.images.remove(id_img)
    vis = {}
    sun = bpy.data.objects.new("bake-sun", bpy.data.lights.new("bake-sun", "SUN"))
    scene.collection.objects.link(sun)
    sun.data.energy = math.pi  # a white diffuse surface facing the sun then bakes to 1
    sun.data.angle = 0.0
    for o in occluders:
        o.hide_render = False
    for name, _view, direction, _h in PROJECTIONS:
        d = np.array(direction, dtype=float)
        # A light's -Z axis is the direction it shines.
        from mathutils import Vector

        sun.rotation_euler = Vector(d).to_track_quat("-Z", "Y").to_euler()
        img = _image(f"bake-vis-{name}", size, True)
        px = run("vis", img, type="DIFFUSE", pass_filter={"DIRECT"}, use_selected_to_active=False)
        vis[name] = px[..., 0]
        if covered.any():
            vis[name] = vis[name] / max(float(np.percentile(vis[name][covered], 99.5)), 1e-6)
        bpy.data.images.remove(img)
    bpy.data.objects.remove(sun, do_unlink=True)
    for o in objs:
        o.data.materials.clear()
        for m in saved[o.name]:
            o.data.materials.append(m)
    result = (pos[..., :3].copy(), nrm[..., :3].copy(), vis, covered, ids)
    bpy.data.images.remove(pos_img)
    bpy.data.images.remove(nrm_img)
    return result


def clean_view(img, axis, keep, below_row):
    """A painted view with the bag half replaced, below `below_row`, by the mirror of the
    other half about the body axis."""
    out = img.copy()
    w = img.shape[1]
    xs = np.arange(w) + 0.5
    src = np.clip(np.floor(2 * axis - xs).astype(int), 0, w - 1)
    replace = (xs < axis) if keep == "right" else (xs > axis)
    rows = slice(below_row, img.shape[0])
    out[rows][:, replace] = img[rows][:, src[replace]]
    return out


def mirror_regions(img, axis, boxes):
    """Replace each (x0, y0, x1, y1) pixel box by its mirror about the body axis: a hand the
    sheet cut off at the edge of the view takes the other hand's paint."""
    out = img.copy()
    w = img.shape[1]
    for x0, y0, x1, y1 in boxes:
        xs = np.arange(x0, x1)
        src = np.clip(np.floor(2 * axis - (xs + 0.5)).astype(int), 0, w - 1)
        out[y0:y1, x0:x1] = img[y0:y1][:, src]
    return out


def painted_view(views, view):
    """A view's paint with the bag half mirrored away (`bagRow`) and `mirrorRegions` filled."""
    cfg = views.cfg
    fr = views.frame[view]
    img = views.img[view]
    if cfg.get("bagRow") is not None and view in cfg["keepHalf"]:
        img = clean_view(img, fr.axis, cfg["keepHalf"][view], cfg["bagRow"])
    boxes = cfg.get("mirrorRegions", {}).get(view)
    return mirror_regions(img, fr.axis, boxes) if boxes else img


def sample(img, px, py):
    """Bilinear lookup of an (h, w, c) image at float pixel coordinates (x right, y down)."""
    h, w = img.shape[:2]
    x = np.clip(px - 0.5, 0, w - 1.001)
    y = np.clip(py - 0.5, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    a, b = img[y0, x0], img[y0, x0 + 1]
    c, d = img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def lookup_mask(mask, px, py):
    h, w = mask.shape
    xi, yi = np.floor(px).astype(int), np.floor(py).astype(int)
    ok = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
    out = np.zeros(px.shape, dtype=bool)
    out[ok] = mask[yi[ok], xi[ok]]
    return out


def project(views, pos, nrm, vis, covered, power=3.5, only=None, exclude=None):
    """Blend the painted views into texel colours. `only` / `exclude` map a view name to a
    pixel mask that texels may / may not take colour from (hair texels take hair pixels,
    body texels never do). Returns (rgb, painted mask)."""
    images = {v: painted_view(views, v) for v in ("front", "back", "side")}
    valid = {
        "front": mt.erode(views.sym["front"], 2),
        "back": mt.erode(views.sym["back"], 2),
        "left": mt.erode(views.mask["side"], 2) & ~mt.dilate(views.side_cut, 3),
        "right": mt.erode(views.mask["side"], 2) & ~mt.dilate(views.side_cut, 3) & ~mt.dilate(views.side_clip, 3),
    }
    for name, view, _d, _h in PROJECTIONS:
        if only is not None:
            valid[name] = valid[name] & only[view]
        if exclude is not None:
            valid[name] = valid[name] & ~exclude[view]
    acc = np.zeros(pos.shape[:2] + (3,), dtype=np.float32)
    wsum = np.zeros(pos.shape[:2], dtype=np.float32)
    facing_acc = np.zeros_like(acc)
    facing_sum = np.zeros_like(wsum)
    for name, view, direction, hfun in PROJECTIONS:
        fr = views.frame[view]
        px, py = fr.to_pixel(hfun(pos), pos[..., 2])
        ok = lookup_mask(valid[name], px, py) & covered
        colour = sample(images[view], px, py)
        w = np.clip(vis[name], 0, 1) ** power * ok
        acc += colour * w[..., None]
        wsum += w
        # Fallback weight from facing alone, for texels every sun misses (under the chin).
        facing = np.clip(-(nrm @ np.array(direction, dtype=np.float32)), 0, 1) ** power * ok
        facing_acc += colour * facing[..., None]
        facing_sum += facing
    rgb = np.where(wsum[..., None] > 0.02, acc / np.maximum(wsum, 1e-6)[..., None], facing_acc / np.maximum(facing_sum, 1e-6)[..., None])
    filled = (wsum > 0.02) | (facing_sum > 0.02)
    return rgb, filled & covered


def dilate_fill(rgb, filled, steps=24, allowed=None):
    """Grow texel colours outward into empty texels (seam padding for mip-mapping); with
    `allowed`, only into those texels."""
    rgb = rgb.copy()
    have = filled.copy()
    for _ in range(steps):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(have.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sh = np.roll(np.roll(have, dy, 0), dx, 1)
            acc += np.roll(np.roll(rgb * have[..., None], dy, 0), dx, 1)
            cnt += sh
        new = ~have & (cnt > 0)
        if allowed is not None:
            new &= allowed
        rgb[new] = acc[new] / cnt[new][:, None]
        have |= new
        if have.all():
            break
    return rgb, have


def masked_blur(rgb, mask, radius):
    """Box blur of the texels inside `mask`, averaging only masked neighbours."""
    w = mask.astype(np.float32)
    num = mt.box_blur(rgb * w[..., None], radius)
    den = mt.box_blur(w, radius)[..., None]
    return np.where(den > 1e-6, num / np.maximum(den, 1e-6), rgb)


def texture_image(name, rgb, path):
    """Write an sRGB texture (bpy row order) to disk and return the packed Blender image."""
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1), np.float32)], axis=2)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return img
