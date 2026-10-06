import * as THREE from 'three';
import { BOARD_EXTENT, damp, FIRE, TABLE_Y } from './constants.js';

// Anel de fogo em volta do tabuleiro. A altura das chamas é controlada por um
// único número, `level` (0 = apagado, 1 = altura máxima `FIRE.maxHeight`),
// pensado para ser alimentado por integrações externas via `setLevel`.
//
// As chamas são cilindros abertos (sem tampa) com shader aditivo de ruído que
// sobe com o tempo; duas camadas com sementes diferentes dão volume. Um anel no
// chão e uma luz pontual acompanham a intensidade.

const RADIUS = Math.hypot(BOARD_EXTENT, BOARD_EXTENT) + FIRE.gap;
// Anel do chão em coordenadas normalizadas pelo raio externo (uv da RingGeometry).
const GROUND_OUTER = RADIUS + FIRE.groundWidth;
const GROUND_MID = RADIUS / GROUND_OUTER;
const GROUND_HALF = FIRE.groundWidth / GROUND_OUTER;

const flameVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Ruído de valor periódico em x (o cilindro dá a volta sem costura).
const noiseChunk = /* glsl */ `
  float hash(vec2 p, float period) {
    p.x = mod(p.x, period);
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i, period), hash(i + vec2(1.0, 0.0), period), u.x),
      mix(hash(i + vec2(0.0, 1.0), period), hash(i + vec2(1.0, 1.0), period), u.x),
      u.y
    );
  }
  float fbm(vec2 p, float period) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 4; k++) {
      v += a * noise(p, period);
      p *= 2.0;
      period *= 2.0;
      a *= 0.5;
    }
    return v;
  }
`;

const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform float uSeed;
  uniform vec3 uCore;
  uniform vec3 uMid;
  uniform vec3 uEdge;
  varying vec2 vUv;
  ${noiseChunk}
  void main() {
    float period = ${FIRE.tongues.toFixed(1)};
    float y = vUv.y;
    float x = vUv.x * period;

    // Altura local varia ao longo do anel (línguas de fogo de tamanhos diferentes).
    float local = 0.55 + 0.65 * noise(vec2(x * 0.25 + uSeed, uTime * 0.6), period * 0.25);
    float h = max(uLevel * local, 0.001);

    // Ruído subindo, com leve ondulação horizontal.
    float sway = (noise(vec2(x * 0.5, y * 2.0 - uTime * 0.8 + uSeed), period * 0.5) - 0.5) * 1.2;
    float n = fbm(vec2(x + sway, y * 6.0 - uTime * 2.2 + uSeed * 3.0), period);

    float t = y / h;
    float i = smoothstep(0.0, 0.45, n * 1.35 - t * 0.95 + 0.05);
    i *= smoothstep(0.0, 0.04, y);              // base macia
    i *= smoothstep(0.0, 0.05, uLevel);         // some quando apagado

    vec3 c = mix(uEdge, uMid, smoothstep(0.05, 0.5, i));
    c = mix(c, uCore, smoothstep(0.55, 1.0, i));
    gl_FragColor = vec4(c * i * 1.1, 1.0);
  }
`;

const groundFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform vec3 uColor;
  varying vec2 vUv;
  ${noiseChunk}
  void main() {
    // RingGeometry: uv é planar; recalcula ângulo e distância ao centro do anel.
    vec2 p = vUv * 2.0 - 1.0;
    float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
    float r = length(p);
    float band = 1.0 - abs(r - ${GROUND_MID.toFixed(4)}) / ${GROUND_HALF.toFixed(4)};
    band = clamp(band, 0.0, 1.0);
    float flicker = 0.7 + 0.6 * noise(vec2(ang * 40.0, uTime * 3.0), 40.0);
    float a = band * band * flicker * smoothstep(0.0, 0.3, uLevel) * (0.35 + 0.65 * uLevel);
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

function additive(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: flameVertex,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export class FireRing {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'fireRing';
    this.level = 0; // altura atual (suavizada)
    this.target = 0; // altura pedida via setLevel

    const colors = {
      uCore: { value: new THREE.Color(FIRE.core) },
      uMid: { value: new THREE.Color(FIRE.mid) },
      uEdge: { value: new THREE.Color(FIRE.edge) },
    };

    this.materials = [];
    const geo = new THREE.CylinderGeometry(1, 1, FIRE.maxHeight, 160, 1, true);
    geo.translate(0, FIRE.maxHeight / 2, 0);
    this.geometries = [geo];

    // Duas camadas: externa e interna, com sementes diferentes.
    [
      { scale: 1, seed: 0 },
      { scale: 0.96, seed: 7.3 },
    ].forEach(({ scale, seed }) => {
      const mat = additive(flameFragment, {
        uTime: { value: 0 },
        uLevel: { value: 0 },
        uSeed: { value: seed },
        ...colors,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(RADIUS * scale, 1, RADIUS * scale);
      mesh.position.y = TABLE_Y;
      mesh.renderOrder = 2;
      this.materials.push(mat);
      this.group.add(mesh);
    });

    // Brilho no chão.
    const groundGeo = new THREE.RingGeometry(RADIUS - FIRE.groundWidth, GROUND_OUTER, 160, 1);
    groundGeo.rotateX(-Math.PI / 2);
    this.geometries.push(groundGeo);
    const groundMat = additive(groundFragment, {
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uColor: { value: new THREE.Color(FIRE.mid) },
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = TABLE_Y + 0.005;
    ground.renderOrder = 1;
    this.materials.push(groundMat);
    this.group.add(ground);

    // Luz quente que acompanha a altura do fogo.
    this.light = new THREE.PointLight(FIRE.light, 0, 0, 1);
    this.light.position.set(0, TABLE_Y + 3, 0);
    this.group.add(this.light);

    scene.add(this.group);
  }

  /** Define a altura do fogo: 0 = apagado, 1 = altura máxima. Valores fora do intervalo são limitados. */
  setLevel(value) {
    const v = Number(value);
    this.target = Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0;
  }

  update(dt, time) {
    this.level = damp(this.level, this.target, FIRE.response, dt);
    for (const mat of this.materials) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uLevel.value = this.level;
    }
    const flicker = 0.85 + 0.15 * Math.sin(time * 13.1) * Math.sin(time * 7.7 + 1.3);
    this.light.intensity = FIRE.lightIntensity * this.level * flicker;
    this.group.visible = this.level > 0.002;
  }

  dispose() {
    this.group.removeFromParent();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}

/**
 * Demonstração: sorteia uma nova altura a cada poucos segundos.
 * Substituir pela integração real chamando `fire.setLevel(valor)`.
 */
export class RandomFireDriver {
  constructor(fire, { minInterval = 1.2, maxInterval = 3.5 } = {}) {
    this.fire = fire;
    this.minInterval = minInterval;
    this.maxInterval = maxInterval;
    this.next = 0;
    this.enabled = true;
  }

  update(time) {
    if (!this.enabled || time < this.next) return;
    this.fire.setLevel(Math.random());
    this.next = time + this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
  }
}
