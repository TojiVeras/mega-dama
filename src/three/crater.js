import * as THREE from 'three';
import { CRATER } from './constants.js';

const SIZE = 256;
const rand = (a, b) => a + Math.random() * (b - a);

/** Rachaduras: caminhos aleatórios saindo do centro (coordenadas 0..1, centro 0.5). */
function makeCracks() {
  const cracks = [];
  const grow = (x, y, angle, length, width, depth) => {
    const pts = [[x, y]];
    const steps = Math.round(length / 0.025);
    for (let i = 0; i < steps; i++) {
      angle += rand(-0.5, 0.5);
      x += Math.cos(angle) * 0.025;
      y += Math.sin(angle) * 0.025;
      pts.push([x, y]);
      if (depth < 2 && Math.random() < 0.12) grow(x, y, angle + rand(-1, 1), length * 0.45, width * 0.6, depth + 1);
    }
    cracks.push({ pts, width });
  };
  const n = Math.round(rand(6, 10));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
    grow(0.5 + Math.cos(a) * 0.08, 0.5 + Math.sin(a) * 0.08, a, rand(0.25, 0.42), rand(2, 4), 0);
  }
  return cracks;
}

function drawCracks(ctx, cracks, style, widthScale = 1) {
  ctx.strokeStyle = style;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const { pts, width } of cracks) {
    ctx.lineWidth = width * widthScale;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * SIZE, y * SIZE) : ctx.moveTo(x * SIZE, y * SIZE)));
    ctx.stroke();
  }
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}

/** Texturas de uma cratera: cor (queimado com transparência), relevo e brasas. */
function craterTextures() {
  const cracks = makeCracks();
  const r = SIZE / 2;

  // Cor: mancha de queimado que some nas bordas, fundo escuro e rachaduras.
  const color = canvas();
  let ctx = color.getContext('2d');
  let g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(8,5,3,0.97)');
  g.addColorStop(0.32, 'rgba(22,13,8,0.95)');
  g.addColorStop(0.45, 'rgba(48,30,18,0.9)'); // borda levantada, um pouco mais clara
  g.addColorStop(0.62, 'rgba(25,15,9,0.7)');
  g.addColorStop(1, 'rgba(20,12,8,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.pow(Math.random(), 0.7) * r * 0.9;
    ctx.fillStyle = `rgba(${Math.random() < 0.3 ? '70,52,40' : '5,3,2'},${rand(0.1, 0.35)})`;
    ctx.beginPath();
    ctx.arc(r + Math.cos(a) * d, r + Math.sin(a) * d, rand(2, 9), 0, Math.PI * 2);
    ctx.fill();
  }
  drawCracks(ctx, cracks, 'rgba(0,0,0,0.9)');

  // Relevo (bumpMap): fundo afundado, borda levantada, rachaduras mais fundas.
  const bump = canvas();
  ctx = bump.getContext('2d');
  g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, '#202020');
  g.addColorStop(0.3, '#404040');
  g.addColorStop(0.44, '#d0d0d0');
  g.addColorStop(0.56, '#a0a0a0');
  g.addColorStop(0.8, '#808080');
  g.addColorStop(1, '#808080');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  drawCracks(ctx, cracks, '#000');

  // Brasas: rachaduras e fundo incandescentes (apagam com o tempo).
  const ember = canvas();
  ctx = ember.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  g = ctx.createRadialGradient(r, r, 0, r, r, r * 0.4);
  g.addColorStop(0, 'rgba(255,200,120,1)');
  g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  drawCracks(ctx, cracks, '#ff7a28', 0.8);

  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(color, true), bumpMap: tex(bump, false), emissiveMap: tex(ember, true) };
}

/**
 * Crateras queimadas onde os raios caíram. Ficam no tabuleiro até o fim do jogo;
 * cada uma guarda `tag` (tamanho do histórico) para sumir ao desfazer o lance.
 */
export class CraterField {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.craters = [];
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.geometry.rotateX(-Math.PI / 2);
  }

  add(x, z, tag) {
    const textures = craterTextures();
    const material = new THREE.MeshStandardMaterial({
      ...textures,
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
      bumpScale: CRATER.depth,
      emissive: new THREE.Color(0xff5a1a),
      emissiveIntensity: CRATER.emberGlow,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(this.geometry, material);
    const s = CRATER.size * rand(0.9, 1.1);
    mesh.scale.set(s, 1, s);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.position.set(x, 0.002, z);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.craters.push({ mesh, tag, age: 0 });
  }

  /** Remove as crateras de lances desfeitos (tag >= historyLength). */
  removeFrom(historyLength) {
    this.craters = this.craters.filter((c) => {
      if (c.tag < historyLength) return true;
      this.dispose(c);
      return false;
    });
  }

  clear() {
    this.removeFrom(-Infinity);
  }

  dispose({ mesh }) {
    this.group.remove(mesh);
    const m = mesh.material;
    m.map.dispose();
    m.bumpMap.dispose();
    m.emissiveMap.dispose();
    m.dispose();
  }

  /** Brasas esfriam devagar, tremulando, até ficar só um brilho bem fraco. */
  update(dt, time) {
    for (const c of this.craters) {
      c.age += dt;
      const heat = Math.exp(-c.age / CRATER.cooling);
      const flicker = 0.85 + 0.15 * Math.sin(time * 9 + c.mesh.id) * Math.sin(time * 5.3 + c.mesh.id * 2);
      c.mesh.material.emissiveIntensity = (CRATER.emberGlow * heat + CRATER.residualGlow) * flicker;
    }
  }
}
