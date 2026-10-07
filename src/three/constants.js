import { colOf, rowOf, SIZE } from '../game/rules.js';

// Unidades do mundo: 1 casa = 1 unidade. Tabuleiro centralizado na origem,
// superfície de jogo em y = 0. Brancas ficam do lado +z, pretas do lado -z.
export const FRAME = 0.6;
export const BOARD_THICKNESS = 0.4;
export const TABLE_Y = -BOARD_THICKNESS;
export const BOARD_EXTENT = SIZE / 2 + FRAME;

export const PIECE_RADIUS = 0.38;
export const PIECE_HEIGHT = 0.16;

// Alturas usadas ao arrastar.
export const DRAG_LIFT = 0.12; // altura normal da peça segurada (abaixo do topo de outra peça)
export const FLY_MARGIN = 0.1; // folga acima de uma peça ao sobrevoá-la
export const SELECT_LIFT = 0.12; // peça selecionada por clique

// Captura múltipla arrastando: parar a peça sobre um pouso intermediário enche um
// relógio; ao completar, o pouso conta como jogado e o arraste continua dali.
export const DWELL = {
  time: 0.6, // segundos parado sobre a casa para confirmar
  maxSpeed: 1.5, // casas/s: acima disso a peça está "passando", o relógio não avança
  drain: 2, // quão rápido o relógio esvazia enquanto a peça se move (x tempo de encher)
};

export const COLORS = {
  move: 0x48d6ff,
  capture: 0xff9d2e,
  mustCapture: 0xffc94a,
};

// Anel de fogo (fire.js). A altura é um nível de 0 a 1 multiplicado por maxHeight.
// Os valores de música/espectro/mola podem ser ajustados ao vivo no painel
// "Ajustes do fogo" (src/music/tuning.js), que guarda as mudanças no navegador.
export const FIRE = {
  gap: 0.6, // folga entre o canto do tabuleiro e o anel
  maxHeight: 2.2, // altura das chamas com nível 1
  tongues: 48, // quantidade de línguas de fogo na volta
  response: 2.5, // velocidade com que a altura persegue o valor pedido
  groundWidth: 0.9, // meia largura do brilho no chão
  core: 0xfff1b0,
  mid: 0xff8a1e,
  edge: 0xb3200a,
  light: 0xff7a2a,
  lightIntensity: 2.5,
  // Movimento fluido com música: mola amortecida (sem tranco). Frequência em rad/s:
  // maior = acompanha mais rápido. Subida mais rápida que a descida.
  rise: 52,
  fall: 16,
  // Paredes das duas camadas: a base de cada uma fica no seu raio e as duas inclinam
  // até se encontrarem na altura da chama (chama baixa = parede mais deitada).
  walls: {
    inner: 0.935, // raio da base do anel menor (fração do raio do anel maior)
    apex: 0.63, // onde as paredes se encontram: 0 = no raio do maior, 1 = no do menor
    meet: 0.3, // altura do encontro em relação à altura da chama (>1 = encontram acima)
    minHeight: 0.039, // altura mínima usada para inclinar (evita parede deitada no chão)
  },
  bands: 128, // faixas de frequência espalhadas em volta do anel (modo equalizador)
  // Fogo como equalizador: cada trecho do anel segue uma faixa de frequência.
  // Graves na frente de cada jogador (+z e -z), agudos nas laterais, espelhado.
  spectrum: {
    enabled: false, // modo inicial (o painel de música alterna entre volume e frequência)
    minHz: 40,
    maxHz: 16200,
    smoothing: 0.1, // suavização do analisador entre quadros (0..1); maior = menos tremido, mais lento
    minRange: 9.5, // como music.minRange, por faixa (agudos são fracos e ruidosos)
    silenceDb: -90, // faixa abaixo disso fica apagada (escala do espectro, não do RMS)
    volumeBoost: 0.25, // quanto o volume geral (0..1) soma em todas as faixas; 0 = só a frequência
    spread: 2, // média com as faixas vizinhas (desvio, em faixas); 0 = cada faixa sozinha
  },
  // Fogo sincronizado com a música (src/music/level.js).
  music: {
    // A escala se ajusta à música: 0% no volume abaixo do qual ela fica `low` do tempo
    // e 100% no volume abaixo do qual ela fica `high` do tempo (percentis).
    minRange: 3, // janela mínima (dB) entre "baixo" e "alto" (evita amplificar ruído)
    maxRange: 31, // janela máxima (dB); passagens mais baixas que isso ficam apagadas
    low: 0.19, // percentil que vira 0%
    high: 0.99, // percentil que vira 100% (maior = 100% só nos trechos mais altos)
    adapt: 5.2, // dB/s: quão rápido a escala acompanha a música (menor = memória mais longa)
    release: 10.2, // queda do fogo depois da batida (maior = mais seco)
    curve: 0.7, // altura exponencial: sobe pouco no começo e muito no final (0 = linear)
    silenceDb: -80, // abaixo disso o fogo fica apagado
    bassWeight: 0.35, // peso dos graves no volume (0 = só o som cheio, 1 = só graves)
    bassCutoff: 160, // Hz: até onde conta como grave
    offset: 0, // atraso (s) aplicado ao fogo; aumente só se ele vier adiantado em relação ao som
    waitingLevel: 0.23, // altura parada enquanto a música toca sem captura do áudio
  },
};

