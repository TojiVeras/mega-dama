import * as THREE from 'three';
import { WHITE } from '../game/rules.js';
import {
  FLY_MARGIN,
  PIECE_HEIGHT,
  PIECE_RADIUS,
  damp,
  easeInOutCubic,
  squareToWorld,
} from './constants.js';

const R = PIECE_RADIUS;
const H = PIECE_HEIGHT;

// Perfil torneado de uma pedra de damas (raio, altura), com sulcos no topo.
function pieceGeometry() {
  const pts = [
    [0, 0],
    [R - 0.03, 0],
    [R, 0.02],
    [R, H * 0.35],
    [R - 0.012, H * 0.45],
    [R, H * 0.55],
    [R, H - 0.02],
    [R - 0.03, H],
    [R * 0.8, H],
    [R * 0.76, H - 0.018],
    [R * 0.7, H - 0.018],
    [R * 0.66, H - 0.004],
    [R * 0.4, H - 0.004],
    [R * 0.36, H - 0.014],
    [R * 0.3, H - 0.014],
    [R * 0.27, H - 0.004],
    [0, H - 0.004],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 64);
  geo.computeVertexNormals();
  return geo;
}

const SHARED = {
  geometry: null,
  crownRing: null,
  crownMat: null,
};

function shared() {
  if (!SHARED.geometry) {
    SHARED.geometry = pieceGeometry();
    SHARED.crownRing = new THREE.TorusGeometry(R * 0.5, 0.022, 12, 48);
    SHARED.crownRing.rotateX(Math.PI / 2);
    SHARED.crownMat = new THREE.MeshStandardMaterial({ color: 0xe0b44c, metalness: 0.9, roughness: 0.25 });
  }
  return SHARED;
}

function pieceMaterial(color) {
  const white = color === WHITE;
  return new THREE.MeshPhysicalMaterial({
    color: white ? 0xe8dbc0 : 0x1d1b1e,
    roughness: white ? 0.42 : 0.45,
    clearcoat: white ? 0.5 : 0.35,
    clearcoatRoughness: 0.3,
    emissive: new THREE.Color(white ? 0xfff6e6 : 0x9aa0b4),
    emissiveIntensity: 0,
  });
}

/** Representação 3D de uma peça. Toda a animação dela acontece em update(). */
export class PieceView {
  constructor(piece) {
    const { geometry, crownRing, crownMat } = shared();
    this.id = piece.id;
    this.color = piece.color;
    this.king = false;
    this.inTray = false;
    this.marked = false; // capturada durante um lance em andamento

    this.material = pieceMaterial(piece.color);
    this.group = new THREE.Group();
    this.group.userData.pieceView = this;

    this.tilt = new THREE.Group(); // inclinação ao arrastar
    this.group.add(this.tilt);

    const base = new THREE.Mesh(geometry, this.material);
    base.castShadow = true;
    base.receiveShadow = true;
    this.tilt.add(base);

    this.crown = new THREE.Group();
    const top = new THREE.Mesh(geometry, this.material);
    top.castShadow = true;
    top.receiveShadow = true;
    const ring = new THREE.Mesh(crownRing, crownMat);
    ring.position.y = H - 0.004;
    ring.castShadow = true;
    this.crown.add(top, ring);
    this.crown.position.y = H;
    this.crown.visible = false;
    this.tilt.add(this.crown);

    this.hover = 0;
    this.hoverTarget = 0;
    this.follow = null; // {x,y,z} quando está sendo arrastada
    this.tween = null;
    this.crownTween = null;
    this.prev = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    this.setKing(piece.king, false);
  }

  get height() {
    return this.king ? H * 2 : H;
  }

  get position() {
    return this.group.position;
  }

  placeAt(sq) {
    const { x, z } = squareToWorld(sq);
    this.group.position.set(x, 0, z);
    this.prev.copy(this.group.position);
  }

  setKing(king, animate = true) {
    this.king = king;
    this.crown.visible = king;
    if (king && animate) {
      this.crownTween = { t: 0, duration: 0.55 };
      this.crown.position.y = H + 1.2;
      this.crown.scale.setScalar(0.01);
    } else {
      this.crown.position.y = H;
      this.crown.scale.setScalar(1);
    }
  }

