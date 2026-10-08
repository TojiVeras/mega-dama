// Player do YouTube via IFrame API (https://developers.google.com/youtube/iframe_api_reference).
// O áudio do iframe é de outra origem: o navegador não deixa analisá-lo direto.
// Para sincronizar o fogo de verdade, veja tabAudio.js.

let apiPromise = null;

function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error('Não foi possível carregar o player do YouTube.'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

const ERRORS = {
  2: 'Link do YouTube inválido.',
  5: 'Este vídeo não pode tocar no player embutido.',
  100: 'Vídeo não encontrado (removido ou privado).',
  101: 'O dono do vídeo não permite tocar fora do YouTube.',
  150: 'O dono do vídeo não permite tocar fora do YouTube.',
};

export class YouTubePlayer {
  /** `element`: div que será substituído pelo iframe. */
  constructor(element, { onStateChange, onError } = {}) {
    this.element = element;
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.player = null;
    this.ready = null;
    this.state = -1;
  }

  get playing() {
    return this.state === 1; // YT.PlayerState.PLAYING
  }

  /** Tocando ou carregando no meio da música (não pisca o modo durante o buffer). */
  get audible() {
    return this.state === 1 || this.state === 3; // PLAYING, BUFFERING
  }

  /** Vídeo atual: `{ video_id, title, author }` (null se ainda não há player). */
  get video() {
    return this.player?.getVideoData?.() ?? null;
  }

  /** Tempo atual da música em segundos (0 se ainda não há player). */
  get currentTime() {
    return this.player?.getCurrentTime?.() ?? 0;
  }

  #create(YT) {
    return new Promise((resolve) => {
      this.player = new YT.Player(this.element, {
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => resolve(this.player),
          onStateChange: (e) => {
            this.state = e.data;
            this.onStateChange?.(e.data);
          },
          onError: (e) => this.onError?.(ERRORS[e.data] ?? `Erro do YouTube (${e.data}).`),
        },
      });
    });
  }

  /** Toca um vídeo e/ou playlist: `{ videoId, listId }` (de parseYouTubeUrl). */
  async load({ videoId, listId }) {
    if (!this.ready) {
      this.ready = loadApi().then((YT) => this.#create(YT));
      this.ready.catch(() => (this.ready = null));
    }
    const player = await this.ready;
    if (listId) {
      player.loadPlaylist({ list: listId, listType: 'playlist', index: 0 });
      // Com vídeo específico, começa nele (o índice dentro da lista é desconhecido).
      if (videoId) player.loadVideoById(videoId);
    } else {
      player.loadVideoById(videoId);
    }
  }
}
