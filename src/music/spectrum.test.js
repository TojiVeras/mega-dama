import { describe, expect, it } from 'vitest';
import { bandBins, bandDb, logBands, smoothBands } from './spectrum.js';

describe('logBands', () => {
  it('cobre de minHz a maxHz em bandas contíguas e crescentes', () => {
    const bands = logBands(8, 40, 12000);
    expect(bands).toHaveLength(8);
    expect(bands[0][0]).toBeCloseTo(40);
    expect(bands[7][1]).toBeCloseTo(12000);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i][0]).toBeCloseTo(bands[i - 1][1]);
      expect(bands[i][1] - bands[i][0]).toBeGreaterThan(bands[i - 1][1] - bands[i - 1][0]);
    }
  });
});

describe('bandBins', () => {
  it('toda banda tem ao menos um índice válido e nenhuma usa o índice 0 (DC)', () => {
    const bins = bandBins(logBands(32, 40, 12000), 48000 / 2048, 1024);
    for (const [from, to] of bins) {
      expect(from).toBeGreaterThanOrEqual(1);
      expect(to).toBeGreaterThanOrEqual(from);
      expect(to).toBeLessThan(1024);
    }
    expect(bins.at(-1)[1]).toBeGreaterThan(400); // agudos lá no fim do espectro
  });
});

describe('bandDb', () => {
  it('média de potência: duas metades de -20 dB e -inf dão ~-23 dB', () => {
    const spec = new Float32Array([-200, -20, -200]);
    expect(bandDb(spec, [[1, 1]])[0]).toBeCloseTo(-20);
    expect(bandDb(spec, [[1, 2]])[0]).toBeCloseTo(-23.01, 1);
  });
});

describe('smoothBands', () => {
  it('spread 0 não altera', () => {
    const src = Float32Array.from([0, 1, 0, 1]);
    expect(Array.from(smoothBands(src, 0))).toEqual([0, 1, 0, 1]);
  });

  it('pico isolado vira um morro: vizinhos sobem e o pico desce', () => {
    const src = new Float32Array(16);
    src[8] = 1;
    const out = smoothBands(src, 1.5);
    expect(out[8]).toBeLessThan(0.5);
    expect(out[7]).toBeGreaterThan(0.1);
    expect(out[9]).toBeCloseTo(out[7]);
    expect(out[7]).toBeLessThan(out[8]);
    expect(out[0]).toBeLessThan(0.01);
  });

  it('valor constante continua constante (inclusive nas pontas)', () => {
    const out = smoothBands(new Float32Array(8).fill(0.7), 3);
    for (const v of out) expect(v).toBeCloseTo(0.7);
  });
});
