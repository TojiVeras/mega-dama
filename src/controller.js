import {
  applyMove,
  countPieces,
  createInitialState,
  getLegalMoves,
  movesMatchingPrefix,
  nextLandings,
  opponent,
} from './game/rules.js';
import { DRAG_LIFT, FLY_MARGIN, easeOutCubic, squareToWorld, trayPosition } from './three/constants.js';

/**
 * Orquestra o jogo: guarda o estado das regras, o histórico (desfazer), o
 * lance em andamento (capturas múltiplas passo a passo) e sincroniza peças,
 * brilhos, câmera e HUD.
 */
export class GameController {
  constructor({ pieces, glow, rig, hud }) {
    this.pieces = pieces;
    this.glow = glow;
    this.rig = rig;
    this.hud = hud;
    this.autoCamera = true;
    this.busy = false;
    this.newGame(false);
  }

  newGame(animateCamera = true) {
    this.state = createInitialState();
    this.history = [];
    this.pending = null;
    this.rebuildViews();
    this.refresh();
    if (animateCamera) this.turnCamera();
    else this.rig.snapTo(this.state.turn);
  }

  // ---------- consultas usadas pela interação ----------

  get turn() {
    return this.state.turn;
  }

  get canInteract() {
    return !this.busy && !this.state.result && !this.rig.animating;
  }

  /** Casa atual de uma peça, considerando um lance de captura em andamento. */
  squareOf(view) {
    if (this.pending && this.pending.pieceId === view.id) {
      const { from, prefix } = this.pending;
      return prefix.length ? prefix[prefix.length - 1] : from;
    }
    return this.state.board.findIndex((p) => p && p.id === view.id);
  }

  canPick(view) {
    if (!this.canInteract || view.inTray || view.color !== this.turn) return false;
    if (this.pending && this.pending.pieceId !== view.id) return false;
    return this.landingsFor(view).size > 0;
  }

  /** Map<casa, 'move'|'capture'> das próximas casas válidas para a peça. */
  landingsFor(view) {
    const result = new Map();
    const sq = this.squareOf(view);
    if (sq < 0 || view.color !== this.turn) return result;
    const from = this.pending ? this.pending.from : sq;
    const prefix = this.pending ? this.pending.prefix : [];
    if (this.pending && this.pending.pieceId !== view.id) return result;
    for (const m of movesMatchingPrefix(this.legal, from, prefix)) {
      if (m.path.length > prefix.length) result.set(m.path[prefix.length], m.captures.length ? 'capture' : 'move');
    }
    return result;
  }

  /** Mostra os brilhos das casas possíveis para a peça (ou limpa, se null). */
  showTargets(view, hotSquare = -1) {
    this.glow.setTargets(view ? this.landingsFor(view) : new Map(), hotSquare);
  }

  /** Peça travada no meio de uma captura múltipla (deve continuar se movendo). */
  get lockedView() {
    return this.pending ? this.pieces.get(this.pending.pieceId) : null;
  }

  obstacleHeightAt = (x, z, self) => this.pieces.obstacleHeightAt(x, z, self);

  // ---------- ações ----------

  /** Peça volta para a casa atual (lance inválido). */
  async returnPiece(view) {
    const { x, z } = squareToWorld(this.squareOf(view));
    await view.moveTo({ x, y: 0, z }, { duration: 0.35, obstacleHeightAt: this.obstacleHeightAt, ease: easeOutCubic });
  }

  /**
   * Executa um passo do lance: a peça vai para `to`. Se for captura e ainda
   * houver capturas obrigatórias, a peça fica travada esperando o próximo passo.
   */
  async step(view, to, { fromDrag = false } = {}) {
    const landings = this.landingsFor(view);
    if (!landings.has(to)) {
      if (this.legal.some((m) => m.captures.length) ) this.hud.flash('Captura obrigatória — e sempre do maior número de peças!');
      await this.returnPiece(view);
      return false;
    }

    this.busy = true;
    this.glow.setTargets(new Map());
    this.glow.setRings(new Set());

    const from = this.pending ? this.pending.from : this.squareOf(view);
    const prefix = this.pending ? [...this.pending.prefix, to] : [to];
    const candidates = movesMatchingPrefix(this.legal, from, prefix);
    const captureSq = candidates[0].captures[prefix.length - 1];

    const { x, z } = squareToWorld(to);
    await view.moveTo(
      { x, y: 0, z },
      {
        duration: fromDrag ? 0.22 : 0.5,
        minArc: fromDrag ? 0 : 0.2,
        obstacleHeightAt: this.obstacleHeightAt,
        ease: fromDrag ? easeOutCubic : undefined,
      },
    );

    if (captureSq !== undefined) {
      const captured = this.pieces.get(this.state.board[captureSq].id);
      captured.marked = true;
    }

    const complete = candidates.find((m) => m.path.length === prefix.length);
    if (complete) {
      await this.finishMove(complete);
    } else {
      this.pending = { pieceId: view.id, from, prefix };
      this.busy = false;
      this.refresh();
    }
    return true;
  }

