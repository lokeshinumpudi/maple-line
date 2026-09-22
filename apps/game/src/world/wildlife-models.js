import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const INK = '#171d1c',
  IVORY = '#ece4d4';
export const WILDLIFE_MODELS = Object.freeze({
  'sika-deer': {
    kind: 'mammal',
    coat: '#9c6540',
    cream: '#e6d8b6',
    height: 1.05,
    width: 0.32,
    length: 0.68,
    head: [0, 1.57, 0.65],
    headSize: [0.19, 0.23, 0.28],
    ear: [0.105, 0.23, 0.075],
    leg: 0.75,
  },
  'japanese-hare': {
    kind: 'mammal',
    coat: '#a59376',
    cream: '#e7ddc8',
    height: 0.35,
    width: 0.23,
    length: 0.38,
    head: [0, 0.58, 0.34],
    headSize: [0.16, 0.18, 0.19],
    ear: [0.07, 0.3, 0.05],
    leg: 0.25,
  },
  tanuki: {
    kind: 'mammal',
    coat: '#746652',
    cream: '#c8bfa4',
    height: 0.4,
    width: 0.29,
    length: 0.53,
    head: [0, 0.58, 0.48],
    headSize: [0.21, 0.2, 0.23],
    ear: [0.085, 0.115, 0.065],
    leg: 0.32,
  },
  'red-fox': {
    kind: 'mammal',
    coat: '#bd642e',
    cream: '#f0e2c9',
    height: 0.57,
    width: 0.23,
    length: 0.56,
    head: [0, 0.77, 0.51],
    headSize: [0.17, 0.19, 0.24],
    ear: [0.095, 0.19, 0.06],
    leg: 0.5,
  },
  'japanese-squirrel': {
    kind: 'mammal',
    coat: '#925a37',
    cream: '#e3cdb0',
    height: 0.25,
    width: 0.13,
    length: 0.23,
    head: [0, 0.44, 0.19],
    headSize: [0.115, 0.13, 0.14],
    ear: [0.045, 0.09, 0.04],
    leg: 0.2,
  },
  'wild-boar': {
    kind: 'mammal',
    coat: '#554a3f',
    cream: '#9b8872',
    height: 0.62,
    width: 0.38,
    length: 0.72,
    head: [0, 0.59, 0.63],
    headSize: [0.27, 0.3, 0.37],
    ear: [0.14, 0.18, 0.085],
    leg: 0.43,
  },
  'japanese-macaque': {
    kind: 'mammal',
    coat: '#8e8270',
    cream: '#c4b8a2',
    height: 0.48,
    width: 0.29,
    length: 0.38,
    head: [0, 0.87, 0.29],
    headSize: [0.22, 0.24, 0.21],
    ear: [0.09, 0.105, 0.065],
    leg: 0.38,
  },
  'pond-turtle': { kind: 'turtle' },
  yamame: {
    kind: 'fish',
    back: '#637b75',
    belly: '#d8d9bd',
    mark: '#334e52',
    pattern: 'bars',
    length: 0.48,
    girth: 0.135,
  },
  ayu: {
    kind: 'fish',
    back: '#748f77',
    belly: '#e1e6ce',
    mark: '#dcba4d',
    pattern: 'cheek',
    length: 0.44,
    girth: 0.105,
  },
  oikawa: {
    kind: 'fish',
    back: '#567885',
    belly: '#d5dce0',
    mark: '#347896',
    pattern: 'bars',
    length: 0.39,
    girth: 0.105,
  },
  iwana: {
    kind: 'fish',
    back: '#455c4b',
    belly: '#c2bf94',
    mark: '#ecdbad',
    pattern: 'spots',
    length: 0.5,
    girth: 0.14,
  },
  medaka: {
    kind: 'fish',
    back: '#bdae77',
    belly: '#eee4b8',
    mark: '#b8cddd',
    pattern: 'stripe',
    length: 0.24,
    girth: 0.06,
  },
  koi: {
    kind: 'fish',
    back: '#f2e9d3',
    belly: '#f0dfc7',
    mark: '#c94d28',
    pattern: 'patches',
    length: 0.55,
    girth: 0.17,
  },
  'japanese-white-eye': {
    kind: 'bird',
    back: '#7e9140',
    belly: '#e3dda7',
    head: '#8d9c45',
    wing: '#526738',
    ring: true,
    size: 0.85,
  },
  'barn-swallow': {
    kind: 'bird',
    back: '#243e54',
    belly: '#edddc4',
    head: '#23384b',
    throat: '#a35338',
    wing: '#20354b',
    fork: true,
    size: 1,
  },
  'varied-tit': {
    kind: 'bird',
    back: '#526164',
    belly: '#c17a46',
    head: '#232d2c',
    cheek: '#ddd7be',
    wing: '#354a52',
    size: 1,
  },
  'long-tailed-tit': {
    kind: 'bird',
    back: '#c4b9a9',
    belly: '#f3eee2',
    head: '#edece0',
    wing: '#3f4342',
    longTail: true,
    size: 0.8,
  },
  kingfisher: {
    kind: 'bird',
    back: '#26878c',
    belly: '#d18a43',
    head: '#226c7d',
    cheek: '#e6cfad',
    wing: '#235f74',
    longBeak: true,
    size: 1.3,
  },
  'mandarin-duck': {
    kind: 'bird',
    back: '#675745',
    belly: '#e4d6b4',
    head: '#36736d',
    cheek: '#e1b86f',
    wing: '#a86430',
    duck: true,
    size: 2,
  },
});

