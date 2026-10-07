// AudioContext único do jogo (trovão e peças). O navegador só libera o áudio
// depois de um gesto do usuário: chame unlockAudio() num pointerdown.
let ctx = null;

/** AudioContext compartilhado (criado na primeira chamada) ou null sem Web Audio. */
export function audioContext() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  return ctx;
}

export function unlockAudio() {
  const c = audioContext();
  if (c && c.state === 'suspended') c.resume();
  return c;
}

/** Buffer de ruído branco ou marrom (grave, para estrondos). */
export function noiseBuffer(ctx, seconds, brown = false) {
  const { sampleRate } = ctx;
  const buffer = ctx.createBuffer(1, Math.floor(seconds * sampleRate), sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = w;
  }
  return buffer;
}
