import { describe, expect, it } from 'vitest';
import { parseYouTubeUrl } from './youtubeUrl.js';

const V = 'dQw4w9WgXcQ';
const L = 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI';

describe('parseYouTubeUrl', () => {
  it('aceita id puro', () => {
    expect(parseYouTubeUrl(V)).toEqual({ videoId: V, listId: null });
  });

  it.each([
    `https://www.youtube.com/watch?v=${V}`,
    `youtube.com/watch?v=${V}&t=42s`,
    `https://m.youtube.com/watch?v=${V}`,
    `https://music.youtube.com/watch?v=${V}`,
    `https://youtu.be/${V}?si=abc`,
    `https://www.youtube.com/shorts/${V}`,
    `https://www.youtube.com/embed/${V}`,
    `https://www.youtube.com/live/${V}`,
    `https://www.youtube-nocookie.com/embed/${V}`,
  ])('reconhece vídeo em %s', (link) => {
    expect(parseYouTubeUrl(link)).toEqual({ videoId: V, listId: null });
  });

  it('reconhece playlist sozinha e vídeo dentro de playlist', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/playlist?list=${L}`)).toEqual({ videoId: null, listId: L });
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${V}&list=${L}`)).toEqual({ videoId: V, listId: L });
  });

  it.each(['', '   ', 'abc', 'https://vimeo.com/123456', 'https://www.youtube.com/watch?v=curto', 'não é link'])(
    'rejeita %j',
    (link) => {
      expect(parseYouTubeUrl(link)).toBeNull();
    },
  );
});
