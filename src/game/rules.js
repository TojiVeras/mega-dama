// Motor de regras da Damas Brasileira (puro, sem dependência de Three.js).
//
// Tabuleiro 8x8, índice = row * 8 + col.
//   row 0 = lado das brancas (embaixo), row 7 = lado das pretas.
//   col 0 = coluna "a". Casa a1 (row 0, col 0) é escura.
// Somente casas escuras ((row + col) % 2 === 0) são jogáveis.
//
// Regras implementadas:
//   - Brancas começam.
//   - Pedra move 1 casa na diagonal para frente; captura para frente e para trás.
//   - Dama é "voadora": anda qualquer distância na diagonal e captura à distância,
//     podendo parar em qualquer casa livre após a peça capturada.
//   - Captura é obrigatória e deve-se capturar o MAIOR número de peças possível
//     (lei da maioria; pedra e dama valem o mesmo).
//   - Peças capturadas só saem do tabuleiro ao fim do lance: não podem ser
//     saltadas duas vezes e bloqueiam o caminho (regra do "golpe turco").
//   - Pedra que passa pela última fileira durante uma captura e continua
//     capturando NÃO é promovida; só promove se terminar o lance lá.
//   - Perde quem não tiver peças ou lances legais.
//   - Empate após DRAW_KING_MOVES lances sucessivos (de cada jogador) só com
//     damas, sem captura e sem movimento de pedra.

export const SIZE = 8;
export const WHITE = 'w';
export const BLACK = 'b';
export const DRAW_KING_MOVES = 20;

const DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export const idx = (row, col) => row * SIZE + col;
export const rowOf = (sq) => Math.floor(sq / SIZE);
export const colOf = (sq) => sq % SIZE;
export const inBounds = (row, col) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;
export const isDark = (sq) => (rowOf(sq) + colOf(sq)) % 2 === 0;
export const opponent = (color) => (color === WHITE ? BLACK : WHITE);
export const forwardOf = (color) => (color === WHITE ? 1 : -1);
export const promotionRow = (color) => (color === WHITE ? SIZE - 1 : 0);

/** Nome algébrico da casa, ex.: 0 -> "a1". */
export const squareName = (sq) => String.fromCharCode(97 + colOf(sq)) + (rowOf(sq) + 1);

/** Estado inicial: 12 pedras de cada lado nas casas escuras das 3 primeiras fileiras. */
export function createInitialState() {
  const board = new Array(SIZE * SIZE).fill(null);
  let nextId = 0;
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const sq = idx(row, col);
      if (!isDark(sq)) continue;
      if (row < 3) board[sq] = { id: nextId++, color: WHITE, king: false };
      else if (row > 4) board[sq] = { id: nextId++, color: BLACK, king: false };
    }
  }
  return { board, turn: WHITE, kingMovesWithoutProgress: 0, result: null };
}

/**
 * Cria um estado a partir de uma descrição simples (útil para testes).
 * pieces: { a1: 'w', c3: 'W', h8: 'b', ... }  (maiúscula = dama)
 */
export function stateFromPieces(pieces, turn = WHITE) {
  const board = new Array(SIZE * SIZE).fill(null);
  let nextId = 0;
  for (const [name, code] of Object.entries(pieces)) {
    const col = name.charCodeAt(0) - 97;
    const row = Number(name.slice(1)) - 1;
    board[idx(row, col)] = {
      id: nextId++,
      color: code.toLowerCase() === 'w' ? WHITE : BLACK,
      king: code === code.toUpperCase(),
    };
  }
  return { board, turn, kingMovesWithoutProgress: 0, result: null };
}

/**
 * Lances legais do jogador da vez.
 * Cada lance: { from, path: [casas de pouso em ordem], captures: [casas capturadas em ordem], promote }
 */
export function getLegalMoves(state) {
  if (state.result) return [];
  const { board, turn } = state;

  let captures = [];
  for (let sq = 0; sq < board.length; sq++) {
    const p = board[sq];
    if (p && p.color === turn) captures.push(...captureSequencesFrom(board, sq));
  }
  if (captures.length > 0) {
    const max = Math.max(...captures.map((m) => m.captures.length));
    return captures.filter((m) => m.captures.length === max);
  }

  const moves = [];
  for (let sq = 0; sq < board.length; sq++) {
    const p = board[sq];
    if (p && p.color === turn) moves.push(...simpleMovesFrom(board, sq));
  }
  return moves;
}

