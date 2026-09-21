/** A small spatial index for camera clearance; no raycast through thousands of instances. */
export function createCanopyGrid(cellSize = 12) {
  const cells = new Map();
  const key = (x, z) => `${x}:${z}`;
  return {
    add(x, z, radius, top) {
      const tree = { x, z, radius, top };
      for (
        let column = Math.floor((x - radius) / cellSize);
        column <= Math.floor((x + radius) / cellSize);
        column++
      ) {
        for (
          let row = Math.floor((z - radius) / cellSize);
          row <= Math.floor((z + radius) / cellSize);
          row++
        ) {
          const id = key(column, row);
          if (!cells.has(id)) cells.set(id, []);
          cells.get(id).push(tree);
        }
      }
    },
    heightAt(x, z) {
      let height = -Infinity;
      for (const tree of cells.get(key(Math.floor(x / cellSize), Math.floor(z / cellSize))) ?? []) {
        if ((x - tree.x) ** 2 + (z - tree.z) ** 2 <= tree.radius ** 2)
          height = Math.max(height, tree.top);
      }
      return height;
    },
  };
}
