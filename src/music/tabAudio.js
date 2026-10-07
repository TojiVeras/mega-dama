// Captura o áudio da própria aba (getDisplayMedia) para analisar a música do
// YouTube, já que o iframe é de outra origem e não pode ser lido pelo Web Audio.
// Funciona em navegadores Chromium no computador (Chrome, Edge, Opera): o usuário
// escolhe esta aba e marca "Compartilhar áudio da aba".

import { FIRE } from '../three/constants.js';
import { rmsDb } from './level.js';
import { bandBins, bandDb, logBands } from './spectrum.js';

export const tabAudioSupported = () => Boolean(navigator.mediaDevices?.getDisplayMedia);

// Volume medido como RMS do sinal (domínio do tempo) numa janela de ~43 ms: longa
// o bastante para conter ciclos inteiros dos graves (50 Hz = 20 ms) e não tremer.
// Peso e corte dos graves ficam em FIRE.music (ajustáveis ao vivo).
const WINDOW = 2048;

export class TabAudio {
  constructor({ onEnded } = {}) {
    this.onEnded = onEnded;
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.data = null;
  }

  get active() {
    return Boolean(this.stream);
  }

  /** Abre o seletor de compartilhamento. Precisa ser chamado num clique. */
  async start() {
    if (this.active) return;
    // Criado antes do seletor, ainda dentro do clique, para não nascer suspenso.
    const ctx = new AudioContext();
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // obrigatório no Chrome; a faixa de vídeo é descartada logo abaixo
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false,
        },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        systemAudio: 'include',
      });
    } catch (err) {
      ctx.close();
      throw err;
    }

    const [track] = stream.getAudioTracks();
    stream.getVideoTracks().forEach((t) => t.stop());
    if (!track) {
      ctx.close();
      throw new Error('Nenhum áudio compartilhado: escolha esta aba e marque "Compartilhar áudio da aba".');
    }

    this.ctx = ctx;
    await ctx.resume();
    const source = this.ctx.createMediaStreamSource(new MediaStream([track]));
    // Só analisa: nada vai para a saída (o som já toca pelo próprio iframe).
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = WINDOW;
    this.analyser.smoothingTimeConstant = FIRE.spectrum.smoothing; // só afeta o espectro
    source.connect(this.analyser);

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    this.lowpass = lowpass;
    this.bassAnalyser = this.ctx.createAnalyser();
    this.bassAnalyser.fftSize = WINDOW;
    source.connect(lowpass).connect(this.bassAnalyser);

    this.data = new Float32Array(WINDOW);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.bands = new Float32Array(FIRE.bands);
    this.applySettings();
    this.stream = stream;
    track.addEventListener('ended', () => this.stop());
  }

  stop() {
    if (!this.stream) return;
    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.bassAnalyser = null;
    this.lowpass = null;
    this.onEnded?.();
  }

  /** Volume atual em dB, com peso nos graves (null se não está capturando). */
  sample() {
    if (!this.analyser) return null;
    this.analyser.getFloatTimeDomainData(this.data);
    const full = rmsDb(this.data);
    this.bassAnalyser.getFloatTimeDomainData(this.data);
    const bass = rmsDb(this.data);
    const w = FIRE.music.bassWeight;
    return w * bass + (1 - w) * full;
  }

  /** Relê FIRE.music/FIRE.spectrum (filtro de graves, suavização e faixas) com a captura ativa. */
  applySettings() {
    if (!this.analyser) return;
    this.analyser.smoothingTimeConstant = FIRE.spectrum.smoothing;
    this.lowpass.frequency.value = FIRE.music.bassCutoff;
    const { minHz, maxHz } = FIRE.spectrum;
    this.bins = bandBins(logBands(FIRE.bands, minHz, maxHz), this.ctx.sampleRate / WINDOW, this.freq.length);
  }

  /** Volume de cada banda de frequência em dB, dos graves aos agudos (null se não está capturando). */
  spectrum() {
    if (!this.analyser) return null;
    this.analyser.getFloatFrequencyData(this.freq);
    return bandDb(this.freq, this.bins, this.bands);
  }
}
