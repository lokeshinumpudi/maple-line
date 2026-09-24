"""Silhouette maths for the concept-art cast: matte, measure, align, mirror, landmarks.

Pure numpy, no Blender, so it runs inside Blender's Python (build.py) and in the unit
tests (tests/test_matte.py). Images are float arrays in [0, 1], shape (rows, cols, 3),
row 0 at the top as the image is drawn. Masks are bool arrays of shape (rows, cols).
"""

import numpy as np

# ---------------------------------------------------------------------------------------
# Morphology on bool masks, by shifting. No scipy in Blender's Python.


def _shift(mask, dy, dx, fill=False):
    out = np.full_like(mask, fill)
    h, w = mask.shape
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = mask[ys, xs]
    return out


def disk_offsets(radius):
    r = int(radius)
    return [(dy, dx) for dy in range(-r, r + 1) for dx in range(-r, r + 1) if dy * dy + dx * dx <= radius * radius + 1e-9]


def dilate(mask, radius=1):
    out = mask.copy()
    for dy, dx in disk_offsets(radius):
        if dy or dx:
            out |= _shift(mask, dy, dx)
    return out


def erode(mask, radius=1):
    out = mask.copy()
    for dy, dx in disk_offsets(radius):
        if dy or dx:
            out &= _shift(mask, dy, dx, fill=True)
    return out


def opening(mask, radius):
    return dilate(erode(mask, radius), radius)


def closing(mask, radius):
    return erode(dilate(mask, radius), radius)


def box_blur(img, radius=1):
    """Mean over a (2r+1)^2 box; edges repeat. Works on (h, w) or (h, w, c)."""
    k = 2 * radius + 1
    pad = [(radius, radius), (radius, radius)] + [(0, 0)] * (img.ndim - 2)
    p = np.pad(img, pad, mode="edge")
    c = np.cumsum(np.cumsum(p, axis=0), axis=1)
    c = np.pad(c, [(1, 0), (1, 0)] + [(0, 0)] * (img.ndim - 2))
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s / (k * k)


def flood(allowed, seeds):
    """Pixels of `allowed` 4-connected to `seeds` (both bool masks)."""
    reached = seeds & allowed
    while True:
        grown = reached.copy()
        # Several steps per convergence check keeps the loop cheap on big images.
        for _ in range(16):
            grown = (grown | _shift(grown, 1, 0) | _shift(grown, -1, 0) | _shift(grown, 0, 1) | _shift(grown, 0, -1)) & allowed
        if (grown == reached).all():
            return reached
        reached = grown


def border(shape):
    b = np.zeros(shape, dtype=bool)
    b[0, :] = b[-1, :] = b[:, 0] = b[:, -1] = True
    return b


def fill_holes(mask):
    return ~flood(~mask, border(mask.shape))


def largest_component(mask):
    """The connected piece holding the most pixels (4-connected)."""
    remaining = mask.copy()
    best = np.zeros_like(mask)
    while remaining.any():
        ys, xs = np.nonzero(remaining)
        seed = np.zeros_like(mask)
        seed[ys[0], xs[0]] = True
        piece = flood(remaining, seed)
        if piece.sum() > best.sum():
            best = piece
        remaining &= ~piece
        if best.sum() > remaining.sum():
            break
    return best


# ---------------------------------------------------------------------------------------
# Matte.


def paper_colors(img, pad_tol=0.02):
    """The flat padding colour (the image corner) and the painted paper colour (the median
    of border-adjacent pixels that are not the padding). Returns two RGB arrays."""
    pad = img[2, 2]
    ring = np.concatenate([img[4:12].reshape(-1, 3), img[-12:-4].reshape(-1, 3)])
    # The painted paper is the most common colour in the top rows away from the padding.
    top = img[4:40].reshape(-1, 3)
    far = np.abs(top - pad).max(axis=1) > pad_tol
    paper = np.median(top[far], axis=0) if far.sum() > 50 else np.median(ring, axis=0)
    return pad, paper


def shadow_like(img, paper, low=0.62, high=0.99, tint=0.05):
    """Pixels that look like the paper in shade: every channel the paper's times one
    common factor (a painted ground shadow), not a coloured shoe or sock."""
    ratio = img / np.maximum(paper, 1e-3)
    mean = ratio.mean(axis=2)
    return (mean > low) & (mean < high) & (np.abs(ratio - mean[..., None]).max(axis=2) < tint)