function simpleMovesFrom(board, from) {
  const piece = board[from];
  const r0 = rowOf(from);
  const c0 = colOf(from);
  const moves = [];
  for (const [dr, dc] of DIRS) {
    if (!piece.king && dr !== forwardOf(piece.color)) continue;
    let r = r0 + dr;
    let c = c0 + dc;
    while (inBounds(r, c) && !board[idx(r, c)]) {
      const to = idx(r, c);
      moves.push({ from, path: [to], captures: [], promote: !piece.king && r === promotionRow(piece.color) });
      if (!piece.king) break;
      r += dr;
      c += dc;
    }
  }
  return moves;
}

function captureSequencesFrom(board, from) {
  const piece = board[from];
  const results = [];
  // A peça que se move deixa a casa de origem livre durante o lance.
  const work = board.slice();
  work[from] = null;

  const search = (sq, path, captured) => {
    const r0 = rowOf(sq);
    const c0 = colOf(sq);
    let extended = false;

    for (const [dr, dc] of DIRS) {
      let r = r0 + dr;
      let c = c0 + dc;

      if (piece.king) {
        while (inBounds(r, c) && !work[idx(r, c)]) {
          r += dr;
          c += dc;
        }
      }
      if (!inBounds(r, c)) continue;
      const midSq = idx(r, c);
      const mid = work[midSq];
      if (!mid || mid.color === piece.color || captured.includes(midSq)) continue;

      let lr = r + dr;
      let lc = c + dc;
      while (inBounds(lr, lc) && !work[idx(lr, lc)]) {
        const land = idx(lr, lc);
        extended = true;
        search(land, [...path, land], [...captured, midSq]);
        if (!piece.king) break;
        lr += dr;
        lc += dc;
      }
    }

    if (!extended && captured.length > 0) {
      const last = path[path.length - 1];
      results.push({
        from,
        path,
        captures: captured,
        promote: !piece.king && rowOf(last) === promotionRow(piece.color),
      });
    }
  };

  search(from, [], []);
  return results;
}

/** Aplica um lance completo e devolve um NOVO estado (não muta o original). */
export function applyMove(state, move) {
  const board = state.board.slice();
  const piece = board[move.from];
  const to = move.path[move.path.length - 1];

  board[move.from] = null;
  for (const sq of move.captures) board[sq] = null;
  board[to] = move.promote ? { ...piece, king: true } : piece;

  const kingOnlyMove = piece.king && move.captures.length === 0;
  const next = {
    board,
    turn: opponent(state.turn),
    kingMovesWithoutProgress: kingOnlyMove ? state.kingMovesWithoutProgress + 1 : 0,
    result: null,
  };

  if (next.kingMovesWithoutProgress >= DRAW_KING_MOVES * 2) {
    next.result = { type: 'draw', reason: `${DRAW_KING_MOVES} lances de damas sem captura` };
  } else if (getLegalMoves(next).length === 0) {
    const hasPieces = board.some((p) => p && p.color === next.turn);
    next.result = {
      type: 'win',
      winner: state.turn,
      reason: hasPieces ? 'adversário sem lances' : 'todas as peças capturadas',
    };
  }
  return next;
}

/**
 * Para a interação passo a passo: dado um prefixo de casas já percorridas por
 * uma peça, retorna os lances legais compatíveis.
 */
export function movesMatchingPrefix(moves, from, prefix) {
  return moves.filter(
    (m) => m.from === from && m.path.length >= prefix.length && prefix.every((sq, i) => m.path[i] === sq),
  );
}

/** Próximas casas de pouso possíveis após o prefixo (sem duplicatas). */
export function nextLandings(moves, from, prefix) {
  const set = new Set();
  for (const m of movesMatchingPrefix(moves, from, prefix)) {
    if (m.path.length > prefix.length) set.add(m.path[prefix.length]);
  }
  return [...set];
}

/** O jogador da vez desiste: devolve um NOVO estado com a vitória do adversário. */
export function resign(state) {
  if (state.result) return state;
  const reason = state.turn === WHITE ? 'brancas desistiram' : 'pretas desistiram';
  return { ...state, result: { type: 'win', winner: opponent(state.turn), reason } };
}

export function countPieces(state, color) {
  return state.board.filter((p) => p && p.color === color).length;
}
