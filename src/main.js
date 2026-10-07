import * as THREE from 'three';
import './style.css';
import { GameController } from './controller.js';
import { Hud } from './hud.js';
import { InputController } from './input.js';
import { MusicFireDriver } from './music/fireSync.js';
import { MusicPanel } from './music/panel.js';
import { TuningPanel } from './music/tuning.js';
import { createBoard } from './three/board.js';
import { CameraRig } from './three/cameraRig.js';
import { FIRE } from './three/constants.js';
import { FireRing, RandomFireDriver } from './three/fire.js';
import { GlowField } from './three/glow.js';
import { PieceSet } from './three/pieces.js';
import { createScene } from './three/scene.js';

const container = document.getElementById('app');
const { renderer, scene, camera, controls } = createScene(container);

scene.add(createBoard());
const pieces = new PieceSet(scene);
const glow = new GlowField(scene);
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

const game = new GameController({ pieces, glow, rig, hud });
input = new InputController({ canvas: renderer.domElement, camera, pieces, game });

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
  pieces.update(dt, time);
  glow.update(dt, time);
  fireDriver.update(dt, time);
  fire.update(dt, time);
  music.render(fireDriver.mode, fireDriver.sound, fire.level);
  renderer.render(scene, camera);
});

// Útil para depurar no console do navegador.
window.__damas = { game, pieces, rig, fire, fireDriver, music, tuning };