def matte(img, tol=0.075, clean=2, pad_tol=0.02, ground_shadow=False):
    """Character mask: pixels not reachable from the image border through paper-coloured
    pixels. Line art closes each shape, so light skin and white socks stay in the figure
    even though their colours sit near the paper. With `ground_shadow`, a painted shadow
    under the feet (the paper darkened, in the lowest tenth of the image, below the socks)
    counts as paper. Returns (mask, alpha)."""
    pad, paper = paper_colors(img, pad_tol)
    smooth = box_blur(img, 1)
    dist = np.minimum(np.linalg.norm(smooth - pad, axis=2), np.linalg.norm(smooth - paper, axis=2))
    allowed = dist < tol
    if ground_shadow:
        rows = np.arange(img.shape[0])[:, None] > img.shape[0] * 0.9
        allowed |= shadow_like(smooth, paper) & rows
    background = flood(allowed, border(dist.shape))
    mask = fill_holes(~background)
    mask = opening(mask, clean)
    mask = largest_component(mask)
    mask = fill_holes(closing(mask, clean))
    # Soft alpha: a one-pixel ramp across the edge from the colour distance.
    edge = dilate(mask, 1) & ~erode(mask, 1)
    alpha = mask.astype(np.float32)
    ramp = np.clip((dist - tol * 0.5) / tol, 0, 1)
    alpha[edge] = ramp[edge]
    return mask, alpha


def polygon_mask(shape, points):
    """Even-odd fill of a polygon given in (x, y) pixel coordinates."""
    h, w = shape
    ys, xs = np.mgrid[0:h, 0:w]
    xs = xs + 0.5
    ys = ys + 0.5
    inside = np.zeros(shape, dtype=bool)
    pts = np.asarray(points, dtype=float)
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        if y0 == y1:
            continue
        crosses = ((y0 <= ys) & (ys < y1)) | ((y1 <= ys) & (ys < y0))
        xcross = x0 + (ys - y0) * (x1 - x0) / (y1 - y0)
        inside ^= crosses & (xs < xcross)
    return inside


# ---------------------------------------------------------------------------------------
# Measurement and alignment.


def extent_rows(mask):
    rows = np.nonzero(mask.any(axis=1))[0]
    return int(rows[0]), int(rows[-1])


def row_runs(row):
    """[(start, end_exclusive)] of True runs in a 1-D bool array."""
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    starts = np.nonzero(d == 1)[0]
    ends = np.nonzero(d == -1)[0]
    return list(zip(starts.tolist(), ends.tolist()))


def outer_centre(mask, row):
    """Midpoint of the outermost silhouette pixels in one row."""
    cols = np.nonzero(mask[row])[0]
    return 0.5 * (cols[0] + cols[-1] + 1)


class ViewFrame:
    """Maps image pixels to character metres for one orthographic view.

    `top` and `sole` are pixel rows of the head top and the sole; `axis` is the pixel column
    that lands on the character's vertical axis. World height z = (sole - y) * scale;
    horizontal h = (x - axis) * scale, positive towards image right.
    """

    def __init__(self, top, sole, axis, height):
        self.top, self.sole, self.axis = float(top), float(sole), float(axis)
        self.scale = height / (self.sole - self.top)
        self.height = height

    def to_world(self, x, y):
        return (np.asarray(x, dtype=float) - self.axis) * self.scale, (self.sole - np.asarray(y, dtype=float)) * self.scale

    def to_pixel(self, h, z):
        return np.asarray(h, dtype=float) / self.scale + self.axis, self.sole - np.asarray(z, dtype=float) / self.scale

    def as_dict(self):
        return {"top": self.top, "sole": self.sole, "axis": self.axis, "metresPerPixel": self.scale}


def frame_for(mask, height, axis_rows):
    """Frame from a silhouette: head top and sole rows, and the axis as the mean of the
    outer centres over `axis_rows` (fractions of the figure height from the top)."""
    top, sole = extent_rows(mask)
    sole += 1  # the sole is the bottom edge of the last row
    rows = [int(round(top + f * (sole - top))) for f in axis_rows]
    axis = float(np.mean([outer_centre(mask, r) for r in rows]))
    return ViewFrame(top, sole, axis, height)


def resample(mask, frame, size, metres_per_cell, h_range, z_range=None):
    """Nearest-neighbour resample of a mask into a world grid: rows are z from the top down,
    columns are horizontal metres. Returns (grid, hs, zs) with cell-centre coordinates."""
    z_range = z_range or (0.0, frame.height)
    hs = np.arange(h_range[0] + metres_per_cell / 2, h_range[1], metres_per_cell)
    zs = np.arange(z_range[1] - metres_per_cell / 2, z_range[0], -metres_per_cell)
    px, py = frame.to_pixel(hs[None, :], zs[:, None])
    xi = np.clip(np.floor(px).astype(int), 0, mask.shape[1] - 1)
    yi = np.clip(np.floor(py).astype(int), 0, mask.shape[0] - 1)
    inside = (px >= 0) & (px < mask.shape[1]) & (py >= 0) & (py < mask.shape[0])
    grid = mask[yi, xi] & inside
    del size
    return grid, hs, zs