  async finishMove(move) {
    this.busy = true;
    this.pending = null;
    const mover = this.pieces.get(this.state.board[move.from].id);

    // Peças capturadas voam para a pilha lateral de quem capturou.
    const capturedColor = opponent(this.turn);
    let trayIndex = 12 - countPieces(this.state, capturedColor);
    const flights = move.captures.map((sq, i) => {
      const view = this.pieces.get(this.state.board[sq].id);
      const target = trayPosition(capturedColor, trayIndex++);
      return new Promise((resolve) => setTimeout(resolve, i * 90)).then(() => {
        view.marked = false;
        view.inTray = true;
        view.setKing(false, false);
        return view.moveTo(target, { duration: 0.7, minArc: 1.4 });
      });
    });
    await Promise.all(flights);

    if (move.promote) {
      mover.setKing(true, true);
      this.hud.flash('Dama!');
      await new Promise((r) => setTimeout(r, 450));
    }

    this.history.push(this.state);
    this.state = applyMove(this.state, move);
    this.refresh();

    if (this.state.result) {
      this.busy = false;
      this.hud.showResult(this.state.result);
      return;
    }
    await this.turnCamera();
    this.busy = false;
    this.refresh();
  }

  async turnCamera() {
    if (this.autoCamera) await this.rig.goTo(this.turn);
  }

  async undo() {
    if (this.busy || this.rig.animating) return;
    if (this.pending) {
      // Cancela a captura múltipla em andamento.
      this.pending = null;
      this.rebuildViews();
      this.refresh();
      return;
    }
    if (!this.history.length) return;
    this.state = this.history.pop();
    this.hud.hideResult();
    this.rebuildViews();
    this.refresh();
    this.busy = true;
    await this.turnCamera();
    this.busy = false;
    this.refresh();
  }

  /** Esconde os anéis de captura obrigatória enquanto uma peça é arrastada. */
  suppressRings(on) {
    this.ringsSuppressed = on;
    this.glow.setRings(on || !this.rings ? new Set() : this.rings);
  }

  setAutoCamera(on) {
    this.autoCamera = on;
    if (on && this.canInteract) this.rig.goTo(this.turn);
  }

  // ---------- sincronização ----------

  rebuildViews() {
    this.pieces.clear();
    this.state.board.forEach((p, sq) => {
      if (p) this.pieces.add(p, sq);
    });
    // Recria as pilhas de peças capturadas.
    let nextId = 1000;
    for (const color of ['w', 'b']) {
      const missing = 12 - countPieces(this.state, color);
      for (let i = 0; i < missing; i++) {
        const view = this.pieces.add({ id: nextId++, color, king: false }, 0);
        const t = trayPosition(color, i);
        view.position.set(t.x, t.y, t.z);
        view.prev.copy(view.position);
        view.inTray = true;
      }
    }
  }

  refresh() {
    this.legal = getLegalMoves(this.state);
    const mustCapture = this.legal.some((m) => m.captures.length > 0);

    const rings = new Set();
    if (mustCapture && !this.busy && !this.state.result) {
      if (this.pending) {
        const { prefix } = this.pending;
        rings.add(prefix[prefix.length - 1]);
      } else {
        for (const m of this.legal) rings.add(m.from);
      }
    }
    this.rings = rings;
    this.glow.setRings(this.ringsSuppressed ? new Set() : rings);

    const lock = this.lockedView;
    this.showTargets(lock && !this.busy ? lock : null);

    this.hud.update({
      turn: this.turn,
      white: countPieces(this.state, 'w'),
      black: countPieces(this.state, 'b'),
      mustCapture: mustCapture && !this.state.result,
      maxCaptures: mustCapture ? this.legal[0].captures.length : 0,
      continuing: !!this.pending,
      canUndo: this.history.length > 0 || !!this.pending,
      kingMoves: this.state.kingMovesWithoutProgress,
    });
  }

  /** Posição alvo de uma peça sendo arrastada, subindo por cima de outras peças. */
  dragHeight(view, x, z) {
    const below = Math.max(this.obstacleHeightAt(x, z, view), this.obstacleHeightAt(view.position.x, view.position.z, view));
    return Math.max(DRAG_LIFT, below > 0 ? below + FLY_MARGIN : 0);
  }
}
