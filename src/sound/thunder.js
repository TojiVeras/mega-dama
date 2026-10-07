import { noiseBuffer, unlockAudio } from './audio.js';

/**
 * Som de raio sintetizado com Web Audio (sem arquivos): estalo agudo no impacto,
 * estrondo grave logo em seguida e um trovão que rola e some.
 */
export class ThunderSound {
  constructor({ volume = 0.8 } = {}) {
    this.volume = volume;
    this.ctx = null;
  }

  /** Cria/retoma o AudioContext. Chame dentro de um gesto do usuário (o navegador exige). */
  unlock() {
    const ctx = unlockAudio();
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.white = noiseBuffer(ctx, 2);
    this.brown = noiseBuffer(ctx, 5, true);
    this.out = ctx.createDynamicsCompressor();
    this.out.threshold.value = -14;
    this.out.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.out.connect(this.master).connect(ctx.destination);
  }

  /**
   * Ruído filtrado com envelope; `env` = [[tempo, ganho], ...] a partir de `t0`.
   * `offset` (0..1) escolhe o trecho do ruído, para cada raio soar diferente.
   */
  burst(buffer, t0, filter, env, offset = 0) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    f.Q.value = filter.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    for (const [t, v] of env) g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0001), t0 + t);
    src.connect(f).connect(g).connect(this.out);
    const end = env[env.length - 1][0];
    src.start(t0, offset * Math.max(0, buffer.duration - end - 0.1));
    src.stop(t0 + end + 0.05);
    return f;
  }

  /** Toca o raio. `delay` em segundos (ex.: sincronizar com o impacto visual). */
  play(delay = 0) {
    this.unlock();
    const { ctx } = this;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const r = (a, b) => a + Math.random() * (b - a);

    // Estalo: ruído branco agudo, curtíssimo, com algumas re-descargas.
    for (let i = 0; i < 4; i++) {
      const t = t0 + (i === 0 ? 0 : r(0.02, 0.16));
      const peak = i === 0 ? 1 : r(0.25, 0.55);
      this.burst(this.white, t, { type: 'highpass', freq: r(1200, 2600) }, [
        [0.003, peak],
        [r(0.08, 0.18), 0.001],
      ], Math.random());
    }

    // Estrondo: grave forte logo depois do estalo.
    this.burst(this.brown, t0 + 0.01, { type: 'lowpass', freq: 420 }, [
      [0.015, 1.6],
      [0.35, 0.5],
      [1.2, 0.001],
    ], Math.random());

    // Trovão rolando: grave abafado que oscila e some devagar.
    const rumbleEnv = [[0.25, 0.5]];
    let t = 0.25;
    while (t < 3) {
      t += r(0.12, 0.3);
      rumbleEnv.push([t, r(0.25, 1.1) * Math.exp(-(t - 0.25) * 1.1)]);
    }
    rumbleEnv.push([t + 0.6, 0.001]);
    const low = this.burst(this.brown, t0 + 0.08, { type: 'lowpass', freq: 220, q: 1.2 }, rumbleEnv, Math.random());
    low.frequency.setValueAtTime(320, t0 + 0.08);
    low.frequency.exponentialRampToValueAtTime(110, t0 + t);
  }
}
