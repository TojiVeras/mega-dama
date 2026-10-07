// Painel "Ajustes do fogo": um controle deslizante para cada parâmetro de
// FIRE (constants.js) ligado à música, aplicado ao vivo. As mudanças ficam
// guardadas no navegador; "Copiar" gera os valores para colar em constants.js.

/** Parâmetros ajustáveis: [caminho dentro de FIRE, rótulo, mín, máx, passo, explicação]. */
export const TUNING = [
  {
    group: 'Escala do volume',
    items: [
      ['music.low', 'Percentil do 0%', 0, 0.6, 0.01, 'Volume que vira 0%: a música fica acima dele (1 − p) do tempo.'],
      ['music.high', 'Percentil do 100%', 0.5, 1, 0.005, 'Maior = 100% só nos trechos mais altos.'],
      ['music.minRange', 'Janela mínima (dB)', 0, 30, 0.5, 'Distância mínima entre 0% e 100%; evita amplificar ruído.'],
      ['music.maxRange', 'Janela máxima (dB)', 3, 80, 1, 'Trechos mais baixos que isso abaixo do 100% ficam apagados.'],
      [
        'music.adapt',
        'Adaptação (dB/s)',
        0.1,
        20,
        0.1,
        'Quão rápido a escala acompanha a música; menor = memória longa.',
      ],
      ['music.silenceDb', 'Silêncio abaixo de (dB)', -120, -20, 1, 'Som mais baixo que isso apaga o fogo.'],
    ],
  },
  {
    group: 'Som medido',
    items: [
      [
        'music.bassWeight',
        'Peso dos graves',
        0,
        1,
        0.05,
        '0 = só o som cheio (voz conta mais); 1 = só graves (batida).',
      ],
      ['music.bassCutoff', 'Corte dos graves (Hz)', 40, 500, 5, 'Até onde conta como grave.'],
    ],
  },
  {
    group: 'Movimento',
    items: [
      ['music.release', 'Queda após o pico', 0.2, 30, 0.1, 'Maior = o alvo do fogo cai mais rápido depois de um pico.'],
      ['rise', 'Mola: subida (rad/s)', 1, 60, 0.5, 'Maior = sobe mais rápido (menos suave).'],
      ['fall', 'Mola: descida (rad/s)', 1, 60, 0.5, 'Maior = desce mais rápido (menos suave).'],
      ['music.curve', 'Curva exponencial', 0, 8, 0.1, '0 = linear; maior = sobe pouco no começo e muito no fim.'],
      ['music.offset', 'Atraso (s)', 0, 0.5, 0.01, 'Atrasa o fogo, se ele vier antes do som.'],
    ],
  },
  {
    group: 'Frequência (equalizador)',
    items: [
      [
        'spectrum.smoothing',
        'Suavização do espectro',
        0,
        0.95,
        0.05,
        'Maior = faixas menos tremidas, porém mais lentas.',
      ],
      [
        'spectrum.volumeBoost',
        'Soma do volume',
        0,
        1,
        0.01,
        'Quanto o volume geral soma em todas as faixas; 0 = só a frequência.',
      ],
      ['spectrum.spread', 'Média com vizinhas', 0, 8, 0.1, 'Mistura cada faixa com as do lado; maior = morros suaves.'],
      ['spectrum.minRange', 'Janela mínima por faixa (dB)', 0, 40, 0.5, 'Maior = faixas fracas tremem menos.'],
      ['spectrum.silenceDb', 'Silêncio por faixa (dB)', -150, -40, 1, 'Faixa abaixo disso fica apagada.'],
      ['spectrum.minHz', 'Frequência mínima (Hz)', 20, 500, 5, 'Grave mais baixo (na frente dos jogadores).'],
      ['spectrum.maxHz', 'Frequência máxima (Hz)', 2000, 20000, 100, 'Agudo mais alto (nas laterais).'],
    ],
  },
  {
    group: 'Paredes do fogo',
    items: [
      ['maxHeight', 'Altura máxima', 0.5, 8, 0.1, 'Altura das chamas com nível 100%; maior = fogo mais alto.'],
      ['walls.inner', 'Raio do anel menor', 0.6, 1, 0.005, 'Base do anel interno (fração do externo); menor = triângulo mais largo.'],
      ['walls.apex', 'Ponto de encontro', 0, 1, 0.01, '0 = paredes se encontram no raio do maior; 1 = no do menor.'],
      ['walls.meet', 'Altura do encontro', 0.2, 3, 0.05, 'Em relação à altura da chama; maior = paredes mais em pé.'],
      ['walls.minHeight', 'Altura mínima', 0.001, 0.3, 0.001, 'Chama abaixo disso inclina como se tivesse essa altura.'],
    ],
  },
  {
    group: 'Outros',
    items: [['music.waitingLevel', 'Altura sem captura', 0, 1, 0.01, 'Fogo parado quando a música toca sem áudio.']],
  },
];

