import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Film look for the main view: linear HDR scene target, bloom, sun shafts from
 * the sky depth mask, depth of field, ACES tone mapping, grade and lens finish.
 * Quality 'off' renders straight to the canvas exactly as before; 'lite' keeps
 * the grade and lens finish without MSAA, bloom, shafts or depth of field.
 * Water refraction and reflection captures keep rendering into their own targets.
 */
export const FILM_QUALITIES = Object.freeze(['off', 'lite', 'full']);

// Grades are applied after tone mapping. The default look is warm and muted: lifted,
// slightly amber blacks, restrained saturation and gentle contrast, like film stock
// under a low sun. Weather and time of day shift it; the palettes still decide colour.
export const FILM_GRADES = Object.freeze({
  clear: {
    lift: [0.014, 0.01, 0.004],
    gamma: [0.99, 1, 1.02],
    gain: [1.04, 1.005, 0.93],
    saturation: 0.9,
    contrast: 1.06,
  },
  golden: {
    // Golden hour without turning skin orange: warm, but a gentler blue cut and saturation.
    lift: [0.016, 0.01, 0.006],
    gamma: [0.99, 1, 1.02],
    gain: [1.06, 1.0, 0.91],
    saturation: 0.88,
    contrast: 1.08,
  },
  rain: {
    lift: [0.006, 0.009, 0.012],
    gamma: [1.01, 1, 0.98],
    gain: [0.96, 0.99, 1.02],
    saturation: 0.74,
    contrast: 1.03,
  },
  storm: {
    lift: [0.002, 0.006, 0.012],
    gamma: [1.03, 1.01, 0.98],
    gain: [0.86, 0.91, 0.97],
    saturation: 0.62,
    contrast: 1.1,
  },
  snow: {
    lift: [0.006, 0.008, 0.012],
    gamma: [1, 1, 0.99],
    gain: [0.99, 1, 1.02],
    saturation: 0.82,
    contrast: 1.03,
  },
  rainNight: {
    // Lifted blue shadows and a gentle gain: blue-hour rain that still shows shapes.
    lift: [0.014, 0.017, 0.024],
    gamma: [1.05, 1.03, 1.0],
    gain: [1.06, 1.02, 0.99],
    saturation: 0.84,
    contrast: 1.02,
  },
  dusk: {
    lift: [0.01, 0.007, 0.018],
    gamma: [0.98, 1, 1.03],
    gain: [1.06, 0.98, 0.88],
    saturation: 0.88,
    contrast: 1.07,
  },
});

/** Which grade a frame uses. storm is the 0..1 storm blend, sunPhase the sun preset. */
export function gradeKey({ weather = 'clear', dusk = false, storm = 0, sunPhase } = {}) {
  if (storm > 0.5 && weather === 'rain') return 'storm';
  if (dusk) return weather === 'rain' ? 'rainNight' : 'dusk';
  if (weather === 'clear' && (sunPhase === 'sunrise' || sunPhase === 'sunset')) return 'golden';
  return FILM_GRADES[weather] ? weather : 'clear';
}

/** Sun position in normalized screen coordinates, or null when behind the camera. */
export function sunScreenPosition(camera, sunDirection, out = new THREE.Vector3()) {
  out.copy(sunDirection).normalize().multiplyScalar(800).add(camera.position);
  out.project(camera);
  if (out.z > 1 || out.z < -1) return null;
  return { x: out.x * 0.5 + 0.5, y: out.y * 0.5 + 0.5 };
}

/** How strongly shafts should show for a sun at screen uv; fades beyond the frame. */
export function shaftStrength(
  screen,
  { weather = 'clear', inTunnel = false, dusk = false, sunPhase } = {},
) {
  if (!screen || inTunnel || weather === 'rain') return 0;
  const dx = Math.max(0, Math.abs(screen.x - 0.5) - 0.5);
  const dy = Math.max(0, Math.abs(screen.y - 0.5) - 0.5);
  const outside = Math.hypot(dx, dy);
  const onScreen = Math.max(0, 1 - outside / 0.45);
  // A low sun through haze makes the longest shafts.
  const low = sunPhase === 'sunrise' || sunPhase === 'sunset' ? 1.4 : 1;
  return onScreen * (weather === 'snow' ? 0.35 : 1) * (dusk ? 1.25 : 0.75) * low;
}

