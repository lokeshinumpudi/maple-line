/** Reversible rendering inspections, separate from saved level authoring. */
export function createEmbedVisuals({
  THREE,
  scene,
  camera,
  renderer,
  train,
  riverWater,
  center,
  riverProfile,
  railPoint,
  terrain,
  station,
  wind,
  surfaceDetail,
  forestSource,
  // Optional embed cast (stage.js createEmbedCast) for `focus: 'cast'`.
  cast = null,
}) {
  const wire = new THREE.MeshBasicMaterial({ color: '#24483e', wireframe: true });
  const clay = new THREE.MeshStandardMaterial({ color: '#858b90', roughness: 0.9, metalness: 0 });
  const normals = new THREE.MeshNormalMaterial();
  // Opaque train materials and their own roughness. Collected again on each change, because
  // the Blender train model replaces the procedural body after it loads.
  const surfaces = new Map();
  function collectSurfaces() {
    for (const carriage of train)
      carriage.traverse((object) => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials)
          if (material?.isMeshStandardMaterial && !material.transparent && !surfaces.has(material))
            surfaces.set(material, material.roughness);
      });
  }
  collectSurfaces();
  const inTrain = (object) => {
    for (let parent = object; parent; parent = parent.parent)
      if (train.includes(parent)) return true;
    return false;
  };
  const hidden = new Map();

  const settings = {
    windStrength: null,
    textureDetail: true,
    sceneryDistance: 720,
    focus: 'route',
    surface: 'materials',
    isolation: 'all',
    wireframe: false,
    shadows: true,
    fov: null,
    exposure: null,
    roughness: null,
    fogDensity: null,
    waterReflection: 1,
    waterRipples: 1,
    waterDepth: 1,
    waterFoam: 1,
    waterSpeed: 1,
    subject: 'meera',
    clip: 'idle',
    skeleton: false,
    motionLayers: true,
    pose: 'clip',
  };
  const waterUniforms = riverWater.material.uniforms;
  for (const name of ['Reflection', 'Ripples', 'Depth', 'Foam'])
    waterUniforms[`embed${name}`] = { value: 1 };
  // Extend this river's existing shader. Defaults preserve its original appearance.
  riverWater.material.fragmentShader =
    'uniform float embedReflection; uniform float embedRipples; uniform float embedDepth; uniform float embedFoam;\n' +
    riverWater.material.fragmentShader
      .replace(
        'vec3(ripples.x,noise.z,ripples.y)',
        'vec3(ripples.x*embedRipples,noise.z,ripples.y*embedRipples)',
      )
      .replace('float reflectionWeight=clamp(', 'float reflectionWeight=embedReflection*clamp(')
      .replace('exp(-opticalDepth*vec3(', 'exp(-opticalDepth*embedDepth*vec3(')
      .replace('albedo+=foam*vec3(', 'albedo+=embedFoam*foam*vec3(');
  riverWater.material.needsUpdate = true;
  let waterTime = waterUniforms.time.value;
  const treeMatrix = new THREE.Matrix4();
  const forestTarget = new THREE.Vector3();
  let nearestTree = Infinity;
  for (let i = 0; i < forestSource.count; i++) {
    forestSource.getMatrixAt(i, treeMatrix);
    const position = new THREE.Vector3().setFromMatrixPosition(treeMatrix);
    const score = (position.x - center(-380) - 65) ** 2 + (position.z + 380) ** 2;
    if (score < nearestTree) {
      nearestTree = score;
      forestTarget.copy(position).add(new THREE.Vector3(0, treeMatrix.elements[5] * 0.5 + 1, 0));
    }
  }
  function restoreVisibility() {
    for (const [object, visible] of hidden) object.visible = visible;
    hidden.clear();
  }
  function isSubject(object) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const name = `${object.name} ${materials.map((m) => m?.name || '').join(' ')}`.toLowerCase();
    if (settings.focus === 'train') return inTrain(object);
    if (settings.focus === 'cast') return Boolean(cast?.contains(object));
    if (settings.focus === 'water')
      return object === riverWater.mesh || /river|terrain-valley/.test(name);
    if (settings.focus === 'terrain') return /terrain/.test(name);
    if (settings.focus === 'bridge')
      return inTrain(object) || /bridge|terrain|ballast|rail hardware/.test(name);
    if (settings.focus === 'forest') return /tree|foliage|trunk|leaf|terrain/.test(name);
    if (settings.focus === 'station') {
      for (let parent = object; parent; parent = parent.parent) if (parent === station) return true;
      return inTrain(object);
    }
    return true;
  }
  return {
    configure(config) {
      restoreVisibility();
      if (Object.hasOwn(config, 'textureDetail'))
        surfaceDetail.strength.value = config.textureDetail ? 1 : 0;
      if (Object.hasOwn(config, 'windStrength')) wind.setStrength(config.windStrength);
      for (const key of Object.keys(settings))
        if (Object.hasOwn(config, key)) settings[key] = config[key];
      if (Object.hasOwn(config, 'wireframe') && !Object.hasOwn(config, 'surface'))
        settings.surface = config.wireframe ? 'wireframe' : 'materials';
      settings.wireframe = settings.surface === 'wireframe';
      renderer.shadowMap.enabled = settings.shadows;
      cast?.configure({
        active: settings.focus === 'cast',
        subject: settings.subject,
        clip: settings.clip,
        skeleton: settings.skeleton,
        motionLayers: settings.motionLayers,
        pose: settings.pose,
      });
      collectSurfaces();
      for (const [material, roughness] of surfaces)
        material.roughness = settings.roughness ?? roughness;
    },
    sceneryDistance: () => settings.sceneryDistance ?? 720,
    focus: () => settings.focus,
    focusPose() {
      const focus = settings.focus;
      if (focus === 'route') return null;
      if (focus === 'cast') return cast?.focusPose() ?? null;
      let target,
        offset,
        minDistance = 3,
        maxDistance = 600;
      if (focus === 'water') {
        const z = -460,
          river = riverProfile(z);
        target = new THREE.Vector3(center(z) + river.offset, -0.4, z);
        offset = new THREE.Vector3(22, 13, 28);
      } else if (focus === 'bridge' || focus === 'terrain') {
        target = railPoint(6250).clone();
        target.y -= 20;
        offset = new THREE.Vector3(170, 95, 35);
        maxDistance = 900;
      } else if (focus === 'forest') {
        target = forestTarget.clone();
        offset = new THREE.Vector3(-18, 9, 16);
        const eye = target.clone().add(offset);
        offset.y += Math.max(0, terrain(eye.x - center(eye.z), eye.z) + 3 - eye.y);
      } else if (focus === 'station') {
        target = station.position.clone().add(new THREE.Vector3(0, 3, 0));
        offset = new THREE.Vector3(-18, 12, 24);
      } else {
        target = train[Math.floor(train.length / 2)].position
          .clone()
          .add(new THREE.Vector3(0, 2, 0));
        offset = new THREE.Vector3(30, 16, 38);
        maxDistance = 180;
      }
      return {
        key: focus,
        target: target.toArray(),
        eye: target.clone().add(offset).toArray(),
        minDistance,
        maxDistance,
      };
    },
    apply(dt = 0) {
      const surface = { clay, wireframe: wire, normals }[settings.surface] ?? null;
      // A cast subject takes the surface on its own meshes (see stage.js setSurface).
      scene.overrideMaterial = settings.focus === 'cast' ? null : surface;
      cast?.setSurface(settings.focus === 'cast' ? surface : null);
      if (settings.fov !== null && camera.fov !== settings.fov) {
        camera.fov = settings.fov;
        camera.updateProjectionMatrix();
      }
      if (settings.exposure !== null) renderer.toneMappingExposure = settings.exposure;
      if (settings.fogDensity !== null && scene.fog) scene.fog.density = settings.fogDensity;
      if (settings.roughness !== null)
        for (const material of surfaces.keys()) material.roughness = settings.roughness;
      for (const name of ['Reflection', 'Ripples', 'Depth', 'Foam'])
        waterUniforms[`embed${name}`].value = settings[`water${name}`] ?? 1;
      if (settings.focus === 'water') {
        waterTime += Math.min(dt, 0.05) * (settings.waterSpeed ?? 1);
        waterUniforms.time.value = waterTime;
      }
      // A lit override on a line (no normals) draws NaN, which the film pass spreads over
      // the whole frame, so clay and direction views hide lines.
      const litOverride = scene.overrideMaterial === clay || scene.overrideMaterial === normals;
      if (settings.isolation !== 'all' || litOverride)
        scene.traverse((object) => {
          // An LOD shows one of its levels itself every frame, so hide the LOD instead.
          const drawn = object.isMesh || object.isPoints || object.isSprite || object.isLine;
          if (!drawn && !object.isLOD) return;
          if (object.parent?.isLOD) return;
          const subject =
            (!object.isLine || !litOverride) &&
            (settings.isolation === 'all' ||
              (object.isLOD
                ? isSubject(object) || object.levels.some((level) => isSubject(level.object))
                : isSubject(object)));
          if (!subject) {
            if (!hidden.has(object)) hidden.set(object, object.visible);
            object.visible = false;
          }
        });
    },
    snapshot: () => ({
      ...settings,
      hiddenObjects: hidden.size,
      cast: cast?.snapshot() ?? null,
      applied: {
        surfaceDetailStrength: surfaceDetail.strength.value,
        windStrength: wind.getState().strength,
        waterReflection: waterUniforms.embedReflection.value,
        waterRipples: waterUniforms.embedRipples.value,
        waterDepth: waterUniforms.embedDepth.value,
        waterFoam: waterUniforms.embedFoam.value,
      },
    }),
    dispose() {
      restoreVisibility();
      cast?.dispose();
      wire.dispose();
      clay.dispose();
      normals.dispose();
    },
  };
}