const ITEMS = TUNING.flatMap((g) => g.items);

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

/** Aplica valores salvos em `target`, ignorando caminhos desconhecidos e limitando à faixa de cada item. */
export function applyOverrides(target, overrides) {
  if (!overrides) return;
  for (const [path, , min, max] of ITEMS) {
    if (!(path in overrides)) continue;
    const v = Number(overrides[path]);
    if (overrides[path] !== null && Number.isFinite(v)) setPath(target, path, Math.min(Math.max(v, min), max));
  }
}

/** Valores atuais de todos os itens, agrupados como em FIRE (para colar em constants.js). */
export function snapshot(source) {
  const out = {};
  for (const [path] of ITEMS) {
    const keys = path.split('.');
    let o = out;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys.at(-1)] = getPath(source, path);
  }
  return out;
}

const STORAGE_KEY = 'damas3d.fire.tuning';

function readStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function writeStorage(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Armazenamento bloqueado: os ajustes valem só até recarregar.
  }
}

const decimals = (step) => (String(step).split('.')[1] ?? '').length;

/**
 * Painel HTML. `fire` é o objeto FIRE (alterado no lugar); `onChange(path)` é
 * chamado a cada mudança para quem copiou valores reaplicar.
 * Os valores salvos são aplicados já no construtor: crie antes de quem lê FIRE.
 */
export class TuningPanel {
  constructor({ root, fire, onChange, flash }) {
    this.root = root;
    this.fire = fire;
    this.onChange = onChange;
    this.flash = flash;
    this.defaults = snapshot(fire);
    this.overrides = readStorage() ?? {};
    applyOverrides(fire, this.overrides);
    this.rows = new Map();
    this.#build();
  }

  #build() {
    const body = this.root.querySelector('.tuning-body');
    for (const { group, items } of TUNING) {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = group;
      fieldset.append(legend);
      for (const [path, label, min, max, step, hint] of items) {
        const row = document.createElement('label');
        row.className = 'tuning-row';
        row.title = `${hint}\nPadrão: ${getPath(this.defaults, path)} · duplo clique volta ao padrão`;
        const name = document.createElement('span');
        name.textContent = label;
        const value = document.createElement('output');
        const input = document.createElement('input');
        Object.assign(input, { type: 'range', min, max, step });
        input.addEventListener('input', () => this.#set(path, Number(input.value)));
        input.addEventListener('dblclick', () => this.#set(path, getPath(this.defaults, path)));
        row.append(name, value, input);
        fieldset.append(row);
        this.rows.set(path, { row, input, value, step });
      }
      body.append(fieldset);
    }
    this.root.querySelector('[data-action="copy"]').addEventListener('click', () => this.copy());
    this.root.querySelector('[data-action="reset"]').addEventListener('click', () => this.reset());
    this.#refresh();
  }

  #set(path, value) {
    setPath(this.fire, path, value);
    if (value === getPath(this.defaults, path)) delete this.overrides[path];
    else this.overrides[path] = value;
    writeStorage(Object.keys(this.overrides).length ? this.overrides : null);
    this.#refresh(path);
    this.onChange?.(path);
  }

  #refresh(only) {
    for (const [path, r] of this.rows) {
      if (only && path !== only) continue;
      const v = getPath(this.fire, path);
      r.input.value = v;
      r.value.textContent = Number(v).toFixed(decimals(r.step));
      r.row.classList.toggle('changed', path in this.overrides);
    }
  }

  async copy() {
    const text = JSON.stringify(snapshot(this.fire), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      this.flash?.('Valores copiados');
    } catch {
      console.log(text);
      this.flash?.('Não deu para copiar; os valores estão no console');
    }
  }

  reset() {
    applyOverrides(this.fire, Object.fromEntries(ITEMS.map(([p]) => [p, getPath(this.defaults, p)])));
    this.overrides = {};
    writeStorage(null);
    this.#refresh();
    this.onChange?.(null);
    this.flash?.('Ajustes voltaram ao padrão');
  }
}
