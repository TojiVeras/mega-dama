import { describe, expect, it } from 'vitest';
import { FIRE } from '../three/constants.js';
import { applyOverrides, getPath, snapshot, TUNING } from './tuning.js';

describe('tuning', () => {
  it('todo parâmetro do painel existe em FIRE e o padrão está dentro da faixa', () => {
    for (const { items } of TUNING) {
      for (const [path, , min, max] of items) {
        const v = getPath(FIRE, path);
        expect(typeof v, path).toBe('number');
        expect(v, path).toBeGreaterThanOrEqual(min);
        expect(v, path).toBeLessThanOrEqual(max);
      }
    }
  });

  it('applyOverrides limita à faixa e ignora lixo', () => {
    const target = structuredClone(snapshot(FIRE));
    applyOverrides(target, { 'music.low': 99, rise: 'abc', 'naoexiste.x': 1, fall: 20 });
    expect(target.music.low).toBe(0.6);
    expect(target.rise).toBe(FIRE.rise);
    expect(target.fall).toBe(20);
    expect(target.naoexiste).toBeUndefined();
    applyOverrides(target, null); // armazenamento vazio
  });

  it('snapshot agrupa como em FIRE', () => {
    const s = snapshot(FIRE);
    expect(s.music.release).toBe(FIRE.music.release);
    expect(s.spectrum.minHz).toBe(FIRE.spectrum.minHz);
    expect(s.rise).toBe(FIRE.rise);
  });
});
