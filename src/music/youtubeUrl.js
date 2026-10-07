// Extrai id de vídeo e/ou playlist de um link do YouTube (ou de um id puro).
// Puro, sem DOM: testado em youtubeUrl.test.js.

const ID = /^[\w-]{11}$/;
const LIST = /^[\w-]{10,}$/;

/**
 * Aceita links como youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/…,
 * /live/…, music.youtube.com, links de playlist (?list=…) ou um id de 11 caracteres.
 * Retorna `{ videoId, listId }` (qualquer um pode ser null) ou null se não reconhecer.
 */
export function parseYouTubeUrl(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  if (ID.test(text)) return { videoId: text, listId: null };

  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let videoId = null;

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/')[1] || null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') videoId = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) videoId = parts[1] || null;
  } else {
    return null;
  }

  if (videoId && !ID.test(videoId)) videoId = null;
  let listId = url.searchParams.get('list');
  if (listId && !LIST.test(listId)) listId = null;
  return videoId || listId ? { videoId, listId } : null;
}
