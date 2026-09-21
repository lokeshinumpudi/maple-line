import * as THREE from 'three';
import { sceneryHash } from './scenery-fields.js';

/** A bounded, world-anchored glow near the original valley's dry banks at dusk. */
export function createEveningMotes({ scene, renderer, center, terrain, railU, riverBedHeight }) {
  const count = 140;
  const positions = new Float32Array(count * 3),
    phases = new Float32Array(count);
  for (let i = 0; i < count; i++) phases[i] = sceneryHash(i, 0, 7651) * Math.PI * 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const uniforms = { time: { value: 0 }, opacity: { value: 0 }, pixelRatio: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float phase; uniform float time; uniform float pixelRatio;
      varying float pulse; varying float fade;
      void main() {
        vec3 p = position + vec3(sin(time*.27+phase)*.65, sin(time*.43+phase)*.4, cos(time*.21+phase)*.65);
        vec4 eye = modelViewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix*eye;
        gl_PointSize = clamp(340.*pixelRatio/max(8.,-eye.z),1.,9.*pixelRatio);
        pulse = .45+.55*pow(.5+.5*sin(time*.7+phase),2.);
        fade = smoothstep(2.,10.,-eye.z)*(1.-smoothstep(80.,160.,-eye.z));
      }`,
    fragmentShader: `
      uniform float opacity; varying float pulse; varying float fade;
      void main() {
        float r=length(gl_PointCoord-.5)*2.;
        float glow=exp(-r*r*4.)*(1.-smoothstep(.65,1.,r));
        gl_FragColor=vec4(1.,.78,.32,glow*pulse*opacity*fade);
      }`,
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.name = 'Evening / golden riverside motes';
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  let lastCell = null,
    disposed = false,
    accepted = 0;
  return {
    update(dt, { position, dusk, weather, paused = false, inTunnel = false, season = 'autumn' }) {
      if (disposed) return;
      const active =
        dusk &&
        weather === 'clear' &&
        season !== 'winter' &&
        !inTunnel &&
        position.z >= -700 &&
        position.z <= 740;
      uniforms.opacity.value = THREE.MathUtils.lerp(
        uniforms.opacity.value,
        active ? 0.8 : 0,
        1 - Math.exp(-Math.max(0, dt) * 2),
      );
      mesh.visible = uniforms.opacity.value > 0.005;
      if (!paused) uniforms.time.value += Math.max(0, dt);
      if (!mesh.visible) return;
      uniforms.pixelRatio.value = renderer.getPixelRatio();
      const cell = Math.floor(position.z / 48);
      if (cell === lastCell) return;
      lastCell = cell;
      accepted = 0;
      for (let row = -3; row <= 3; row++)
        for (let i = 0; i < 20; i++) {
          const region = cell + row;
          const z = (region + sceneryHash(region, i, 1619)) * 48;
          const u = -75 + sceneryHash(region, i, 7919) * 135;
          const bed = riverBedHeight(u, z),
            y = terrain(u, z);
          if (
            z < -800 ||
            z > 790 ||
            Math.abs(u - railU(z)) < 8 ||
            (bed !== null && bed < 0.2) ||
            !Number.isFinite(y) ||
            y > 25
          )
            continue;
          positions.set(
            [center(z) + u, y + 1.3 + sceneryHash(region, i, 3571) * 2, z],
            accepted * 3,
          );
          phases[accepted] = sceneryHash(region, i, 7651) * Math.PI * 2;
          accepted++;
        }
      geometry.setDrawRange(0, accepted);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.phase.needsUpdate = true;
    },
    getState() {
      return { visible: mesh.visible, count: accepted, capacity: count, time: uniforms.time.value };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
