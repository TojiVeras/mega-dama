import { DRAW_KING_MOVES, WHITE } from './game/rules.js';

const NAMES = { w: 'Brancas', b: 'Pretas' };
const $ = (id) => document.getElementById(id);

/** Interface HTML sobreposta ao canvas. */
export class Hud {
  constructor({ onNewGame, onUndo, onResign, onToggleCamera }) {
    this.turnEl = $('turn');
    this.turnLabel = $('turn-label');
    this.whiteCount = $('count-w');
    this.blackCount = $('count-b');
    this.hint = $('hint');
    this.toast = $('toast');
    this.undoBtn = $('btn-undo');
    this.result = $('result');
    this.lightningEl = $('lightning-flash');
    this.flashTimer = null;

    $('btn-new').addEventListener('click', () => {
      if (confirm('Começar um novo jogo?')) onNewGame();
    });
    $('btn-again').addEventListener('click', onNewGame);
    this.undoBtn.addEventListener('click', onUndo);
    this.resignBtn = $('btn-resign');
    this.resignBtn.addEventListener('click', () => {
      if (confirm(`As ${NAMES[this.turnEl.dataset.color]} desistem da partida?`)) onResign();
    });
    $('btn-rules').addEventListener('click', () => $('rules').showModal());
    $('btn-close-rules').addEventListener('click', () => $('rules').close());
    $('btn-camera').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      onToggleCamera(on);
    });
    $('draw-moves').textContent = DRAW_KING_MOVES;
  }

  update({ turn, white, black, mustCapture, maxCaptures, continuing, canUndo, over, kingMoves }) {
    this.turnEl.dataset.color = turn;
    this.turnLabel.textContent = `Vez das ${NAMES[turn]}`;
    this.whiteCount.textContent = white;
    this.blackCount.textContent = black;
    this.undoBtn.disabled = !canUndo;
    this.resignBtn.disabled = over;

    let hint = '';
    if (continuing) hint = 'Continue capturando com a mesma peça';
    else if (mustCapture)
      hint = maxCaptures > 1 ? `Captura obrigatória: ${maxCaptures} peças` : 'Captura obrigatória';
    else if (kingMoves >= 10) hint = `Lances só de damas: ${Math.floor(kingMoves / 2)}/${DRAW_KING_MOVES} para empate`;
    this.hint.textContent = hint;
    this.hint.hidden = !hint;
  }

  flash(message) {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.toast.classList.remove('show'), 1800);
  }

  /** Clarão branco-azulado na tela inteira e tremida rápida (raio). */
  lightningFlash() {
    for (const [el, cls] of [
      [this.lightningEl, 'strike'],
      [$('app'), 'shake'],
    ]) {
      el.classList.remove(cls);
      void el.offsetWidth; // reinicia a animação CSS
      el.classList.add(cls);
    }
  }

  showResult(result) {
    $('result-title').textContent = result.type === 'draw' ? 'Empate!' : `${NAMES[result.winner]} vencem!`;
    $('result-reason').textContent = result.reason[0].toUpperCase() + result.reason.slice(1);
    this.result.dataset.winner = result.type === 'draw' ? 'draw' : result.winner === WHITE ? 'w' : 'b';
    this.result.hidden = false;
  }

  hideResult() {
    this.result.hidden = true;
  }
}
