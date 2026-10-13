// Cor que mais aparece na capa do vídeo -> paleta do fogo. Puro, sem DOM: testado em thumbColor.test.js.

const BINS = 24; // fatias de 15° do círculo de cores
const TAU = Math.PI * 2;

/**
 * Matiz (0..1) que mais aparece em pixels RGBA (`ImageData.data`). Preto, branco e cinza não
 * contam (fogo aditivo não tem "preto"); devolve null se a imagem quase não tiver cor.
 */
export function dominantHue(data) {
  const count = new Float32Array(BINS);
  const cos = new Float32Array(BINS);
  const sin = new Float32Array(BINS);
  let total = 0;
  let colored = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    total++;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (max < 0.25 || d / max < 0.3) continue; // escuro ou acinzentado
    const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
    const bin = Math.min(BINS - 1, Math.floor(h * BINS));
    count[bin]++;
    cos[bin] += Math.cos(h * TAU);
    sin[bin] += Math.sin(h * TAU);
    colored++;
  }
  if (!total || colored < total * 0.04) return null;

  // Fatia mais cheia (contando um pouco as vizinhas) e a média do matiz em volta dela.
  const at = (arr, i) => arr[(i + BINS) % BINS];
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < BINS; i++) {
    const score = count[i] + 0.5 * (at(count, i - 1) + at(count, i + 1));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  const x = at(cos, best - 1) + cos[best] + at(cos, best + 1);
  const y = at(sin, best - 1) + sin[best] + at(sin, best + 1);
  return (Math.atan2(y, x) / TAU + 1) % 1;
}

function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h * 12) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return (channel(0) << 16) | (channel(8) << 8) | channel(4);
}

/**
 * Paleta do fogo (`{ core, mid, edge, light }`, como em FIRE) para um matiz 0..1: mesma
 * claridade das cores padrão, com o miolo e a borda levemente deslocados no círculo de cores.
 */
export function firePalette(hue) {
  return {
    core: hsl(hue + 0.04, 1, 0.85),
    mid: hsl(hue, 1, 0.56),
    edge: hsl(hue - 0.04, 0.9, 0.37),
    light: hsl(hue, 1, 0.58),
  };
}
