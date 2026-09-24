"""Body volume from aligned silhouettes: rounded slices, arm tubes and a smooth field.

A plain visual hull from a front and a side view has box-shaped cross-sections: every
horizontal slice is the product of one front interval and one side interval. Here each
slice is a superellipse inscribed in that box instead, per silhouette piece (torso, each
leg), so the result keeps both silhouettes exactly along the view axes and is round
between them. Arms are swept spheres along the arm's centre line, because a slanted arm
cut horizontally reads wider than it is. Pure numpy; units are metres; grids are indexed
[x, y, z] with z up, the character facing -y and her left at +x.
"""

import numpy as np

from matte import row_runs


class Grid:
    def __init__(self, x_range, y_range, z_range, cell):
        self.cell = cell
        self.xs = np.arange(x_range[0] + cell / 2, x_range[1], cell)
        self.ys = np.arange(y_range[0] + cell / 2, y_range[1], cell)
        self.zs = np.arange(z_range[0] + cell / 2, z_range[1], cell)
        self.shape = (len(self.xs), len(self.ys), len(self.zs))
        self.origin = np.array([x_range[0], y_range[0], z_range[0]])

    def index(self, value, axis):
        coords = (self.xs, self.ys, self.zs)[axis]
        return int(np.clip(np.round((value - coords[0]) / self.cell), 0, len(coords) - 1))


def sample_view(mask, frame, hs, zs):
    """Mask sampled at world (h, z) cell centres: returns bool [len(hs), len(zs)]."""
    px, py = np.broadcast_arrays(*frame.to_pixel(hs[:, None], zs[None, :]))
    xi = np.floor(px).astype(int)
    yi = np.floor(py).astype(int)
    ok = (xi >= 0) & (xi < mask.shape[1]) & (yi >= 0) & (yi < mask.shape[0])
    out = np.zeros(xi.shape, dtype=bool)
    out[ok] = mask[yi[ok], xi[ok]]
    return out


def runs_m(column, coords):
    """True runs of a 1-D bool array as (lo, hi) metre intervals."""
    step = coords[1] - coords[0]
    lo = coords[0] - step / 2
    return [(lo + a * step, lo + b * step) for a, b in row_runs(column)]


def superellipse(xx, yy, cx, ax, cy, ay, p):
    return (np.abs(xx - cx) / max(ax, 1e-6)) ** p + (np.abs(yy - cy) / max(ay, 1e-6)) ** p <= 1.0


def containing(runs, value):
    for a, b in runs:
        if a <= value <= b:
            return (a, b)
    return None


def widest(runs):
    return max(runs, key=lambda r: r[1] - r[0]) if runs else None


def slices(grid, front, side, marks, legs_depth=0.9):
    """Per z index, the superellipse slices {part: (cx, ax, cy, ay, p)} of the neck, torso,
    hips and legs.

    front: bool [nx, nz] symmetric front silhouette; side: bool [ny, nz] side silhouette.
    marks: z_neck_top, z_shoulder, z_waist, z_hem, z_crotch, z_ankle, neck (cx, ax, cy, ay),
    torso_x_limit(z) (the half width beyond which a run is an arm), leg_hem (cx, ax, cy, ay).
    """
    out = []
    leg_cx, leg_ax = marks["leg_hem"][0], marks["leg_hem"][1]
    for k, z in enumerate(grid.zs):
        fr = runs_m(front[:, k], grid.xs)
        sr = runs_m(side[:, k], grid.ys)
        row = {}
        if z > marks["z_neck_top"]:
            out.append(row)
            continue
        if z > marks["z_shoulder"] - 0.05:
            cx, ax, cy, ay = marks["neck"]
            row["neck"] = (cx, ax, cy, ay, 2.0)
        if marks["z_waist"] < z <= marks["z_shoulder"]:
            t = containing(fr, 0.0)
            s = widest(sr)
            if t and s:
                lim = marks["torso_x_limit"](z)
                a, b = max(t[0], -lim), min(t[1], lim)
                row["torso"] = ((a + b) / 2, (b - a) / 2, (s[0] + s[1]) / 2, (s[1] - s[0]) / 2, 2.4)
        elif marks["z_hem"] < z <= marks["z_waist"] + 0.02:
            # Under the skirt: thighs grow from the hem up to the crotch, the pelvis above.
            cx, ax, cy, ay = marks["leg_hem"]
            u = np.clip((z - marks["z_hem"]) / max(marks["z_crotch"] - marks["z_hem"], 1e-6), 0, 1)
            grow = 1 + 0.16 * u
            lcx = cx * (1 - 0.12 * u)
            row["legL"] = (lcx, ax * grow, cy, ay * (1 + 0.1 * u), 2.1)
            row["legR"] = (-lcx, ax * grow, cy, ay * (1 + 0.1 * u), 2.1)
            if z > marks["z_crotch"] - 0.03:
                v = np.clip((z - marks["z_crotch"] + 0.03) / 0.08, 0, 1)
                hip_ax = (lcx + ax * grow) * (0.55 + 0.45 * v)
                row["hips"] = (0.0, hip_ax, cy, ay * 1.28 * (0.7 + 0.3 * v), 2.3)
        elif z <= marks["z_hem"]:
            s = widest(sr)
            if s:
                # Both legs overlap in the side view; one leg is a little shallower.
                depth = (s[1] - s[0]) * legs_depth
                cy, ay = s[1] - depth / 2, depth / 2
                p = 2.6 if z < marks["z_ankle"] else 2.1
                for a, b in fr:
                    c = (a + b) / 2
                    # Only runs where a leg can be: pleat tips of the hem are not legs.
                    # Shoes and slippers are wider than the leg above them.
                    wide = 2.6 if z < marks["z_ankle"] + 0.02 else 1.0
                    if abs(abs(c) - leg_cx) < 1.3 * leg_ax * wide and b - a < 3 * leg_ax * wide:
                        row["legL" if c > 0 else "legR"] = (c, (b - a) / 2, cy, ay, p)
        out.append(row)
    return smooth_parts(out)


