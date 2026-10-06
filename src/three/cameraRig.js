import * as THREE from 'three';
import { WHITE } from '../game/rules.js';
import { easeInOutCubic } from './constants.js';

const BASE_RADIUS = 12.5;
const BASE_PHI = 0.68; // ângulo a partir da vertical
const PORTRAIT_PHI = 0.42; // em tela em pé, olha mais de cima para usar a altura
const FIT_HALF_WIDTH = 5.1; // meia largura do tabuleiro + margem

/**
 * Posiciona a câmera atrás do jogador da vez e anima a troca de lado
 * orbitando em volta do tabuleiro (coordenadas esféricas).
 */
export class CameraRig {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.anim = null;
  }

  get animating() {
    return this.anim !== null;
  }

  /** Distância que faz o tabuleiro caber na largura da tela, inclusive em celular em pé. */
  fitRadius() {
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const radius = Math.max(BASE_RADIUS, FIT_HALF_WIDTH / Math.tan(hHalf));
    this.controls.maxDistance = Math.max(24, radius * 1.4);
    return radius;
  }

  sphericalFor(color) {
    const phi = this.camera.aspect < 1 ? PORTRAIT_PHI : BASE_PHI;
    return new THREE.Spherical(this.fitRadius(), phi, color === WHITE ? 0 : Math.PI);
  }

  snapTo(color) {
    this.anim = null;
    const s = this.sphericalFor(color);
    this.camera.position.setFromSpherical(s).add(this.controls.target);
    this.camera.lookAt(this.controls.target);
    this.controls.enabled = true;
    this.controls.update();
  }

  goTo(color, duration = 1.4) {
    const from = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    const to = this.sphericalFor(color);
    let dTheta = to.theta - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    if (Math.abs(Math.abs(dTheta) - Math.PI) < 1e-3) dTheta = Math.PI; // meia-volta: sempre no mesmo sentido
    this.controls.enabled = false;
    return new Promise((resolve) => {
      this.anim = { from, dTheta, to, t: 0, duration, resolve };
    });
  }

  update(dt) {
    if (!this.anim) return;
    const a = this.anim;
    a.t = Math.min(1, a.t + dt / a.duration);
    const e = easeInOutCubic(a.t);
    const lift = Math.sin(Math.PI * e);
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(a.from.radius, a.to.radius, e) + lift * 1.2,
      THREE.MathUtils.lerp(a.from.phi, a.to.phi, e) - lift * 0.18,
      a.from.theta + a.dTheta * e,
    );
    this.camera.position.setFromSpherical(s).add(this.controls.target);
    this.camera.lookAt(this.controls.target);
    if (a.t >= 1) {
      this.anim = null;
      this.controls.enabled = true;
      this.controls.update();
      a.resolve();
    }
  }
}
