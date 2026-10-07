# Damas 3D — guia para trabalhar no projeto

Jogo de damas brasileiras em 3D, multiplayer local (dois jogadores no mesmo dispositivo), feito com **Three.js + Vite**, JavaScript puro (ES modules), sem framework de UI. Interface e comentários em português.

## Comandos

```bash
npm install        # dependências
npm run dev        # servidor de desenvolvimento (http://localhost:5173)
npm test           # testes das regras (Vitest)
npm run build      # build estático em dist/
npm run preview    # serve o dist/ (http://localhost:4173)
```

Antes de considerar uma mudança pronta: `npm test` e `npm run build` precisam passar. Mudança visual/interação: abra no navegador e teste com o mouse (arrastar, clique-clique, captura múltipla, desfazer, troca de câmera). No console do navegador, `window.__damas` expõe `{ game, pieces, rig }` para inspecionar/forçar posições.

## Arquitetura

```
src/
  game/rules.js        Motor de regras PURO (sem Three.js/DOM). Única fonte de verdade das regras.
  game/rules.test.js   Testes Vitest das regras.
  controller.js        GameController: estado, histórico (desfazer), lance em andamento,
                       orquestra animações, brilhos, câmera e HUD.
  input.js             InputController: hover, arrastar, clique-clique (pointer events).
  hud.js               Interface HTML sobreposta (turno, placar, avisos, modal de fim/regras).
  main.js              Monta tudo e roda o loop de render.
  style.css            Estilos da HUD.
  three/
    constants.js       Dimensões, alturas de arraste, cores, conversões casa <-> mundo, easing.
    scene.js           Renderer, luzes, ambiente, OrbitControls (botão direito gira).
    board.js           Tabuleiro com textura de madeira gerada em canvas (com coordenadas).
    pieces.js          PieceView (malha + animação de cada peça) e PieceSet (coleção).
    glow.js            GlowField: brilho das casas possíveis e anéis de captura obrigatória.
    cameraRig.js       Posição da câmera por jogador e animação de troca de lado.
    fire.js            FireRing (anel de fogo: altura via setLevel 0..1 ou por faixa via setBands) e
                       RandomFireDriver (demo).
    pentagram.js       PentagramFire: pentagrama de fogo dentro do anel (mesmo shader de chamas). Força =
                       capturas / 24 (setCaptured); altura linear, opacidade em curva. Ajustes em PENTAGRAM.
    lightning.js       LightningField: raio que cai na peça capturada (tubos aditivos, galhos, faíscas,
                       onda de choque, luz de impacto). Ajustes em LIGHTNING (constants.js).
    crater.js          CraterField: cratera queimada (texturas de canvas: cor, relevo, brasas) onde o raio
                       caiu. Fica até o fim do jogo; `tag` = history.length, some ao desfazer o lance.
  sound/
    audio.js           AudioContext compartilhado (unlockAudio no primeiro pointerdown) e buffers de ruído.
    thunder.js         ThunderSound: som de raio sintetizado com Web Audio (estalo + estrondo + trovão).
    pieces.js          PieceSounds: batidas sintetizadas (pick/tap/board/stack/crown) e sopro contínuo que
                       segue PieceSet.maxSpeed(). Pouso vem de PieceView.onLand (fim do moveTo / coroa).
  music/
    youtubeUrl.js      parseYouTubeUrl (puro, testado): link/id -> { videoId, listId }.
    youtube.js         YouTubePlayer: carrega a IFrame API e toca vídeo/playlist.
    tabAudio.js        TabAudio: captura o áudio da própria aba (getDisplayMedia) e mede o volume (RMS).
    spectrum.js        logBands / bandBins / bandDb: espectro -> faixas de frequência. Puro, testado.
    level.js           LevelTracker (volume em dB -> altura 0..1) e DelayLine. Puro, testado.
    fireSync.js        MusicFireDriver: escolhe o modo do fogo (audio / waiting / idle).
    panel.js           MusicPanel: painel HTML (botão "Música" na barra).
    tuning.js          TuningPanel: painel "Ajustes do fogo" com um slider por parâmetro de FIRE (ao vivo,
                       salvo no localStorage; "Copiar" exporta os valores para constants.js).
index.html             Markup da HUD e diálogo de regras.
```

Fluxo de um lance: `InputController` → `GameController.step(view, casa)` → valida contra `getLegalMoves` → anima a peça → se for captura, `strike` (raio + trovão + clarão na tela) → se ainda houver saltos, guarda `pending` (peça travada) → senão `finishMove` → peças capturadas voam para a pilha lateral → `applyMove` → `CameraRig.goTo(próximo jogador)`.

### Música e fogo

