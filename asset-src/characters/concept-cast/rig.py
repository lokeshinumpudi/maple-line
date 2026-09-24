"""Humanoid skeleton fitted to silhouette landmarks, skin weights, springs, T-pose.

Joint positions come from the landmarks measured in build.py (arm centre line, wrist,
hips, knees, ankles, chin, shoulders). The body is skinned with Blender's heat weights and
then cleaned by region: arm bones never pull the blouse side, torso bones never pull the
sleeve, each leg owns its own side, the head is rigid. The skirt gets smooth hip-and-thigh
weights, the hair a few spring chains. The figure is modelled in the painted A-pose; VRM
wants a T-pose, so the arms are posed out level and that pose is applied as the rest pose.
Blender coordinates: Z up, facing -Y, her left at +X.
"""

import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

import matte as mt

ARM_BONES = ("Shoulder", "UpperArm", "LowerArm", "Hand", "Thumb", "Index", "Middle", "Ring", "Little")
LEG_BONES = ("UpperLeg", "LowerLeg", "Foot", "Toes")


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, dtype=float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def fit_joints(m, rows, grid, hp, views):
    """name -> (head, tail, parent) for the VRM humanoid, her left side at +x."""
    zs = grid.zs

    def row_at(z):
        return rows[int(np.clip(np.searchsorted(zs, z), 0, len(zs) - 1))]

    def torso_y(z):
        r = row_at(z)
        for part in ("torso", "hips", "neck"):
            if part in r:
                return r[part][2]
        return m["leg_hem"][2]

    def leg_at(z):
        r = row_at(z)
        leg = r.get("legL")
        return (leg[0], leg[2]) if leg else (m["leg_hem"][0], m["leg_hem"][2])

    V = lambda x, y, z: Vector((float(x), float(y), float(z)))  # noqa: E731
    j = {}

    def bone(name, head, tail, parent):
        j[name] = (Vector(head), Vector(tail), parent)

    zh = m["z_hips"]
    z_spine, z_chest, z_upper = zh + 0.09, zh + 0.19, zh + 0.29
    z_neck = m["z_shoulder"] + 0.012
    z_head = m["z_chin"] + 0.018
    bone("hips", V(0, torso_y(zh), zh), V(0, torso_y(z_spine), z_spine), None)
    bone("spine", V(0, torso_y(z_spine), z_spine), V(0, torso_y(z_chest), z_chest), "hips")
    bone("chest", V(0, torso_y(z_chest), z_chest), V(0, torso_y(z_upper), z_upper), "spine")
    bone("upperChest", V(0, torso_y(z_upper), z_upper), V(0, m["neck"][2], z_neck), "chest")
    bone("neck", V(0, m["neck"][2], z_neck), V(0, m["neck"][2] + 0.004, z_head), "upperChest")
    bone("head", V(0, m["neck"][2] + 0.004, z_head), V(0, m["neck"][2] + 0.004, z_head + 0.16), "neck")
    arm = m["arm"]
    pts = arm["points"]
    i_sh = int(np.argmin(np.abs(pts[:, 2] - arm["shoulder"][2])))
    path = pts[i_sh:]
    wrist = arm["wrist"]
    i_wr = int(np.argmin(np.linalg.norm(path - wrist, axis=1)))
    upper = path[: i_wr + 1]
    elbow = mt.along(upper, 0.47)
    tip = arm["tip"]
    hand_dir = (tip - wrist) / max(np.linalg.norm(tip - wrist), 1e-6)
    hand_len = np.linalg.norm(tip - wrist)
    palm_end = wrist + hand_dir * hand_len * 0.45
    # Across the hand, in the flat of the palm (the x-z plane: hands are thin in y).
    across = np.cross(hand_dir, [0, 1, 0])
    across /= max(np.linalg.norm(across), 1e-6)
    for side, sx in (("left", 1), ("right", -1)):
        f = np.array([sx, 1, 1])
        sh_head = V(sx * 0.018, m["neck"][2], m["z_shoulder"] - 0.02)
        bone(f"{side}Shoulder", sh_head, V(*(path[0] * f)), "upperChest")
        bone(f"{side}UpperArm", V(*(path[0] * f)), V(*(elbow * f)), f"{side}Shoulder")
        bone(f"{side}LowerArm", V(*(elbow * f)), V(*(wrist * f)), f"{side}UpperArm")
        bone(f"{side}Hand", V(*(wrist * f)), V(*(palm_end * f)), f"{side}LowerArm")
        for n_i, (finger, off) in enumerate((("Index", 0.3), ("Middle", 0.1), ("Ring", -0.1), ("Little", -0.28))):
            base = palm_end + across * off * hand_len * 0.4
            seg = hand_len * 0.55 / 3
            prev = f"{side}Hand"
            for s_i, seg_name in enumerate(("Proximal", "Intermediate", "Distal")):
                a = base + hand_dir * seg * s_i
                b = base + hand_dir * seg * (s_i + 1)
                name = f"{side}{finger}{seg_name}"
                bone(name, V(*(a * f)), V(*(b * f)), prev)
                prev = name
            del n_i
        # Thumb: from the wrist, forward (-y) and down the hand.
        t0 = wrist + hand_dir * hand_len * 0.12 + np.array([0, -0.012, 0])
        prev = f"{side}Hand"
        for s_i, seg_name in enumerate(("Metacarpal", "Proximal", "Distal")):
            a = t0 + (hand_dir * 0.6 + np.array([0, -0.5, 0])) * 0.014 * s_i
            b = t0 + (hand_dir * 0.6 + np.array([0, -0.5, 0])) * 0.014 * (s_i + 1)
            name = f"{side}Thumb{seg_name}"
            bone(name, V(*(a * f)), V(*(b * f)), prev)
            prev = name
        z_hip = m["z_crotch"] + 0.055
        z_knee = 0.5 * (z_hip + m["z_ankle"]) - 0.012
        z_ank = m["z_ankle"] - 0.035
        hx, hy = leg_at(m["z_hem"] - 0.02)
        kx, ky = leg_at(z_knee)
        ax_, ay_ = leg_at(z_ank + 0.03)
        hx *= 0.92
        toe_y = views.h_of_col("side", views.cfg["toePx"])
        ball = (ay_ + (toe_y - ay_) * 0.72, 0.028)
        bone(f"{side}UpperLeg", V(sx * hx, hy, z_hip), V(sx * kx, ky, z_knee), "hips")
        bone(f"{side}LowerLeg", V(sx * kx, ky, z_knee), V(sx * ax_, ay_, z_ank), f"{side}UpperLeg")
        bone(f"{side}Foot", V(sx * ax_, ay_, z_ank), V(sx * ax_, ball[0], ball[1]), f"{side}LowerLeg")
        bone(f"{side}Toes", V(sx * ax_, ball[0], ball[1]), V(sx * ax_, toe_y + 0.012, ball[1] - 0.004), f"{side}Foot")
    del hp
    return j


