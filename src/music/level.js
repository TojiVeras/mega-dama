// Conversão do volume do áudio em altura do fogo (0..1). Puro, sem DOM.

/** Volume RMS de um trecho de amostras (-1..1), em dB (0 dB = escala cheia). */
export function rmsDb(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return 10 * Math.log10(sum / Math.max(samples.length, 1) + 1e-12);
}

/**
 * Curva exponencial em 0..1: cresce pouco no começo e muito no final.
 * `k` = 0 é linear; quanto maior, mais o fogo só dispara nos picos.
 */
export function expCurve(x, k) {
  if (!(k > 0)) return x;
  return Math.expm1(k * x) / Math.expm1(k);
}

/**
 * Mapeia o volume (em dB) para 0..1 entre um volume "baixo" e um "alto" típicos
 * da própria música, então a escala se ajusta a cada música sozinha.
 *
 * As referências são percentis estimados ao longo de dezenas de segundos (por
 * padrão 10% e 95% do tempo a música está abaixo deles), não o pico recente: assim
 * a escala não acompanha cada trecho. Um verso cantado baixo continua mais baixo
 * que o refrão gritado, e o instrumental mais baixo que ambos, mesmo que cada
 * trecho dure vários segundos. Ataque instantâneo e queda controlada por `release`.
 */
export class LevelTracker {
  constructor({
    minRange = 3,
    maxRange = 30,
    low = 0.1,
    high = 0.95,
    adapt = 2,
    warmup = 4,
    release = 10,
    silenceDb = -75,
    curve = 0,
  } = {}) {
    this.minRange = minRange; // janela mínima (dB) entre "baixo" e "alto": evita amplificar ruído
    this.maxRange = maxRange; // janela máxima (dB): passagens muito baixas ficam apagadas
    this.low = low; // percentil que vira 0%
    this.high = high; // percentil que vira 100%
    this.adapt = adapt; // dB/s: velocidade com que os percentis se movem
    this.warmup = warmup; // s: no início da música a escala se adapta bem mais rápido
    this.release = release; // velocidade de queda do envelope (1/s)
    this.silenceDb = silenceDb; // ruído abaixo disso nunca acende o fogo
    this.curve = curve; // curvatura da altura (expCurve); 0 = linear
    this.reset();
  }

  reset() {
    this.lo = null; // volume "baixo" de referência (dB)
    this.hi = null; // volume "alto" de referência (dB)
    this.age = 0; // segundos de som desde o reset
    this.input = 0; // volume atual normalizado na escala (antes do envelope e da curva)
    this.env = 0;
    this.level = 0;
  }

  /** `db`: volume atual em dB; `dt` em segundos. Retorna a altura do fogo em 0..1. */
  push(db, dt) {
    const v = Number.isNaN(db) || db == null ? -Infinity : db;
    const step = dt > 0 ? Math.min(dt, 0.25) : 1 / 60;
    const audible = v > this.silenceDb;

    if (audible) {
      if (this.lo == null) this.lo = this.hi = v;
      this.age += step;
      // Estimativa incremental de percentil: sobe `p` e desce `1 - p` proporcionalmente.
      const eta = this.adapt * step * (1 + 10 * Math.exp(-this.age / this.warmup));
      this.lo += eta * (this.low - (v < this.lo ? 1 : 0));
      this.hi += eta * (this.high - (v < this.hi ? 1 : 0));
    }

    let x = 0;
    if (audible) {
      const top = this.hi;
      const bottom = Math.min(Math.max(this.lo, top - this.maxRange), top - this.minRange);
      x = Math.min(Math.max((v - bottom) / (top - bottom), 0), 1);
    }

    this.input = x;
    this.env = Math.max(x, this.env * Math.exp(-this.release * step));
    this.level = expCurve(this.env, this.curve);
    return this.level;
  }
}

/**
 * Atraso fixo de um sinal: o áudio é analisado antes de sair na caixa de som,
 * então o valor é guardado e devolvido `delay` segundos depois.
 */
export class DelayLine {
  constructor() {
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  /** Guarda `value` no instante `time` e retorna o valor de `time - delay`. */
  push(time, value, delay) {
    this.items.push({ time, value });
    const target = time - Math.max(delay, 0);
    let i = 0;
    while (i + 1 < this.items.length && this.items[i + 1].time <= target) i++;
    if (i > 0) this.items.splice(0, i);
    return this.items[0].time <= target ? this.items[0].value : 0;
  }
}
