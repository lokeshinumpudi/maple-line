import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { campaign } from '../src/narrative/story-data.js';
import { createStoryCast } from '../src/narrative/story-cast.js';
import { createStoryGuests } from '../src/narrative/story-guests.js';
import { createStoryCinematics } from '../src/narrative/story-cinematics.js';
import { routeCenter, routeElevation, scenicTerrain } from '../src/world/extended-route.js';

const WIDTH = 1280;
const HEIGHT = 800;
const railPoint = (z) => new THREE.Vector3(routeCenter(z) + 28, routeElevation(z), z);
function terrainHeight(x, z) {
  if (z > 790) return scenicTerrain(x, z);
  // The original Momiji right-bank shelf and slope, matching main's naturalTerrain.
  // All cast and cinematic sight samples in this fixture stay east of the river.
  const u = x - routeCenter(z);
  if (u <= 38) return 4.1;
  const d = u - 38;
  return (
    4.1 +
    d * 0.85 +
    Math.sin(z * 0.025 + u * 0.05) * Math.min(d * 0.3, 13) +
    Math.sin(z * 0.066 + u * 0.13) * Math.min(d * 0.1, 7)
  );
}

for (const z of [525, 1500, 3100, 4700, 12800]) {
  test(`conversation at ${z} frames all three heads above the dialogue at 1280×800`, (t) => {
    const scene = new THREE.Scene();
    const cast = createStoryCast({ THREE, scene, railPoint, terrainHeight });
    const guests = createStoryGuests({ THREE, scene, railPoint, terrainHeight });
    const beat = campaign.beats.find((item) => item.z === z);
    const storyState = { enabled: true, status: 'dialogue', activeBeat: beat };
    const trainPosition = railPoint(z);
    const input = { storyState, trainPosition, trainSpeed: 0 };
    cast.update(input);
    guests.update(input);
    const castFrame = cast.getState();
    const guestFrame = guests.getState();
    assert.equal(castFrame.visible, true);
    assert.equal(guestFrame.visible, true);
    const combined = { ...castFrame, feet: [...castFrame.feet, ...guestFrame.feet] };
    const characters = [...castFrame.characters, ...guestFrame.characters];
    assert.equal(characters.length, 3);
    const camera = new THREE.PerspectiveCamera(48, WIDTH / HEIGHT, 0.3, 2000);
    camera.position.copy(trainPosition).add(new THREE.Vector3(-90, 54, -55));
    camera.lookAt(trainPosition);
    const baseCameraPosition = camera.position.clone();
    const baseCameraQuaternion = camera.quaternion.clone();
    const cinematic = createStoryCinematics({
      THREE,
      camera,
      railPoint,
      terrainHeight,
      reducedMotion: true,
    });
    t.after(() => {
      cinematic.dispose();
      cast.dispose();
      guests.dispose();
    });
    for (const dialogueFraction of [0.35, 0.55]) {
      cinematic.update({
        dt: 1 / 60,
        storyState,
        castState: combined,
        trainPosition,
        baseCameraPosition,
        baseCameraQuaternion,
        dialogueFraction,
      });
      const dialogueTop = HEIGHT * (1 - dialogueFraction);
      const positions = characters.map((character) => {
        const projected = new THREE.Vector3(...character.headFocus).project(camera);
        return {
          id: character.id,
          x: ((projected.x + 1) * WIDTH) / 2,
          y: ((1 - projected.y) * HEIGHT) / 2,
          depth: projected.z,
        };
      });
      t.diagnostic(JSON.stringify({ z, dialogueTop, positions }));
      for (const point of positions) {
        assert.ok(
          point.depth > -1 && point.depth < 1,
          `${point.id}: head behind camera/clipping plane`,
        );
        assert.ok(
          point.x >= 12 && point.x <= WIDTH - 12,
          `${point.id}: x=${point.x.toFixed(1)} outside horizontal safe frame`,
        );
        assert.ok(
          point.y >= 12 && point.y <= dialogueTop - 12,
          `${point.id}: head y=${point.y.toFixed(1)} overlaps dialogue top ${dialogueTop} (12px margin)`,
        );
      }
    }
  });
}
