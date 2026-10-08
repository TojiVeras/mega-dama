import * as THREE from 'three';
import './style.css';
import { GameController } from './controller.js';
import { Hud } from './hud.js';
import { InputController } from './input.js';
import { MusicFireDriver } from './music/fireSync.js';
import { eddieWanted } from './music/maiden.js';
import { MusicPanel } from './music/panel.js';
import { TuningPanel } from './music/tuning.js';
import { createBoard } from './three/board.js';
import { CameraRig } from './three/cameraRig.js';
import { FIRE, LIGHTNING, PIECE_SOUND } from './three/constants.js';
import { FireRing, RandomFireDriver } from './three/fire.js';
import { PentagramFire } from './three/pentagram.js';
import { GlowField } from './three/glow.js';
import { CraterField } from './three/crater.js';
import { Demon } from './three/demon.js';
import { Eddie } from './three/eddie.js';
import { LightningField } from './three/lightning.js';
import { PieceSet } from './three/pieces.js';
import { createScene } from './three/scene.js';
import { PieceSounds } from './sound/pieces.js';
import { ThunderSound } from './sound/thunder.js';

const container = document.getElementById('app');
const { renderer, scene, camera, controls } = createScene(container);

scene.add(createBoard());
// Demônio gigante segurando a bandeja do tabuleiro (carrega em segundo plano).
const demon = new Demon(scene);
const pieces = new PieceSet(scene);
const glow = new GlowField(scene);
const lightning = new LightningField(scene);
const craters = new CraterField(scene);
const thunder = new ThunderSound({ volume: LIGHTNING.volume });
const pieceSounds = new PieceSounds(PIECE_SOUND);
pieces.onLand = (view, kind, strength) => pieceSounds.hit(kind, strength);
// O navegador só libera áudio depois de um gesto do usuário; o raio toca mais tarde, fora dele.
window.addEventListener(
  'pointerdown',
  () => {
    thunder.unlock();
    pieceSounds.unlock();
  },
  { capture: true },
);
// Eddie: chega com um raio quando o YouTube toca Iron Maiden e anda em círculos.
const eddie = new Eddie(scene, { camera, lightning, thunder, onStrike: () => hud.lightningFlash() });
const rig = new CameraRig(camera, controls);
// Aplica os ajustes salvos do painel "Ajustes do fogo" antes de tudo que lê FIRE.
const tuning = new TuningPanel({
  root: document.getElementById('tuning'),
  fire: FIRE,
  flash: (msg) => hud.flash(msg),
  // Só é chamado por interação do usuário, quando tudo abaixo já existe.
  onChange: () => {
    fireDriver.applySettings();
    music.tabAudio.applySettings();
  },
});
const fire = new FireRing(scene);
// Pentagrama de fogo dentro do anel: mais forte conforme as peças são capturadas.
const pentagram = new PentagramFire(scene);
// Sem música, a altura do fogo é aleatória (demonstração).
const idleFireDriver = new RandomFireDriver(fire);

let input;
const hud = new Hud({
  onNewGame: () => {
    hud.hideResult();
    input.reset();
    game.newGame();
  },
  onUndo: () => {
    input.reset();
    game.undo();
  },
  onResign: () => {
    input.reset();
    game.resign();
  },
  onToggleCamera: (on) => game.setAutoCamera(on),
});

let fireDriver;
const music = new MusicPanel({
  flash: (msg) => hud.flash(msg),
  spectrum: FIRE.spectrum.enabled,
  onSpectrumChange: (on) => {
    if (fireDriver) fireDriver.useSpectrum = on;
  },
});
// Com música tocando, o fogo segue o volume do áudio (ou cada faixa de frequência).
fireDriver = new MusicFireDriver({
  fire,
  player: music.player,
  tabAudio: music.tabAudio,
  idleDriver: idleFireDriver,
});
fireDriver.useSpectrum = music.spectrum;

const game = new GameController({ pieces, glow, rig, hud, lightning, thunder, craters });
input = new InputController({ canvas: renderer.domElement, camera, pieces, game, sounds: pieceSounds });

window.addEventListener('resize', () => {
  if (!rig.animating && game.autoCamera) rig.snapTo(game.turn);
});

const timer = new THREE.Timer();
timer.connect(document); // pausa o relógio quando a aba fica em segundo plano
renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const time = timer.getElapsed();
  rig.update(dt);
  if (!rig.animating) controls.update(dt);
  // Névoa acompanha a distância da câmera (no celular em pé a câmera fica bem mais longe).
  const dist = camera.position.distanceTo(controls.target);
  scene.fog.near = dist + 2;
  scene.fog.far = dist + 14;
  input.update(dt);
  pieces.update(dt, time);
  pieceSounds.setMotion(pieces.maxSpeed());
  glow.update(dt, time);
  lightning.update(dt);
  craters.update(dt, time);
  demon.update(time);
  eddie.setWanted(eddieWanted(music.player.state, music.player.video));
  eddie.update(dt, music.player.audible);
  fireDriver.update(dt, time);
  fire.update(dt, time);
  pentagram.setCaptured(24 - game.state.board.filter(Boolean).length);
  pentagram.update(dt, time, fire.level);
  music.render(fireDriver.mode, fireDriver.sound, fire.level);
  renderer.render(scene, camera);
});

// Útil para depurar no console do navegador.
window.__damas = { game, pieces, rig, fire, pentagram, fireDriver, music, tuning, lightning, thunder, pieceSounds, craters, demon, eddie };