def hair_chains(hp, hair, n_chains=6, joints=3):
    """Spring chains hanging inside the bob: back, back sides and side curtains."""
    C = hp["centre"]
    co = np.array([v.co[:] for v in hair.data.vertices])
    z_low = co[:, 2].min()
    z_top = C.z + 0.01
    chains = {}
    angles = [150, 180, 210, 105, 255, 125, 235][:n_chains]
    for i, deg in enumerate(angles):
        a = math.radians(deg)
        d = np.array([math.sin(a), -math.cos(a)])
        # Radius of the hair at this angle, a little inside the shell.
        rel = co[:, :2] - np.array([C.x, C.y])
        facing = rel @ d
        near = (np.abs(rel @ np.array([-d[1], d[0]])) < 0.02) & (co[:, 2] < z_top)
        radius = float(np.percentile(facing[near], 60)) if near.any() else 0.08
        base = np.array([C.x, C.y]) + d * radius * 0.8
        pts = [Vector((base[0], base[1], z_top - (z_top - z_low) * t / joints)) for t in range(joints + 1)]
        chains[f"hair{i}"] = pts
    return chains


def create_armature(joints, chains):
    data = bpy.data.armatures.new("rig")
    arm = bpy.data.objects.new("Armature", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, _p) in joints.items():
        b = data.edit_bones.new(name)
        b.head, b.tail, b.roll = head, tail, 0
    for name, (_h, _t, parent) in joints.items():
        if parent:
            data.edit_bones[name].parent = data.edit_bones[parent]
    for prefix, pts in chains.items():
        prev = "head"
        for i in range(len(pts) - 1):
            b = data.edit_bones.new(f"{prefix}_{i}")
            b.head, b.tail = pts[i], pts[i + 1]
            b.parent = data.edit_bones[prev]
            prev = b.name
        # A short end bone so the last spring joint has a tail to swing.
        end = data.edit_bones.new(f"{prefix}_{len(pts) - 1}")
        end.head, end.tail = pts[-1], pts[-1] + (pts[-1] - pts[-2]) * 0.5
        end.parent = data.edit_bones[prev]
    bpy.ops.object.mode_set(mode="OBJECT")
    ends = {f"{prefix}_{len(pts) - 1}" for prefix, pts in chains.items()}
    for b in data.bones:
        b.use_deform = b.name not in ends
    return arm


