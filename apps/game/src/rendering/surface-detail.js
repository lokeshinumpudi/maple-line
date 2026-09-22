import * as THREE from 'three';
import {
  SURFACE_FAMILIES,
  createWetnessTracker,
  wetnessDarkenGlsl,
  wetnessRoughnessGlsl,
} from '../train/weather-materials.js';

// Packed, repeatable detail at three scales. No image downloads or extra render passes.
export function createSurfaceDetail() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    let n = Math.imul(x + 7919, 374761393) ^ Math.imul(y + 104729, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y, period) => {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const fx = x - ix,
      fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy);
    const h = (a, b) => hash((a + period) % period, (b + period) % period);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(h(ix, iy), h(ix + 1, iy), sx),
      THREE.MathUtils.lerp(h(ix, iy + 1), h(ix + 1, iy + 1), sx),
      sy,
    );
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = Math.round(255 * (noise(x / 4, y / 4, 64) * 0.7 + hash(x, y) * 0.3));
      data[i + 1] = Math.round(255 * noise(x / 16, y / 16, 16));
      data[i + 2] = Math.round(255 * noise(x / 64, y / 64, 4));
      data[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = 'Packed stone, grain and meadow detail';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  // Rain darkens within seconds; drying is several times slower. Shared by every applied kind.
  const tracker = createWetnessTracker({ wetTime: 7, dryTime: 40 });
  const wetness = tracker.uniform;
  const strength = { value: 1 };
  const kinds = { terrain: 0, stone: 1, roof: 2, timber: 3, plaster: 4, ballast: 5 };
  return {
    wetness,
    strength,
    texture,
    apply(material, kind = 'stone') {
      const old = material.onBeforeCompile;
      const oldKey = material.customProgramCacheKey();
      const mode = kinds[kind];
      if (mode === undefined) throw new TypeError(`Unknown surface ${kind}`);
      const family = SURFACE_FAMILIES[kind];
      material.onBeforeCompile = function (shader, renderer) {
        old.call(this, shader, renderer);
        shader.uniforms.surfaceDetail = { value: texture };
        shader.uniforms.surfaceWetness = wetness;
        shader.uniforms.surfaceDetailStrength = strength;
        shader.vertexShader =
          'varying vec3 vSurfacePosition;\n' +
          shader.vertexShader.replace(
            '#include <project_vertex>',
            `#include <project_vertex>
          vec4 surfacePosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          surfacePosition = instanceMatrix * surfacePosition;
          #endif
          vSurfacePosition = (modelMatrix * surfacePosition).xyz;`,
          );
        shader.fragmentShader =
          `uniform sampler2D surfaceDetail;
          uniform float surfaceDetailStrength;
          uniform float surfaceWetness; varying vec3 vSurfacePosition;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `
          #include <color_fragment>
          vec3 surfaceNormal = normalize(cross(dFdx(vSurfacePosition),dFdy(vSurfacePosition)));
          vec3 surfaceWeights = pow(abs(surfaceNormal),vec3(4.0));
          surfaceWeights /= max(dot(surfaceWeights,vec3(1.0)),0.001);
          vec3 surfaceP = vSurfacePosition * ${kind === 'ballast' ? '0.7' : '0.16'};
          vec3 detail = texture2D(surfaceDetail,surfaceP.yz).rgb * surfaceWeights.x
            + texture2D(surfaceDetail,surfaceP.xz).rgb * surfaceWeights.y
            + texture2D(surfaceDetail,surfaceP.xy).rgb * surfaceWeights.z;
          float surfaceHeight = detail.r;
          float detailShade = mix(0.79,1.12,detail.r) * mix(0.87,1.1,detail.g);
          ${
            kind === 'terrain'
              ? `
            float patches = texture2D(surfaceDetail,vSurfacePosition.xz * .007).b;
            detailShade *= mix(.74,1.14,patches);
            diffuseColor.rgb *= mix(vec3(1.0),mix(vec3(.82,.87,.65),vec3(1.06,1.02,.88),patches),surfaceDetailStrength);
          `
              : ''
          }
          ${
            kind === 'roof'
              ? `
            vec2 tiles = vSurfacePosition.xz * vec2(2.0,2.8);
            tiles.x += mod(floor(tiles.y),2.0)*.5;
            vec2 edge = min(fract(tiles),1.0-fract(tiles));
            vec2 aa = max(fwidth(tiles),vec2(.008));
            float seams = smoothstep(.025-aa.x,.025+aa.x,edge.x)*smoothstep(.05-aa.y,.05+aa.y,edge.y);
            float tileFade = 1.0-smoothstep(.3,1.2,max(aa.x,aa.y));
            detailShade *= mix(1.0,mix(.56,1.08,seams),tileFade);
            surfaceHeight *= mix(1.0,seams,tileFade);
          `
              : ''
          }
          ${
            kind === 'timber'
              ? `
            float grain = texture2D(surfaceDetail,vec2(vSurfacePosition.x+vSurfacePosition.z,vSurfacePosition.y*.07)*1.8).r;
            float board = vSurfacePosition.y * 5.0;
            float boardEdge = min(fract(board),1.0-fract(board));
            float boardAA = max(fwidth(board),.008);
            float boardSeam = smoothstep(.035-boardAA,.035+boardAA,boardEdge);
            detailShade *= mix(.67,1.12,grain) * mix(1.0,mix(.68,1.0,boardSeam),1.0-smoothstep(.3,1.0,boardAA));
            surfaceHeight = grain * .3 + boardSeam * .7;
          `
              : ''
          }
          ${
            kind === 'plaster'
              ? `
            vec2 wallUV = mix(vSurfacePosition.xy, vSurfacePosition.zy, surfaceWeights.x);
            vec2 panels = wallUV * vec2(.42, .5);
            vec2 panelEdge = min(fract(panels), 1.0 - fract(panels));
            vec2 panelAA = max(fwidth(panels), vec2(.002));
            float panelSeam = smoothstep(.007-panelAA.x,.007+panelAA.x,panelEdge.x)
              * smoothstep(.009-panelAA.y,.009+panelAA.y,panelEdge.y);
            float panelFade = 1.0-smoothstep(.12,.6,max(panelAA.x,panelAA.y));
            float stain = texture2D(surfaceDetail, wallUV * vec2(.045,.16)).g;
            surfaceHeight = detail.r * .22 + mix(1.0,panelSeam,panelFade) * .78;
            detailShade = mix(.88,1.08,detail.r) * mix(.87,1.04,stain)
              * mix(1.0,mix(.72,1.0,panelSeam),panelFade);
          `
              : ''
          }
          diffuseColor.rgb *= mix(1.0,detailShade,surfaceDetailStrength);
          ${wetnessDarkenGlsl(family, { weight: 'surfaceWeights.y' })}
        `,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `
          #include <roughnessmap_fragment>
          float wetPatch = surfaceWeights.y * smoothstep(.3,.7,detail.g);
          ${wetnessRoughnessGlsl(family, { weight: 'wetPatch' })}
        `,
        );
        if (['timber', 'plaster', 'stone', 'roof'].includes(kind)) {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            // Screen derivatives express relief in world metres, independent of UV scale.
            vec3 reliefX = dFdx(-vViewPosition), reliefY = dFdy(-vViewPosition);
            vec3 reliefR1 = cross(reliefY, normal), reliefR2 = cross(normal, reliefX);
            float reliefDet = dot(reliefX, reliefR1) * faceDirection;
            vec2 reliefSlope = vec2(dFdx(surfaceHeight), dFdy(surfaceHeight))
              * ${kind === 'stone' ? '0.055' : '0.018'} * surfaceDetailStrength;
            vec3 reliefGradient = sign(reliefDet) * (reliefSlope.x * reliefR1 + reliefSlope.y * reliefR2);
            normal = normalize(max(abs(reliefDet), .000001) * normal - reliefGradient);`,
          );
        }
        material.userData.surfaceKind = kind;
      };
      material.customProgramCacheKey = () => `${oldKey}:surface-v3:${mode}`;
      material.needsUpdate = true;
      return material;
    },
    update(dt, weather) {
      tracker.advance(dt, weather);
    },
    dispose() {
      texture.dispose();
    },
  };
}

// Average coincident terrain normals without changing topology or terrain heights.
export function smoothTerrainNormals(geometry) {
  geometry.computeVertexNormals();
  const positions = geometry.attributes.position,
    normals = geometry.attributes.normal;
  const groups = new Map();
  const key = (i) =>
    `${Math.round(positions.getX(i) * 1000)},${Math.round(positions.getY(i) * 1000)},${Math.round(positions.getZ(i) * 1000)}`;
  for (let i = 0; i < positions.count; i++) {
    const k = key(i),
      n = groups.get(k) ?? new THREE.Vector3();
    n.add(new THREE.Vector3().fromBufferAttribute(normals, i));
    groups.set(k, n);
  }
  for (const n of groups.values()) n.normalize();
  for (let i = 0; i < positions.count; i++) {
    const n = groups.get(key(i));
    normals.setXYZ(i, n.x, n.y, n.z);
  }
  normals.needsUpdate = true;
  return geometry;
}
