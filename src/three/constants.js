import { colOf, rowOf, SIZE } from '../game/rules.js';

// Unidades do mundo: 1 casa = 1 unidade. Tabuleiro centralizado na origem,
// superfície de jogo em y = 0. Brancas ficam do lado +z, pretas do lado -z.
export const FRAME = 0.6;
export const BOARD_THICKNESS = 0.4;
export const TABLE_Y = -BOARD_THICKNESS;
export const BOARD_EXTENT = SIZE / 2 + FRAME;

export const PIECE_RADIUS = 0.38;
export const PIECE_HEIGHT = 0.16;

// Alturas usadas ao arrastar.
export const DRAG_LIFT = 0.12; // altura normal da peça segurada (abaixo do topo de outra peça)
export const FLY_MARGIN = 0.1; // folga acima de uma peça ao sobrevoá-la
export const SELECT_LIFT = 0.12; // peça selecionada por clique

export const COLORS = {
  move: 0x48d6ff,
  capture: 0xff9d2e,
  mustCapture: 0xffc94a,
};

export function squareToWorld(sq) {
  return { x: colOf(sq) - SIZE / 2 + 0.5, z: SIZE / 2 - 0.5 - rowOf(sq) };
}

/** Converte coordenadas do mundo em casa; retorna -1 fora do tabuleiro. */
export function worldToSquare(x, z) {
  const col = Math.floor(x + SIZE / 2);
  const row = Math.floor(SIZE / 2 - z);
  if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return -1;
  return row * SIZE + col;
}

/** Posição de uma peça capturada na pilha lateral de quem capturou. */
export function trayPosition(capturedColor, index) {
  const stack = Math.floor(index / 4);
  const level = index % 4;
  const side = capturedColor === 'b' ? 1 : -1; // pretas capturadas vão para a direita das brancas
  return {
    x: side * (BOARD_EXTENT + 0.75),
    y: TABLE_Y + level * PIECE_HEIGHT,
    z: side * (2.6 - stack * 0.9),
  };
}

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
