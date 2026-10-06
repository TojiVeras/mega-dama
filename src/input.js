import * as THREE from 'three';
import { BOARD_EXTENT, DRAG_LIFT, SELECT_LIFT, worldToSquare } from './three/constants.js';

const CLICK_TOLERANCE_PX = 6;

/**
 * Mouse/toque: passar por cima destaca a peça, segurar e arrastar move a peça
 * livremente até a casa desejada. Também funciona com clique na peça + clique na casa.
 */
export class InputController {
  constructor({ canvas, camera, pieces, game }) {
    this.canvas = canvas;
    this.camera = camera;
    this.pieces = pieces;
    this.game = game;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();

    this.hovered = null;
    this.selected = null; // seleção por clique
    this.drag = null;

    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', () => this.setHovered(null));
  }

  setRay(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  pieceUnderPointer() {
    const hits = this.raycaster.intersectObjects(this.pieces.meshes(), true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pieceView) o = o.parent;
      if (o) return o.userData.pieceView;
    }
    return null;
  }

  pointOnPlane(height) {
    this.plane.constant = -height;
    return this.raycaster.ray.intersectPlane(this.plane, this.hit) ? this.hit : null;
  }

  setHovered(view) {
    if (this.hovered === view) return;
    if (this.hovered && this.hovered !== this.drag?.view) this.hovered.hoverTarget = 0;
    this.hovered = view;
    if (view) view.hoverTarget = 1;
  }

  /** Atualiza brilhos: peça arrastada > selecionada > travada em captura > sob o mouse. */
  updateTargets(hotSquare = -1) {
    const focus = this.drag?.view ?? this.selected ?? this.game.lockedView ?? (this.hovered && this.game.canPick(this.hovered) ? this.hovered : null);
    if (!this.game.canInteract && !this.drag) {
      this.game.showTargets(null);
      return;
    }
    this.game.showTargets(focus, hotSquare);
  }

  onMove = (event) => {
    this.setRay(event);

    if (this.drag && event.pointerId === this.drag.pointerId) {
      const d = this.drag;
      if (!d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) > CLICK_TOLERANCE_PX) {
        d.moved = true;
        this.selected = null;
        this.game.suppressRings(true);
      }
      if (!d.moved) return;
      const p = this.pointOnPlane(DRAG_LIFT);
      if (!p) return;
      const lim = BOARD_EXTENT + 0.2;
      const x = THREE.MathUtils.clamp(p.x + d.offset.x, -lim, lim);
      const z = THREE.MathUtils.clamp(p.z + d.offset.z, -lim, lim);
      d.view.follow = { x, y: this.game.dragHeight(d.view, x, z), z };
      d.target = { x, z };
      this.updateTargets(worldToSquare(x, z));
      return;
    }

    if (this.drag) return;
    const view = this.pieceUnderPointer();
    const own = view && !view.inTray && view.color === this.game.turn && this.game.canInteract ? view : null;
    this.setHovered(own);
    this.canvas.style.cursor = own && this.game.canPick(own) ? 'grab' : 'default';
    this.updateTargets();
  };

  onDown = (event) => {
    if (event.button !== 0 || this.drag) return;
    this.setRay(event);
    if (!this.game.canInteract) return;

    const view = this.pieceUnderPointer();
    if (view && this.game.canPick(view)) {
      if (this.selected && this.selected !== view) this.deselect();
      const p = this.pointOnPlane(DRAG_LIFT);
      this.drag = {
        view,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        offset: p ? { x: view.position.x - p.x, z: view.position.z - p.z } : { x: 0, z: 0 },
        target: null,
      };
      view.tween = null;
      view.hoverTarget = 1;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.style.cursor = 'grabbing';
      // Levanta a peça imediatamente ao segurar.
      view.follow = { x: view.position.x, y: DRAG_LIFT, z: view.position.z };
      this.updateTargets();
      return;
    }

    // Clique numa casa com uma peça selecionada.
    const active = this.selected ?? this.game.lockedView;
    if (active) {
      const p = this.pointOnPlane(0);
      const sq = p ? worldToSquare(p.x, p.z) : -1;
      if (sq >= 0 && this.game.landingsFor(active).has(sq)) {
        this.selected = null;
        this.commit(active, sq, false);
      } else if (this.selected) {
        this.deselect();
      }
    }
  };

  onUp = (event) => {
    const d = this.drag;
    if (!d || event.pointerId !== d.pointerId) return;
    this.drag = null;
    this.game.suppressRings(false);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.canvas.style.cursor = 'grab';
    const view = d.view;

    if (!d.moved) {
      // Clique simples: alterna seleção.
      if (this.selected === view) {
        this.deselect();
      } else {
        if (this.selected) this.deselect();
        this.selected = view;
        view.follow = { x: view.position.x, y: SELECT_LIFT, z: view.position.z };
        this.updateTargets();
      }
      return;
    }

    view.follow = null;
    const pos = d.target ?? view.position;
    const sq = worldToSquare(pos.x, pos.z);
    if (sq === this.game.squareOf(view) || sq < 0) {
      this.game.returnPiece(view).then(() => this.updateTargets());
    } else {
      this.commit(view, sq, true);
    }
  };

  onCancel = (event) => {
    const d = this.drag;
    if (!d || event.pointerId !== d.pointerId) return;
    this.drag = null;
    this.game.suppressRings(false);
    d.view.follow = null;
    this.game.returnPiece(d.view);
  };

  deselect() {
    const view = this.selected;
    this.selected = null;
    if (view && !this.game.busy) {
      view.follow = null;
      this.game.returnPiece(view);
    }
    this.updateTargets();
  }

  async commit(view, sq, fromDrag) {
    view.hoverTarget = 0;
    this.game.showTargets(null);
    await this.game.step(view, sq, { fromDrag });
    if (this.hovered && this.hovered.color !== this.game.turn) this.setHovered(null);
    this.updateTargets();
  }

  /** Chamado quando o estado muda por fora (novo jogo, desfazer). */
  reset() {
    this.drag = null;
    this.game.suppressRings(false);
    this.selected = null;
    this.hovered = null;
    this.canvas.style.cursor = 'default';
  }
}
