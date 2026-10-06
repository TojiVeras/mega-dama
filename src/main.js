import * as THREE from 'three';
import './style.css';
import { GameController } from './controller.js';
import { Hud } from './hud.js';
import { InputController } from './input.js';
import { createBoard } from './three/board.js';
import { CameraRig } from './three/cameraRig.js';
import { GlowField } from './three/glow.js';
import { PieceSet } from './three/pieces.js';
import { createScene } from './three/scene.js';

const container = document.getElementById('app');
const { renderer, scene, camera, controls } = createScene(container);

scene.add(createBoard());
const pieces = new PieceSet(scene);
const glow = new GlowField(scene);
const rig = new CameraRig(camera, controls);

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
  scene.fog.near = dist + 4;
  scene.fog.far = dist + 30;
  pieces.update(dt, time);
  glow.update(dt, time);
  renderer.render(scene, camera);
});

// Útil para depurar no console do navegador.
window.__damas = { game, pieces, rig };