/** Geometry is authored once and shared by instances; every part carries its own vertex colors. */
export function createWildlifeModelRenderer(root) {
  const geometries = [],
    models = new Map();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0,
  });
  const fishMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.32,
    metalness: 0.12,
  });
  const dummy = new THREE.Object3D(),
    parent = new THREE.Matrix4(),
    matrix = new THREE.Matrix4();
  function builder() {
    const pieces = [];
    function add(geometry, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      if (g !== geometry) geometry.dispose();
      // Small tonal differences remain smooth; no random geometry or per-frame texture work.
      const c = new THREE.Color(color),
        colors = [];
      const normals = g.getAttribute('normal');
      for (let i = 0; i < g.getAttribute('position').count; i++) {
        const shade = 0.94 + 0.06 * (normals?.getY(i) ?? 0);
        colors.push(c.r * shade, c.g * shade, c.b * shade);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      g.deleteAttribute('uv');
      dummy.position.fromArray(position);
      dummy.scale.fromArray(scale);
      dummy.rotation.set(...rotation);
      dummy.updateMatrix();
      g.applyMatrix4(dummy.matrix);
      pieces.push(g);
    }
    const oval = (color, p, s, r) => {
      const small = Math.min(...s) < 0.025,
        medium = Math.max(...s) < 0.12;
      add(
        new THREE.SphereGeometry(1, small ? 8 : medium ? 10 : 16, small ? 4 : medium ? 6 : 10),
        color,
        p,
        s,
        r,
      );
    };
    function bone(color, a, b, r1, r2 = r1) {
      const start = new THREE.Vector3(...a),
        end = new THREE.Vector3(...b),
        direction = end.clone().sub(start);
      const g = new THREE.CylinderGeometry(r2, r1, direction.length(), 8);
      g.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.normalize(),
        ),
      );
      add(g, color, start.add(end).multiplyScalar(0.5).toArray());
    }
    function tube(color, points, radius) {
      add(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
          16,
          radius,
          10,
          false,
        ),
        color,
      );
      oval(color, points[0], [radius, radius, radius]);
      oval(color, points.at(-1), [radius, radius, radius]);
    }
    return {
      add,
      oval,
      bone,
      tube,
      finish() {
        const g = mergeGeometries(pieces, false);
        pieces.forEach((p) => p.dispose());
        geometries.push(g);
        return g;
      },
    };
  }
  function define(id, part, count, make, offset = [0, 0, 0], copies = 1) {
    const b = builder();
    make(b);
    const mesh = new THREE.InstancedMesh(
      b.finish(),
      WILDLIFE_MODELS[id].kind === 'fish' ? fishMaterial : material,
      (count + 1) * copies,
    );
    mesh.name = `Wildlife / ${id} / ${part}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = ['mammal', 'turtle'].includes(WILDLIFE_MODELS[id].kind);
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    const entry = models.get(id) ?? {};
    entry[part] = { mesh, offset, copies };
    models.set(id, entry);
  }
  function eye(b, x, y, z, r, ring = false) {
    if (ring) b.oval(IVORY, [x, y, z], [r * 1.48, r * 1.48, r * 0.68]);
    b.oval(INK, [x, y, z + r * 0.38], [r, r, r * 0.7]);
    b.oval('#ffffff', [x - r * 0.22, y + r * 0.3, z + r * 0.94], [r * 0.24, r * 0.24, r * 0.12]);
  }
  function mammal(id, c) {
    const cap = id === 'sika-deer' ? 12 : 8;
    const deer = id === 'sika-deer',
      hare = id === 'japanese-hare',
      fox = id === 'red-fox',
      squirrel = id === 'japanese-squirrel',
      boar = id === 'wild-boar',
      monkey = id === 'japanese-macaque';
    define(id, 'body', cap, (b) => {
      b.oval(c.coat, [0, c.height, 0], [c.width, deer ? 0.37 : boar ? 0.42 : c.width, c.length]);
      b.oval(
        c.coat,
        [0, c.height * 0.94, -c.length * 0.6],
        [c.width * 1.02, c.width * 1.1, c.length * 0.5],
      );
      b.oval(
        c.cream,
        [0, c.height - c.width * 0.53, c.length * 0.22],
        [c.width * 0.78, c.width * 0.55, c.length * 0.64],
      );
      if (deer) {
        b.oval(c.coat, [0, 1.28, 0.46], [0.175, 0.4, 0.21], [0.33, 0, 0]);
        b.oval(IVORY, [0, 1.04, -0.62], [0.23, 0.26, 0.055]);
        for (let side of [-1, 1])
          for (let i = 0; i < 9; i++)
            b.oval(
              '#ddc7a0',
              [side * 0.302, 0.98 + (i % 3) * 0.14, -0.4 + Math.floor(i / 3) * 0.28],
              [0.013, 0.027, 0.035],
            );
      }
      if (boar)
        for (let i = 0; i < 12; i++)
          b.bone('#342f29', [0, 0.98, -0.45 + i * 0.09], [0, 1.08, -0.48 + i * 0.09], 0.028, 0.003);
      if (monkey) b.oval(c.cream, [0, 0.65, 0.25], [0.23, 0.32, 0.16]);
      // Shoulder and haunch tufts break the outline without a fur shell.
      if (fox || squirrel || id === 'tanuki')
        for (let side of [-1, 1])
          for (let i = 0; i < 3; i++)
            b.oval(
              c.coat,
              [side * c.width * 0.85, c.height + 0.08 - i * 0.04, c.length * 0.55],
              [0.085, 0.08, 0.15],
              [0, side * 0.45, 0],
            );
    });
    define(
      id,
      'head',
      cap,
      (b) => {
        b.oval(c.coat, [0, 0, 0], c.headSize);
        const muzzle = fox ? 0.24 : boar ? 0.25 : deer ? 0.2 : hare ? 0.11 : monkey ? 0.09 : 0.13;
        b.oval(
          monkey ? '#c88478' : c.cream,
          [0, -0.055, c.headSize[2] * 0.72],
          [c.headSize[0] * 0.67, c.headSize[1] * 0.5, muzzle],
        );
        b.oval(
          boar ? '#817568' : INK,
          [0, -0.04, c.headSize[2] * 0.72 + muzzle * 0.92],
          [boar ? 0.1 : 0.037, boar ? 0.066 : 0.026, 0.022],
        );
        if (boar)
          for (let sign of [-1, 1]) {
            b.oval(INK, [sign * 0.044, -0.04, 0.492], [0.018, 0.018, 0.008]);
            b.bone(IVORY, [sign * 0.19, -0.13, 0.23], [sign * 0.22, 0.025, 0.4], 0.034, 0.006);
          }
        if (monkey) b.oval('#c7887d', [0, 0.025, 0.155], [0.174, 0.162, 0.065]);
        for (let sign of [-1, 1]) {
          const ex = sign * c.headSize[0] * 0.73,
            ey = c.headSize[1] * 0.75;
          b.oval(c.coat, [ex, ey + c.ear[1] * 0.5, -0.02], c.ear, [0, 0, sign * -0.25]);
          b.oval(
            hare ? '#c39889' : c.cream,
            [ex, ey + c.ear[1] * 0.5, 0.035],
            [c.ear[0] * 0.53, c.ear[1] * 0.72, 0.02],
            [0, 0, sign * -0.25],
          );
          if (id === 'tanuki')
            b.oval(
              '#302e2a',
              [sign * 0.125, 0.025, 0.16],
              [0.105, 0.084, 0.073],
              [0, sign * 0.3, sign * -0.15],
            );
          eye(
            b,
            sign * c.headSize[0] * 0.7,
            0.045,
            c.headSize[2] * 0.78,
            monkey ? 0.027 : hare ? 0.029 : 0.026,
          );
          if (fox)
            b.oval(
              c.cream,
              [sign * 0.105, -0.035, 0.135],
              [0.095, 0.075, 0.15],
              [0, sign * 0.35, 0],
            );
        }
        if (fox || hare)
          for (let sign of [-1, 1])
            for (let k = 0; k < 3; k++)
              b.bone(
                '#a79c86',
                [sign * 0.055, -0.08, 0.25],
                [sign * 0.18, -0.07 + k * 0.025, 0.29],
                0.002,
                0.001,
              );
      },
      c.head,
    );
    define(
      id,
      'leg',
      cap,
      (b) => {
        const legLength = Math.max(c.leg, c.height - 0.12);
        const upper = legLength * 0.48;
        b.oval(
          c.coat,
          [0, -upper * 0.5, 0],
          [deer ? 0.06 : 0.075, upper * 0.66, deer ? 0.07 : 0.09],
        );
        b.bone(
          fox ? '#554336' : c.coat,
          [0, -upper, 0],
          [0, -legLength, 0.045],
          deer ? 0.045 : 0.047,
          0.035,
        );
        b.oval(
          deer ? '#35322b' : fox ? '#4a3a2b' : c.coat,
          [0, -legLength + 0.025, 0.07],
          [deer ? 0.052 : 0.071, 0.045, hare ? 0.135 : 0.1],
        );
        if (!deer)
          for (let i = 0; i < 3; i++)
            b.oval('#3b332b', [(i - 1) * 0.03, -legLength + 0.02, 0.145], [0.009, 0.013, 0.025]);
      },
      [0, 0, 0],
      4,
    );
    define(
      id,
      'tail',
      cap,
      (b) => {
        if (squirrel) {
          b.tube(
            c.coat,
            [
              [0, 0, 0],
              [0, 0.2, -0.22],
              [0, 0.6, -0.3],
              [0, 0.82, -0.14],
              [0, 0.75, 0.08],
            ],
            0.13,
          );
          b.tube(
            c.cream,
            [
              [0, 0.15, -0.31],
              [0, 0.48, -0.43],
              [0, 0.72, -0.31],
            ],
            0.04,
          );
        } else if (fox) {
          b.oval(c.coat, [0, -0.03, -0.27], [0.145, 0.16, 0.38], [0.2, 0, 0]);
          b.oval(IVORY, [0, 0.025, -0.55], [0.095, 0.11, 0.17], [0.2, 0, 0]);
        } else if (boar)
          b.tube(
            c.coat,
            [
              [0, 0, 0],
              [0, 0.04, -0.18],
              [0.07, 0.08, -0.23],
              [0.09, 0.025, -0.2],
            ],
            0.018,
          );
        else
          b.oval(
            hare ? IVORY : c.coat,
            [0, 0, -0.07],
            [hare ? 0.115 : 0.09, hare ? 0.12 : 0.095, hare ? 0.12 : monkey ? 0.1 : 0.22],
          );
      },
      [0, c.height, -c.length * 0.78],
    );
    if (deer)
      define(
        id,
        'antlers',
        cap,
        (b) => {
          for (let sign of [-1, 1]) {
            b.bone('#baa17a', [sign * 0.11, 0.14, -0.06], [sign * 0.23, 0.64, -0.21], 0.032, 0.012);
            b.bone('#baa17a', [sign * 0.19, 0.42, -0.15], [sign * 0.37, 0.6, -0.02], 0.021, 0.006);
            b.bone('#baa17a', [sign * 0.16, 0.29, -0.11], [sign * 0.24, 0.44, 0.1], 0.019, 0.005);
          }
        },
        c.head,
      );
  }
  function turtle(id) {
    define(id, 'body', 6, (b) => {
      b.oval('#927c47', [0, 0.16, 0], [0.31, 0.13, 0.44]);
      b.oval('#4c5840', [0, 0.24, -0.01], [0.31, 0.22, 0.42]);
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 3; col++) {
          const z = (row - 2) * 0.145,
            x = (col - 1) * 0.17,
            n = (x / 0.33) ** 2 + (z / 0.46) ** 2;
          if (n < 0.95)
            b.oval(
              (row + col) % 2 ? '#677044' : '#75744c',
              [x, 0.24 + 0.22 * Math.sqrt(1 - n), z],
              [0.077, 0.008, 0.067],
              [
                Math.atan2(z * 0.22, 0.46 * 0.46 * Math.sqrt(1 - n)),
                0,
                -Math.atan2(x * 0.22, 0.33 * 0.33 * Math.sqrt(1 - n)),
              ],
            );
        }
    });
    define(
      id,
      'head',
      6,
      (b) => {
        b.oval('#657047', [0, 0, 0.07], [0.105, 0.095, 0.17]);
        for (let side of [-1, 1]) {
          b.oval('#d0b65f', [side * 0.085, 0.022, 0.105], [0.015, 0.016, 0.13]);
          eye(b, side * 0.072, 0.047, 0.17, 0.018);
        }
      },
      [0, 0.23, 0.39],
    );
    define(
      id,
      'leg',
      6,
      (b) => {
        b.oval('#62613e', [0, -0.045, 0.045], [0.067, 0.066, 0.14]);
        for (let k = 0; k < 3; k++)
          b.bone(
            '#d0bd82',
            [(k - 1) * 0.03, -0.06, 0.13],
            [(k - 1) * 0.035, -0.07, 0.2],
            0.008,
            0.002,
          );
      },
      [0, 0, 0],
      4,
    );
    define(
      id,
      'tail',
      6,
      (b) => b.bone('#62613e', [0, 0, 0], [0, -0.08, -0.22], 0.045, 0.004),
      [0, 0.16, -0.36],
    );
  }
  function fish(id, c) {
    define(id, 'body', 77, (b) => {
      const g = new THREE.SphereGeometry(1, 24, 12),
        pos = g.attributes.position;
      // Narrow the rear peduncle and flatten the belly into a fish silhouette.
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i),
          taper = z < 0 ? 0.65 + 0.35 * (z + 1) : 1;
        pos.setXYZ(i, pos.getX(i) * c.girth * taper, pos.getY(i) * c.girth * 0.9, z * c.length);
      }
      g.computeVertexNormals();
      b.add(g, c.back);
      b.oval(
        c.belly,
        [0, -c.girth * 0.43, c.length * 0.05],
        [c.girth * 0.83, c.girth * 0.5, c.length * 0.83],
      );
      for (let sign of [-1, 1]) {
        const ex = sign * c.girth * 0.59,
          ez = c.length * 0.7,
          eyeScale = c.girth / 0.135;
        b.oval(
          '#c8b888',
          [ex, 0.035 * eyeScale, ez],
          [0.024 * eyeScale, 0.025 * eyeScale, 0.023 * eyeScale],
        );
        eye(b, ex, 0.038 * eyeScale, ez + 0.013 * eyeScale, 0.014 * eyeScale);
        b.oval(
          c.back,
          [sign * c.girth * 0.84, 0, c.length * 0.37],
          [0.012, c.girth * 0.75, c.length * 0.12],
          [0, sign * -0.25, 0],
        );
        b.bone(
          c.belly,
          [sign * c.girth * 0.8, -0.01, c.length * 0.43],
          [sign * c.girth * 0.68, -c.girth * 0.65, c.length * 0.35],
          0.005,
          0.004,
        );
        for (let j = 0; j < 8; j++) {
          const z = -c.length * 0.56 + j * c.length * 0.155;
          const x =
            sign *
            c.girth *
            Math.sqrt(Math.max(0.1, 1 - (z / c.length) ** 2 - (0.025 / (c.girth * 0.9)) ** 2)) *
            (z < 0 ? 1 + (0.35 * z) / c.length : 1);
          if (c.pattern === 'cheek' && j > 0) continue;
          if (c.pattern === 'patches' && j % 3 === 1) continue;
          if (c.pattern === 'stripe') b.oval(c.mark, [x, 0.025, z], [0.006, 0.012, 0.035]);
          else if (c.pattern === 'cheek')
            b.oval(c.mark, [sign * c.girth * 0.91, 0.018, c.length * 0.35], [0.004, 0.025, 0.045]);
          else
            b.oval(
              c.mark,
              [x, c.pattern === 'patches' ? 0.045 : 0.025, z],
              [
                0.003,
                c.pattern === 'spots' ? 0.012 : c.pattern === 'patches' ? 0.055 : 0.045,
                c.pattern === 'patches' ? 0.055 : 0.016,
              ],
            );
        }
      }
      // Fin rays and paired pectoral fins are part of the shared body geometry.
      b.add(
        new THREE.ConeGeometry(1, 1, 4),
        c.back,
        [0, c.girth * 0.95, -0.03],
        [0.008, c.girth * 0.9, c.length * 0.25],
        [0, 0, -0.2],
      );
      for (let side of [-1, 1])
        for (let k = 0; k < 4; k++)
          b.bone(
            c.belly,
            [side * c.girth * 0.6, -0.045, 0.12],
            [side * (c.girth + 0.07 + k * 0.012), -0.08, -0.02 - k * 0.018],
            0.006,
            0.001,
          );
      b.bone('#6e7666', [-0.023, -0.016, c.length * 0.96], [0.023, -0.016, c.length * 0.96], 0.004);
    });
    define(
      id,
      'tail',
      77,
      (b) => {
        const points = [
          [0, 0],
          [-0.045, 0.045],
          [-0.2, 0.16],
          [-0.17, 0.045],
          [-0.12, 0],
          [-0.17, -0.045],
          [-0.2, -0.16],
          [-0.045, -0.045],
        ];
        const shape = new THREE.Shape();
        points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false });
        g.rotateY(-Math.PI / 2);
        g.scale(c.girth / 0.135, c.girth / 0.135, c.length / 0.48);
        b.add(g, c.back);
        for (let sign of [-1, 1])
          for (let k = 0; k < 4; k++)
            b.bone(
              c.belly,
              [0, 0, 0],
              [
                0,
                (sign * (0.04 + k * 0.035) * c.girth) / 0.135,
                ((-0.16 - k * 0.013) * c.length) / 0.48,
              ],
              0.003,
              0.001,
            );
      },
      [0, 0, -c.length * 0.83],
    );
  }
  function bird(id, c) {
    const s = c.size,
      scale = (v) => v.map((n) => n * s);
    define(id, 'body', 18, (b) => {
      b.oval(c.back, [0, 0, 0], scale(c.duck ? [0.18, 0.15, 0.34] : [0.105, 0.13, 0.23]));
      b.oval(
        c.belly,
        scale([0, -0.045, 0.07]),
        scale(c.duck ? [0.16, 0.11, 0.26] : [0.091, 0.092, 0.17]),
      );
      if (c.duck)
        for (let side of [-1, 1])
          for (let k = 0; k < 5; k++)
            b.oval(
              '#e5cba1',
              scale([side * 0.145, 0.05, -0.14 + k * 0.05]),
              scale([0.014, 0.045, 0.045]),
              [0.3, 0, 0],
            );
      for (let side of [-1, 1]) {
        b.bone(
          c.duck ? '#c78036' : '#71604b',
          scale([side * 0.04, -0.06, 0.03]),
          scale([side * 0.04, -0.18, 0.04]),
          0.008 * s,
        );
        for (let toe = -1; toe <= 1; toe++)
          b.bone(
            '#9b7846',
            scale([side * 0.04, -0.18, 0.04]),
            scale([side * 0.04 + toe * 0.022, -0.18, 0.1]),
            0.004 * s,
          );
      }
    });
    define(
      id,
      'head',
      18,
      (b) => {
        b.oval(c.head, [0, 0, 0], scale(c.duck ? [0.1, 0.14, 0.15] : [0.1, 0.105, 0.105]));
        if (c.cheek)
          for (let side of [-1, 1])
            b.oval(c.cheek, scale([side * 0.071, -0.025, 0.015]), scale([0.034, 0.065, 0.076]));
        if (c.throat) b.oval(c.throat, scale([0, -0.055, 0.065]), scale([0.065, 0.047, 0.04]));
        if (c.duck) {
          b.oval('#9b4d32', scale([0, -0.017, 0.17]), scale([0.057, 0.028, 0.095]));
          for (let side of [-1, 1])
            b.oval('#edd6a3', scale([side * 0.085, 0.045, 0.025]), scale([0.013, 0.017, 0.12]), [
              0,
              0,
              side * 0.25,
            ]);
        } else
          b.bone(
            '#41473b',
            scale([0, -0.005, 0.073]),
            scale([0, -0.014, c.longBeak ? 0.3 : 0.17]),
            0.027 * s,
            0.001,
          );
        for (let side of [-1, 1]) eye(b, side * 0.066 * s, 0.025 * s, 0.067 * s, 0.016 * s, c.ring);
        if (c.duck)
          for (let k = 0; k < 7; k++)
            b.oval(
              c.cheek,
              scale([0, 0.08 - k * 0.008, -0.07 - k * 0.014]),
              scale([0.068 - k * 0.005, 0.05, 0.11]),
              [-0.35, 0, 0],
            );
      },
      scale(c.duck ? [0, 0.16, 0.21] : [0, 0.1, 0.14]),
    );
    define(
      id,
      'wing',
      18,
      (b) => {
        b.oval(c.wing, scale([0.17, 0, -0.035]), scale([0.2, 0.032, 0.12]), [0, -0.18, 0]);
        for (let k = 0; k < 7; k++) {
          const length = (c.duck ? 0.18 : 0.26) - k * 0.015;
          b.oval(
            k % 2 ? c.wing : c.back,
            scale([0.2 + k * 0.032, 0, -0.09 + k * 0.028]),
            scale([length, 0.014, 0.025]),
            [0, 0.38 + k * 0.09, 0],
          );
          b.bone(
            c.belly,
            scale([0.14 + k * 0.02, 0.013, -0.07 + k * 0.023]),
            scale([0.3 + k * 0.017, 0.013, -0.13 + k * 0.03]),
            0.0015 * s,
          );
        }
        if (c.duck)
          b.oval('#c37e34', scale([0.16, 0.05, -0.12]), scale([0.1, 0.17, 0.035]), [0.4, 0, 0.2]);
      },
      [0, 0.025 * s, 0],
      2,
    );
    define(
      id,
      'tail',
      18,
      (b) => {
        for (let k = 0; k < 5; k++) {
          const length = c.longTail ? 0.27 : c.fork ? (k === 0 || k === 4 ? 0.26 : 0.12) : 0.14;
          b.oval(
            c.wing,
            scale([(k - 2) * 0.025, 0, -length * 0.55]),
            scale([0.018, 0.013, length]),
            [0, (k - 2) * 0.07, 0],
          );
        }
      },
      scale([0, -0.005, -0.18]),
    );
  }
  for (const [id, c] of Object.entries(WILDLIFE_MODELS)) {
    if (c.kind === 'mammal') mammal(id, c);
    else if (c.kind === 'turtle') turtle(id);
    else if (c.kind === 'fish') fish(id, c);
    else bird(id, c);
  }
  function posePart(entry, index, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    dummy.position.fromArray(position);
    dummy.rotation.set(...rotation);
    dummy.scale.fromArray(scale);
    dummy.updateMatrix();
    matrix.multiplyMatrices(parent, dummy.matrix);
    entry.mesh.setMatrixAt(index, matrix);
    entry.mesh.count = Math.max(entry.mesh.count, index + 1);
  }
  return {
    begin() {
      for (const parts of models.values()) for (const p of Object.values(parts)) p.mesh.count = 0;
    },
    draw(
      id,
      index,
      {
        x,
        y,
        z,
        heading = 0,
        time = 0,
        walking = false,
        alert = false,
        flying = false,
        graze = 0,
        season = 'autumn',
        size = 1,
        hop = 0,
      },
    ) {
      const c = WILDLIFE_MODELS[id],
        parts = models.get(id);
      dummy.position.set(x, y + hop, z);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      parent.copy(dummy.matrix);
      for (const [name, p] of Object.entries(parts)) {
        if (name === 'antlers' && !['autumn', 'winter'].includes(season)) continue;
        if (name === 'leg') {
          const leg = c.leg ? Math.max(c.leg, c.height - 0.12) : 0.13;
          for (let i = 0; i < 4; i++)
            posePart(
              p,
              index * 4 + i,
              [
                (i % 2 ? 1 : -1) * (c.width ?? 0.25) * 0.72,
                leg,
                (i < 2 ? 1 : -1) * (c.length ?? 0.4) * 0.56,
              ],
              [walking ? Math.sin(time * 5 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.28 : 0, 0, 0],
            );
        } else if (name === 'wing') {
          for (let side = 0; side < 2; side++)
            posePart(
              p,
              index * 2 + side,
              p.offset,
              [
                0,
                flying ? (side ? Math.PI : 0) : side ? Math.PI - 1.25 : 1.25,
                (side ? 1 : -1) * (flying ? Math.sin(time * 11) * 0.62 : 0.08),
              ],
              [flying ? 1 : 0.65, 1, flying ? 1 : 0.9],
            );
        } else {
          const offset = [...p.offset],
            rotation = [0, 0, 0];
          if (name === 'head' || name === 'antlers') {
            if (c.kind === 'mammal') {
              rotation[0] = alert ? -0.08 : graze * 0.7;
              offset[1] -= graze * 0.36;
              offset[2] += graze * 0.16;
            } else if (c.kind === 'bird') rotation[1] = Math.sin(time * 0.7) * 0.15;
          }
          if (name === 'tail')
            rotation[1] =
              Math.sin(time * (c.kind === 'fish' ? 8 : 1.8)) * (c.kind === 'fish' ? 0.28 : 0.13);
          posePart(p, index, offset, rotation);
        }
      }
    },
    end() {
      for (const parts of models.values())
        for (const p of Object.values(parts)) {
          p.mesh.visible = p.mesh.count > 0;
          if (p.mesh.count) p.mesh.instanceMatrix.needsUpdate = true;
        }
    },
    getStats() {
      let activeBatches = 0,
        triangles = 0;
      for (const parts of models.values())
        for (const { mesh } of Object.values(parts))
          if (mesh.count) {
            activeBatches++;
            triangles += (mesh.geometry.attributes.position.count / 3) * mesh.count;
          }
      return {
        allocatedBatches: [...models.values()].reduce((n, p) => n + Object.keys(p).length, 0),
        activeBatches,
        triangles,
      };
    },
    dispose() {
      for (const parts of models.values())
        for (const { mesh } of Object.values(parts)) {
          mesh.removeFromParent();
          mesh.dispose();
        }
      geometries.forEach((g) => g.dispose());
      material.dispose();
      fishMaterial.dispose();
    },
  };
}