  /**
   * Move a peça até `to` em arco. A altura do arco é calculada para passar por
   * cima de qualquer peça no caminho (obstacleHeightAt).
   */
  moveTo(to, { duration = 0.45, minArc = 0.15, obstacleHeightAt, ease = easeInOutCubic } = {}) {
    this.follow = null;
    const from = this.group.position.clone();
    const target = new THREE.Vector3(to.x, to.y ?? 0, to.z);
    let arc = minArc;
    if (obstacleHeightAt) {
      for (let i = 1; i < 24; i++) {
        const t = i / 24;
        const e = ease(t);
        const x = from.x + (target.x - from.x) * e;
        const z = from.z + (target.z - from.z) * e;
        const needed = obstacleHeightAt(x, z, this);
        if (needed <= 0) continue;
        const baseY = from.y + (target.y - from.y) * e;
        const s = Math.sin(Math.PI * e);
        if (s > 0.05) arc = Math.max(arc, (needed + FLY_MARGIN - baseY) / s);
      }
    }
    return new Promise((resolve) => {
      this.tween = { from, to: target, t: 0, duration, arc: Math.min(arc, 3), ease, resolve };
    });
  }

  update(dt, time) {
    const pos = this.group.position;

    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const e = tw.ease(tw.t);
      pos.lerpVectors(tw.from, tw.to, e);
      pos.y += Math.sin(Math.PI * e) * tw.arc;
      if (tw.t >= 1) {
        pos.copy(tw.to);
        this.tween = null;
        tw.resolve();
      }
    } else if (this.follow) {
      pos.x = damp(pos.x, this.follow.x, 22, dt);
      pos.z = damp(pos.z, this.follow.z, 22, dt);
      pos.y = damp(pos.y, this.follow.y, 16, dt);
    }

    // Inclinação proporcional à velocidade horizontal (sensação de peso).
    if (dt > 0) {
      this.velocity.subVectors(pos, this.prev).divideScalar(dt);
      this.prev.copy(pos);
    }
    const moving = this.follow || this.tween;
    const tx = moving ? THREE.MathUtils.clamp(this.velocity.z * 0.035, -0.35, 0.35) : 0;
    const tz = moving ? THREE.MathUtils.clamp(-this.velocity.x * 0.035, -0.35, 0.35) : 0;
    this.tilt.rotation.x = damp(this.tilt.rotation.x, tx, 10, dt);
    this.tilt.rotation.z = damp(this.tilt.rotation.z, tz, 10, dt);

    if (this.crownTween) {
      const ct = this.crownTween;
      ct.t = Math.min(1, ct.t + dt / ct.duration);
      const e = 1 - Math.pow(1 - ct.t, 3);
      this.crown.position.y = H + (1 - e) * 1.2;
      this.crown.scale.setScalar(Math.max(0.01, e));
      if (ct.t >= 1) this.crownTween = null;
    }

    // Destaque ao passar o mouse e pulso vermelho quando marcada para captura.
    this.hover = damp(this.hover, this.hoverTarget, 14, dt);
    if (this.marked) {
      this.material.emissive.setHex(0xff3b2f);
      this.material.emissiveIntensity = 0.35 + 0.2 * Math.sin(time * 8);
    } else {
      this.material.emissive.setHex(this.color === WHITE ? 0xfff6e6 : 0x9aa0b4);
      this.material.emissiveIntensity = this.hover * (this.color === WHITE ? 0.3 : 0.45);
    }
  }

  dispose() {
    this.material.dispose();
  }
}

/** Conjunto de peças em cena, indexado pelo id da peça no estado do jogo. */
export class PieceSet {
  constructor(scene) {
    this.scene = scene;
    this.byId = new Map();
  }

  clear() {
    for (const view of this.byId.values()) {
      this.scene.remove(view.group);
      view.dispose();
    }
    this.byId.clear();
  }

  add(piece, sq) {
    const view = new PieceView(piece);
    view.placeAt(sq);
    this.byId.set(piece.id, view);
    this.scene.add(view.group);
    return view;
  }

  get(id) {
    return this.byId.get(id);
  }

  meshes() {
    return [...this.byId.values()].filter((v) => !v.inTray).map((v) => v.group);
  }

  /**
   * Altura do topo da peça mais alta que ficaria embaixo de uma peça em (x, z).
   * Retorna 0 se não há sobreposição. Usado para "sobrevoar" peças.
   */
  obstacleHeightAt = (x, z, self) => {
    let h = 0;
    const reach = PIECE_RADIUS * 2 + 0.04;
    for (const v of this.byId.values()) {
      if (v === self || v.inTray) continue;
      const dx = v.position.x - x;
      const dz = v.position.z - z;
      if (dx * dx + dz * dz < reach * reach) h = Math.max(h, v.position.y + v.height);
    }
    return h;
  };

  update(dt, time) {
    for (const v of this.byId.values()) v.update(dt, time);
  }
}
