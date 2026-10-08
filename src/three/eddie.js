import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import eddieUrl from '../assets/eddie.glb?url';
import { damp, EDDIE, LIGHTNING } from './constants.js';

// Eddie múmia (Powerslave). O modelo não tem esqueleto: o andar é feito no vertex
// shader, girando as pernas no quadril e no joelho e o tronco em volta do eixo vertical.
// O .glb foi otimizado com gltf-transform (meshopt + webp, ~1/8 do original).

// Medidas no espaço do modelo (+y para cima, +z para a frente, altura ~1,9),
// tiradas das silhuetas da pose original.
const HIP_Y = -0.1; // articulação do quadril
const HIP_Z = -0.08;
const KNEE_Y = -0.55;
const KNEE_Z = -0.06;
const CROTCH = 0.07; // |x| a partir do qual o vértice é todo de uma perna
const CHAIN_Z = 0.11; // a corrente pendurada fica na frente das coxas (z maior)
const CHAIN_BOTTOM = -0.6;
const LEG = 0.85; // do quadril à sola

const f = (v) => v.toFixed(4);

const WALK_GLSL = /* glsl */ `
uniform float uThighL;
uniform float uThighR;
uniform float uKneeL;
uniform float uKneeR;
uniform float uTwist;

vec3 eddieRotX(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
}
vec3 eddieRotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

// Pesos calculados na pose original; aplica joelho, depois quadril, depois o tronco.
void eddieWalk(inout vec3 p, inout vec3 n) {
  vec3 o = p;
  bool left = o.x < 0.0;
  float chain = smoothstep(${f(CHAIN_Z)}, ${f(CHAIN_Z + 0.04)}, o.z) * step(${f(CHAIN_BOTTOM)}, o.y);
  float leg = smoothstep(0.0, ${f(CROTCH)}, abs(o.x))
    * (1.0 - smoothstep(${f(HIP_Y - 0.12)}, ${f(HIP_Y + 0.08)}, o.y))
    * (1.0 - chain);
  float shin = leg * (1.0 - smoothstep(${f(KNEE_Y - 0.07)}, ${f(KNEE_Y + 0.07)}, o.y));

  vec3 knee = vec3(0.0, ${f(KNEE_Y)}, ${f(KNEE_Z)});
  float a = (left ? uKneeL : uKneeR) * shin;
  p = knee + eddieRotX(p - knee, a);
  n = eddieRotX(n, a);

  vec3 hip = vec3(0.0, ${f(HIP_Y)}, ${f(HIP_Z)});
  a = (left ? uThighL : uThighR) * leg;
  p = hip + eddieRotX(p - hip, a);
  n = eddieRotX(n, a);

  float torso = max(smoothstep(${f(HIP_Y)}, ${f(HIP_Y + 0.3)}, o.y), chain);
  a = uTwist * torso;
  p = hip + eddieRotY(p - hip, a);
  n = eddieRotY(n, a);
}
`;

/** Atributo quantizado (int16 normalizado do meshopt) -> float32. */
function toFloat(attr) {
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr.getComponent(i, k);
  }
  return new THREE.BufferAttribute(out, attr.itemSize);
}

/**
 * Eddie gigante andando em círculos. `want` (setWanted) vem da música; `forced`
 * (console: __damas.eddie.summon() / dismiss() / auto()) passa por cima dela.
 * Estados: hidden -> loading -> arriving (raio) -> walking -> leaving (raio) -> hidden.
 * O modelo só é baixado na primeira vez que ele é chamado.
 */
export class Eddie {
  constructor(scene, { camera, lightning, thunder, onStrike }) {
    this.camera = camera;
    this.lightning = lightning;
    this.thunder = thunder;
    this.onStrike = onStrike;
    this.root = new THREE.Group();
    this.root.name = 'eddie';
    this.root.visible = false;
    this.body = new THREE.Group(); // balanço lateral (o root cuida da posição e do rumo)
    this.root.add(this.body);
    scene.add(this.root);

    this.state = 'hidden';
    this.want = false;
    this.forced = null;
    this.unwanted = 0; // s seguidos sem querer o Eddie
    this.angle = 0;
    this.phase = 0;
    this.speed = 0;
    this.zap = 0;
    this.vanish = 0; // s até sumir depois do raio de saída
    this.material = null;
    this.uniforms = {
      uThighL: { value: 0 },
      uThighR: { value: 0 },
      uKneeL: { value: 0 },
      uKneeR: { value: 0 },
      uTwist: { value: 0 },
    };
  }

  /** true = em cena, false = vai embora, null = mantém (música pausada). */
  setWanted(want) {
    if (want !== null) this.want = want;
  }

  summon() {
    this.forced = true;
  }

  dismiss() {
    this.forced = false;
  }

  auto() {
    this.forced = null;
  }

