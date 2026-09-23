/**
 * Blender-built station modules placed on a station group. Each module GLB carries
 * LOD meshes marked with a `lod` extra (0 near, 1 far) and a `kind` extra. Nothing is
 * placed until the file loads, so a missing file leaves the station as it was.
 */
export const MODULE_PLACEMENTS = Object.freeze([
  {
    kind: 'station-shelter',
    path: 'models/modules/station-shelter.glb',
    // Momiji platform, station-local metres: the deck top is 1.1 m above the station origin,
    // the platform runs from x 2.5 to 7.5, and this end of it (z 8–14) had no cover.
    position: [6.2, 1.1, 11],
    // The open front faces +Z in the file; turn it to face the track at -X.
    yaw: -Math.PI / 2,
    farDistance: 70,
  },
]);

export function createStationModules({ THREE, loader, parent, placements = MODULE_PLACEMENTS }) {
  const placed = [];
  const ready = Promise.all(
    placements.map(async (placement) => {
      const gltf = await loader.get(placement.path);
      if (!gltf) return;
      const levels = [];
      gltf.scene.traverse((node) => {
        if (node.isMesh && Number.isInteger(node.userData.lod)) levels.push(node);
      });
      if (!levels.length) return;
      const lod = new THREE.LOD();
      lod.name = `Module / ${placement.kind}`;
      for (const mesh of levels.sort((a, b) => a.userData.lod - b.userData.lod)) {
        mesh.removeFromParent();
        mesh.position.set(0, 0, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        lod.addLevel(mesh, mesh.userData.lod === 0 ? 0 : placement.farDistance);
      }
      lod.position.set(...placement.position);
      lod.rotation.y = placement.yaw;
      parent.add(lod);
      placed.push({ kind: placement.kind, object: lod, levels: levels.length });
    }),
  );
  return {
    ready,
    getState: () =>
      placed.map(({ kind, levels, object }) => ({ kind, levels, visible: object.visible })),
    dispose() {
      for (const { object } of placed) object.removeFromParent();
    },
  };
}
