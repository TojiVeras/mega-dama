import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import demonUrl from '../assets/blood_demon.glb?url';
import { DEMON, TABLE_Y, TRAY } from './constants.js';

// "Blood Demon" de PierreHuot (Sketchfab), CC-BY-4.0.
// O modelo vem segurando um cálice com as duas mãos em concha na frente do peito:
// a bandeja entra no lugar do cálice, apoiada nos dedos, com os polegares por cima.

// Medidas no espaço do modelo (unidades do glTF, +y para cima, +z para a frente),
// tiradas dos vértices da pose de repouso.
const PALM_TOP = 0.0272; // topo dos dedos em concha (fundo da bandeja)
const WRIST_Z = 0.0021; // começo da palma
const FINGERTIP_Z = 0.009; // ponta dos dedos
const HANDS_X = -0.0006; // meio entre as duas mãos

// Peças do modelo que não fazem parte do demônio (cálice, sangue e pedestais).
const HIDDEN = /Calice|Sang|Socle/;

// Ossos que se mexem parados (nenhum deles move os braços, que seguram a bandeja).
// axis: eixo local; amp: amplitude (rad); speed: rad/s; phase: defasagem.
const IDLE = [
  { bone: /Aile_G_1_/, axis: [0, 0, 1], amp: 0.06, speed: 0.9, phase: 0 },
  { bone: /Aile_D_1_/, axis: [0, 0, 1], amp: 0.06, speed: 0.9, phase: 0 },
  { bone: /Aile_[GD]_3_/, axis: [0, 0, 1], amp: 0.04, speed: 0.9, phase: -0.6 },
  { bone: /Queue_\d+_/, axis: [0, 1, 0], amp: 0.035, speed: 0.6, phase: 0, chain: 0.35 },
  { bone: /Tete_/, axis: [0, 0, 1], amp: 0.03, speed: 0.45, phase: 1.3 },
  { bone: /Machoire_/, axis: [0, 0, 1], amp: 0.05, speed: 0.7, phase: 2.1 },
];

/**
 * Carrega o demônio e o posiciona segurando a bandeja pela borda `DEMON.side`.
 * O carregamento é assíncrono: até terminar, a cena fica sem ele.
 */
export class Demon {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'demon';
    this.root.visible = false;
    scene.add(this.root);
    this.idle = [];
    this.ready = new GLTFLoader().loadAsync(demonUrl).then(
      (gltf) => this.setup(gltf.scene),
      (err) => console.warn('Demônio não carregou:', err),
    );
  }

  setup(model) {
    model.traverse((obj) => {
      if (obj.isMesh) {
        if (HIDDEN.test(obj.name) || HIDDEN.test(obj.parent?.name ?? '')) {
          obj.visible = false;
          return;
        }
        obj.frustumCulled = false; // a pose mexe os ossos; a caixa da pose de repouso não serve
        const mat = obj.material;
        if (mat.roughness === 0) mat.roughness = DEMON.roughness;
      }
      if (obj.isBone) {
        const rule = IDLE.find((r) => r.bone.test(obj.name));
        if (rule) {
          const index = rule.chain ? Number(obj.name.match(/Queue_(\d+)_/)[1]) : 0;
          this.idle.push({ bone: obj, rest: obj.quaternion.clone(), axis: new THREE.Vector3(...rule.axis), rule, index });
        }
      }
    });

    const s = DEMON.scale;
    const side = Math.sign(DEMON.side) || -1;
    this.root.add(model);
    this.root.scale.setScalar(s);
    // De frente para o tabuleiro: o +z do modelo aponta para o centro.
    this.root.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    // Ponto da mão que vai na borda da bandeja, levado para o mundo.
    const grip = new THREE.Vector3(HANDS_X, PALM_TOP, WRIST_Z + DEMON.grip * (FINGERTIP_Z - WRIST_Z))
      .multiplyScalar(s)
      .applyEuler(this.root.rotation);
    this.root.position.set(side * TRAY.halfX, TABLE_Y - TRAY.thickness, 0).sub(grip);
    this.root.visible = true;
  }

  update(time) {
    const k = DEMON.breathe;
    const q = new THREE.Quaternion();
    for (const it of this.idle) {
      const r = it.rule;
      const angle = k * r.amp * Math.sin(time * r.speed + r.phase - (r.chain ?? 0) * it.index);
      it.bone.quaternion.copy(it.rest).multiply(q.setFromAxisAngle(it.axis, angle));
    }
  }
}
