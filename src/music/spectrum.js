// Divide o espectro em bandas de frequência (para o fogo virar um "equalizador"
// em volta do tabuleiro). Puro, sem DOM: testado em spectrum.test.js.

/** `count` bandas com espaçamento logarítmico (como o ouvido), de `minHz` a `maxHz`: [[lo, hi], ...]. */
export function logBands(count, minHz, maxHz) {
  const ratio = maxHz / minHz;
  return Array.from({ length: count }, (_, i) => [minHz * ratio ** (i / count), minHz * ratio ** ((i + 1) / count)]);
}

/**
 * Converte bandas em Hz para intervalos de índices do FFT [from, to] (inclusivos).
 * Toda banda recebe pelo menos um índice (nos graves várias podem cair no mesmo).
 */
export function bandBins(bands, hzPerBin, binCount) {
  return bands.map(([lo, hi]) => {
    const from = Math.min(Math.max(1, Math.round(lo / hzPerBin)), binCount - 1);
    const to = Math.min(Math.max(from, Math.round(hi / hzPerBin) - 1), binCount - 1);
    return [from, to];
  });
}

/** Potência média de cada banda em dB, a partir do espectro em dB por índice (getFloatFrequencyData). */
export function bandDb(spectrumDb, bins, out = new Float32Array(bins.length)) {
  for (let b = 0; b < bins.length; b++) {
    const [from, to] = bins[b];
    let power = 0;
    for (let i = from; i <= to; i++) power += 10 ** (spectrumDb[i] / 10);
    out[b] = 10 * Math.log10(power / (to - from + 1) + 1e-12);
  }
  return out;
}

/**
 * Suaviza as alturas com as faixas vizinhas (média ponderada gaussiana de
 * desvio `spread`, em faixas), para não ter faixa alta colada em faixa baixa.
 * As pontas são espelhadas, como no anel (graves e agudos se repetem invertidos).
 * `spread` = 0 copia sem alterar.
 */
export function smoothBands(src, spread, out = new Float32Array(src.length)) {
  const n = src.length;
  if (!(spread > 0) || n < 2) {
    out.set(src);
    return out;
  }
  const reach = Math.ceil(spread * 2.5);
  const reflect = (i) => {
    const period = 2 * (n - 1);
    const k = ((i % period) + period) % period;
    return k < n ? k : period - k;
  };
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let weight = 0;
    for (let d = -reach; d <= reach; d++) {
      const w = Math.exp(-(d * d) / (2 * spread * spread));
      sum += w * src[reflect(i + d)];
      weight += w;
    }
    out[i] = sum / weight;
  }
  return out;
}