def smooth_parts(rows, window=9, parts=("torso", "neck")):
    """Moving average of each part's slice parameters over z, so one-pixel wobbles in a
    painted outline do not become ridges around the body."""
    for part in parts:
        ks = [k for k, row in enumerate(rows) if part in row]
        if len(ks) < 3:
            continue
        values = np.array([rows[k][part][:4] for k in ks])
        smoothed = np.stack([smooth_series(values[:, i], window) for i in range(4)], axis=1)
        for k, v in zip(ks, smoothed):
            rows[k][part] = (*v.tolist(), rows[k][part][4])
    return rows


def fill_slices(grid, rows):
    occ = np.zeros(grid.shape, dtype=bool)
    xx, yy = np.meshgrid(grid.xs, grid.ys, indexing="ij")
    for k, row in enumerate(rows):
        for cx, ax, cy, ay, p in row.values():
            occ[:, :, k] |= superellipse(xx, yy, cx, ax, cy, ay, p)
    return occ


def add_ellipsoid(occ, grid, centre, radii):
    """OR an axis-aligned ellipsoid into the occupancy grid."""
    lo = [grid.index(centre[i] - radii[i], i) for i in range(3)]
    hi = [grid.index(centre[i] + radii[i], i) + 1 for i in range(3)]
    xs = grid.xs[lo[0] : hi[0]][:, None, None]
    ys = grid.ys[lo[1] : hi[1]][None, :, None]
    zs = grid.zs[lo[2] : hi[2]][None, None, :]
    inside = ((xs - centre[0]) / radii[0]) ** 2 + ((ys - centre[1]) / radii[1]) ** 2 + ((zs - centre[2]) / radii[2]) ** 2 <= 1
    occ[lo[0] : hi[0], lo[1] : hi[1], lo[2] : hi[2]] |= inside


def sweep(occ, grid, points, radii, depth_ratio):
    """Spheres (flattened in y by depth_ratio) along a polyline, one per cell of length."""
    points = np.asarray(points, dtype=float)
    radii = np.asarray(radii, dtype=float)
    depth_ratio = np.broadcast_to(np.asarray(depth_ratio, dtype=float), radii.shape)
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        n = max(1, int(np.ceil(np.linalg.norm(b - a) / (grid.cell * 0.75))))
        for t in np.linspace(0, 1, n, endpoint=False):
            r = radii[i] + (radii[i + 1] - radii[i]) * t
            d = depth_ratio[i] + (depth_ratio[i + 1] - depth_ratio[i]) * t
            add_ellipsoid(occ, grid, a + (b - a) * t, (r, r * d, r))
    add_ellipsoid(occ, grid, points[-1], (radii[-1], radii[-1] * depth_ratio[-1], radii[-1]))


def blur3(field, passes=2):
    """Separable 3-tap box blur, repeated: a cheap Gaussian for rounding voxel steps."""
    f = field.astype(np.float32)
    for _ in range(passes):
        for axis in range(3):
            p = np.pad(f, [(1, 1) if a == axis else (0, 0) for a in range(3)], mode="edge")
            sl = lambda s, e: tuple(slice(s, p.shape[a] - e) if a == axis else slice(None) for a in range(3))  # noqa: E731
            f = (p[sl(0, 2)] + p[sl(1, 1)] + p[sl(2, 0)]) / 3.0
    return f


def smooth_series(values, window):
    """Centred moving average that keeps the ends (edge padding)."""
    values = np.asarray(values, dtype=float)
    if window <= 1 or len(values) < 3:
        return values
    w = min(window, len(values) | 1)
    pad = w // 2
    p = np.pad(values, pad, mode="edge")
    kernel = np.ones(w) / w
    return np.convolve(p, kernel, mode="valid")
