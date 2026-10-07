import { describe, expect, it } from 'vitest';
import { spring } from './constants.js';

describe('spring', () => {
  it('chega no alvo sem passar do ponto', () => {
    const s = { x: 0, v: 0 };
    let max = 0;
    for (let i = 0; i < 120; i++) max = Math.max(max, spring(s, 1, 16, 1 / 60));
    expect(s.x).toBeCloseTo(1, 3);
    expect(max).toBeLessThanOrEqual(1.0001);
  });

  it('é contínua: mudar o alvo não dá salto na posição', () => {
    const s = { x: 0, v: 0 };
    for (let i = 0; i < 10; i++) spring(s, 1, 16, 1 / 60);
    const before = s.x;
    spring(s, 0, 7, 1 / 60);
    expect(Math.abs(s.x - before)).toBeLessThan(0.05);
  });

  it('fica estável com quadro longo', () => {
    const s = { x: 0, v: 0 };
    spring(s, 1, 16, 0.5);
    expect(s.x).toBeGreaterThan(0.9);
    expect(s.x).toBeLessThan(1.01);
  });
});
