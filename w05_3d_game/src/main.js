import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './config.js';
import { AudioBus } from './audio.js';
import { Hud } from './hud.js';
import { Player, bindPlayerInput } from './player.js';
import { Level } from './level.js';
import { Game } from './game.js';
import { attachDebug } from './debug.js';
import './team/index.js';
import { setupDevTools } from './devtools.js';

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

  // 新材质进场时异步预编译着色器。level.js 里一直有这两个调用点
  // （"先让渲染器编译，避免玩家第一次看到它时掉帧"），但之前没人赋值，
  // 所以一直是空转。compileAsync 走 KHR_parallel_shader_compile，不阻塞主线程。
  level.onSceneChanged = () => {
    if (typeof renderer.compileAsync !== 'function') return;
    renderer.compileAsync(scene, camera).catch(() => {});
  };
  // 玩家还在主菜单时就把第 5 关那套重场景建好（只建不入场），
  // 这样走廊预建时几乎不用再花时间。
  const prewarmLevel5 = () => { try { level.prewarm(5); } catch (e) { console.warn('[prewarm] 第 5 关预建失败', e); } };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(prewarmLevel5, { timeout: 5000 });
  else setTimeout(prewarmLevel5, 1500);

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

  // 调试入口：?ending 直接播放尾声，方便检查同学回头与红眼
  const endingParam = new URLSearchParams(location.search).get('ending');
  if (endingParam !== null) {
    setTimeout(() => {
      if (endingParam === 'sim') {
        game.debugSimulateEnding();
        return;
      }
      game.debugPlayEnding(endingParam);
      // 无头环境 rAF 不一定会跑到下一帧，这里同步推进并画一帧，便于截图核对
      game.update(0.016);
      renderer.render(scene, camera);
    }, 600);
  }
  // 把运行时错误留在 DOM 上，便于无头环境排查
  window.addEventListener('error', (event) => {
    document.body.dataset.lastError = String(event.message || 'error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    document.body.dataset.lastError = 'rejection: ' + String(event.reason && event.reason.message || event.reason);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  const dev = true;
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
    setupDevTools({ game, player, level });
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has('devLevel')) {
      const val = searchParams.get('devLevel');
      // 延迟一帧等绑定完成后再跳转
      requestAnimationFrame(() => {
        const mappings = {
          'intro': 'intro',
          'prologue': 'prologue',
          '1': 'level1',
          '2': 'level2',
          '3': 'level3',
          '4': 'level4',
          '5': 'level5',
          'finale': 'finalelook',
          'finalelook': 'finalelook',
          'finalechase': 'finalechase',
          'epilogue': 'epilogue',
          'win': 'win',
        };
        const target = mappings[val];
        if (target) {
          // 模拟点击对应的跳转按钮
          const btn = document.querySelector(`[data-dev-go="${target}"]`);
          if (btn) btn.click();
          console.log(`[devtools] URL: ?devLevel=${val} → ${target}`);
        } else {
          console.warn(`[devtools] unknown devLevel value: ${val}`);
        }
      });
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
  const message = String((error && error.message) || error);
  bootError.textContent = /WebGL|webgl/.test(message)
    ? '这个浏览器打不开 WebGL，换 Chrome 或 Edge 再试。'
    : '游戏启动失败，请刷新页面再试。';
}
