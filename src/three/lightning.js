import * as THREE from 'three';
import { LIGHTNING } from './constants.js';

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Linha quebrada de `a` até `b` por deslocamento do ponto médio: cada nível
 * divide os segmentos ao meio e empurra o meio para o lado (zigue-zague do raio).
 */
function jagged(a, b, levels, roughness) {
  let pts = [a.clone(), b.clone()];
  let amount = a.distanceTo(b) * roughness;
  for (let l = 0; l < levels; l++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      const mid = p.clone().lerp(q, rand(0.4, 0.6));
      mid.x += rand(-amount, amount);
      mid.z += rand(-amount, amount);
      mid.y += rand(-amount, amount) * 0.3;
      next.push(mid, q);
    }
    pts = next;
    amount *= 0.52;
  }
  return pts;
}

/** Tubo que segue a linha quebrada; o índice cresce ao longo dela (drawRange = raio descendo). */
function tube(points, radius) {
  const path = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
  const segments = points.length - 1;
  const geometry = new THREE.TubeGeometry(path, segments, radius, 5, false);
  geometry.userData.perSegment = 5 * 6; // índices por segmento do tubo
  geometry.userData.segments = segments;
  return geometry;
}

function glowMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
}

/** Um raio: cai do céu até (x, z), brilha, pisca e some. */
class Strike {
  constructor(parent, x, y, z, ground) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.t = 0;
    this.hit = false;
    this.target = new THREE.Vector3(x, y, z);

    const start = new THREE.Vector3(
      x + rand(-1, 1) * LIGHTNING.spread,
      LIGHTNING.height,
      z + rand(-1, 1) * LIGHTNING.spread,
    );
    const main = jagged(start, this.target, 6, 0.22);

    this.meshes = [];
    const addBolt = (points, scale, delay) => {
      const core = new THREE.Mesh(tube(points, 0.022 * scale), glowMaterial(LIGHTNING.core, 1));
      const halo = new THREE.Mesh(tube(points, 0.11 * scale), glowMaterial(LIGHTNING.halo, 0.35));
      for (const m of [core, halo]) {
        m.renderOrder = 10;
        m.userData.base = m.material.opacity * scale;
        m.userData.delay = delay;
        m.geometry.setDrawRange(0, 0);
        this.group.add(m);
        this.meshes.push(m);
      }
    };
    addBolt(main, 1, 0);

    // Galhos: saem de pontos do raio principal e descem para os lados.
    const branches = Math.round(rand(3, 6));
    for (let i = 0; i < branches; i++) {
      const k = Math.floor(rand(0.15, 0.75) * main.length);
      const from = main[k];
      const len = rand(1.2, 3.2) * (1 - k / main.length);
      const to = from.clone().add(new THREE.Vector3(rand(-1, 1) * len, -rand(0.6, 1.2) * len, rand(-1, 1) * len));
      to.y = Math.max(to.y, ground + 0.4);
      addBolt(jagged(from, to, 4, 0.3), rand(0.35, 0.6), (k / main.length) * LIGHTNING.descend);
    }

    // Onda de choque e faíscas no ponto do impacto.
    this.shock = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 48), glowMaterial(LIGHTNING.halo, 0));
    this.shock.rotation.x = -Math.PI / 2;
    this.shock.position.set(x, ground, z);
    this.group.add(this.shock);

    const n = 48;
    const pos = new Float32Array(n * 3);
    this.sparkVel = [];
    for (let i = 0; i < n; i++) {
      pos.set([x, y, z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = rand(1.5, 4.5);
      this.sparkVel.push(new THREE.Vector3(Math.cos(a) * s, rand(1.5, 5), Math.sin(a) * s));
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({
        color: LIGHTNING.core,
        size: 0.07,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.sparks.visible = false;
    this.group.add(this.sparks);
  }

  /** Brilho do raio depois do impacto: forte, com duas "re-descargas", e some. */
  brightness() {
    const t = this.t - LIGHTNING.descend;
    if (t < 0) return 0.55;
    const fade = Math.max(0, 1 - t / LIGHTNING.duration);
    const flicker = t < 0.06 ? 1 : 0.35 + 0.65 * (Math.sin(t * 55) > -0.2 ? 1 : 0.15);
    return fade * fade * flicker;
  }

  /** Devolve true quando terminou. */
  update(dt) {
    this.t += dt;
    const b = this.brightness();

    for (const m of this.meshes) {
      const { perSegment, segments } = m.geometry.userData;
      const grow = THREE.MathUtils.clamp((this.t - m.userData.delay) / LIGHTNING.descend, 0, 1);
      m.geometry.setDrawRange(0, Math.ceil(grow * segments) * perSegment);
      m.material.opacity = m.userData.base * b;
    }

    if (!this.hit && this.t >= LIGHTNING.descend) this.hit = true;

    const after = this.t - LIGHTNING.descend;
    if (after >= 0) {
      const k = Math.min(1, after / 0.5);
      this.shock.scale.setScalar(0.2 + k * 1.6);
      this.shock.material.opacity = (1 - k) * 0.9;

      this.sparks.visible = true;
      this.sparks.material.opacity = Math.max(0, 1 - after / 0.7);
      const arr = this.sparks.geometry.attributes.position.array;
      this.sparkVel.forEach((v, i) => {
        v.y -= 12 * dt;
        arr[i * 3] += v.x * dt;
        arr[i * 3 + 1] = Math.max(0.01, arr[i * 3 + 1] + v.y * dt);
        arr[i * 3 + 2] += v.z * dt;
      });
      this.sparks.geometry.attributes.position.needsUpdate = true;
    }
    return this.t > LIGHTNING.descend + LIGHTNING.duration + 0.3;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

/**
 * Raios que caem nas peças capturadas. A luz de impacto e o clarão do céu ficam
 * sempre na cena (intensidade 0 quando não há raio) para não recompilar shaders.
 */
export class LightningField {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.strikes = [];

    this.impactLight = new THREE.PointLight(LIGHTNING.light, 0, 9, 1.6);
    this.skyLight = new THREE.HemisphereLight(LIGHTNING.light, 0x101020, 0);
    scene.add(this.impactLight, this.skyLight);
  }

  /**
   * Raio em (x, z) com a ponta na altura y; `ground`: altura do chão (onda de choque).
   * Resolve quando o raio toca o chão.
   */
  strike(x, y, z, ground = 0.01) {
    const s = new Strike(this.group, x, y, z, ground);
    this.strikes.push(s);
    this.impactLight.position.set(x, ground + 0.8, z);
    return new Promise((resolve) => {
      s.onHit = resolve;
    });
  }

  update(dt) {
    let light = 0;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      const wasHit = s.hit;
      const done = s.update(dt);
      if (s.hit && !wasHit) s.onHit?.();
      light = Math.max(light, s.hit ? s.brightness() : s.brightness() * 0.3);
      if (done) {
        s.dispose();
        this.strikes.splice(i, 1);
      }
    }
    this.impactLight.intensity = light * LIGHTNING.lightIntensity;
    this.skyLight.intensity = light * LIGHTNING.skyIntensity;
  }
}