def bind_auto(obj, arm, deform_names):
    """Heat weights from Blender, limited to the named bones."""
    for b in arm.data.bones:
        b.use_deform = b.name in deform_names
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    ok = len(obj.vertex_groups) > 0 and any(True for v in obj.data.vertices if v.groups)
    return ok


def get_weights(obj):
    names = [g.name for g in obj.vertex_groups]
    W = np.zeros((len(obj.data.vertices), len(names)), dtype=np.float32)
    for v in obj.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    return names, W


def set_weights(obj, names, W, limit=4):
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    groups = [obj.vertex_groups.new(name=n) for n in names]
    for i in range(W.shape[0]):
        row = W[i]
        top = np.argsort(-row)[:limit]
        s = row[top].sum()
        if s <= 0:
            continue
        for k in top:
            if row[k] > 1e-4:
                groups[k].add([i], float(row[k] / s), "REPLACE")


def clean_body(obj, joints, m, names, W):
    """Region rules on top of the heat weights."""
    co = np.array([v.co[:] for v in obj.data.vertices])
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    idx = {n: i for i, n in enumerate(names)}

    def cols(pred):
        return [i for n, i in idx.items() if pred(n)]

    arm_cols = {s: cols(lambda n, s=s: n.startswith(s) and any(k in n for k in ARM_BONES)) for s in ("left", "right")}
    leg_cols = {s: cols(lambda n, s=s: n.startswith(s) and any(k in n for k in LEG_BONES)) for s in ("left", "right")}
    torso_cols = cols(lambda n: n in ("hips", "spine", "chest", "upperChest"))
    head_cols = cols(lambda n: n in ("neck", "head"))
    lim = np.array([m["torso_x_limit"](zz) if zz < m["z_shoulder"] - 0.035 else m["torso_half_armpit"] for zz in z])
    in_torso = (np.abs(x) < lim + 0.004) & (z > m["z_hem"])
    shoulder_zone = z > m["z_shoulder"] - 0.06
    for s, sx in (("left", 1), ("right", -1)):
        mine = sx * x > 0
        # Torso and far side never move with this side's arm (the shoulder blends).
        W[np.ix_(in_torso & ~shoulder_zone, arm_cols[s])] = 0
        W[np.ix_(~mine, arm_cols[s])] = 0
        W[np.ix_(~mine, leg_cols[s])] = 0
        # The sleeve beyond the gap follows only its arm (and the shoulder at the top).
        sleeve = mine & ~in_torso & (z > m["z_hem"] + 0.02)
        W[np.ix_(sleeve & ~shoulder_zone, torso_cols + head_cols)] = 0
        W[np.ix_(sleeve, leg_cols["left"] + leg_cols["right"])] = 0
    legs = z < m["z_hem"] - 0.01
    W[np.ix_(legs, torso_cols[1:] + head_cols + arm_cols["left"] + arm_cols["right"])] = 0
    # Neck and anything inside the head: neck/head only.
    top = z > m["z_shoulder"] + 0.015
    W[np.ix_(top, torso_cols + arm_cols["left"] + arm_cols["right"])] = 0
    rigid = z > m["z_chin"] - 0.005
    W[rigid] = 0
    W[rigid, idx["head"]] = 1
    # Vertices the rules emptied fall back to the nearest bone.
    empty = W.sum(axis=1) < 1e-4
    if empty.any():
        heads = {n: (joints[n][0], joints[n][1]) for n in names if n in joints}
        for i in np.nonzero(empty)[0]:
            p = Vector(co[i])
            best = min(heads, key=lambda n: distance_to_segment(p, *heads[n]))
            W[i, idx[best]] = 1
    return W


def distance_to_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def fallback_weights(obj, joints, names):
    """Nearest-bone weights with a soft blend, when heat weighting cannot solve."""
    co = [v.co.copy() for v in obj.data.vertices]
    W = np.zeros((len(co), len(names)), dtype=np.float32)
    segs = [(joints[n][0], joints[n][1]) for n in names]
    for i, p in enumerate(co):
        d = np.array([distance_to_segment(p, a, b) for a, b in segs])
        w = np.exp(-(d - d.min()) / 0.012)
        w[w < 0.05] = 0
        W[i] = w
    return W


