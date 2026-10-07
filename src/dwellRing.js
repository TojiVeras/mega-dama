import * as THREE from 'three';
import { squareToWorld } from './three/constants.js';

const R = 44; // raio do círculo no viewBox
const LENGTH = 2 * Math.PI * R;

/**
 * Relógio HTML sobre uma casa do tabuleiro: o arco se completa conforme `progress`
 * vai de 0 a 1 (confirmação de pouso intermediário ao arrastar).
 */
export class DwellRing {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.v = new THREE.Vector3();
    this.el = document.createElement('div');
    this.el.className = 'dwell-ring';
    this.el.hidden = true;
    this.el.innerHTML = `
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="track" cx="50" cy="50" r="${R}" />
        <circle class="arc" cx="50" cy="50" r="${R}" stroke-dasharray="${LENGTH}" />
      </svg>`;
    this.arc = this.el.querySelector('.arc');
    document.body.appendChild(this.el);
  }

  /** Mostra o relógio na casa `sq` com o arco em `progress` (0..1). */
  show(sq, progress) {
    const { x, z } = squareToWorld(sq);
    const rect = this.canvas.getBoundingClientRect();
    const a = this.project(x - 0.5, z, rect);
    const b = this.project(x + 0.5, z, rect);
    const c = this.project(x, z, rect);
    const size = Math.max(48, Math.hypot(b.x - a.x, b.y - a.y) * 1.15);
    const s = this.el.style;
    s.left = `${c.x}px`;
    s.top = `${c.y}px`;
    s.width = s.height = `${size}px`;
    this.arc.style.strokeDashoffset = String(LENGTH * (1 - progress));
    this.el.classList.remove('done');
    this.el.hidden = false;
  }

  /** Pulso de confirmação e some. */
  complete() {
    this.arc.style.strokeDashoffset = '0';
    this.el.classList.add('done');
    clearTimeout(this.doneTimer);
    this.doneTimer = setTimeout(() => this.hide(), 320);
  }

  hide() {
    clearTimeout(this.doneTimer);
    this.el.classList.remove('done');
    this.el.hidden = true;
  }

  project(x, z, rect) {
    this.v.set(x, 0, z).project(this.camera);
    return { x: rect.left + ((this.v.x + 1) / 2) * rect.width, y: rect.top + ((1 - this.v.y) / 2) * rect.height };
  }
}
