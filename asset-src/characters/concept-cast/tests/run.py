"""Run the concept-cast unit tests inside Blender's Python (it ships numpy):

    blender -b --factory-startup --python-exit-code 1 \\
      --python asset-src/characters/concept-cast/tests/run.py
"""

import os
import sys
import unittest

here = os.path.dirname(os.path.abspath(__file__))
suite = unittest.defaultTestLoader.discover(here, pattern="test_*.py")
result = unittest.TextTestRunner(verbosity=1).run(suite)
if not result.wasSuccessful():
    sys.exit(1)