def skirt_weights(obj, m, names, share=0.92):
    idx = {n: i for i, n in enumerate(names)}
    W = np.zeros((len(obj.data.vertices), len(names)), dtype=np.float32)
    top, hem = m["z_skirt_top"], m["z_hem"]
    cy = m["leg_hem"][2]
    for v in obj.data.vertices:
        x, y, z = v.co
        t = float(smoothstep(top - 0.02, hem, z))
        side = float(np.clip(0.5 + x / 0.12, 0, 1))
        # The front panel rides on the thighs (sitting lifts it); the back stays with the
        # hips, which it is sat on.
        front = float(np.clip((cy - y) / 0.08, 0, 1))
        legs = share * t ** 0.8 * (0.55 + 0.45 * front)
        W[v.index, idx["hips"]] = 1 - legs
        W[v.index, idx["leftUpperLeg"]] = legs * side
        W[v.index, idx["rightUpperLeg"]] = legs * (1 - side)
    return W


def hair_weights(obj, chains, names, hp):
    """Hair: the head above the chains' roots, then the nearest chain by angle, down it."""
    idx = {n: i for i, n in enumerate(names)}
    W = np.zeros((len(obj.data.vertices), len(names)), dtype=np.float32)
    C = hp["centre"]
    info = []
    for prefix, pts in chains.items():
        d = Vector((pts[0].x - C.x, pts[0].y - C.y, 0)).normalized()
        info.append((prefix, d, pts))
    if not info:  # hair with no hanging chains (a bun) rides on the head
        W[:, idx["head"]] = 1
        return W
    for v in obj.data.vertices:
        p = v.co
        root_z = info[0][2][0].z
        if p.z > root_z:
            W[v.index, idx["head"]] = 1
            continue
        rel = Vector((p.x - C.x, p.y - C.y, 0))
        if rel.length < 1e-6:
            W[v.index, idx["head"]] = 1
            continue
        rel.normalize()
        scores = [(rel.dot(d), prefix, pts) for prefix, d, pts in info]
        scores.sort(key=lambda s: -s[0])
        best, prefix, pts = scores[0]
        if best < 0.55:  # the fringe and the front: rigid on the head
            W[v.index, idx["head"]] = 1
            continue
        span = pts[0].z - pts[-1].z
        t = float(np.clip((pts[0].z - p.z) / max(span, 1e-6), 0, 1)) * (len(pts) - 1)
        k = min(int(t), len(pts) - 2)
        frac = t - k
        amount = float(smoothstep(0.55, 0.8, best))
        head_share = 1 - amount * min(1.0, t / 0.6)
        W[v.index, idx["head"]] += head_share
        W[v.index, idx[f"{prefix}_{k}"]] += (1 - head_share) * (1 - frac)
        W[v.index, idx[f"{prefix}_{min(k + 1, len(pts) - 2)}"]] += (1 - head_share) * frac
    return W


def rigid(obj, bone):
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    g = obj.vertex_groups.new(name=bone)
    g.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")


def attach(obj, arm):
    obj.parent = arm
    obj.matrix_parent_inverse = Matrix.Identity(4)
    for mod in list(obj.modifiers):
        if mod.type == "ARMATURE":
            obj.modifiers.remove(mod)
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def to_t_pose(arm, meshes):
    """Pose each arm chain out level along its side, apply that deformation to the
    meshes and make it the rest pose (the VRM 1.0 humanoid rest is a T-pose)."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    for side, sx in (("left", 1), ("right", -1)):
        target = Vector((sx, 0, 0))
        for name in (f"{side}UpperArm", f"{side}LowerArm", f"{side}Hand"):
            pb = arm.pose.bones[name]
            bpy.context.view_layer.update()
            cur = (pb.tail - pb.head).normalized()  # armature space, current pose
            q = cur.rotation_difference(target)
            # Rotate in armature space about the bone head.
            M = pb.matrix.copy()
            loc = M.to_translation()
            R = q.to_matrix().to_4x4()
            pb.matrix = Matrix.Translation(loc) @ R @ Matrix.Translation(-loc) @ M
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        if obj.data.shape_keys:
            continue  # the face is rigid on the head, the pose does not move it
        mod = next(md for md in obj.modifiers if md.type == "ARMATURE")
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in meshes:
        attach(obj, arm)


def check_symmetry(joints):
    """Largest left/right mismatch of mirrored joint heads, in metres (for the report)."""
    worst = 0.0
    for name, (head, _t, _p) in joints.items():
        if name.startswith("left"):
            other = joints.get("right" + name[4:])
            if other:
                worst = max(worst, (Vector((-head.x, head.y, head.z)) - other[0]).length)
    return worst

