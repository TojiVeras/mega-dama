import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TABLE_Y, TRAY } from './constants.js';

const BG = 0x0f1116;

/** Retângulo de cantos arredondados no plano xz, com o topo em TABLE_Y. */
function createTray() {
  const { halfX: w, halfZ: d, corner: r, thickness } = TRAY;
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d);
  shape.quadraticCurveTo(w, -d, w, -d + r);
  shape.lineTo(w, d - r);
  shape.quadraticCurveTo(w, d, w - r, d);
  shape.lineTo(-w + r, d);
  shape.quadraticCurveTo(-w, d, -w, d - r);
  shape.lineTo(-w, -d + r);
  shape.quadraticCurveTo(-w, -d, -w + r, -d);
  const bevel = Math.min(0.05, thickness / 4);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
  // A forma fica em xy e é extrudada em +z: deita e põe o topo em TABLE_Y.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, TABLE_Y - bevel, 0);
  const tray = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: TRAY.color, roughness: 0.85 }));
  tray.receiveShadow = true;
  tray.castShadow = true;
  return tray;
}

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 12, 26);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;

  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 9, 8);

  // Bandeja sob o tabuleiro (no lugar de uma mesa): o demônio a segura pela borda.
  scene.add(createTray());

  // Luzes
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a1410, 0.6));

  // Luz principal quase a pino e simétrica em z: o tabuleiro fica igual visto
  // do lado das brancas e das pretas (a câmera troca de lado a cada turno).
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(3.5, 13, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.35);
  fill.position.set(-8, 6, 0);
  scene.add(fill);

  // Câmera: botão esquerdo é das peças; direito gira, roda/pinça dá zoom.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 24;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.25;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return { renderer, scene, camera, controls };
}
