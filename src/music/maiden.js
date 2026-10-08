// Decide se o Eddie deve estar em cena a partir do player do YouTube. Puro, testado.

const MAIDEN = /iron[\s-]*maiden/i;

/** O vídeo (`{ title, author }` de getVideoData) é do Iron Maiden? */
export function isIronMaiden(video) {
  if (!video) return false;
  return MAIDEN.test(video.title ?? '') || MAIDEN.test(video.author ?? '');
}

/**
 * `state`: estado do YT.Player. Devolve true (Eddie em cena), false (vai embora)
 * ou null (pausado: fica como está).
 */
export function eddieWanted(state, video) {
  if (state === 1 || state === 3) return isIronMaiden(video); // tocando / carregando
  if (state === 2) return null; // pausado
  return false; // acabou, parado ou sem vídeo
}