// Pentagrama de fogo dentro do anel (pentagram.js). A força cresce com as peças
// capturadas no jogo (0 = nenhuma, 1 = `total`).
export const PENTAGRAM = {
  radius: 0.9, // raio das pontas da estrela (fração do raio do anel de fogo)
  rotation: 0, // giro da estrela (rad); 0 = uma ponta para +x (lateral, igual para os dois lados)
  maxHeight: 0.8, // altura máxima das chamas (bem menor que a do anel)
  width: 0.12, // meia largura da base das chamas (as duas paredes inclinam até o centro)
  tongues: 2, // línguas de fogo por unidade de comprimento
  groundWidth: 0.35, // meia largura do brilho no chão sob as linhas
  total: 24, // capturas para a força máxima
  minHeight: 0.3, // altura (fração de maxHeight) logo na primeira captura
  opacityCurve: 2, // opacidade cresce com força^curva: devagar no começo e rápido no fim
  minOpacity: 0.08, // opacidade logo na primeira captura (bem fraquinha)
  pulse: 0.25, // quanto a altura acompanha o anel de fogo (música); 0 = só as capturas
  response: 1.2, // velocidade com que a força persegue o número de capturas
};

export function squareToWorld(sq) {
  return { x: colOf(sq) - SIZE / 2 + 0.5, z: SIZE / 2 - 0.5 - rowOf(sq) };
}

/** Converte coordenadas do mundo em casa; retorna -1 fora do tabuleiro. */
export function worldToSquare(x, z) {
  const col = Math.floor(x + SIZE / 2);
  const row = Math.floor(SIZE / 2 - z);
  if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return -1;
  return row * SIZE + col;
}

/** Posição de uma peça capturada na pilha lateral de quem capturou. */
export function trayPosition(capturedColor, index) {
  const stack = Math.floor(index / 4);
  const level = index % 4;
  const side = capturedColor === 'b' ? 1 : -1; // pretas capturadas vão para a direita das brancas
  return {
    x: side * (BOARD_EXTENT + 0.75),
    y: TABLE_Y + level * PIECE_HEIGHT,
    z: side * (2.6 - stack * 0.9),
  };
}

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
/**
 * Mola criticamente amortecida: move `state.x` até `target` sem passar do ponto
 * e sem tranco quando o alvo muda. `state = { x, v }`; `omega` em rad/s.
 */
export function spring(state, target, omega, dt) {
  // Passos pequenos mantêm a integração estável mesmo com quadros longos.
  const steps = Math.max(1, Math.ceil((omega * dt) / 0.3));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.v += (omega * omega * (target - state.x) - 2 * omega * state.v) * h;
    state.x += state.v * h;
  }
  return state.x;
}

export const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

// Raio que cai na peça capturada (lightning.js) e som do trovão (sound/thunder.js).
export const LIGHTNING = {
  height: 14, // altura de onde o raio sai (acima da câmera; a névoa não afeta o raio)
  spread: 3, // desvio horizontal máximo da origem do raio em relação à peça
  descend: 0.09, // s: tempo do raio descer do céu até a peça
  duration: 0.55, // s: brilho e piscadas depois do impacto
  core: 0xf4f8ff,
  halo: 0x8fb4ff,
  light: 0xbcd2ff,
  lightIntensity: 40, // luz pontual no impacto
  skyIntensity: 3, // clarão geral da cena
  volume: 0.8, // volume do trovão (0..1)
};

// Cratera queimada que fica onde o raio caiu até o fim do jogo (crater.js).
export const CRATER = {
  size: 1.15, // diâmetro (casas)
  depth: 4, // força do relevo (bumpScale): fundo afundado e borda levantada
  emberGlow: 2.5, // brilho das brasas logo depois do impacto
  cooling: 2.5, // s: quão rápido as brasas esfriam
  residualGlow: 0.08, // brilho fraco que sobra nas rachaduras
};

// Sons das peças (sound/pieces.js): batidas ao segurar/pousar/empilhar e sopro ao mover.
export const PIECE_SOUND = {
  volume: 0.7, // volume geral das batidas (0..1)
  motion: 0.25, // volume do som de movimento na velocidade máxima
};

// Bandeja que segura o tabuleiro e as pilhas de peças capturadas (scene.js). Fica no
// lugar da antiga mesa: abaixo dela não há chão, só o demônio que a segura (demon.js).
export const TRAY = {
  halfX: 6.15, // meia largura em x (cobre as pilhas laterais em BOARD_EXTENT + 0.75)
  halfZ: 4.95, // meia profundidade em z
  thickness: 0.22, // espessura: ~0,0011 × DEMON.scale para o polegar encostar no topo (dedos embaixo)
  corner: 0.45, // raio dos cantos arredondados
  color: 0x1c120c,
};

// Demônio gigante (demon.js) que segura a bandeja pela borda -x, de frente para +x.
export const DEMON = {
  scale: 200, // o modelo tem ~0,065 de altura; 200 = ~13 casas
  side: -1, // borda da bandeja segurada: -1 = esquerda das brancas, 1 = direita
  grip: 0.25, // onde fica a borda da bandeja na palma: 0 = no pulso, 1 = na ponta dos dedos
  breathe: 1, // intensidade do movimento parado (asas, cauda, cabeça); 0 = estátua
  roughness: 0.55, // o modelo vem com rugosidade 0 (plástico molhado); a textura modula
};