const filmShader = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.5 },
    cameraFar: { value: 1800 },
    exposure: { value: 1.12 },
    time: { value: 0 },
    sunScreen: { value: new THREE.Vector2(0.5, 0.8) },
    sunColor: { value: new THREE.Color('#ffe4ba') },
    shafts: { value: 0 },
    dofFocus: { value: 30 },
    dofRange: { value: 18 },
    dofMaxBlur: { value: 0 },
    lift: { value: new THREE.Vector3() },
    gamma: { value: new THREE.Vector3(1, 1, 1) },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1 },
    contrast: { value: 1 },
    vignette: { value: 0.28 },
    grain: { value: 0.035 },
    aberration: { value: 0.0025 },
    letterbox: { value: 0 },
    fade: { value: 0 },
  },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader: `
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tColor; uniform sampler2D tDepth;
    uniform vec2 resolution; uniform float cameraNear; uniform float cameraFar;
    uniform float exposure; uniform float time;
    uniform vec2 sunScreen; uniform vec3 sunColor; uniform float shafts;
    uniform float dofFocus; uniform float dofRange; uniform float dofMaxBlur;
    uniform vec3 lift; uniform vec3 gamma; uniform vec3 gain;
    uniform float saturation; uniform float contrast;
    uniform float vignette; uniform float grain; uniform float aberration;
    uniform float letterbox; uniform float fade;

    float viewDistance(vec2 uv){
      float d=texture2D(tDepth,uv).x;
      return -perspectiveDepthToViewZ(d,cameraNear,cameraFar);
    }
    float coc(float dist){
      return clamp(abs(dist-dofFocus)/max(dofRange,.001),0.,1.)*dofMaxBlur;
    }
    vec3 RRTAndODTFit(vec3 v){
      vec3 a=v*(v+.0245786)-.000090537;
      vec3 b=v*(.983729*v+.4329510)+.238081;
      return a/b;
    }
    vec3 aces(vec3 color){
      const mat3 inputMat=mat3(vec3(.59719,.07600,.02840),vec3(.35458,.90834,.13383),vec3(.04823,.01566,.83777));
      const mat3 outputMat=mat3(vec3(1.60475,-.10208,-.00327),vec3(-.53108,1.10813,-.07276),vec3(-.07367,-.00605,1.07602));
      color*=exposure/.6;
      color=inputMat*color;
      color=RRTAndODTFit(color);
      return clamp(outputMat*color,0.,1.);
    }
    vec3 srgb(vec3 c){
      return mix(pow(c,vec3(.41666))*1.055-vec3(.055),c*12.92,vec3(lessThanEqual(c,vec3(.0031308))));
    }
    float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}

    void main(){
      vec2 uv=vUv;
      vec2 texel=1./resolution;
      vec3 color=texture2D(tColor,uv).rgb;

      // Depth of field: golden-angle gather, weighted by each tap's own blur so
      // sharp foreground edges do not smear over the subject.
      if(dofMaxBlur>.01){
        float centerDistance=viewDistance(uv);
        float centerCoc=coc(centerDistance);
        if(centerCoc>.35){
          vec3 sum=color; float total=1.;
          for(int i=1;i<24;i++){
            float fi=float(i);
            float r=sqrt(fi/24.)*centerCoc;
            float a=fi*2.39996;
            vec2 offset=vec2(cos(a),sin(a))*r*texel;
            vec2 sampleUv=uv+offset;
            float sampleCoc=coc(viewDistance(sampleUv));
            float w=smoothstep(r-.5,r+.5,max(sampleCoc,centerCoc*.35));
            sum+=texture2D(tColor,sampleUv).rgb*w; total+=w;
          }
          color=sum/total;
        }
      }

      // Lateral colour at the frame edge, as in a real lens.
      vec2 fromCenter=uv-.5;
      float edge=dot(fromCenter,fromCenter);
      if(aberration>0.){
        vec2 shift=fromCenter*edge*aberration;
        vec3 base=texture2D(tColor,uv).rgb;
        color.r+=texture2D(tColor,uv-shift).r-base.r;
        color.b+=texture2D(tColor,uv+shift).b-base.b;
        color=max(color,0.);
      }

      // Sun shafts: march toward the sun through the open-sky mask.
      if(shafts>.001){
        vec2 delta=(uv-sunScreen)/40.;
        vec2 p=uv; float decay=1.; float light=0.;
        for(int i=0;i<40;i++){
          p-=delta;
          if(p.x<0.||p.x>1.||p.y<0.||p.y>1.)break;
          float sky=step(.99995,texture2D(tDepth,p).x);
          light+=sky*decay;
          decay*=.965;
        }
        light/=40.;
        float falloff=1.-smoothstep(0.,.9,distance(uv*vec2(resolution.x/resolution.y,1.),sunScreen*vec2(resolution.x/resolution.y,1.)));
        color+=sunColor*light*falloff*shafts*.9;
      }

      color=aces(color);
      // Lift / gamma / gain, then contrast about mid-grey and saturation.
      color=gain*(color+lift*(1.-color));
      color=pow(max(color,0.),1./gamma);
      color=(color-.18)*contrast+.18;
      float luma=dot(color,vec3(.2126,.7152,.0722));
      color=mix(vec3(luma),color,saturation);
      color=clamp(color,0.,1.);

      float v=smoothstep(.85,.15,length(fromCenter*vec2(1.,.82))*1.08);
      color*=mix(1.,v,vignette);
      color=srgb(color);
      float n=hash(uv*resolution+fract(time*61.)*vec2(97.,53.))-.5;
      color+=n*grain*(1.-luma*.6);

      float bar=letterbox*.5;
      float barMask=step(bar,uv.y)*step(uv.y,1.-bar);
      color*=barMask;
      color*=1.-fade;
      gl_FragColor=vec4(color,1.);
    }`,
};

