import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './config.js';
import { AudioBus } from './audio.js';
import { Hud } from './hud.js';
import { Player, bindPlayerInput } from './player.js';
import { Level } from './level.js';
import { Game } from './game.js';
import { attachDebug } from './debug.js';
import './team/index.js';

const canvas = document.querySelector('#game-canvas');
const bootError = document.querySelector('#boot-error');

try {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  if (!renderer.getContext()) throw new Error('WebGL 不可用');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.exposure;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 180);
  scene.add(camera);

  const audio = new AudioBus();
  const hud = new Hud(audio);
  const level = new Level(scene);
  const player = new Player(camera);
  bindPlayerInput(player, canvas);
  const game = new Game({ scene, camera, canvas, hud, audio, level, player });

  hud.bind({
    onStart: () => game.start(false),
    onDemo: () => game.startDemo(),
    onResume: () => game.resume(),
    onRetry: () => game.retryFinale(),
    onRestart: () => game.start(false),
    onMenu: () => game.returnToMenu(),
    onExitDemo: () => game.finishDemo(),
  });

  document.addEventListener('pointerlockchange', () => game.onPointerLockChange());
  window.addEventListener('keydown', (event) => game.onKey(event.code));
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  const dev = import.meta.env == null || import.meta.env.DEV;
  if (dev) {
    window.__game = {
      game,
      player,
      level,
      audio,
      state: () => ({
        phase: game.phase,
        level: game.levelIndex,
        cleared: game.cleared,
        hasCamera: game.hasCamera,
        cameraState: game.cameraState,
        x: Number(player.x.toFixed(2)),
        z: Number(player.z.toFixed(2)),
        yaw: Number(player.yaw.toFixed(2)),
        anomalies: level.anomalies.length,
      }),
    };
    if (new URLSearchParams(location.search).has('debug')) {
      attachDebug({ renderer, level }).catch((error) => console.warn(error));
    }
  }

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    game.update(dt);
    renderer.toneMappingExposure = CONFIG.exposure;
    renderer.render(scene, camera);
  }
  frame();
} catch (error) {
  console.error(error);
  bootError.classList.remove('hidden');
  bootError.textContent = '这个浏览器打不开 WebGL，换 Chrome 或 Edge 再试。';
}