  load() {
    if (!this.ready) {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      this.ready = loader.loadAsync(eddieUrl).then((gltf) => this.setup(gltf.scene));
    }
    return this.ready;
  }

  setup(model) {
    let source = null;
    model.updateMatrixWorld(true);
    model.traverse((obj) => {
      if (obj.isMesh && !source) source = obj;
    });
    // Desfaz a quantização: o shader trabalha nas medidas originais do modelo.
    const geo = source.geometry;
    geo.setAttribute('position', toFloat(geo.getAttribute('position')));
    geo.setAttribute('normal', toFloat(geo.getAttribute('normal')));
    geo.applyMatrix4(source.matrixWorld);
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;

    const mat = source.material;
    mat.metalness = EDDIE.metalness;
    mat.fog = false; // fica longe; com névoa sumiria no fundo
    mat.emissive = new THREE.Color(LIGHTNING.halo);
    mat.emissiveIntensity = 0;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WALK_GLSL}`)
        .replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nvec3 walkPos = position;\neddieWalk(walkPos, objectNormal);',
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = walkPos;');
    };
    this.material = mat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; // as pernas saem da caixa da pose original
    mesh.position.y = -min.y; // pés em y = 0 do grupo
    this.scale = EDDIE.height / (max.y - min.y);
    this.body.scale.setScalar(this.scale);
    this.body.add(mesh);
    this.place();
  }

  /** Raio no lugar do Eddie (com trovão e clarão). Resolve quando toca o chão. */
  async bolt() {
    const { x, z } = this.root.position;
    this.thunder?.play(LIGHTNING.descend);
    await this.lightning.strike(x, EDDIE.ground, z, EDDIE.ground + 0.01);
    this.zap = 1;
    this.onStrike?.();
  }

  async arrive() {
    this.state = 'loading';
    try {
      await this.load();
    } catch (err) {
      console.warn('Eddie não carregou:', err);
      this.state = 'failed';
      return;
    }
    if (!(this.forced ?? this.want)) {
      this.state = 'hidden';
      return;
    }
    this.state = 'arriving';
    // Chega do outro lado do tabuleiro, onde a câmera o vê por cima da bandeja.
    const cam = this.camera.position;
    this.angle = Math.atan2(-cam.z, -cam.x);
    this.place();
    await this.bolt();
    this.root.visible = true;
    this.state = 'walking';
  }

  async leave() {
    this.state = 'leaving';
    await this.bolt();
    this.vanish = 0.15; // um instante eletrocutado antes de sumir
  }

  /** Posição e rumo no círculo; o quadril desce quando as pernas abrem (pé no chão). */
  place(thigh = 0) {
    const a = this.angle;
    const drop = this.scale ? this.scale * LEG * (1 - Math.cos(thigh)) : 0;
    this.root.position.set(EDDIE.radius * Math.cos(a), EDDIE.ground - drop, EDDIE.radius * Math.sin(a));
    this.root.rotation.y = -a; // de frente para a tangente (sentido anti-horário visto de cima)
  }

  /** `moving`: música tocando (pausada, ele para no lugar). */
  update(dt, moving) {
    const want = this.forced ?? this.want;
    this.unwanted = want ? 0 : this.unwanted + dt;
    if (want && this.state === 'hidden') this.arrive();
    else if (this.state === 'walking' && this.unwanted > EDDIE.leaveDelay) this.leave();

    if (this.vanish > 0) {
      this.vanish -= dt;
      if (this.vanish <= 0) {
        this.root.visible = false;
        this.state = 'hidden';
      }
    }
    if (!this.material) return;

    this.zap = Math.max(0, this.zap - dt * 1.5);
    this.material.emissiveIntensity = this.zap * this.zap * EDDIE.zapGlow;
    if (!this.root.visible) return;

    // Anda só com a música tocando; a fase do passo segue a distância (pé não escorrega).
    const target = moving || this.forced ? EDDIE.speed : 0;
    this.speed = damp(this.speed, this.state === 'walking' ? target : 0, 2.5, dt);
    const dist = this.speed * dt;
    this.angle += dist / EDDIE.radius;
    const strideLength = 4 * LEG * Math.sin(EDDIE.stride) * this.scale; // dois passos
    this.phase += (dist / strideLength) * Math.PI * 2;

    const k = this.speed / EDDIE.speed;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const thigh = EDDIE.stride * k * s;
    const u = this.uniforms;
    u.uThighL.value = -thigh; // ângulo negativo = pé para a frente
    u.uThighR.value = thigh;
    u.uKneeL.value = EDDIE.knee * k * Math.max(0, c); // dobra a perna que está indo à frente
    u.uKneeR.value = EDDIE.knee * k * Math.max(0, -c);
    u.uTwist.value = -EDDIE.twist * k * s;
    this.body.rotation.z = EDDIE.sway * k * s;
    this.place(thigh);
  }
}