def mirror_about(mask, axis):
    """Reflect a mask left-right about pixel column `axis` (a column edge, may be fractional)."""
    h, w = mask.shape
    xs = np.arange(w) + 0.5
    src = np.floor(2 * axis - xs).astype(int)
    ok = (src >= 0) & (src < w)
    out = np.zeros_like(mask)
    out[:, ok] = mask[:, src[ok]]
    return out


def symmetric_from_half(mask, axis, keep="right"):
    """A left-right symmetric mask from one half: `keep` names the half copied across."""
    xs = np.arange(mask.shape[1]) + 0.5
    half = mask & ((xs > axis)[None, :] if keep == "right" else (xs < axis)[None, :])
    return half | mirror_about(half, axis)


def iou(a, b):
    union = (a | b).sum()
    return float((a & b).sum() / union) if union else 1.0


# ---------------------------------------------------------------------------------------
# Landmarks from the aligned front and side silhouettes (world metres).


def width_profile(grid, zs, hs):
    """Per row: list of (h0, h1) runs in metres."""
    step = hs[1] - hs[0]
    out = []
    for r in range(grid.shape[0]):
        out.append([(hs[0] - step / 2 + a * step, hs[0] - step / 2 + b * step) for a, b in row_runs(grid[r])])
    return out


def find_crotch(runs, zs, zmin=0.3, zmax=1.0):
    """Highest z where the silhouette below the torso splits into two runs straddling 0."""
    best = None
    for r, z in enumerate(zs):
        if not (zmin < z < zmax):
            continue
        centre = [run for run in runs[r] if run[0] < 0 < run[1]]
        if not centre and len(runs[r]) >= 2:
            best = z if best is None else max(best, z)
    return best


def find_armpit(runs, zs, zmin=0.8, zmax=1.4):
    """Highest z where the arms separate from the torso: three or more runs in a row."""
    best = None
    for r, z in enumerate(zs):
        if zmin < z < zmax and len(runs[r]) >= 3:
            best = z if best is None else max(best, z)
    return best


def neck_row(runs, zs, zmin, zmax):
    """Narrowest centre run between zmin and zmax (the neck), as (z, half width)."""
    best = None
    for r, z in enumerate(zs):
        if zmin < z < zmax:
            for a, b in runs[r]:
                if a < 0 < b:
                    w = (b - a) / 2
                    if best is None or w < best[1]:
                        best = (z, w)
    return best


def arm_line(grid, hs, zs, side, z_top, z_bottom, torso_half):
    """Centre line of one arm from the front silhouette: for each row below the armpit,
    the outermost run on `side` (+1 image right, -1 image left) beyond the torso.
    Returns (zs, centre_h, half_width) arrays."""
    rows = []
    for r, z in enumerate(zs):
        if not (z_bottom < z < z_top):
            continue
        runs = row_runs(grid[r])
        step = hs[1] - hs[0]
        cand = []
        for a, b in runs:
            h0, h1 = hs[0] + (a - 0.5) * step, hs[0] + (b - 0.5) * step
            c = 0.5 * (h0 + h1)
            if side * c > torso_half(z):
                cand.append((side * c, c, (h1 - h0) / 2))
        if cand:
            _s, c, w = max(cand)
            rows.append((z, c, w))
    if not rows:
        return np.zeros(0), np.zeros(0), np.zeros(0)
    a = np.array(rows)
    return a[:, 0], a[:, 1], a[:, 2]


def continuous_prefix(zs, cs, max_dz, max_dc):
    """Length of the leading run of samples with no z gap above max_dz and no centre jump
    above max_dc between neighbours (zs sorted from the top down)."""
    for i in range(1, len(zs)):
        if abs(zs[i] - zs[i - 1]) > max_dz or abs(cs[i] - cs[i - 1]) > max_dc:
            return i
    return len(zs)


def fit_line(zs, hs):
    """Least-squares h = a z + b; returns (a, b)."""
    A = np.stack([zs, np.ones_like(zs)], axis=1)
    sol, *_ = np.linalg.lstsq(A, hs, rcond=None)
    return float(sol[0]), float(sol[1])


def along(points, fraction):
    """Point at a fraction of the arc length of a polyline (the elbow on the arm line)."""
    points = np.asarray(points, dtype=float)
    seg = np.linalg.norm(np.diff(points, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    target = fraction * cum[-1]
    i = int(np.clip(np.searchsorted(cum, target, side="right") - 1, 0, len(seg) - 1))
    t = (target - cum[i]) / max(seg[i], 1e-9)
    return points[i] + (points[i + 1] - points[i]) * t


def narrowest(zs, widths, zmin, zmax):
    """z of the smallest width within [zmin, zmax] (elbow, wrist, knee, ankle)."""
    sel = (zs >= zmin) & (zs <= zmax)
    if not sel.any():
        return None
    i = np.argmin(np.where(sel, widths, np.inf))
    return float(zs[i])
