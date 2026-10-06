import * as THREE from 'three';
import { SIZE } from '../game/rules.js';
import { BOARD_EXTENT, BOARD_THICKNESS as THICKNESS, FRAME } from './constants.js';

const TEX_SIZE = 2048;

// Gerador pseudo-aleatório determinístico para o veio da madeira ficar sempre igual.
function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function drawGrain(ctx, x, y, w, h, base, rand, vertical) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  const lines = Math.floor((vertical ? w : h) / 3);
  for (let i = 0; i < lines; i++) {
    const t = rand();
    ctx.strokeStyle = t < 0.5 ? `rgba(0,0,0,${0.03 + rand() * 0.07})` : `rgba(255,240,210,${0.02 + rand() * 0.05})`;
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    const off = rand() * (vertical ? w : h);
    const amp = 2 + rand() * 6;
    const freq = 0.004 + rand() * 0.01;
    const phase = rand() * 10;
    const len = vertical ? h : w;
    for (let s = 0; s <= len; s += 8) {
      const wave = Math.sin(s * freq + phase) * amp;
      if (vertical) ctx.lineTo(x + off + wave, y + s);
      else ctx.lineTo(x + s, y + off + wave);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function createBoardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  const rand = rng(1234);
  const unit = TEX_SIZE / (BOARD_EXTENT * 2);
  const frame = FRAME * unit;
  const sq = unit;

  // Moldura
  drawGrain(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#4a2c18', rand, false);

  // Casas
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const dark = (row + col) % 2 === 0;
      // row 0 fica embaixo na textura (lado +z / brancas)
      const x = frame + col * sq;
      const y = frame + (SIZE - 1 - row) * sq;
      drawGrain(ctx, x, y, sq, sq, dark ? '#6e3f22' : '#e6cfa2', rand, (row + col) % 4 === 0);
    }
  }

  // Filete dourado em volta da área de jogo
  ctx.strokeStyle = '#c9a25a';
  ctx.lineWidth = 6;
  ctx.strokeRect(frame - 5, frame - 5, SIZE * sq + 10, SIZE * sq + 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(frame - 9, frame - 9, SIZE * sq + 18, SIZE * sq + 18);

  // Coordenadas: legíveis do lado das brancas (embaixo/esquerda) e das pretas (cima/direita).
  ctx.fillStyle = 'rgba(240, 222, 186, 0.8)';
  ctx.font = `600 ${Math.round(frame * 0.5)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = (text, x, y, flip) => {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.rotate(Math.PI);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  for (let i = 0; i < SIZE; i++) {
    const letter = String.fromCharCode(97 + i);
    const number = String(i + 1);
    const cx = frame + i * sq + sq / 2;
    const cy = frame + (SIZE - 1 - i) * sq + sq / 2;
    label(letter, cx, TEX_SIZE - frame / 2, false);
    label(letter, cx, frame / 2, true);
    label(number, frame / 2, cy, false);
    label(number, TEX_SIZE - frame / 2, cy, true);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createBoard() {
  const size = BOARD_EXTENT * 2;
  const geo = new THREE.BoxGeometry(size, THICKNESS, size);
  const side = new THREE.MeshStandardMaterial({ color: 0x3a2213, roughness: 0.55 });
  const top = new THREE.MeshPhysicalMaterial({
    map: createBoardTexture(),
    roughness: 0.6,
    clearcoat: 0.15,
    clearcoatRoughness: 0.5,
  });
  // Ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z
  const mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
  mesh.position.y = -THICKNESS / 2;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
