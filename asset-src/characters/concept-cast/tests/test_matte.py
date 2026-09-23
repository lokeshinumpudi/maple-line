"""Unit tests for the silhouette, alignment and landmark maths (matte.py, shape.py).

Blender's Python has numpy, so the tests run there without extra installs:

    blender -b --factory-startup --python-exit-code 1 \\
      --python asset-src/characters/concept-cast/tests/run.py

Plain Python with numpy works too: python -m unittest discover asset-src/characters/concept-cast/tests
"""

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import matte as mt  # noqa: E402
import shape as sh  # noqa: E402

PAPER = np.array([0.94, 0.86, 0.73])
SKIN = np.array([0.97, 0.82, 0.68])  # close to the paper on purpose
LINE = np.array([0.25, 0.18, 0.15])


def painted(h=120, w=100, seed=3):
    """A paper sheet with a flat pad border, a light outlined oval and a dark bar."""
    rng = np.random.default_rng(seed)
    img = np.tile(PAPER, (h, w, 1)) + rng.normal(0, 0.008, (h, w, 3))
    img[:, :6] = img[:, -6:] = [0.945, 0.9, 0.81]  # padding
    img[:2] = img[-2:] = [0.945, 0.9, 0.81]
    yy, xx = np.mgrid[0:h, 0:w]
    r = ((xx - 50) / 22) ** 2 + ((yy - 40) / 26) ** 2
    img[r <= 1.0] = LINE  # outline ring
    img[r <= 0.82] = SKIN  # light fill inside the line
    img[70:110, 40:60] = [0.15, 0.17, 0.3]  # a dark leg-like bar, touching the oval
    img[64:72, 46:54] = [0.15, 0.17, 0.3]
    truth = (r <= 1.0) | ((yy >= 70) & (yy < 110) & (xx >= 40) & (xx < 60)) | ((yy >= 64) & (yy < 72) & (xx >= 46) & (xx < 54))
    return np.clip(img, 0, 1), truth


class MatteTest(unittest.TestCase):
    def test_light_fill_inside_line_art_stays_in_the_figure(self):
        img, truth = painted()
        mask, alpha = mt.matte(img, clean=1)
        # The 3x3 colour blur keeps the outline pixel itself: at most one pixel of growth.
        self.assertFalse((truth & ~mask).any())
        self.assertGreater(mt.iou(mask, mt.dilate(truth, 1)), 0.95)
        self.assertTrue(mask[40, 50], "the skin-coloured centre belongs to the figure")
        self.assertFalse(mask[5, 50])
        self.assertTrue(((alpha >= 0) & (alpha <= 1)).all())

    def test_paper_colours_separate_padding_from_paper(self):
        img, _ = painted()
        pad, paper = mt.paper_colors(img)
        self.assertLess(np.abs(paper - PAPER).max(), 0.03)
        self.assertGreater(np.abs(pad - paper).max(), 0.03)

    def test_polygon_mask_fills_a_square(self):
        m = mt.polygon_mask((20, 20), [(5, 5), (15, 5), (15, 15), (5, 15)])
        self.assertEqual(int(m.sum()), 100)
        self.assertTrue(m[10, 10])
        self.assertFalse(m[2, 2])

    def test_fill_holes_and_largest_component(self):
        m = np.zeros((20, 20), bool)
        m[2:12, 2:12] = True
        m[5:8, 5:8] = False  # a hole
        m[15:17, 15:17] = True  # a speck
        big = mt.largest_component(mt.fill_holes(m))
        self.assertTrue(big[6, 6])
        self.assertFalse(big[16, 16])


class AlignmentTest(unittest.TestCase):
    def figure(self, top, sole, centre, w=200, h=200):
        m = np.zeros((h, w), bool)
        m[top:sole, centre - 10 : centre + 10] = True
        return m

    def test_frames_scale_views_of_different_pixel_height_to_one_height(self):
        a = mt.frame_for(self.figure(10, 170, 100), 1.6, (0.5,))
        b = mt.frame_for(self.figure(30, 130, 80), 1.6, (0.5,))
        self.assertAlmostEqual(a.scale * 160, 1.6)
        self.assertAlmostEqual(b.scale * 100, 1.6)
        # Head top and sole land on the same world heights in both views.
        for f, top, sole in ((a, 10, 170), (b, 30, 130)):
            self.assertAlmostEqual(float(f.to_world(0, top)[1]), 1.6)
            self.assertAlmostEqual(float(f.to_world(0, sole)[1]), 0.0)
        self.assertAlmostEqual(a.axis, 100.0)
        self.assertAlmostEqual(b.axis, 80.0)

    def test_pixel_world_round_trip(self):
        f = mt.ViewFrame(12, 188, 97.5, 1.55)
        h, z = f.to_world(np.array([40.0, 150.0]), np.array([60.0, 120.0]))
        x, y = f.to_pixel(h, z)
        np.testing.assert_allclose(x, [40, 150])
        np.testing.assert_allclose(y, [60, 120])

    def test_mirror_and_symmetric_half(self):
        m = np.zeros((10, 20), bool)
        m[2:8, 12:16] = True  # right of the axis at x = 10
        mirrored = mt.mirror_about(m, 10.0)
        self.assertTrue(mirrored[5, 5] and not mirrored[5, 13])
        sym = mt.symmetric_from_half(m, 10.0, "right")
        np.testing.assert_array_equal(sym, sym[:, ::-1])
        self.assertAlmostEqual(mt.iou(sym, m | mirrored), 1.0)

    def test_front_back_mirror_check(self):
        """A back view is the front seen mirrored: after flipping about the axis the
        silhouettes agree; unflipped, an asymmetric figure does not."""
        front = np.zeros((40, 40), bool)
        front[5:35, 15:25] = True
        front[10:20, 25:34] = True  # an arm on image right only
        back = front[:, ::-1]
        fa = mt.frame_for(front, 1.0, (0.5,))
        ba = mt.frame_for(back, 1.0, (0.5,))
        hs = np.linspace(-0.4, 0.4, 81)
        zs = np.linspace(0.02, 0.98, 49)
        f = sh.sample_view(front, fa, hs, zs)
        good = sh.sample_view(back, ba, -hs, zs)
        wrong = sh.sample_view(back, ba, hs, zs)
        self.assertGreater(mt.iou(f, good), mt.iou(f, wrong) + 0.1)

    def test_sample_view_maps_world_cells_to_pixels(self):
        m = np.zeros((100, 100), bool)
        m[20:40, 60:70] = True
        f = mt.ViewFrame(0, 100, 50, 1.0)  # 1 cm per pixel, axis at column 50
        grid = sh.sample_view(m, f, np.array([0.15, -0.15]), np.array([0.7, 0.5]))
        self.assertTrue(grid[0, 0])  # h 0.15 -> column 65, z 0.7 -> row 30
        self.assertFalse(grid[1, 0])
        self.assertFalse(grid[0, 1])


