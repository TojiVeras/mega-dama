import * as THREE from 'three';
import { BOARD_EXTENT, damp, FIRE, PENTAGRAM, TABLE_Y } from './constants.js';
import { additive, noiseChunk } from './fire.js';

// Pentagrama de fogo dentro do anel: as 5 linhas da estrela (cada ponta ligada à
// segunda seguinte) com o mesmo shader de chamas do anel. A força vem do número
// de peças capturadas (`setCaptured`): a altura cresce linearmente, a opacidade
// cresce com uma curva (devagar no começo). Onde a linha passa sobre o tabuleiro
// a base fica na superfície (y = 0); fora dele, na mesa (TABLE_Y).

const RING_RADIUS = Math.hypot(BOARD_EXTENT, BOARD_EXTENT) + FIRE.gap;
const STEP = 0.06; // espaçamento das colunas ao longo da linha (unidades)
const ROWS = 16; // divisões na altura

const surfaceY = (x, z) => (Math.abs(x) <= BOARD_EXTENT && Math.abs(z) <= BOARD_EXTENT ? 0 : TABLE_Y);

/** Segmentos da estrela: pares de pontas [a, b] em {x, z}. */
function starSegments() {
  const r = RING_RADIUS * PENTAGRAM.radius;
  const tips = Array.from({ length: 5 }, (_, k) => {
    const a = PENTAGRAM.rotation + (k * Math.PI * 2) / 5;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
  return tips.map((a, k) => [a, tips[(k + 2) % 5]]);
}

/**
 * Malha de uma faixa ao longo de cada segmento. `build(col, row)` devolve
 * { offset (perpendicular), y, u, v } para cada vértice da grade.
 */
function stripGeometry(rows, build) {
  const pos = [];
  const uv = [];
  const index = [];
  for (const [a, b] of starSegments()) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    const cols = Math.ceil(len / STEP);
    const start = pos.length / 3;
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * len;
      const cx = a.x + (dx / len) * s;
      const cz = a.z + (dz / len) * s;
      const base = surfaceY(cx, cz);
      for (let r = 0; r <= rows; r++) {
        const p = build(r / rows);
        pos.push(cx + nx * p.offset, base + p.y, cz + nz * p.offset);
        uv.push(s, p.v);
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const i = start + c * (rows + 1) + r;
        const j = i + rows + 1;
        index.push(i, j, i + 1, i + 1, j, j + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  return geo;
}

// Mesmas chamas do anel (fire.js), sem o modo equalizador. vUv.x = distância ao
// longo da linha (unidades); vUv.y = 0..1 da altura máxima. O ruído vertical é
// escalado para as chamas terem o mesmo "grão" das do anel, só que mais baixas.
const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform float uAlpha;
  uniform float uSeed;
  uniform vec3 uCore;
  uniform vec3 uMid;
  uniform vec3 uEdge;
  varying vec2 vUv;
  ${noiseChunk}
  void main() {
    float period = 4096.0;
    float y = vUv.y;
    float x = vUv.x * ${PENTAGRAM.tongues.toFixed(2)};
    float ny = y * ${(PENTAGRAM.maxHeight / FIRE.maxHeight).toFixed(4)};

    float n0 = noise(vec2(x * 0.25 + uSeed, uTime * 0.6), period);
    float h = max(uLevel * (0.55 + 0.65 * n0), 0.001);

    float sway = (noise(vec2(x * 0.5, ny * 2.0 - uTime * 0.8 + uSeed), period) - 0.5) * 1.2;
    float n = fbm(vec2(x + sway, ny * 6.0 - uTime * 2.2 + uSeed * 3.0), period);

    float t = y / h;
    float i = smoothstep(0.0, 0.45, n * 1.35 - t * 0.95 + 0.05);
    i *= smoothstep(0.0, 0.04, y);
    i *= smoothstep(0.0, 0.05, h);

    vec3 c = mix(uEdge, uMid, smoothstep(0.05, 0.5, i));
    c = mix(c, uCore, smoothstep(0.55, 1.0, i));
    gl_FragColor = vec4(c * i * 1.1 * uAlpha, 1.0);
  }
`;

// Brilho no chão sob as linhas: vUv.y = -1..1 atravessando a faixa.
const groundFragment = /* glsl */ `
  uniform float uTime;
  uniform float uAlpha;
  uniform vec3 uColor;
  varying vec2 vUv;
  ${noiseChunk}
  void main() {
    float band = clamp(1.0 - abs(vUv.y), 0.0, 1.0);
    float flicker = 0.7 + 0.6 * noise(vec2(vUv.x * 6.0, uTime * 3.0), 4096.0);
    gl_FragColor = vec4(uColor * band * band * flicker * uAlpha * 0.8, 1.0);
  }
`;

export class PentagramFire {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'pentagram';
    this.target = 0; // força pedida (0..1)
    this.strength = 0; // força atual (suavizada)
    this.materials = [];
    this.geometries = [];

    const colors = {
      uCore: { value: new THREE.Color(FIRE.core) },
      uMid: { value: new THREE.Color(FIRE.mid) },
      uEdge: { value: new THREE.Color(FIRE.edge) },
    };

    // Duas paredes por linha (como as duas camadas do anel): a base de cada uma
    // fica de um lado e elas inclinam até o centro, formando uma "tenda".
    const { width, maxHeight } = PENTAGRAM;
    [
      { side: 1, seed: 0 },
      { side: -1, seed: 7.3 },
    ].forEach(({ side, seed }) => {
      const geo = stripGeometry(ROWS, (v) => ({
        offset: side * width * Math.max(0, 1 - v / 0.4),
        y: v * maxHeight,
        v,
      }));
      const mat = additive(flameFragment, {
        uTime: { value: 0 },
        uLevel: { value: 0 },
        uAlpha: { value: 0 },
        uSeed: { value: seed },
        ...colors,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 2;
      this.geometries.push(geo);
      this.materials.push(mat);
      this.group.add(mesh);
    });

    const groundGeo = stripGeometry(1, (v) => ({
      offset: (v * 2 - 1) * PENTAGRAM.groundWidth,
      y: 0.006,
      v: v * 2 - 1,
    }));
    const groundMat = additive(groundFragment, {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uColor: { value: new THREE.Color(FIRE.mid) },
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.renderOrder = 1;
    this.geometries.push(groundGeo);
    this.materials.push(groundMat);
    this.group.add(ground);

    this.group.visible = false;
    scene.add(this.group);
  }

  /** Número de peças capturadas no jogo; a força máxima é com `PENTAGRAM.total`. */
  setCaptured(count) {
    this.target = THREE.MathUtils.clamp(count / PENTAGRAM.total, 0, 1);
  }

  /** `ringLevel`: altura atual do anel de fogo (0..1), para pulsar junto com ele. */
  update(dt, time, ringLevel = 0) {
    this.strength = damp(this.strength, this.target, PENTAGRAM.response, dt);
    const s = this.strength;
    const { minHeight, minOpacity, opacityCurve, pulse, total } = PENTAGRAM;
    const height = s > 0.001 ? (minHeight + (1 - minHeight) * s) * (1 - pulse + pulse * ringLevel * 2) : 0;
    // Some suavemente abaixo de uma captura (novo jogo / desfazer).
    const alpha = (minOpacity + (1 - minOpacity) * Math.pow(s, opacityCurve)) * THREE.MathUtils.smoothstep(s, 0, 1 / total);
    for (const mat of this.materials) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uAlpha.value = alpha;
      if (mat.uniforms.uLevel) mat.uniforms.uLevel.value = Math.min(height, 1);
    }
    this.group.visible = alpha > 0.002;
  }

  dispose() {
    this.group.removeFromParent();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
