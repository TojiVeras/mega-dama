import { FIRE } from '../three/constants.js';
import { DelayLine, LevelTracker } from './level.js';
import { smoothBands } from './spectrum.js';

/**
 * Decide a altura do fogo a cada quadro:
 * - "audio": áudio da aba capturado e música tocando → a altura segue o volume
 *   (padrão) ou, com `useSpectrum`, cada trecho do anel segue uma faixa de
 *   frequência (equalizador); o volume geral sempre move luz e brilho do chão.
 *   Sem atraso (dá para atrasar o volume geral com `offset` se vier adiantado);
 * - "waiting": música tocando sem captura → fogo baixo e parado (não dá para
 *   sincronizar sem ouvir o áudio);
 * - "idle": nada tocando (ou pausado) → driver de demonstração (aleatório).
 */
export class MusicFireDriver {
  constructor({ fire, player, tabAudio, idleDriver }) {
    this.fire = fire;
    this.player = player;
    this.tabAudio = tabAudio;
    this.idleDriver = idleDriver;
    this.tracker = new LevelTracker();
    // Uma escala automática por faixa: cada uma usa a altura toda (os graves
    // são sempre mais fortes que os agudos, então uma escala só achataria os agudos).
    this.bandTrackers = Array.from({ length: FIRE.bands }, () => new LevelTracker());
    this.bands = new Float32Array(FIRE.bands); // altura de cada faixa 0..1
    this.smoothed = new Float32Array(FIRE.bands); // idem, com média das vizinhas (o que vai pro fogo)
    this.useSpectrum = FIRE.spectrum.enabled; // false = altura pelo volume; true = equalizador
    this.delay = new DelayLine();
    this.applySettings();
    this.mode = 'idle';
    this.level = 0;
    this.sound = null; // volume detectado 0..1 (null sem captura), para o medidor
  }

  /** Relê FIRE.music/FIRE.spectrum (chamado pelo painel de ajustes a cada mudança). */
  applySettings() {
    const m = FIRE.music;
    const opts = {
      minRange: m.minRange,
      maxRange: m.maxRange,
      low: m.low,
      high: m.high,
      adapt: m.adapt,
      release: m.release,
      silenceDb: m.silenceDb,
      curve: m.curve,
    };
    Object.assign(this.tracker, opts);
    const bandOpts = { ...opts, minRange: FIRE.spectrum.minRange, silenceDb: FIRE.spectrum.silenceDb };
    this.bandTrackers.forEach((t) => Object.assign(t, bandOpts));
    this.offset = m.offset; // atraso (s) aplicado ao fogo
  }

  update(dt, time) {
    const prev = this.mode;
    if (this.tabAudio.active && this.player.audible) this.mode = 'audio';
    else if (this.player.audible) this.mode = 'waiting';
    else this.mode = 'idle';
    this.sound = null;
    if (this.mode !== prev) {
      this.tracker.reset();
      this.bandTrackers.forEach((t) => t.reset());
      this.delay.clear();
    }

    if (this.mode !== 'audio' || !this.useSpectrum) this.fire.setBands(null);
    if (this.mode === 'idle') {
      this.fire.fluid = false;
      this.fire.response = FIRE.response;
      this.idleDriver.update(time);
      this.level = this.fire.target;
      return;
    }

    if (this.mode === 'waiting') {
      this.fire.fluid = false;
      this.fire.response = FIRE.response;
      this.level = FIRE.music.waitingLevel;
    } else {
      // O fogo segue o envelope do áudio com mola (movimento fluido, sem tranco).
      this.fire.fluid = true;
      const level = this.tracker.push(this.tabAudio.sample(), dt);
      this.sound = this.tracker.input;
      const spectrum = this.tabAudio.spectrum();
      for (let i = 0; i < this.bands.length; i++) this.bands[i] = this.bandTrackers[i].push(spectrum[i], dt);
      this.level = this.delay.push(time, level, this.offset);
      // As faixas seguem calculadas mesmo no modo volume, para a troca ser imediata.
      if (this.useSpectrum) {
        const out = smoothBands(this.bands, FIRE.spectrum.spread, this.smoothed);
        // O volume geral soma em todas as faixas: som alto levanta o anel inteiro.
        const boost = FIRE.spectrum.volumeBoost * this.level;
        for (let i = 0; i < out.length; i++) out[i] = Math.min(out[i] + boost, 1);
        this.fire.setBands(out);
      }
    }
    this.fire.setLevel(this.level);
  }
}
