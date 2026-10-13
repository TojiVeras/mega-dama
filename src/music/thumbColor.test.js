import { describe, expect, it } from 'vitest';
import { dominantHue, firePalette } from './thumbColor.js';

/** Pixels RGBA: `[cor, quantidade]` em sequência. */
function pixels(...groups) {
  return groups.flatMap(([rgb, n]) => Array.from({ length: n }, () => [...rgb, 255]).flat());
}

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

describe('dominantHue', () => {
  it('acha o matiz de uma imagem de uma cor só', () => {
    expect(dominantHue(pixels([[0, 0, 255], 50]))).toBeCloseTo(2 / 3, 2);
    expect(dominantHue(pixels([[0, 255, 0], 50]))).toBeCloseTo(1 / 3, 2);
  });

  it('vermelho fica em volta do zero (matiz é circular)', () => {
    const hue = dominantHue(pixels([[255, 0, 20], 30], [[255, 20, 0], 30]));
    expect(Math.min(hue, 1 - hue)).toBeLessThan(0.02);
  });

  it('ignora preto, branco e cinza, mesmo sendo maioria', () => {
    const data = pixels([[0, 0, 0], 60], [[255, 255, 255], 20], [[120, 120, 120], 10], [[0, 0, 255], 10]);
    expect(dominantHue(data)).toBeCloseTo(2 / 3, 2);
  });

  it('entre duas cores, fica com a que mais aparece', () => {
    expect(dominantHue(pixels([[255, 0, 0], 20], [[0, 255, 0], 30]))).toBeCloseTo(1 / 3, 2);
  });

  it('devolve null sem cor (preto e branco, vazio)', () => {
    expect(dominantHue(pixels([[0, 0, 0], 50], [[200, 200, 200], 50]))).toBeNull();
    expect(dominantHue([])).toBeNull();
  });
});

describe('firePalette', () => {
  it('no laranja fica perto do fogo padrão', () => {
    const [r, g, b] = rgb(firePalette(29 / 360).mid);
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(100);
    expect(g).toBeLessThan(170);
    expect(b).toBeLessThan(60);
  });

  it('segue o matiz e clareia da borda para o miolo', () => {
    const { core, mid, edge } = firePalette(2 / 3);
    const sum = (hex) => rgb(hex).reduce((a, c) => a + c, 0);
    expect(rgb(mid)[2]).toBe(255);
    expect(rgb(mid)[2]).toBeGreaterThan(rgb(mid)[0]);
    expect(sum(core)).toBeGreaterThan(sum(mid));
    expect(sum(mid)).toBeGreaterThan(sum(edge));
  });
});