O áudio do iframe do YouTube é de outra origem e **não pode** ser lido pelo Web Audio. Por isso o
fogo só segue a música quando o usuário compartilha **esta aba com áudio** (Chromium no computador;
o seletor abre junto com o "Tocar" ou no botão *Sincronizar*). Com captura, a altura do fogo é o
volume da música (RMS em dB do sinal cheio + graves filtrados < 150 Hz, janela de ~43 ms),
normalizado entre os percentis 10% e 95% do volume da própria música, estimados ao longo de
dezenas de segundos (escala automática que não "achata" verso baixo × refrão alto), sem atraso
(compensar a latência de saída deixava o fogo atrasado). No `FireRing`, volume e faixas seguem o
alvo com mola criticamente amortecida (`spring`, `FIRE.rise`/`FIRE.fall`) para subir e descer
sem tranco; o volume move a luz
e o brilho do chão. Opcionalmente (botão "Frequência" no painel, `FIRE.spectrum.enabled`, `fireDriver.useSpectrum`), o anel vira um **equalizador**: `FIRE.bands` (32) faixas log de 40 Hz a 12 kHz, cada uma
com seu `LevelTracker` (escala própria), vão para uma textura 1D lida pelo shader. O espectro é
espelhado duas vezes na volta: graves na frente de cada jogador (+z/-z), agudos nas laterais. Sem
captura o fogo fica baixo e parado; sem música (ou pausada), volta ao `RandomFireDriver`. Ajuste a
"sensação" em `FIRE.music` (`constants.js`); `__damas.fireDriver.offset` ajusta o atraso ao vivo.

### Convenções importantes

- **Tabuleiro**: índice `row * 8 + col`; `row 0` = lado das brancas; `a1` (0) é escura; jogáveis: `(row + col) % 2 === 0`.
- **Mundo 3D**: 1 casa = 1 unidade, superfície do tabuleiro em `y = 0`. Brancas em `+z`, pretas em `-z`. Use sempre `squareToWorld` / `worldToSquare` de `three/constants.js`.
- **Lances** (`rules.js`): `{ from, path: [pousos em ordem], captures: [casas capturadas em ordem], promote }`. Captura múltipla é feita passo a passo na UI com `movesMatchingPrefix` / `nextLandings`.
- **Estado é imutável**: `applyMove` devolve um novo estado; o histórico guarda os estados anteriores (desfazer = `history.pop()` + `rebuildViews()`).
- **IDs de peça**: cada peça do estado tem `id` estável; `PieceSet` mapeia `id -> PieceView`. Peças nas pilhas laterais têm `inTray = true` e são ignoradas em raycast e colisão. Após desfazer, as pilhas são recriadas com ids a partir de 1000.
- **Animação**: nada de bibliotecas de tween. Cada `PieceView.update(dt)` cuida de `tween` (moveTo em arco), `follow` (arraste, com amortecimento exponencial `damp`) e inclinação. `moveTo` calcula a altura do arco para passar por cima de peças (`obstacleHeightAt`).
- **Sobrevoo no arraste**: `GameController.dragHeight` sobe a peça para acima da peça mais alta embaixo dela (`FLY_MARGIN`); `DRAG_LIFT` é propositalmente menor que a altura de uma peça.
- **Brilho das casas**: `glow.js` desenha as 4 paredes laterais (sem topo/fundo) de um cubo do tamanho da casa com shader aditivo que esmaece para cima, mais um piso translúcido. Azul = movimento, laranja = captura.
- **Câmera**: botão esquerdo é reservado para as peças; OrbitControls usa botão direito (girar) e roda (zoom). Durante a animação de troca de turno os controles ficam desabilitados.
- `three` é importado como `three` e os addons como `three/addons/...`.

## Regras (damas brasileiras) — onde mexer

Tudo em `src/game/rules.js`, coberto por `rules.test.js`. Ao alterar regras, **escreva/ajuste o teste primeiro**. Implementado:

- Brancas começam; pedras andam 1 casa para frente e capturam para frente e para trás.
- Dama voadora (anda e captura à distância, pousa em qualquer casa livre depois da peça).
- Captura obrigatória com **lei da maioria** (máximo de peças; pedra e dama valem igual).
- Peças capturadas só saem no fim do lance e não podem ser saltadas de novo (golpe turco).
- Pedra só é promovida se **terminar** o lance na última fileira.
- Derrota sem peças ou sem lances; empate após `DRAW_KING_MOVES` (20) lances de cada jogador só com damas, sem captura.

Não implementado (ideias): regras de final (ex.: 2 damas × 1 dama em 5 lances), empate por repetição, proposta de empate, IA, multiplayer online, efeitos sonoros.

## Publicação

O build é estático (`dist/`) e usa `base: './'` no `vite.config.js`, então funciona em qualquer hospedagem e em subpastas.

- **GitHub Pages** (configurado): `.github/workflows/deploy.yml` roda testes, build e publica a cada push na `main`. No repositório: *Settings → Pages → Source: GitHub Actions*.
- **Netlify**: `netlify.toml` pronto (ou arraste `dist/` em https://app.netlify.com/drop).
- **Vercel / Cloudflare Pages**: build `npm run build`, saída `dist`.

## Cuidados

- Mantenha `rules.js` sem dependências de Three.js/DOM (é testado em Node).
- Ao criar materiais/geometrias por peça, libere em `PieceView.dispose()`; geometrias compartilhadas ficam em `SHARED` (pieces.js).
- Ajustes de "sensação" (altura de arraste, velocidade, cores do brilho) ficam em `three/constants.js`.
- Teste também em tela de celular em pé (o `CameraRig.fitRadius` afasta a câmera e olha mais de cima).
