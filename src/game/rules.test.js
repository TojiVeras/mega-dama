import { describe, expect, it } from 'vitest';
import {
  BLACK,
  DRAW_KING_MOVES,
  WHITE,
  applyMove,
  createInitialState,
  getLegalMoves,
  nextLandings,
  resign,
  squareName,
  stateFromPieces,
} from './rules.js';

const names = (moves) =>
  moves.map((m) => [squareName(m.from), ...m.path.map(squareName)].join(m.captures.length ? 'x' : '-')).sort();

describe('posição inicial', () => {
  it('tem 12 peças de cada cor e brancas começam', () => {
    const s = createInitialState();
    expect(s.board.filter((p) => p?.color === WHITE)).toHaveLength(12);
    expect(s.board.filter((p) => p?.color === BLACK)).toHaveLength(12);
    expect(s.turn).toBe(WHITE);
  });

  it('brancas têm 7 lances iniciais', () => {
    expect(getLegalMoves(createInitialState())).toHaveLength(7);
  });
});

describe('pedras', () => {
  it('movem só para frente', () => {
    const s = stateFromPieces({ d4: 'w', h8: 'b' });
    expect(names(getLegalMoves(s))).toEqual(['d4-c5', 'd4-e5']);
  });

  it('capturam para trás', () => {
    const s = stateFromPieces({ d4: 'w', c3: 'b', h8: 'b' });
    expect(names(getLegalMoves(s))).toEqual(['d4xb2']);
  });

  it('captura é obrigatória', () => {
    const s = stateFromPieces({ d4: 'w', a1: 'w', e5: 'b', h8: 'b' });
    expect(names(getLegalMoves(s))).toEqual(['d4xf6']);
  });

  it('lei da maioria: deve capturar o maior número de peças', () => {
    // a1 captura 1 (b2); g3 captura 2 (f4, d6).
    const s = stateFromPieces({ a1: 'w', g3: 'w', b2: 'b', f4: 'b', d6: 'b', h8: 'b' }, WHITE);
    expect(names(getLegalMoves(s))).toEqual(['g3xe5xc7']);
  });

  it('promove ao terminar na última fileira', () => {
    const s = stateFromPieces({ c7: 'w', a1: 'b' });
    const move = getLegalMoves(s).find((m) => squareName(m.path[0]) === 'd8');
    expect(move.promote).toBe(true);
    const next = applyMove(s, move);
    expect(next.board.find((p) => p?.color === WHITE).king).toBe(true);
  });

  it('não promove se passa pela última fileira e continua capturando', () => {
    // b6 captura c7 -> d8, depois e7 -> f6 (para trás).
    const s = stateFromPieces({ b6: 'w', c7: 'b', e7: 'b', a1: 'b' });
    const moves = getLegalMoves(s);
    expect(names(moves)).toEqual(['b6xd8xf6']);
    expect(moves[0].promote).toBe(false);
  });
});

describe('damas', () => {
  it('andam qualquer distância na diagonal', () => {
    const s = stateFromPieces({ a1: 'W', h2: 'b' });
    expect(getLegalMoves(s)).toHaveLength(7);
  });

  it('capturam à distância e escolhem a casa de pouso', () => {
    const s = stateFromPieces({ a1: 'W', d4: 'b', a7: 'b' });
    expect(names(getLegalMoves(s))).toEqual(['a1xe5', 'a1xf6', 'a1xg7', 'a1xh8']);
  });

  it('só podem pousar em casas que permitem continuar a captura máxima', () => {
    // Dama em a1 captura c3 e pode pousar de d4 a h8, mas só em e5 consegue
    // continuar capturando f4 (-> g3), então só e5 é permitido.
    const s = stateFromPieces({ a1: 'W', c3: 'b', f4: 'b', h8: 'b' });
    const moves = getLegalMoves(s);
    expect(moves.every((m) => m.captures.length === 2)).toBe(true);
    expect(nextLandings(moves, 0, []).map(squareName)).toEqual(['e5']);
  });

  it('não salta a mesma peça duas vezes (golpe turco)', () => {
    const s = stateFromPieces({ a1: 'W', c3: 'b', h8: 'b' });
    const moves = getLegalMoves(s);
    expect(moves.every((m) => m.captures.length === 1)).toBe(true);
  });
});

describe('fim de jogo', () => {
  it('vence quem captura todas as peças', () => {
    const s = stateFromPieces({ d4: 'w', e5: 'b' });
    const next = applyMove(s, getLegalMoves(s)[0]);
    expect(next.result).toMatchObject({ type: 'win', winner: WHITE });
  });

  it('vence quem deixa o adversário sem lances', () => {
    // Preta em a8 bloqueada por b7 (branca) que está protegida por c6.
    const s = stateFromPieces({ b7: 'w', c6: 'w', h2: 'w', a8: 'b' }, WHITE);
    const move = getLegalMoves(s).find((m) => squareName(m.from) === 'h2');
    const next = applyMove(s, move);
    expect(next.result).toMatchObject({ type: 'win', winner: WHITE });
  });

  it('empata após lances sucessivos só de damas', () => {
    // Damas em diagonais sem captura possível: brancas vão e voltam h2<->g1, pretas a7<->b8.
    const shuttle = { h2: 'g1', g1: 'h2', a7: 'b8', b8: 'a7' };
    let s = stateFromPieces({ h2: 'W', a7: 'B' });
    for (let i = 0; i < DRAW_KING_MOVES * 2; i++) {
      expect(s.result).toBeNull();
      const m = getLegalMoves(s).find((mv) => shuttle[squareName(mv.from)] === squareName(mv.path[0]));
      s = applyMove(s, m);
    }
    expect(s.result?.type).toBe('draw');
  });

  it('desistência dá a vitória ao adversário sem mexer no tabuleiro', () => {
    const s = createInitialState();
    const next = resign(s);
    expect(next.result).toMatchObject({ type: 'win', winner: BLACK });
    expect(next.board).toEqual(s.board);
    expect(s.result).toBeNull();
    expect(resign(next)).toBe(next); // jogo já terminado: nada muda
  });
});
