import * as THREE from 'three';
import { isDark, SIZE } from '../game/rules.js';
import { COLORS, damp, squareToWorld } from './constants.js';

const GLOW_HEIGHT = 0.6;
const GLOW_SIDE = 0.97;

// Paredes laterais de um "cubo invisível" do tamanho da casa: um cilindro de 4
// lados, sem tampa e sem fundo, girado 45° para alinhar com a casa.
// uv.x percorre o perímetro (cantos em 0, .25, .5, .75), uv.y vai de baixo (0) a cima (1).
function wallGeometry() {
  const r = (GLOW_SIDE / 2) * Math.SQRT2;
  const geo = new THREE.CylinderGeometry(r, r, GLOW_HEIGHT, 4, 1, true);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, GLOW_HEIGHT / 2, 0);
  return geo;
}

const wallVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const wallFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uBoost;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float h = vUv.y;
    float fade = pow(1.0 - h, 1.8);
    float corner = smoothstep(0.82, 1.0, abs(fract(vUv.x * 4.0) - 0.5) * 2.0);
    float baseLine = smoothstep(0.08, 0.0, h);
    float band = smoothstep(0.75, 1.0, sin((h * 3.0 - uTime * 0.9) * 6.2831853) * 0.5 + 0.5) * fade;
    float pulse = 0.85 + 0.15 * sin(uTime * 3.5);
    float a = (fade * 0.7 + corner * fade * 0.6 + baseLine * 0.9 + band * 0.35) * pulse * uOpacity * uBoost;
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  }
`;

const floorFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uBoost;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = abs(vUv - 0.5) * 2.0;
    float d = max(p.x, p.y);
    float a = (0.12 + smoothstep(0.7, 1.0, d) * 0.55) * uOpacity * uBoost;
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  }
`;

const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float a = (0.55 + 0.45 * sin(uTime * 5.0)) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

function glowMaterial(fragmentShader, color) {
  return new THREE.ShaderMaterial({
    vertexShader: wallVertex,
    fragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
      uBoost: { value: 1 },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Brilhos de todas as casas escuras. Cada casa tem seu próprio brilho, que
 * acende/apaga suavemente conforme os alvos definidos em setTargets().
 */
export class GlowField {
  constructor(scene) {
    this.cells = new Map();
    const wallGeo = wallGeometry();
    const floorGeo = new THREE.PlaneGeometry(GLOW_SIDE, GLOW_SIDE).rotateX(-Math.PI / 2);
    const ringGeo = new THREE.RingGeometry(0.41, 0.47, 48).rotateX(-Math.PI / 2);

    for (let sq = 0; sq < SIZE * SIZE; sq++) {
      if (!isDark(sq)) continue;
      const { x, z } = squareToWorld(sq);
      const group = new THREE.Group();
      group.position.set(x, 0.003, z);

      const wallMat = glowMaterial(wallFragment, COLORS.move);
      const floorMat = glowMaterial(floorFragment, COLORS.move);
      const ringMat = glowMaterial(ringFragment, COLORS.mustCapture);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      const floor = new THREE.Mesh(floorGeo, floorMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      wall.renderOrder = floor.renderOrder = ring.renderOrder = 10;
      group.add(wall, floor, ring);
      group.visible = false;
      scene.add(group);

      this.cells.set(sq, {
        group,
        wallMat,
        floorMat,
        ringMat,
        opacity: 0,
        target: 0,
        boost: 1,
        boostTarget: 1,
        ring: 0,
        ringTarget: 0,
      });
    }
  }

  /** targets: Map<casa, 'move' | 'capture'>; hot: casa sob a peça arrastada. */
  setTargets(targets, hot = -1) {
    for (const [sq, cell] of this.cells) {
      const kind = targets.get(sq);
      cell.target = kind ? 1 : 0;
      cell.boostTarget = sq === hot && kind ? 1.9 : 1;
      if (kind) {
        const color = kind === 'capture' ? COLORS.capture : COLORS.move;
        cell.wallMat.uniforms.uColor.value.setHex(color);
        cell.floorMat.uniforms.uColor.value.setHex(color);
      }
    }
  }

  /** Anéis pulsando sob as peças que podem (e devem) capturar. */
  setRings(squares) {
    for (const [sq, cell] of this.cells) cell.ringTarget = squares.has(sq) ? 1 : 0;
  }

  update(dt, time) {
    for (const cell of this.cells.values()) {
      cell.opacity = damp(cell.opacity, cell.target, 12, dt);
      cell.boost = damp(cell.boost, cell.boostTarget, 14, dt);
      cell.ring = damp(cell.ring, cell.ringTarget, 10, dt);
      const visible = cell.opacity > 0.01 || cell.ring > 0.01;
      cell.group.visible = visible;
      if (!visible) continue;
      for (const mat of [cell.wallMat, cell.floorMat]) {
        mat.uniforms.uOpacity.value = cell.opacity;
        mat.uniforms.uBoost.value = cell.boost;
        mat.uniforms.uTime.value = time;
      }
      cell.ringMat.uniforms.uOpacity.value = cell.ring * 0.8;
      cell.ringMat.uniforms.uTime.value = time;
      cell.group.children[0].visible = cell.group.children[1].visible = cell.opacity > 0.01;
    }
  }
}
