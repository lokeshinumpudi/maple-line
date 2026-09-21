import { ATMOSPHERE_PROFILES, DUSK_COLORS } from '../rendering/atmosphere-palette.js';

/** Weather and sky for Maple Line. No assets or extra draw calls per particle. */
export function createAtmosphere({ THREE, scene, camera, renderer, sun, hemi, waterMat }) {
  let mode = 'clear';
  let isDusk = false;
  let elapsed = 0;
  const profile = ATMOSPHERE_PROFILES;
  if (!scene.fog || !('density' in scene.fog))
    scene.fog = new THREE.FogExp2(profile.clear.fog, profile.clear.density);
  const skyUniforms = {
    zenith: { value: new THREE.Color(profile.clear.sky) },
    horizon: { value: new THREE.Color(profile.clear.horizon) },
    cloudColor: { value: new THREE.Color('#fff5db') },
    sunDirection: { value: new THREE.Vector3(-90, 160, -65).normalize() },
    time: { value: 0 },
    storm: { value: 0 },
    night: { value: 0 },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 cloudColor;
      uniform float time; uniform float storm; uniform float night;uniform vec3 sunDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.55+noise(p*2.03+8.1)*.28+noise(p*4.1)*.17;}
      void main(){
        vec3 d=normalize(vDirection);float elevation=max(d.y,0.);
        vec3 c=mix(horizon,zenith,pow(elevation,.42));
        vec2 uv=d.xz/(max(d.y,.08)+.32)*2.8+vec2(time*.004,time*.001);
        float wisps=fbm(uv*1.35);float clouds=smoothstep(.46-storm*.13,.76-storm*.12,wisps);
        clouds*=smoothstep(-.01,.22,d.y);
        c=mix(c,cloudColor,clouds*(.72+storm*.25));
        // Hazy distant ridges sit behind the actual valley geometry.
        float angle=atan(d.x,d.z);float ridge=.036+.06*fbm(vec2(angle*3.,2.))+ .035*fbm(vec2(angle*7.,4.));
        float distant=1.-smoothstep(ridge-.008,ridge+.008,d.y);
        float nearRidge=.015+.055*fbm(vec2(angle*4.7,8.));float nearer=1.-smoothstep(nearRidge-.006,nearRidge+.006,d.y);
        c=mix(c,mix(horizon,zenith,.28),distant*.42);
        c=mix(c,mix(horizon,zenith,.48),nearer*.36);
        vec3 sunDir=normalize(sunDirection);float disc=dot(d,sunDir);
        c+=vec3(1.,.76,.43)*pow(max(disc,0.),12.)*.19*(1.-storm)*(1.-night*.8);
        c+=vec3(1.,.91,.71)*smoothstep(.9983,.9993,disc)*.62*(1.-storm)*(1.-night);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 18), skyMaterial);
  sky.name = 'Atmosphere · painted sky and distant ridges';
  sun.name = 'Sun · weather directional light';
  hemi.name = 'Sky and ground bounce light';
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // Long, faint rain lines read as rain at train speed without covering the view.
  const rainCount = 1900,
    snowCount = 1900;
  const volume = { x: 130, y: 80, z: 150 };
  let seed = 27531;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rainPosition = new Float32Array(rainCount * 6);
  const snowPosition = new Float32Array(snowCount * 3);
  const snowSizes = new Float32Array(snowCount);
  for (let i = 0; i < rainCount; i++) {
    const j = i * 6;
    rainPosition[j] = (random() - 0.5) * volume.x;
    rainPosition[j + 1] = (random() - 0.5) * volume.y;
    rainPosition[j + 2] = (random() - 0.5) * volume.z;
    rainPosition[j + 3] = rainPosition[j] + 0.35;
    rainPosition[j + 4] = rainPosition[j + 1] - 2.3;
    rainPosition[j + 5] = rainPosition[j + 2] - 0.12;
  }
  for (let i = 0; i < snowCount; i++) {
    snowPosition[i * 3] = (random() - 0.5) * volume.x;
    snowPosition[i * 3 + 1] = (random() - 0.5) * volume.y;
    snowPosition[i * 3 + 2] = (random() - 0.5) * volume.z;
    snowSizes[i] = 1.7 + random() * 2.4;
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(rainPosition, 3).setUsage(THREE.DynamicDrawUsage),
  );
  const rainMaterial = new THREE.LineBasicMaterial({
    color: '#c9e0e6',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.name = 'Weather · wind-driven rain';
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(snowPosition, 3).setUsage(THREE.DynamicDrawUsage),
  );
  snowGeometry.setAttribute('flakeSize', new THREE.BufferAttribute(snowSizes, 1));
  const snowMaterial = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 }, pixelRatio: { value: renderer.getPixelRatio() } },
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float flakeSize;uniform float pixelRatio;varying float distanceFade;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(flakeSize*pixelRatio*24./max(-p.z,8.),1.2,6.);distanceFade=smoothstep(2.,8.,-p.z);}`,
    fragmentShader: `uniform float opacity;varying float distanceFade;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.17,.5,d))*opacity*distanceFade; if(a<.015)discard;gl_FragColor=vec4(.91,.96,1.,a);}`,
  });
  const snow = new THREE.Points(snowGeometry, snowMaterial);
  snow.name = 'Weather · drifting snow';
  snow.frustumCulled = false;
  snow.visible = false;
  scene.add(snow);
  const previousCamera = camera.position.clone();
  const cameraDelta = new THREE.Vector3();
  const waterTarget = new THREE.Color(),
    groundTarget = new THREE.Color(),
    fogTarget = new THREE.Color(),
    sunTarget = new THREE.Color(),
    zenithTarget = new THREE.Color(),
    horizonTarget = new THREE.Color(),
    cloudTarget = new THREE.Color();
  const duskFog = new THREE.Color(DUSK_COLORS.fog),
    duskSky = new THREE.Color(DUSK_COLORS.sky),
    duskHorizon = new THREE.Color(DUSK_COLORS.horizon);
  const duskSun = new THREE.Color(DUSK_COLORS.sun),
    duskCloud = new THREE.Color(DUSK_COLORS.cloud);
  let rainAmount = 0,
    snowAmount = 0;

  function wrap(value, size) {
    return ((((value + size * 0.5) % size) + size) % size) - size * 0.5;
  }
  function update(dt, position = camera.position) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    elapsed += dt;
    const blend = 1 - Math.exp(-dt * 1.8),
      config = profile[mode];
    rainAmount = THREE.MathUtils.lerp(rainAmount, mode === 'rain' ? 1 : 0, blend);
    snowAmount = THREE.MathUtils.lerp(snowAmount, mode === 'snow' ? 1 : 0, blend);
    const night = isDusk ? 1 : 0;
    fogTarget.set(config.fog).lerp(duskFog, night * 0.65);
    zenithTarget.set(config.sky).lerp(duskSky, night * 0.8);
    horizonTarget.set(config.horizon).lerp(duskHorizon, night * 0.7);
    cloudTarget.set(mode === 'rain' ? '#a2b3b9' : '#fff3db').lerp(duskCloud, night * 0.8);
    sunTarget.set(config.sun).lerp(duskSun, night * 0.8);
    scene.fog.color.lerp(fogTarget, blend);
    scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, config.density, blend);
    scene.background.copy(scene.fog.color);
    scene.environmentIntensity = THREE.MathUtils.lerp(
      scene.environmentIntensity,
      (mode === 'clear' ? 0.35 : 0.18) * (isDusk ? 0.45 : 1),
      blend,
    );
    sun.color.lerp(sunTarget, blend);
    sun.intensity = THREE.MathUtils.lerp(
      sun.intensity,
      config.sunPower * (isDusk ? 0.28 : 1),
      blend,
    );
    hemi.color.lerp(zenithTarget, blend);
    hemi.groundColor.lerp(groundTarget.set(config.ground), blend);
    hemi.intensity = THREE.MathUtils.lerp(
      hemi.intensity,
      config.ambient * (isDusk ? 0.76 : 1),
      blend,
    );
    renderer.toneMappingExposure = THREE.MathUtils.lerp(
      renderer.toneMappingExposure,
      config.exposure,
      blend,
    );
    sky.position.copy(camera.position);
    skyUniforms.time.value = elapsed;
    skyUniforms.sunDirection.value.copy(sun.position).sub(sun.target.position).normalize();
    skyUniforms.zenith.value.lerp(zenithTarget, blend);
    skyUniforms.horizon.value.lerp(horizonTarget, blend);
    skyUniforms.cloudColor.value.lerp(cloudTarget, blend);
    skyUniforms.storm.value = THREE.MathUtils.lerp(
      skyUniforms.storm.value,
      mode === 'rain' ? 1 : mode === 'snow' ? 0.45 : 0,
      blend,
    );
    skyUniforms.night.value = THREE.MathUtils.lerp(skyUniforms.night.value, night, blend);
    cameraDelta.copy(position).sub(previousCamera);
    previousCamera.copy(position);
    rain.position.copy(position);
    snow.position.copy(position);
    rain.visible = rainAmount > 0.005;
    rainMaterial.opacity = rainAmount * (isDusk ? 0.21 : 0.29);
    snow.visible = snowAmount > 0.005;
    snowMaterial.uniforms.opacity.value = snowAmount * 0.88;
    if (rain.visible) {
      for (let i = 0; i < rainCount; i++) {
        const j = i * 6;
        rainPosition[j] = wrap(rainPosition[j] - cameraDelta.x + dt * 3.4, volume.x);
        rainPosition[j + 1] = wrap(rainPosition[j + 1] - cameraDelta.y - dt * 43, volume.y);
        rainPosition[j + 2] = wrap(rainPosition[j + 2] - cameraDelta.z - dt * 1.7, volume.z);
        rainPosition[j + 3] = rainPosition[j] - 0.22;
        rainPosition[j + 4] = rainPosition[j + 1] + 2.7;
        rainPosition[j + 5] = rainPosition[j + 2] + 0.1;
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
    if (snow.visible) {
      for (let i = 0; i < snowCount; i++) {
        const j = i * 3;
        snowPosition[j] = wrap(
          snowPosition[j] - cameraDelta.x + dt * (1.1 + Math.sin(elapsed * 0.8 + i * 0.7) * 0.8),
          volume.x,
        );
        snowPosition[j + 1] = wrap(
          snowPosition[j + 1] - cameraDelta.y - dt * (1.5 + snowSizes[i] * 0.45),
          volume.y,
        );
        snowPosition[j + 2] = wrap(
          snowPosition[j + 2] - cameraDelta.z + dt * Math.cos(elapsed * 0.6 + i * 0.2) * 0.5,
          volume.z,
        );
      }
      snowGeometry.attributes.position.needsUpdate = true;
    }
    if (waterMat?.uniforms) {
      const uniforms = waterMat.uniforms;
      if (uniforms.dusk)
        uniforms.dusk.value = THREE.MathUtils.lerp(uniforms.dusk.value, night, blend);
      if (uniforms.rainStrength) uniforms.rainStrength.value = rainAmount;
      if (uniforms.sunDirection) uniforms.sunDirection.value.copy(skyUniforms.sunDirection.value);
      if (uniforms.sunColor)
        uniforms.sunColor.value
          .copy(sun.color)
          .multiplyScalar(isDusk ? 0.35 : mode === 'rain' ? 0.35 : 1);
      if (uniforms.waterColor)
        uniforms.waterColor.value.lerp(
          waterTarget.set(mode === 'snow' ? '#244f5b' : mode === 'rain' ? '#254c51' : '#1b6156'),
          blend,
        );
    }
  }
  return {
    setWeather(value) {
      if (!(value in profile)) throw new Error(`Unknown weather: ${value}`);
      mode = value;
    },
    setDusk(value) {
      isDusk = Boolean(value);
    },
    update,
    get weather() {
      return mode;
    },
    get dusk() {
      return isDusk;
    },
    dispose() {
      for (const object of [sky, rain, snow]) {
        scene.remove(object);
        object.geometry.dispose();
        object.material.dispose();
      }
    },
  };
}
