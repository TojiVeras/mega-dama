import { TabAudio, tabAudioSupported } from './tabAudio.js';
import { YouTubePlayer } from './youtube.js';
import { parseYouTubeUrl } from './youtubeUrl.js';

const $ = (id) => document.getElementById(id);
const URL_KEY = 'damas3d.music.url';
const SPECTRUM_KEY = 'damas3d.music.spectrum';

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
  constructor({ flash, spectrum = false, onSpectrumChange }) {
    this.flash = flash;
    this.onSpectrumChange = onSpectrumChange;
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

    this.player = new YouTubePlayer($('yt-player'), {
      onStateChange: () => this.panel.classList.add('has-video'),
      onError: (msg) => this.flash(msg),
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
