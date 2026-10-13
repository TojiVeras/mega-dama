import { PlaylistView } from './playlist.js';
import { TabAudio, tabAudioSupported } from './tabAudio.js';
import { dominantHue, firePalette } from './thumbColor.js';
import { YouTubePlayer } from './youtube.js';
import { parseYouTubeUrl } from './youtubeUrl.js';

const $ = (id) => document.getElementById(id);
const URL_KEY = 'damas3d.music.url';
const SPECTRUM_KEY = 'damas3d.music.spectrum';
const THEATER_KEY = 'damas3d.music.theater';
const LIST_KEY = 'damas3d.music.list';
// Tamanho em que a capa é lida para achar a cor do fogo.
const THUMB_W = 48;
const THUMB_H = 27;

const MODE_LABEL = {
  audio: 'Fogo sincronizado com o áudio',
  waiting: 'Fogo parado: clique em Sincronizar',
  idle: 'Fogo em modo demonstração',
};

function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    // Armazenamento bloqueado (aba anônima etc.): só não lembra a preferência.
  }
  return null;
}

/** Painel de música: player do YouTube e botão para sincronizar o fogo com o áudio. */
export class MusicPanel {
  /** `onSpectrumChange(bool)`: alterna a altura do fogo entre volume e frequência. */
  constructor({ flash, spectrum = false, onSpectrumChange, onPalette }) {
    this.flash = flash;
    this.onSpectrumChange = onSpectrumChange;
    this.onPalette = onPalette; // `{ core, mid, edge, light }` da capa da música, ou null
    this.thumbCanvas = document.createElement('canvas');
    this.thumbCanvas.width = THUMB_W;
    this.thumbCanvas.height = THUMB_H;
    this.panel = $('music');
    this.toggleBtn = $('btn-music');
    this.form = $('music-form');
    this.urlInput = $('music-url');
    this.syncBtn = $('music-sync');
    this.status = $('music-status');
    this.meters = {
      sound: { bar: $('meter-sound'), value: $('meter-sound-val'), text: '' },
      fire: { bar: $('meter-fire'), value: $('meter-fire-val'), text: '' },
    };
    this.lastMode = null;

    this.title = $('music-title');
    this.theaterBtn = $('music-theater');
    this.player = new YouTubePlayer($('yt-player'), {
      onStateChange: () => {
        this.panel.classList.add('has-video');
        this.syncPlaylist();
      },
      onError: (msg) => this.flash(msg),
    });
    this.playlist = new PlaylistView($('music-playlist'), {
      onPick: (index) => this.player.playAt(index),
    });
    this.tabAudio = new TabAudio({
      onEnded: () => {
        this.syncBtn.setAttribute('aria-pressed', 'false');
        this.flash('Sincronização com o áudio desligada');
      },
    });

    this.urlInput.value = storage(URL_KEY) ?? '';
    this.modeButtons = { volume: $('mode-volume'), spectrum: $('mode-spectrum') };
    const saved = storage(SPECTRUM_KEY);
    this.setSpectrum(saved == null ? spectrum : saved === '1');
    this.modeButtons.volume.addEventListener('click', () => this.setSpectrum(false, true));
    this.modeButtons.spectrum.addEventListener('click', () => this.setSpectrum(true, true));

    this.tuning = $('tuning');
    this.tuningBtn = $('btn-tuning');
    this.tuningBtn.addEventListener('click', () => this.setTuningOpen(!this.tuning.classList.contains('open')));
    $('tuning-close').addEventListener('click', () => this.setTuningOpen(false));
    this.setTheater(storage(THEATER_KEY) !== '0'); // teatro é o padrão
    this.theaterBtn.addEventListener('click', () => this.setTheater(!this.theater, true));
    this.disc = $('music-disc');
    this.disc.addEventListener('click', () => this.player.toggle());
    $('music-prev').addEventListener('click', () => this.player.previous());
    $('music-next').addEventListener('click', () => this.player.next());
    this.listBtn = $('music-playlist-toggle');
    this.listCount = $('music-playlist-count');
    this.setListOpen(storage(LIST_KEY) === '1');
    this.listBtn.addEventListener('click', () => this.setListOpen(!this.listOpen, true));
    this.toggleBtn.addEventListener('click', () => this.setOpen(!this.panel.classList.contains('open')));
    $('music-close').addEventListener('click', () => this.setOpen(false));
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.play();
    });

    if (!tabAudioSupported()) {
      this.syncBtn.disabled = true;
      this.syncBtn.title = 'Este navegador não permite capturar o áudio da aba';
    }
    this.syncBtn.addEventListener('click', () => this.toggleSync());
  }

  setSpectrum(on, save = false) {
    this.spectrum = on;
    this.modeButtons.volume.setAttribute('aria-pressed', String(!on));
    this.modeButtons.spectrum.setAttribute('aria-pressed', String(on));
    if (save) storage(SPECTRUM_KEY, on ? '1' : '0');
    this.onSpectrumChange?.(on);
  }

  /** Abre/recolhe a lista de músicas do modo teatro. */
  setListOpen(open, save = false) {
    this.listOpen = open;
    this.panel.classList.toggle('list-open', open);
    this.listBtn.setAttribute('aria-expanded', String(open));
    if (open) this.playlist.reveal();
    if (save) storage(LIST_KEY, open ? '1' : '0');
  }

  /** Modo teatro: disco girando com a capa e a playlist, sem medidores, ajustes e explicações. */
  setTheater(on, save = false) {
    this.theater = on;
    this.panel.classList.toggle('theater', on);
    this.theaterBtn.setAttribute('aria-pressed', String(on));
    if (on) {
      this.setTuningOpen(false);
      this.playlist.reveal();
    }
    if (save) storage(THEATER_KEY, on ? '1' : '0');
  }

  /** Atualiza a lista de músicas, a música atual e o título (a cada mudança de estado do player). */
  syncPlaylist() {
    const video = this.player.video;
    const ids = this.player.playlist;
    this.panel.classList.toggle('playing', this.player.playing);
    this.panel.classList.toggle('has-list', ids.length > 0);
    this.listCount.textContent = ids.length ? `${this.player.playlistIndex + 1} / ${ids.length}` : '';
    if (video?.video_id && video.video_id !== this.discVideo) {
      this.discVideo = video.video_id;
      const thumb = `https://i.ytimg.com/vi/${video.video_id}/mqdefault.jpg`;
      this.disc.style.setProperty('--thumb', `url(${thumb})`);
      this.#paletteFrom(thumb, video.video_id);
    }
    this.playlist.setItems(ids);
    this.playlist.setCurrent(this.player.playlistIndex);
    this.playlist.setTitle(video?.video_id, video?.title);
    this.title.textContent = video?.title ?? '';
  }

  // Lê a capa (bem reduzida) e passa adiante a paleta da cor que mais aparece nela.
  #paletteFrom(thumb, videoId) {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // i.ytimg.com libera CORS; sem isso o canvas não deixa ler
    img.onload = () => {
      if (videoId !== this.discVideo) return; // a música já trocou
      let hue = null;
      try {
        const ctx = this.thumbCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, THUMB_W, THUMB_H);
        hue = dominantHue(ctx.getImageData(0, 0, THUMB_W, THUMB_H).data);
      } catch {
        // Canvas bloqueado: fica com as cores padrão.
      }
      this.onPalette?.(hue == null ? null : firePalette(hue));
    };
    img.src = thumb;
  }

  setTuningOpen(open) {
    this.tuning.classList.toggle('open', open);
    this.tuning.inert = !open;
    this.tuningBtn.setAttribute('aria-pressed', String(open));
  }

  setOpen(open) {
    // Só esconde visualmente (sem display: none) para a música seguir tocando.
    this.panel.classList.toggle('open', open);
    this.panel.inert = !open;
    this.toggleBtn.setAttribute('aria-pressed', String(open));
    if (open && !this.panel.classList.contains('has-video')) this.urlInput.focus();
  }

  async play() {
    const parsed = parseYouTubeUrl(this.urlInput.value);
    if (!parsed) {
      this.flash('Cole um link de vídeo ou playlist do YouTube');
      return;
    }
    storage(URL_KEY, this.urlInput.value.trim());
    this.panel.classList.add('has-video');
    const loading = this.player.load(parsed);
    // Aproveita o mesmo clique para pedir o áudio da aba (o seletor exige um gesto do usuário).
    if (!this.tabAudio.active && !this.syncBtn.disabled) this.toggleSync();
    try {
      await loading;
    } catch (err) {
      this.flash(err.message);
    }
  }

  async toggleSync() {
    if (this.tabAudio.active) {
      this.tabAudio.stop();
      return;
    }
    try {
      await this.tabAudio.start();
      this.syncBtn.setAttribute('aria-pressed', 'true');
      this.flash('Fogo sincronizado com o áudio da aba');
    } catch (err) {
      if (err.name === 'NotAllowedError') this.flash('Compartilhamento cancelado');
      else this.flash(err.message || 'Não foi possível capturar o áudio');
    }
  }

  #meter(name, value) {
    const m = this.meters[name];
    m.bar.style.transform = `scaleX(${(value ?? 0).toFixed(3)})`;
    const text = value == null ? '–' : `${Math.round(value * 100)}%`;
    if (text !== m.text) m.value.textContent = m.text = text;
  }

  /**
   * Atualiza os medidores e o texto de status (chamado a cada quadro).
   * `sound`: volume detectado em 0..1 (null sem captura); `fire`: altura atual do fogo.
   */
  render(mode, sound, fire) {
    this.#meter('sound', sound);
    this.#meter('fire', fire);
    if (mode === this.lastMode) return;
    this.lastMode = mode;
    this.status.textContent = MODE_LABEL[mode];
    this.panel.dataset.mode = mode;
    this.toggleBtn.classList.toggle('live', mode !== 'idle');
  }
}
