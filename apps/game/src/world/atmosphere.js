import { SUN_PHASES } from '../rendering/sun-phases.js';
import {
  ATMOSPHERE_PROFILES,
  DUSK_COLORS,
  HEIGHT_FOG,
  STORM_PROFILE,
} from '../rendering/atmosphere-palette.js';
import { updateHeightFog } from '../rendering/height-fog.js';
import { createWeatherState } from './weather-state.js';
import { createRainStreaks } from './rain-streaks.js';

/**
 * Weather and sky for Maple Line: painted sky, fog and haze, GPU rain, snow, storms and
 * lightning. Time only advances through update(dt); nothing reads a wall clock.
 *
 * Options: quality ({ rainStreaks }), fxLayer (a camera layer the water mirror skips),
 * groundHeight(z) for the valley-floor mist, onStrike(strike) when lightning starts.
 */
export function createAtmosphere({
  THREE,
  scene,
  camera,
  renderer,
  sun,
  hemi,
  waterMat,
  quality = { rainStreaks: 4200 },
  fxLayer = 0,
  groundHeight = () => 0,
  onStrike = null,
}) {
  let mode = 'clear';
  let storm = false;
  let isDusk = false;
  let sunPhase = 'daylight';
  let elapsed = 0;
  const profile = ATMOSPHERE_PROFILES;
  const weatherState = createWeatherState({ weather: 'clear' });
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
    flash: { value: 0 },
    flashBearing: { value: 0 },
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
      uniform float flash; uniform float flashBearing;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.55+noise(p*2.03+8.1)*.28+noise(p*4.1)*.17;}
      void main(){
        vec3 d=normalize(vDirection);float elevation=max(d.y,0.);
        vec3 c=mix(horizon,zenith,pow(elevation,.42));
        vec2 uv=d.xz/(max(d.y,.08)+.32)*2.8+vec2(time*.004,time*.001)*(1.+storm*2.5);
        float wisps=fbm(uv*1.35);float clouds=smoothstep(.46-storm*.2,.76-storm*.18,wisps);
        clouds*=smoothstep(-.01,.22,d.y);
        clouds *= mix(.65,1.,min(storm,1.));
        // Storm decks are heavier and darker underneath.
        float underside=storm*smoothstep(.35,.9,fbm(uv*.7+3.));
        c=mix(c,cloudColor*(1.-underside*.35),clouds*(.72+min(storm,1.)*.25));
        // Hazy distant ridges sit behind the actual valley geometry.
        float angle=atan(d.x,d.z);float ridge=.036+.06*fbm(vec2(angle*3.,2.))+ .035*fbm(vec2(angle*7.,4.));
        float distant=1.-smoothstep(ridge-.008,ridge+.008,d.y);
        float nearRidge=.015+.055*fbm(vec2(angle*4.7,8.));float nearer=1.-smoothstep(nearRidge-.006,nearRidge+.006,d.y);
        c=mix(c,mix(horizon,zenith,.28),distant*.42);
        c=mix(c,mix(horizon,zenith,.48),nearer*.36);
        vec3 sunDir=normalize(sunDirection);float disc=dot(d,sunDir);
        float open=1.-min(storm,1.);
        c+=vec3(1.,.76,.43)*pow(max(disc,0.),12.)*.19*open*(1.-night*.8);
        c+=vec3(1.,.91,.71)*smoothstep(.9983,.9993,disc)*.62*open*(1.-night)*(1.-clouds*.9);
        // Lightning lights the cloud deck, brightest around the strike's bearing.
        float toward=.5+.5*cos(angle-flashBearing);
        c+=vec3(.82,.88,1.)*flash*(.25+clouds*1.1)*(.35+.65*pow(toward,3.))*(1.-distant*.6);
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

  const rain = createRainStreaks({ THREE, count: 9000, layer: fxLayer });
  rain.setCount(quality.rainStreaks);
  scene.add(rain.mesh);
  const snowCount = 1900;
  const volume = { x: 130, y: 80, z: 150 };
  let seed = 27531;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const snowPosition = new Float32Array(snowCount * 3);
  const snowSizes = new Float32Array(snowCount);
  for (let i = 0; i < snowCount; i++) {
    snowPosition[i * 3] = (random() - 0.5) * volume.x;
    snowPosition[i * 3 + 1] = (random() - 0.5) * volume.y;
    snowPosition[i * 3 + 2] = (random() - 0.5) * volume.z;
    snowSizes[i] = 1.7 + random() * 2.4;
  }
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
  if (fxLayer) snow.layers.set(fxLayer);
  scene.add(snow);
  const previousCamera = camera.position.clone();
  const cameraDelta = new THREE.Vector3();
  const waterTarget = new THREE.Color(),
    groundTarget = new THREE.Color(),
    fogTarget = new THREE.Color(),
    sunTarget = new THREE.Color(),
    zenithTarget = new THREE.Color(),
    horizonTarget = new THREE.Color(),
    cloudTarget = new THREE.Color(),
    scratch = new THREE.Color();
  const duskFog = new THREE.Color(DUSK_COLORS.fog),
    duskSky = new THREE.Color(DUSK_COLORS.sky),
    duskHorizon = new THREE.Color(DUSK_COLORS.horizon);
  const duskSun = new THREE.Color(DUSK_COLORS.sun),
    duskCloud = new THREE.Color(DUSK_COLORS.cloud);
  const warmFog = new THREE.Color('#dcb896'),
    warmHorizon = new THREE.Color('#ffba80'),
    warmCloud = new THREE.Color('#f9c2a1'),
    warmSun = new THREE.Color('#ffb568');
  const stormColors = {
    fog: new THREE.Color(STORM_PROFILE.fog),
    sky: new THREE.Color(STORM_PROFILE.sky),
    horizon: new THREE.Color(STORM_PROFILE.horizon),
    cloud: new THREE.Color(STORM_PROFILE.cloud),
    sun: new THREE.Color(STORM_PROFILE.sun),
    ground: new THREE.Color(STORM_PROFILE.ground),
  };
  const flashColor = new THREE.Color('#dfe8ff');
  const rainTint = new THREE.Color();
  // Lighting targets are kept separately so a lightning flash never feeds back into them.
  const base = {
    sunColor: sun.color.clone(),
    sunIntensity: sun.intensity,
    hemiIntensity: hemi.intensity,
    fogColor: scene.fog.color.clone(),
  };
  const fogHeight = { density: 0, falloff: 0.045, haze: 0.5, scatter: 0.5, base: 0 };
  const sunDirection = new THREE.Vector3();
  let latest = weatherState.getState();

  function wrap(value, size) {
    return ((((value + size * 0.5) % size) + size) % size) - size * 0.5;
  }
  function update(dt, position = camera.position) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    elapsed += dt;
    const blend = 1 - Math.exp(-dt * 1.8),
      config = profile[mode];
    weatherState.set(mode, storm);
    for (const strike of weatherState.advance(dt)) onStrike?.(strike);
    latest = weatherState.getState();
    const { rain: rainAmount, snow: snowAmount, stormAmount, flash } = latest;
    const night = isDusk ? 1 : 0;
    const phase = SUN_PHASES[sunPhase];
    const warmth = phase.warmth * (mode === 'clear' ? 1 : 0.25);
    fogTarget.set(config.fog).lerp(duskFog, night * 0.65);
    zenithTarget.set(config.sky).lerp(duskSky, night * 0.8);
    horizonTarget.set(config.horizon).lerp(duskHorizon, night * 0.7);
    cloudTarget.set(mode === 'rain' ? '#a2b3b9' : '#fff3db').lerp(duskCloud, night * 0.8);
    sunTarget.set(config.sun).lerp(duskSun, night * 0.8);
    fogTarget.lerp(warmFog, warmth * 0.42);
    horizonTarget.lerp(warmHorizon, warmth * 0.75);
    cloudTarget.lerp(warmCloud, warmth * 0.8);
    sunTarget.lerp(warmSun, warmth * 0.85);
    // Rain at night: no moon or sun behind the cloud, so the sky and fog go dark blue-grey.
    const wetNight = night * rainAmount;
    fogTarget.lerp(scratch.set('#394550'), wetNight * 0.75);
    horizonTarget.lerp(scratch.set('#3a4652'), wetNight * 0.85);
    zenithTarget.lerp(scratch.set('#1d2631'), wetNight * 0.8);
    cloudTarget.lerp(scratch.set('#343e48'), wetNight * 0.85);
    // Storm: darker, lower cloud and heavier fog, still tinted by the time of day.
    const darkNight = 1 - night * 0.45;
    fogTarget.lerp(scratch.copy(stormColors.fog).multiplyScalar(darkNight), stormAmount * 0.85);
    zenithTarget.lerp(scratch.copy(stormColors.sky).multiplyScalar(darkNight), stormAmount * 0.85);
    horizonTarget.lerp(
      scratch.copy(stormColors.horizon).multiplyScalar(darkNight),
      stormAmount * 0.8,
    );
    cloudTarget.lerp(scratch.copy(stormColors.cloud).multiplyScalar(darkNight), stormAmount * 0.9);
    sunTarget.lerp(stormColors.sun, stormAmount * 0.7);
    const lerp = THREE.MathUtils.lerp;
    const density = lerp(config.density, STORM_PROFILE.density, stormAmount);
    const sunPower = lerp(config.sunPower, STORM_PROFILE.sunPower, stormAmount) * phase.power;
    const ambient = lerp(config.ambient, STORM_PROFILE.ambient, stormAmount) * (isDusk ? 0.76 : 1);
    const exposure = lerp(config.exposure, STORM_PROFILE.exposure, stormAmount);
    base.fogColor.lerp(fogTarget, blend);
    scene.fog.density = lerp(scene.fog.density, density, blend);
    scene.environmentIntensity = lerp(
      scene.environmentIntensity,
      (mode === 'clear' ? 0.35 : 0.18) * (isDusk ? 0.45 : 1) * (1 - stormAmount * 0.35),
      blend,
    );
    base.sunColor.lerp(sunTarget, blend);
    base.sunIntensity = lerp(base.sunIntensity, sunPower, blend);
    base.hemiIntensity = lerp(base.hemiIntensity, ambient, blend);
    hemi.color.lerp(zenithTarget, blend);
    hemi.groundColor.lerp(
      groundTarget.set(config.ground).lerp(stormColors.ground, stormAmount),
      blend,
    );
    renderer.toneMappingExposure = lerp(renderer.toneMappingExposure, exposure, blend);
    // A strike briefly lights the whole valley from the sky: sun, bounce light and fog.
    sun.color.copy(base.sunColor).lerp(flashColor, Math.min(1, flash * 1.4));
    sun.intensity = base.sunIntensity + flash * 5.5;
    hemi.intensity = base.hemiIntensity + flash * 1.6;
    scene.fog.color.copy(base.fogColor).lerp(flashColor, flash * 0.35);
    scene.background.copy(scene.fog.color);
    sky.position.copy(camera.position);
    skyUniforms.time.value = elapsed;
    skyUniforms.sunDirection.value.copy(sun.position).sub(sun.target.position).normalize();
    skyUniforms.zenith.value.lerp(zenithTarget, blend);
    skyUniforms.horizon.value.lerp(horizonTarget, blend);
    skyUniforms.cloudColor.value.lerp(cloudTarget, blend);
    skyUniforms.storm.value = lerp(
      skyUniforms.storm.value,
      (mode === 'rain' ? 1 : mode === 'snow' ? 0.45 : 0) + stormAmount * 0.4,
      blend,
    );
    skyUniforms.night.value = lerp(skyUniforms.night.value, night, blend);
    skyUniforms.flash.value = flash;
    skyUniforms.flashBearing.value = latest.flashBearing;

    // Valley mist hugs the ground near the camera; far terrain fades toward the horizon.
    const fogKey = stormAmount > 0.5 ? 'storm' : mode === 'clear' && isDusk ? 'dusk' : mode;
    const height = HEIGHT_FOG[fogKey];
    fogHeight.density = lerp(fogHeight.density, height.density, blend);
    fogHeight.falloff = lerp(fogHeight.falloff, height.falloff, blend);
    fogHeight.haze = lerp(fogHeight.haze, height.haze, blend);
    fogHeight.scatter = lerp(fogHeight.scatter, height.scatter * (1 - stormAmount), blend);
    fogHeight.base = lerp(fogHeight.base, groundHeight(position.z), 1 - Math.exp(-dt * 0.6));
    sunDirection.copy(skyUniforms.sunDirection.value);
    updateHeightFog({
      baseHeight: fogHeight.base,
      falloff: fogHeight.falloff,
      density: quality.heightFog === false ? 0 : fogHeight.density,
      sunScatter: fogHeight.scatter * phase.power * (isDusk ? 0.5 : 1),
      sunDirection,
      sunColor: sun.color,
      hazeColor: skyUniforms.horizon.value,
      hazeStrength: fogHeight.haze,
      hazeDistance: 950,
    });

    cameraDelta.copy(position).sub(previousCamera);
    previousCamera.copy(position);
    snow.position.copy(position);
    rainTint
      .copy(scene.fog.color)
      .lerp(flashColor, 0.35)
      .multiplyScalar(isDusk ? 0.8 : 1.05);
    const gust = latest.gust;
    rain.update(dt, {
      amount: rainAmount,
      storm: stormAmount,
      flash,
      dusk: isDusk,
      color: rainTint,
      wind: { x: 1.8 + gust * 5.5, z: 0.7 + gust * 2.1 },
    });
    snow.visible = snowAmount > 0.005;
    snowMaterial.uniforms.opacity.value = snowAmount * 0.88;
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
      if (uniforms.dusk) uniforms.dusk.value = lerp(uniforms.dusk.value, night, blend);
      if (uniforms.rainStrength) uniforms.rainStrength.value = rainAmount * (1 + stormAmount * 0.6);
      if (uniforms.sunDirection) uniforms.sunDirection.value.copy(skyUniforms.sunDirection.value);
      if (uniforms.sunColor)
        uniforms.sunColor.value
          .copy(sun.color)
          .multiplyScalar((isDusk ? 0.35 : mode === 'rain' ? 0.35 : 1) + flash * 2);
      if (uniforms.waterColor)
        uniforms.waterColor.value.lerp(
          waterTarget.set(mode === 'snow' ? '#244f5b' : mode === 'rain' ? '#254c51' : '#1b6156'),
          blend,
        );
      if (uniforms.skyHorizon) uniforms.skyHorizon.value.copy(skyUniforms.horizon.value);
      if (uniforms.skyZenith) uniforms.skyZenith.value.copy(skyUniforms.zenith.value);
    }
  }
  return {
    setWeather(value) {
      if (!(value in profile)) throw new Error(`Unknown weather: ${value}`);
      mode = value;
    },
    /** Storms only show with rain; the flag is kept so switching back to rain restores it. */
    setStorm(value) {
      storm = Boolean(value);
    },
    setQuality(settings) {
      quality = settings;
      rain.setCount(settings.rainStreaks);
    },
    setDusk(value) {
      isDusk = Boolean(value);
      sunPhase = isDusk ? 'dusk' : 'daylight';
    },
    setSunPhase(value) {
      if (!(value in SUN_PHASES)) throw new RangeError('Unknown sun phase');
      sunPhase = value;
      isDusk = value === 'dusk';
    },
    update,
    /** Live blends for the grade, sound and effects: rain, snow, stormAmount, flash, gust. */
    getState() {
      return latest;
    },
    get sky() {
      return skyUniforms;
    },
    get weather() {
      return mode;
    },
    get storm() {
      return storm && mode === 'rain';
    },
    get dusk() {
      return isDusk;
    },
    dispose() {
      for (const object of [sky, snow]) {
        scene.remove(object);
        object.geometry.dispose();
        object.material.dispose();
      }
      scene.remove(rain.mesh);
      rain.dispose();
    },
  };
}
