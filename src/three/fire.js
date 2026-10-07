import * as THREE from 'three';
import { BOARD_EXTENT, damp, FIRE, spring, TABLE_Y } from './constants.js';

// Anel de fogo em volta do tabuleiro. A altura das chamas é controlada por um
// único número, `level` (0 = apagado, 1 = altura máxima `FIRE.maxHeight`),
// pensado para ser alimentado por integrações externas via `setLevel`.
// Opcionalmente, `setBands` dá uma altura por faixa de frequência (modo
// equalizador): cada trecho do anel sobe e desce com a sua faixa.
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

// Paredes do fogo: cilindro de raio 1 deformado. A base fica no raio da camada
// (uRadius) e a parede inclina até o raio comum do topo (uApex), onde encontra a
// outra camada, na altura da chama naquele ponto (mesma conta do fragment, com
// semente fixa para as duas camadas concordarem). Chama baixa = parede mais
// inclinada; acima da altura da chama as duas sobem juntas na vertical.
const wallVertex = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform sampler2D uBands;
  uniform float uBandCount;
  uniform float uSpectrum;
  uniform float uRadius;
  uniform float uApex;
  uniform float uMeet;
  uniform float uMinHeight;
  varying vec2 vUv;
  ${noiseChunk}
  void main() {
    vUv = uv;
    float period = ${FIRE.tongues.toFixed(1)};
    float x = uv.x * period;
    float n0 = noise(vec2(x * 0.25, uTime * 0.6), period * 0.25);
    float m = 1.0 - abs(fract(uv.x * 2.0) * 2.0 - 1.0);
    float band = texture2D(uBands, vec2((m * (uBandCount - 1.0) + 0.5) / uBandCount, 0.5)).r;
    float h = mix(uLevel * (0.55 + 0.65 * n0), band * (0.85 + 0.3 * n0), uSpectrum);
    h = max(h, uMinHeight) * uMeet;
    float r = mix(uRadius, uApex, clamp(uv.y / h, 0.0, 1.0));
    vec3 p = vec3(position.x * r, position.y, position.z * r);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform float uSeed;
  uniform sampler2D uBands;
  uniform float uBandCount;
  uniform float uSpectrum;
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
    float n0 = noise(vec2(x * 0.25 + uSeed, uTime * 0.6), period * 0.25);
    float local = 0.55 + 0.65 * n0;

    // Equalizador: espectro espelhado duas vezes na volta (graves em u = 0 e 0.5,
    // ou seja, +z e -z, na frente de cada jogador; agudos nas laterais).
    float m = 1.0 - abs(fract(vUv.x * 2.0) * 2.0 - 1.0);
    float band = texture2D(uBands, vec2((m * (uBandCount - 1.0) + 0.5) / uBandCount, 0.5)).r;
    float spec = band * (0.85 + 0.3 * n0);

    float h = max(mix(uLevel * local, spec, uSpectrum), 0.001);

    // Ruído subindo, com leve ondulação horizontal.
    float sway = (noise(vec2(x * 0.5, y * 2.0 - uTime * 0.8 + uSeed), period * 0.5) - 0.5) * 1.2;
    float n = fbm(vec2(x + sway, y * 6.0 - uTime * 2.2 + uSeed * 3.0), period);

    float t = y / h;
    float i = smoothstep(0.0, 0.45, n * 1.35 - t * 0.95 + 0.05);
    i *= smoothstep(0.0, 0.04, y);              // base macia
    i *= smoothstep(0.0, 0.05, h);              // some quando apagado

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

function additive(fragmentShader, uniforms, vertexShader = flameVertex) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
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
    this.response = FIRE.response; // quão rápido `level` persegue `target`
    this.fluid = false; // true: mola (FIRE.rise/fall) em vez de `response`, para música
    this.levelSpring = { x: 0, v: 0 };
    this.spectrum = 0; // 0 = altura única (`level`), 1 = altura por faixa (`setBands`)
    this.spectrumTarget = 0;

    // Uma altura por faixa numa textura 1D; o filtro linear suaviza entre faixas.
    this.bandData = new Uint8Array(FIRE.bands * 4);
    this.bandTargets = new Float32Array(FIRE.bands);
    this.bandSprings = Array.from({ length: FIRE.bands }, () => ({ x: 0, v: 0 }));
    this.bandTexture = new THREE.DataTexture(this.bandData, FIRE.bands, 1, THREE.RGBAFormat);
    this.bandTexture.magFilter = THREE.LinearFilter;
    this.bandTexture.minFilter = THREE.LinearFilter;
    this.bandTexture.needsUpdate = true;
    const bands = {
      uBands: { value: this.bandTexture },
      uBandCount: { value: FIRE.bands },
      uSpectrum: { value: 0 },
    };
    this.spectrumUniform = bands.uSpectrum;

    const colors = {
      uCore: { value: new THREE.Color(FIRE.core) },
      uMid: { value: new THREE.Color(FIRE.mid) },
      uEdge: { value: new THREE.Color(FIRE.edge) },
    };

    this.materials = [];
    this.geometries = [];

    // Cilindro de raio 1; o raio real (e a inclinação) vem do wallVertex. Muitos
    // segmentos na volta para seguir as faixas, e na altura para a dobra no topo.
    const geo = new THREE.CylinderGeometry(1, 1, FIRE.maxHeight, 512, 32, true);
    geo.translate(0, FIRE.maxHeight / 2, 0);
    this.geometries.push(geo);

    // Duas camadas: externa e interna, com sementes diferentes. A base de cada uma
    // fica no seu raio e as paredes inclinam até se encontrarem no raio médio, na
    // altura da chama: o corte das duas forma um triângulo.
    const layers = [{ seed: 0 }, { seed: 7.3 }]; // externa, interna
    // Valores atualizados a cada quadro em `#applyWalls` (painel "Ajustes do fogo").
    this.walls = {
      uApex: { value: 0 },
      uMeet: { value: 1 },
      uMinHeight: { value: 0.02 },
    };
    this.layerRadii = [];
    layers.forEach(({ seed }) => {
      const uRadius = { value: RADIUS };
      this.layerRadii.push(uRadius);
      const mat = additive(
        flameFragment,
        {
          uTime: { value: 0 },
          uLevel: { value: 0 },
          uSeed: { value: seed },
          uRadius,
          ...this.walls,
          ...bands,
          ...colors,
        },
        wallVertex
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; // a caixa do cilindro de raio 1 não cobre o anel deformado
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

  /**
   * Altura por faixa de frequência (0..1 cada, dos graves aos agudos; até `FIRE.bands`).
   * `null` volta para a altura única de `setLevel`. A troca de modo é suave.
   */
  setBands(levels) {
    if (!levels) {
      this.spectrumTarget = 0;
      return;
    }
    this.spectrumTarget = 1;
    const n = Math.min(levels.length, FIRE.bands);
    for (let i = 0; i < n; i++) this.bandTargets[i] = THREE.MathUtils.clamp(levels[i], 0, 1);
  }

  /** Altura que sobe e desce com mola (subida mais rápida que a descida). */
  #spring(state, target, dt) {
    return THREE.MathUtils.clamp(spring(state, target, target > state.x ? FIRE.rise : FIRE.fall, dt), 0, 1);
  }

  /** Lê FIRE.walls (pode mudar ao vivo pelo painel de ajustes). */
  #applyWalls() {
    const { inner, apex, meet, minHeight } = FIRE.walls;
    const [outer, innerR] = this.layerRadii;
    outer.value = RADIUS;
    innerR.value = RADIUS * inner;
    this.walls.uApex.value = RADIUS * (1 + (inner - 1) * apex);
    this.walls.uMeet.value = meet;
    this.walls.uMinHeight.value = minHeight;
  }

  update(dt, time) {
    this.#applyWalls();
    this.spectrum = damp(this.spectrum, this.spectrumTarget, 6, dt);
    this.spectrumUniform.value = this.spectrum;
    if (this.fluid) {
      this.level = this.#spring(this.levelSpring, this.target, dt);
    } else {
      this.level = damp(this.level, this.target, this.response, dt);
      this.levelSpring.x = this.level;
      this.levelSpring.v = 0;
    }
    if (this.spectrum > 0.001) {
      for (let i = 0; i < FIRE.bands; i++) {
        this.bandData[i * 4] = Math.round(this.#spring(this.bandSprings[i], this.bandTargets[i], dt) * 255);
      }
      this.bandTexture.needsUpdate = true;
    }
    for (const mat of this.materials) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uLevel.value = this.level;
    }
    const flicker = 0.85 + 0.15 * Math.sin(time * 13.1) * Math.sin(time * 7.7 + 1.3);
    this.light.intensity = FIRE.lightIntensity * this.level * flicker;
    this.group.visible = this.level > 0.002 || this.spectrum > 0.01;
  }

  dispose() {
    this.group.removeFromParent();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.bandTexture.dispose();
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
