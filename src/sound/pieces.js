import { noiseBuffer, unlockAudio } from './audio.js';

const rand = (a, b) => a + Math.random() * (b - a);

// Timbre de cada tipo de batida: frequência do corpo da peça, brilho do clique,
// quanto do "tum" grave do tabuleiro entra, volume e duração.
const HITS = {
  pick: { freq: 950, click: 4200, thump: 0, gain: 0.22, decay: 0.03 }, // segurar/levantar
  tap: { freq: 420, click: 1800, thump: 0.15, gain: 0.18, decay: 0.04 }, // tocar numa peça que não pode mexer
  board: { freq: 620, click: 3000, thump: 0.5, gain: 0.55, decay: 0.06 }, // pousar no tabuleiro
  stack: { freq: 1150, click: 4800, thump: 0.1, gain: 0.45, decay: 0.05, bounce: true }, // peça sobre peça (pilha)
  crown: { freq: 980, click: 4200, thump: 0.3, gain: 0.6, decay: 0.07, bounce: true }, // dama encaixando
};

/**
 * Sons das peças sintetizados com Web Audio: batidas de madeira ao segurar,
 * pousar e empilhar, e um sopro/arrasto contínuo que acompanha a velocidade.
 */
export class PieceSounds {
  constructor({ volume = 0.7, motion = 0.25 } = {}) {
    this.volume = volume;
    this.motionVolume = motion;
    this.ctx = null;
  }

  unlock() {
    const ctx = unlockAudio();
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.white = noiseBuffer(ctx, 2);
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // Movimento: ruído em loop por um passa-banda; o volume segue a velocidade.
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    this.motionFilter = ctx.createBiquadFilter();
    this.motionFilter.type = 'bandpass';
    this.motionFilter.frequency.value = 600;
    this.motionFilter.Q.value = 0.9;
    this.motionGain = ctx.createGain();
    this.motionGain.gain.value = 0;
    src.connect(this.motionFilter).connect(this.motionGain).connect(this.master);
    src.start();
  }

  /** Batida curta: dois modos de vibração da peça + clique de ruído + "tum" grave. */
  hit(kind, strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const h = HITS[kind];
    const t0 = ctx.currentTime + 0.005;
    const gain = h.gain * strength;
    const freq = h.freq * rand(0.92, 1.08);

    const env = (t, peak, decay) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      g.connect(this.master);
      return g;
    };
    const tone = (t, f, peak, decay, type = 'sine') => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, t + decay);
      o.connect(env(t, peak, decay));
      o.start(t);
      o.stop(t + decay + 0.02);
    };
    const click = (t, peak) => {
      const s = ctx.createBufferSource();
      s.buffer = this.white;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = h.click * rand(0.85, 1.15);
      f.Q.value = 1.4;
      s.connect(f).connect(env(t, peak, 0.018));
      s.start(t, rand(0, 1.5));
      s.stop(t + 0.04);
    };
    const knock = (t, g) => {
      click(t, g * 0.9);
      tone(t, freq, g * 0.6, h.decay);
      tone(t, freq * 2.76, g * 0.25, h.decay * 0.5, 'triangle');
      if (h.thump) tone(t, 150 * rand(0.9, 1.1), g * h.thump, 0.09);
    };

    knock(t0, gain);
    // Peça sobre peça quica de leve antes de assentar.
    if (h.bounce) knock(t0 + rand(0.035, 0.055), gain * 0.3);
  }

  /** Velocidade (unidades/s) da peça mais rápida em movimento; chamado a cada quadro. */
  setMotion(speed) {
    if (!this.motionGain) return;
    const k = Math.min(1, speed / 9);
    const now = this.ctx.currentTime;
    this.motionGain.gain.setTargetAtTime(k * k * this.motionVolume, now, 0.04);
    this.motionFilter.frequency.setTargetAtTime(450 + speed * 140, now, 0.05);
  }
}