/**
 * `grain: false` drops the animated film grain: it looks fine live but video encoders turn
 * per-frame noise into crawling blocks on skin, so episode renders leave it out.
 */
export function createFilmPipeline({ renderer, scene, camera, quality = 'full', grain = true }) {
  if (!FILM_QUALITIES.includes(quality)) throw new TypeError(`Unknown film quality: ${quality}`);
  const size = new THREE.Vector2();
  let width = 0,
    height = 0,
    target = null,
    bloom = null,
    active = quality;
  const material = new THREE.ShaderMaterial({
    name: 'Film finish',
    uniforms: THREE.UniformsUtils.clone(filmShader.uniforms),
    vertexShader: filmShader.vertexShader,
    fragmentShader: filmShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new FullScreenQuad(material);
  const u = material.uniforms;
  const grade = {
    lift: new THREE.Vector3(),
    gamma: new THREE.Vector3(1, 1, 1),
    gain: new THREE.Vector3(1, 1, 1),
    saturation: 1,
    contrast: 1,
  };
  const scratch = new THREE.Vector3();
  const look = {
    letterbox: 0,
    letterboxTarget: 0,
    fade: 0,
    fadeTarget: 0,
    dofFocus: 30,
    dofRange: 18,
    dofMaxBlur: 0,
    shaftBoost: 1,
    bloomBoost: 1,
  };
  let lastShafts = 0,
    bloomNight = 0,
    bloomWet = 0,
    lastGrade = 'clear';

  function disposeTargets() {
    target?.depthTexture?.dispose();
    target?.dispose();
    bloom?.dispose();
    target = null;
    bloom = null;
    width = height = 0;
  }
  function ensureTargets() {
    renderer.getDrawingBufferSize(size);
    if (size.x === width && size.y === height && target) return;
    disposeTargets();
    width = size.x;
    height = size.y;
    const full = active === 'full';
    target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: full && renderer.capabilities.isWebGL2 ? 4 : 0,
      depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedIntType),
    });
    target.texture.name = 'Film scene colour';
    if (full) {
      bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.32, 0.55, 0.92);
      bloom.renderToScreen = false;
    }
    u.resolution.value.set(width, height);
    u.tColor.value = target.texture;
    u.tDepth.value = target.depthTexture;
  }

  const api = {
    get quality() {
      return active;
    },
    setQuality(value) {
      if (!FILM_QUALITIES.includes(value)) throw new TypeError(`Unknown film quality: ${value}`);
      if (value === active) return;
      active = value;
      disposeTargets();
    },
    /** Presentation requests from the director; each value eases toward its target. */
    setLook(patch = {}) {
      for (const key of ['letterbox', 'fade'])
        if (Number.isFinite(patch[key]))
          look[`${key}Target`] = THREE.MathUtils.clamp(patch[key], 0, 1);
      if (patch.cutToBlack) look.fade = 1;
      for (const key of ['dofFocus', 'dofRange', 'dofMaxBlur', 'shaftBoost', 'bloomBoost'])
        if (Number.isFinite(patch[key])) look[key] = Math.max(0, patch[key]);
    },
    /**
     * Render one frame. context: { dt, weather, dusk, inTunnel, sunDirection, sunColor, neon,
     * storm (0..1), flash (0..1), sunPhase }
     */
    render(context) {
      const dt = Math.min(Math.max(context.dt ?? 0, 0), 0.1);
      look.letterbox = THREE.MathUtils.damp(look.letterbox, look.letterboxTarget, 3.2, dt);
      look.fade = THREE.MathUtils.damp(look.fade, look.fadeTarget, look.fade > 0.5 ? 2.4 : 4, dt);
      if (active === 'off') {
        // The host draws letterbox bars in the page when the finish pass is off.
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      ensureTargets();
      const blend = 1 - Math.exp(-dt * 2.2);
      lastGrade = gradeKey(context);
      const preset = FILM_GRADES[lastGrade] ?? FILM_GRADES.clear;
      grade.lift.lerp(scratch.fromArray(preset.lift), blend);
      grade.gamma.lerp(scratch.fromArray(preset.gamma), blend);
      grade.gain.lerp(scratch.fromArray(preset.gain), blend);
      grade.saturation = THREE.MathUtils.lerp(grade.saturation, preset.saturation, blend);
      grade.contrast = THREE.MathUtils.lerp(grade.contrast, preset.contrast, blend);

      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      if (bloom) {
        // At night the threshold drops so lamps, lit windows and their wet reflections
        // grow soft halos; rain and storms scatter them wider.
        const night = context.dusk ? 1 : 0;
        const wet = context.weather === 'rain' ? 1 : 0;
        bloomNight = THREE.MathUtils.lerp(bloomNight, night, blend);
        bloomWet = THREE.MathUtils.lerp(bloomWet, wet, blend);
        bloom.threshold = 0.92 - bloomNight * 0.2 - bloomWet * bloomNight * 0.04;
        bloom.radius = 0.55 + bloomNight * 0.25 + bloomWet * 0.1;
        bloom.strength =
          (0.24 + bloomNight * 0.26 + bloomWet * bloomNight * 0.1) *
          (context.neon ? 1.5 : 1) *
          (1 + (context.flash ?? 0) * 0.8) *
          look.bloomBoost;
        bloom.render(renderer, null, target, dt, false);
      }
      const screen =
        active === 'full' && context.sunDirection
          ? sunScreenPosition(camera, context.sunDirection)
          : null;
      const shafts = shaftStrength(screen, context) * look.shaftBoost;
      lastShafts = THREE.MathUtils.lerp(lastShafts, shafts, 1 - Math.exp(-dt * 3));
      if (screen) u.sunScreen.value.set(screen.x, screen.y);
      if (context.sunColor) u.sunColor.value.copy(context.sunColor);
      u.shafts.value = lastShafts;
      u.cameraNear.value = camera.near;
      u.cameraFar.value = camera.far;
      u.exposure.value = renderer.toneMappingExposure;
      u.time.value += dt;
      u.lift.value.copy(grade.lift);
      u.gamma.value.copy(grade.gamma);
      u.gain.value.copy(grade.gain);
      u.saturation.value = grade.saturation;
      u.contrast.value = grade.contrast;
      u.dofFocus.value = look.dofFocus;
      u.dofRange.value = Math.max(0.5, look.dofRange);
      u.dofMaxBlur.value = active === 'full' ? look.dofMaxBlur : 0;
      // About 1 px of lateral colour in the corners at 1080p; none at the centre.
      u.aberration.value = active === 'full' ? 0.0025 : 0;
      u.grain.value = !grain ? 0 : active === 'full' ? 0.014 : 0.01;
      u.vignette.value = 0.2 + look.letterbox * 0.12;
      // 2.39:1 frame inside the current aspect, capped so portrait phones keep a picture.
      u.letterbox.value = look.letterbox * Math.min(0.3, Math.max(0, 1 - width / height / 2.39));
      u.fade.value = look.fade;
      renderer.setRenderTarget(null);
      quad.render(renderer);
    },
    getState() {
      return {
        quality: active,
        size: [width, height],
        msaa: target?.samples ?? 0,
        bloom: Boolean(bloom),
        grade: lastGrade,
        shafts: Number(lastShafts.toFixed(3)),
        letterbox: Number(look.letterbox.toFixed(3)),
        fade: Number(look.fade.toFixed(3)),
        depthOfField: {
          focus: look.dofFocus,
          range: look.dofRange,
          maxBlurPx: active === 'full' ? look.dofMaxBlur : 0,
        },
      };
    },
    dispose() {
      disposeTargets();
      quad.dispose();
      material.dispose();
    },
  };
  return api;
}
