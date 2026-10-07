import { describe, expect, it } from 'vitest';
import { DelayLine, expCurve, LevelTracker, rmsDb } from './level.js';

const DT = 1 / 60;

function run(tracker, db, seconds) {
  let level = 0;
  for (let t = 0; t < seconds; t += DT) level = tracker.push(db, DT);
  return level;
}

describe('LevelTracker', () => {
  it('silêncio e ruído baixo deixam o fogo apagado', () => {
    const tr = new LevelTracker();
    expect(run(tr, -Infinity, 1)).toBe(0);
    expect(run(tr, -90, 1)).toBe(0);
  });

  it('batida vai ao máximo no mesmo quadro e cai em poucos quadros', () => {
    const tr = new LevelTracker();
    run(tr, -20, 1);
    run(tr, -35, 0.5);
    expect(tr.push(-20, DT)).toBe(1); // ataque instantâneo
    const after = run(tr, -35, 0.3);
    expect(after).toBeLessThan(0.1); // já desceu para o vale entre as batidas
  });

  it('música comprimida (pouca variação) usa a barra toda', () => {
    const tr = new LevelTracker({ release: 1000 });
    const seen = [];
    // Volume oscilando só 4 dB em torno de -14 dB, como música moderna.
    for (let t = 0; t < 10; t += DT) seen.push(tr.push(-14 + 2 * Math.sin(t * 2 * Math.PI * 2), DT));
    const last = seen.slice(-120);
    expect(Math.max(...last)).toBeGreaterThan(0.9);
    expect(Math.min(...last)).toBeLessThan(0.2);
    // Média no meio da barra, não grudada em cima.
    const mean = last.reduce((a, b) => a + b, 0) / last.length;
    expect(mean).toBeGreaterThan(0.25);
    expect(mean).toBeLessThan(0.75);
  });

  it('verso baixo, refrão alto e instrumental ficam em alturas diferentes', () => {
    const tr = new LevelTracker({ release: 1000 });
    // Música de 2 min: instrumental (-24 dB), canto baixo (-19 dB), canto alto (-14 dB),
    // cada trecho com vários segundos e pequenas variações (batida).
    const sections = [
      ['instr', -24, 8],
      ['baixo', -19, 6],
      ['alto', -14, 6],
    ];
    const sums = { instr: [0, 0], baixo: [0, 0], alto: [0, 0] };
    let t = 0;
    for (let rep = 0; rep < 6; rep++) {
      for (const [name, db, secs] of sections) {
        for (let k = 0; k < secs; k += DT, t += DT) {
          const x = tr.push(db + 1.5 * Math.sin(t * 2 * Math.PI * 2), DT);
          if (rep >= 2) {
            sums[name][0] += x;
            sums[name][1]++;
          }
        }
      }
    }
    const mean = (name) => sums[name][0] / sums[name][1];
    expect(mean('instr')).toBeLessThan(mean('baixo') - 0.15);
    expect(mean('baixo')).toBeLessThan(mean('alto') - 0.15);
    expect(mean('baixo')).toBeLessThan(0.8); // cantar baixo não satura
    expect(mean('alto')).toBeGreaterThan(0.75);
  });

  it('não "respira": o mesmo padrão repetido dá a mesma altura', () => {
    const tr = new LevelTracker();
    const bar = () => {
      run(tr, -12, 0.1);
      return run(tr, -24, 0.4);
    };
    bar();
    bar();
    const a = bar();
    const b = bar();
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });

  it('valores inválidos não quebram', () => {
    const tr = new LevelTracker();
    expect(tr.push(NaN, DT)).toBe(0);
    expect(tr.push(undefined, -1)).toBe(0);
  });
});

describe('DelayLine', () => {
  it('devolve o valor com o atraso pedido', () => {
    const d = new DelayLine();
    const out = [];
    for (let i = 0; i <= 10; i++) out.push(d.push(i * 0.01, i, 0.03));
    expect(out.slice(0, 3)).toEqual([0, 0, 0]);
    expect(out[3]).toBe(0);
    expect(out[10]).toBe(7);
  });

  it('sem atraso devolve o valor atual', () => {
    const d = new DelayLine();
    d.push(0, 1, 0);
    expect(d.push(0.016, 5, 0)).toBe(5);
  });
});

describe('expCurve', () => {
  it('mantém as pontas e cresce pouco no começo, muito no final', () => {
    expect(expCurve(0, 3)).toBe(0);
    expect(expCurve(1, 3)).toBeCloseTo(1);
    expect(expCurve(0.5, 3)).toBeLessThan(0.25);
    expect(expCurve(1, 3) - expCurve(0.9, 3)).toBeGreaterThan(expCurve(0.1, 3) - expCurve(0, 3));
  });

  it('k = 0 é linear', () => {
    expect(expCurve(0.3, 0)).toBe(0.3);
  });

  it('LevelTracker aplica a curva', () => {
    const linear = new LevelTracker();
    const curved = new LevelTracker({ curve: 3 });
    linear.push(-20, DT);
    curved.push(-20, DT);
    const a = linear.push(-30, DT);
    const b = curved.push(-30, DT);
    expect(b).toBeCloseTo(expCurve(a, 3));
    expect(b).toBeLessThan(a);
  });
});

describe('rmsDb', () => {
  const sine = (amp, hz, n = 2048, rate = 48000) =>
    Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

  it('senoide cheia dá -3 dB e metade da amplitude dá -6 dB a menos', () => {
    expect(rmsDb(sine(1, 50, 1920))).toBeCloseTo(-3.01, 1); // 2 ciclos inteiros
    expect(rmsDb(sine(0.5, 50)) - rmsDb(sine(1, 50))).toBeCloseTo(-6.02, 1);
  });

  it('é estável para graves: janelas deslocadas dão quase o mesmo valor', () => {
    const long = sine(0.8, 50, 4096);
    const a = rmsDb(long.subarray(0, 2048));
    const b = rmsDb(long.subarray(333, 333 + 2048));
    expect(Math.abs(a - b)).toBeLessThan(0.3);
  });

  it('silêncio dá um valor muito baixo, não -Infinity', () => {
    expect(rmsDb(new Float32Array(16))).toBe(-120);
  });
});
