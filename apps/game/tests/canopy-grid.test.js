import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanopyGrid } from '../src/world/canopy-grid.js';

test('canopy queries cross negative cell boundaries and retain the highest overlapping crown', () => {
  const grid = createCanopyGrid();
  grid.add(-1, -1, 5, 20);
  grid.add(1, 1, 4, 30);
  assert.equal(grid.heightAt(-3, -1), 20);
  assert.equal(grid.heightAt(0, 0), 30);
  assert.equal(grid.heightAt(4, 4), -Infinity);
  assert.equal(grid.heightAt(100, 100), -Infinity);
});