class LandmarkTest(unittest.TestCase):
    def test_armpit_and_crotch_from_runs(self):
        zs = np.linspace(0, 1.5, 151)
        runs = []
        for z in zs:
            if z < 0.7:
                runs.append([(-0.12, -0.02), (0.02, 0.12)])  # legs
            elif z < 1.1:
                runs.append([(-0.35, -0.3), (-0.15, 0.15), (0.3, 0.35)])  # arms apart
            else:
                runs.append([(-0.3, 0.3)])
        self.assertAlmostEqual(mt.find_armpit(runs, zs, 0.8, 1.4), float(zs[zs < 1.1].max()))
        self.assertAlmostEqual(mt.find_crotch(runs, zs, 0.3, 1.0), float(zs[zs < 0.7].max()))

    def test_arm_line_fits_a_slanted_arm(self):
        zs = np.linspace(0.6, 1.2, 61)
        xs = np.linspace(-0.5, 0.5, 201)
        grid = np.zeros((len(zs), len(xs)), bool)
        for i, z in enumerate(zs):
            grid[i, np.abs(xs) < 0.1] = True  # torso
            c = 0.2 + 0.3 * (1.2 - z)  # the arm drifts out as it goes down
            grid[i, np.abs(xs - c) < 0.03] = True
        z_a, c_a, w_a = mt.arm_line(grid, xs, zs, +1, 1.15, 0.65, lambda z: 0.1)
        slope, _b = mt.fit_line(z_a, c_a)
        self.assertAlmostEqual(slope, -0.3, places=2)
        self.assertTrue(np.all(np.abs(w_a - 0.03) < 0.006))

    def test_continuous_prefix_stops_at_a_jump(self):
        zs = np.array([1.0, 0.99, 0.98, 0.97, 0.6])
        cs = np.array([0.2, 0.21, 0.22, 0.23, 0.1])
        self.assertEqual(mt.continuous_prefix(zs, cs, max_dz=0.03, max_dc=0.05), 4)
        self.assertEqual(mt.continuous_prefix(zs[:4], cs[:4], 0.03, 0.05), 4)

    def test_narrowest_and_along(self):
        zs = np.linspace(0, 1, 11)
        widths = np.abs(zs - 0.4) + 0.1
        self.assertAlmostEqual(mt.narrowest(zs, widths, 0.2, 0.8), 0.4)
        pts = np.array([[0.0, 0, 0], [1.0, 0, 0], [1.0, 1.0, 0]])
        np.testing.assert_allclose(mt.along(pts, 0.25), [0.5, 0, 0])
        np.testing.assert_allclose(mt.along(pts, 0.75), [1.0, 0.5, 0])


class ShapeTest(unittest.TestCase):
    def test_rounded_slices_keep_both_silhouettes(self):
        """A superellipse slice touches the front and side extents but is round between."""
        grid = sh.Grid((-0.2, 0.2), (-0.2, 0.2), (0.0, 0.01), 0.004)
        xx, yy = np.meshgrid(grid.xs, grid.ys, indexing="ij")
        inside = sh.superellipse(xx, yy, 0.0, 0.1, 0.0, 0.06, 2.0)
        self.assertTrue(inside[grid.index(0.098, 0), grid.index(0.0, 1)])
        self.assertTrue(inside[grid.index(0.0, 0), grid.index(0.058, 1)])
        self.assertFalse(inside[grid.index(0.09, 0), grid.index(0.05, 1)], "corner of the box is carved away")

    def test_blur_keeps_mass_and_smooths_steps(self):
        occ = np.zeros((12, 12, 12), bool)
        occ[3:9, 3:9, 3:9] = True
        f = sh.blur3(occ, 2)
        self.assertAlmostEqual(float(f.sum()), float(occ.sum()), delta=1.0)
        self.assertTrue(0.0 < f[2, 5, 5] < 1.0)

    def test_smooth_series_keeps_ends(self):
        s = sh.smooth_series(np.array([0.0, 0, 1, 0, 0]), 3)
        self.assertEqual(len(s), 5)
        self.assertAlmostEqual(float(s[2]), 1 / 3)


if __name__ == "__main__":
    unittest.main()
