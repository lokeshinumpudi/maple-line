/**
 * The studio's one WebGL2 renderer drawing four viewports (perspective, front, side and top
 * orthographic) into one canvas with scissor rectangles. Renderer colour settings and the
 * daylight rig are the game's (main.js, character-lab.js), so characters shade as they do on
 * the platform. Concept overlays are image planes seen only by the front or side camera.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { overlayRect } from './studio-math.js';

/** Camera layers: 0 everything, 1 perspective-only helpers, 2 front overlay, 3 side overlay. */
export const LAYER = Object.freeze({ persp: 1, front: 2, side: 3 });

const VIEWS = {
  persp: { layers: [0, LAYER.persp] },
  front: { layers: [0, LAYER.front], dir: [0, 0, 1], up: [0, 1, 0] },
  side: { layers: [0, LAYER.side], dir: [1, 0, 0], up: [0, 1, 0] },
  top: { layers: [0], dir: [0, 1, 0], up: [0, 0, -1] },
};

export function createStudioScene({ canvas, container }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setScissorTest(true);

  const scene = new THREE.Scene();
  const background = new THREE.Color('#1a1f23');
  // The game's daytime lights.
  scene.add(new THREE.HemisphereLight('#dce8db', '#646544', 2.25));
  const sun = new THREE.DirectionalLight('#ffddb0', 3.1);
  sun.position.set(-12, 17, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // Everything that follows the body (cameras aim here, overlays and grids sit here).
  const follow = new THREE.Group();
  follow.name = 'studio follow';
  scene.add(follow);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.ShadowMaterial({ color: '#000000', opacity: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(400, 800, '#3c464c', '#262d31');
  grid.material.transparent = true;
  grid.material.opacity = 0.7;
  scene.add(grid);
  const axes = new THREE.Group();
  const axisLine = (to, color) =>
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(...to)]),
      new THREE.LineBasicMaterial({ color }),
    );
  axes.add(axisLine([200, 0.001, 0], '#b8474d'), axisLine([0, 0.001, 200], '#4a6bc8'));
  axes.add(axisLine([-200, 0.001, 0], '#5a2a2d'), axisLine([0, 0.001, -200], '#27345c'));
  scene.add(axes);
  // Height rulers for the front and side views: lines every 10 cm, bolder every 50 cm.
  const rulers = new THREE.Group();
  for (const [view, layer] of [
    ['front', LAYER.front],
    ['side', LAYER.side],
  ]) {
    const points = [];
    const bold = [];
    for (let y = 0; y <= 2.2001; y += 0.1) {
      const target = Math.round(y * 10) % 5 === 0 ? bold : points;
      if (view === 'front') target.push(-1.2, y, -0.9, 1.2, y, -0.9);
      else target.push(-0.9, y, -1.2, -0.9, y, 1.2);
    }
    for (const [list, color] of [
      [points, '#252c30'],
      [bold, '#3a454b'],
    ]) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
      lines.layers.set(layer);
      rulers.add(lines);
    }
  }
  follow.add(rulers);

  const views = {};
  for (const element of container.querySelectorAll('.view')) {
    const name = element.dataset.view;
    const spec = VIEWS[name];
    const camera =
      name === 'persp'
        ? new THREE.PerspectiveCamera(32, 1, 0.03, 300)
        : new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    camera.layers.disableAll();
    for (const layer of spec.layers) camera.layers.enable(layer);
    const controls = new OrbitControls(camera, element);
    controls.enableDamping = false;
    controls.target.set(0, 0.85, 0);
    if (name === 'persp') camera.position.set(2.1, 1.45, 2.9);
    else {
      camera.position.set(...spec.dir.map((d, i) => d * 10 + (i === 1 ? 0.85 : 0)));
      camera.up.set(...spec.up);
      controls.enableRotate = false;
      controls.screenSpacePanning = true;
      camera.zoom = 1;
    }
    camera.lookAt(controls.target);
    controls.update();
    views[name] = { name, element, camera, controls, height: 2.3 };
  }

  const transform = new TransformControls(views.persp.camera, views.persp.element);
  transform.setSize(0.7);
  const gizmo = transform.getHelper();
  scene.add(gizmo);
  const setLayers = (object, layer) => object.traverse((node) => node.layers.set(layer));
  // The gizmo draws and picks in the perspective view only.
  setLayers(gizmo, LAYER.persp);
  transform.getRaycaster().layers.set(LAYER.persp);
  transform.addEventListener('dragging-changed', (event) => {
    for (const view of Object.values(views)) view.controls.enabled = !event.value;
  });

  // Concept overlays: one plane each for the front and side views.
  const overlays = {};
  for (const [name, layer] of [
    ['front', LAYER.front],
    ['side', LAYER.side],
  ]) {
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    plane.name = `overlay ${name}`;
    plane.layers.set(layer);
    plane.visible = false;
    if (name === 'side') plane.rotation.y = Math.PI / 2;
    follow.add(plane);
    overlays[name] = { plane, material, image: null, size: [1, 1], name: null, onTop: false };
  }

  /** Place an overlay plane for an alignment (studio-math overlayRect, view coordinates). */
  function placeOverlay(view, alignment) {
    const overlay = overlays[view];
    if (!overlay.image) {
      overlay.plane.visible = false;
      return;
    }
    const rect = overlayRect(alignment, overlay.size[0], overlay.size[1]);
    const { plane, material } = overlay;
    plane.scale.set(rect.width * (alignment.flip ? -1 : 1), rect.height, 1);
    // View x is world +X in front and world -Z in the side view (the side camera looks down -X).
    if (view === 'front') plane.position.set(rect.centre[0], rect.centre[1], -0.8);
    else plane.position.set(-0.8, rect.centre[1], -rect.centre[0]);
    material.opacity = alignment.opacity;
    material.depthTest = !overlay.onTop;
    plane.renderOrder = overlay.onTop ? 10 : -1;
    plane.visible = true;
  }

  function setOverlayImage(view, image, name) {
    const overlay = overlays[view];
    overlay.material.map?.dispose();
    if (!image) {
      overlay.image = null;
      overlay.material.map = null;
      overlay.plane.visible = false;
      overlay.name = null;
      return;
    }
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    overlay.material.map = texture;
    overlay.material.needsUpdate = true;
    overlay.image = image;
    overlay.name = name;
    overlay.size = [image.naturalWidth || image.width, image.naturalHeight || image.height];
  }

  let maximised = null;
  function rects() {
    const base = canvas.getBoundingClientRect();
    const out = [];
    for (const view of Object.values(views)) {
      if (maximised && view.name !== maximised) continue;
      const r = view.element.getBoundingClientRect();
      out.push({
        view,
        x: r.left - base.left,
        y: base.bottom - r.bottom,
        width: r.width,
        height: r.height,
      });
    }
    return out;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    for (const { view, width, height } of rects()) {
      const aspect = width / Math.max(1, height);
      const camera = view.camera;
      if (camera.isPerspectiveCamera) camera.aspect = aspect;
      else {
        const h = view.height;
        camera.left = (-h * aspect) / 2;
        camera.right = (h * aspect) / 2;
        camera.top = h / 2;
        camera.bottom = -h / 2;
      }
      camera.updateProjectionMatrix();
    }
  }
  new ResizeObserver(resize).observe(container);

  /** Move every camera (and its orbit target) along with the followed point. */
  const lastFollow = new THREE.Vector3();
  function followTo(point) {
    const delta = new THREE.Vector3(point.x, 0, point.z).sub(lastFollow);
    if (delta.lengthSq() < 1e-12) return;
    lastFollow.add(delta);
    follow.position.set(lastFollow.x, 0, lastFollow.z);
    for (const view of Object.values(views)) {
      view.camera.position.add(delta);
      view.controls.target.add(delta);
      view.controls.update();
    }
  }

  function render() {
    renderer.setScissorTest(true);
    for (const { view, x, y, width, height } of rects()) {
      renderer.setViewport(x, y, width, height);
      renderer.setScissor(x, y, width, height);
      renderer.setClearColor(background);
      renderer.clear();
      grid.visible = gridVisible;
      renderer.render(scene, view.camera);
    }
  }
  let gridVisible = true;

  return {
    THREE,
    renderer,
    scene,
    follow,
    views,
    transform,
    gizmo,
    overlays,
    grid,
    placeOverlay,
    setOverlayImage,
    setLayers,
    render,
    resize,
    followTo,
    rects,
    setGrid(visible) {
      gridVisible = visible;
      axes.visible = visible;
      rulers.visible = visible;
    },
    maximise(name) {
      maximised = maximised === name ? null : name;
      container.classList.toggle('single', Boolean(maximised));
      for (const view of Object.values(views))
        view.element.classList.toggle('max', view.name === maximised);
      resize();
      return maximised;
    },
    get maximised() {
      return maximised;
    },
  };
}
