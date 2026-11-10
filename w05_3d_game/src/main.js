import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './config.js';
import { AudioBus } from './audio.js';
import { Hud } from './hud.js';
import { Player, bindPlayerInput } from './player.js';
import { Level } from './level.js';
import { createSafehouse } from './safehouse.js';
import { configureMateModel, PROCEDURAL_MATE } from './team/m2.js';
import { Game } from './game.js';
import { attachDebug } from './debug.js';
import './team/index.js';
import { setupDevTools } from './devtools.js';

const canvas = document.querySelector('#game-canvas');
const bootError = document.querySelector('#boot-error');

try {
  // 同学模型可以在地址栏里临时换掉（不用改代码）：
  //   ?mate=proc                      用程序化那套（接 glb 之前的老模型）
  //   ?mate=/assets/models/xxx.glb    换成一个 glb
  //   &mateface=keep                  保留 glb 自带的五官（默认隐藏，给红眼尖牙让位）
  // 两个参数各管各的：只写 mateface=keep 也生效（不换模型，只把五官露回来）。
  // 位置必须在最前面：Level 是下一个 new 出来的东西，它的讲台旁那个同学也走这套配置，
  // 而 glb 是异步加载的——晚一步再配，教室里的同学就已经按旧地址开始加载了。
  {
    const mateParams = new URLSearchParams(location.search);
    const mateParam = mateParams.get('mate');
    const keepFace = mateParams.get('mateface') === 'keep';
    if (mateParam || keepFace) {
      const url = !mateParam
        ? null
        : (mateParam === '1' || mateParam === 'procedural' ? PROCEDURAL_MATE : mateParam);
      configureMateModel(url, keepFace ? { hideMaterials: [] } : undefined);
    }
  }

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
  // 追逐伴奏现在有四份候选（第十九轮），地址栏里可以直接指定听哪一份：
  //   ?chase=1..4   1=A 脉搏  2=B 锯弦  3=C 锤击  4=D 耳语   0 = 不放伴奏
  // 不写就用上次在 dev/chase-bgm.html 里选的那份（localStorage: wf-chase），
  // 从没挑过就是 3 = C · 锤击（`DEFAULT_CHASE_TRACK`，audio.js:29）。
  // 「不写」包括 `?chase=0`——那是明确的「关」，不是「用默认」。
  {
    const chaseParam = new URLSearchParams(location.search).get('chase');
    if (chaseParam !== null && chaseParam !== '') audio.setChaseTrack(Number(chaseParam));
  }
  const hud = new Hud(audio);
  const level = new Level(scene);
  const player = new Player(camera);
  // 安全屋常驻场景但整组 invisible：和走廊隔着 54 米，雾又厚，看不见彼此。
  // 提前建好还有额外好处——终局换场那一下不会因为建几何而卡帧。
  const safehouse = createSafehouse(scene);
  // 安全屋里自带 3 盏点光源（+ 同学脸上的红眼灯），而它对 level 来说是个「随时会显示/隐藏的组」：
  // 进门那一下如果让灯数变一次，NUM_POINT_LIGHTS 就变，全场材质重编译 —— 那一帧必卡。
  // 所以跟异常组一样收编进常量光源池（level.js 的 POINT_POOL_SIZE 里有完整说明）。
  level.adoptGroupLights(safehouse.group);
  bindPlayerInput(player, canvas);
  const game = new Game({ scene, camera, canvas, hud, audio, level, player, safehouse });

  // 新材质进场时异步预编译着色器。level.js 里一直有这几个调用点
  // （"先让渲染器编译，避免玩家第一次看到它时掉帧"），但之前没人赋值，
  // 所以一直是空转。（第二十三轮：这两段从空转改成真干活，见下。）
  //
  // 这里刻意用同步的 renderer.compile()，而不是 r170 的 compileAsync()：
  // compileAsync 内部是 setTimeout 轮询 materials，逐帧读 currentProgram.isReady()。
  // 只要某个材质对应的物体在这 10ms 窗口里被隐藏（终局第 2 段就是整层 level 立刻隐藏），
  // currentProgram 就是 undefined，轮询会抛 "Cannot read properties of undefined
  // (reading 'isReady')" —— 这个异常在定时器里，catch 不到，只能不踩。
  // 同步版没有轮询窗口；丢到空闲回调里跑，避免卡住当前帧。
  let compilePending = false;
  // 贴图预上传（renderer.initTexture，第二十三轮加）。为什么要单独做这一件：
  // 灯数恒定之后（level.js 的 POINT_POOL_SIZE），换场那一下 programs 已经不涨了，
  // 剩下的最大单帧来自贴图**第一次上传**：异常那批 1024×1024 的肉质贴图平时藏在
  // 视线外的墙上，等镜头真转过去才上传，软光栅下要生成 mipmap，单张就是 300ms 级。
  // 所以在"场景刚变、玩家还背对着它"的那个空闲点把它们先传上去。
  // initTexture 只传像素、不编译着色器，任何时候调都不会让 shader 变体错位。
  const warmTextures = (root) => {
    if (!root || typeof renderer.initTexture !== 'function') return 0;
    const seen = new Set();
    let count = 0;
    root.traverse((object) => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const key of Object.keys(material)) {
          const value = material[key];
          if (!value || value.isTexture !== true || seen.has(value)) continue;
          seen.add(value);
          try { renderer.initTexture(value); count += 1; } catch (error) { /* 传不上去就算了，别拦着开门 */ }
        }
      }
    });
    return count;
  };
  level.onSceneChanged = () => {
    if (compilePending) return;
    compilePending = true;
    const run = () => {
      compilePending = false;
      if (typeof renderer.compile === 'function') {
        try {
          renderer.compile(scene, camera);
        } catch (error) {
          console.warn('[prewarm] 着色器预编译失败', error);
        }
      }
      // 编译完再传贴图：compile 会把材质/贴图挂进渲染器的属性表，顺序反了就白传一遍。
      try { warmTextures(scene); } catch (error) { console.warn('[prewarm] 贴图预上传失败', error); }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 400);
  };
  // 玩家还在主菜单时就把第 5 关那套重场景建好（只建不入场），
  // 这样走廊预建时几乎不用再花时间。
  const prewarmLevel5 = () => {
    try { level.prewarm(5); } catch (e) { console.warn('[prewarm] 第 5 关预建失败', e); }
    // 预建出来的组还不在场景里，compile 遍历不到它；贴图照样可以先传（initTexture 不查场景）。
    // 顺手把整场扫一遍，安全屋那套（隐藏着、要等终局才露面）也一起预热掉。
    try { warmTextures(level.getPrewarmed(5)); } catch (e) { console.warn('[prewarm] 异常贴图预上传失败', e); }
    try { warmTextures(scene); } catch (e) { console.warn('[prewarm] 场景贴图预上传失败', e); }
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(prewarmLevel5, { timeout: 5000 });
  else setTimeout(prewarmLevel5, 1500);

  hud.bind({
    // 点「开始」先走开场衔接（渐黑 → F11 提示 → 再黑 → 淡进序章、BGM 渐起），
    // 衔接段末尾由 game.updateBoot() 在全黑里调 start(false)
    onStart: () => game.beginBoot(),
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
  // 无头环境拿不到可信截图时，把渲染结果缩到 64×40 统计一次亮度/红色，
  // 写进 body.dataset.pix，供 _tools/pixcheck.py 之类的脚本核对（?ending=...&probe=1）
  const probeParams = new URLSearchParams(location.search);
  if (probeParams.get('probe') === '1') {
    const dumpPixels = (tag) => {
      try {
        const w = 64;
        const h = 40;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.drawImage(renderer.domElement, 0, 0, w, h);
        const data = g.getImageData(0, 0, w, h).data;
        let lum = 0;
        let red = 0;
        let maxR = 0;
        let n = 0;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const i = (y * w + x) * 4;
            const r = data[i];
            const gg = data[i + 1];
            const b = data[i + 2];
            lum += 0.2126 * r + 0.7152 * gg + 0.0722 * b;
            if (r > 90 && r > 2 * gg + 20 && r > 2 * b + 20) {
              red += 1;
              if (r > maxR) maxR = r;
            }
            n += 1;
          }
        }
        document.body.dataset[tag] = `${(lum / n).toFixed(1)}|${red}|${maxR}`;
        // 配套诊断：真在画东西吗？画了几次？相机在哪？
        const gl = renderer.getContext();
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        document.body.dataset.gl = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
        document.body.dataset.draw = `${renderer.info.render.calls}|${renderer.info.render.triangles}`;
        document.body.dataset.cam = [
          camera.position.x.toFixed(2),
          camera.position.y.toFixed(2),
          camera.position.z.toFixed(2),
          camera.rotation.y.toFixed(2),
          camera.rotation.x.toFixed(2),
        ].join(',');
        document.body.dataset.diag = JSON.stringify({
          phase: game.phase,
          stage: game.endStage,
          endT: Number(game.endT.toFixed(2)),
          px: player.x,
          pz: player.z,
          pyaw: Number(player.yaw.toFixed(3)),
          pitch: Number(player.pitch.toFixed(3)),
          feetY: player.feetY,
          gait: [player.gaitAmount, player.gaitPhase, player.gaitPulse, player.gaitPulseVelocity],
          grounded: player.grounded,
          mate: game.safehouse ? game.safehouse.mateChestPoint() : null,
          door: game.safehouse ? game.safehouse.doorAngle() : null,
          chase: audio.chaseMusic ? audio.chaseMusic.info() : null,
        });
        // 追逐伴奏核对：选的是第几份 / 真在跑吗 / 强度多少
        if (audio.chaseMusic) {
          const info = audio.chaseMusic.info();
          // 第一个字段用「玩家选的编号」而不是 ChaseMusic 内部下标：选 0（关）时
          // 内部下标仍是 0+1=1，写出来会误报成「选了 A 但没响」。
          const sel = Number.isFinite(audio.chaseTrackIndex) ? audio.chaseTrackIndex : info.index;
          const id = sel > 0 ? info.id : 'off';
          document.body.dataset.chase = `${sel}|${id}|${info.playing ? 'on' : 'off'}|${info.intensity}`;
        }
      } catch (error) {
        document.body.dataset[tag] = 'err:' + (error && error.message);
      }
    };
    // 采样一帧（?probe=1 专用；正常游玩时整段不执行）
    const shoot = (tag) => {
      game.update(0.016);
      renderer.render(scene, camera);
      dumpPixels(tag);
    };
    // 探针专用后门：让 CDP 在任意时刻再抓一帧（含 dataset.chase / dataset.diag）。
    // 只有 ?probe=1 时才挂，正常游玩时这个函数不存在。
    window.__probeDump = (tag = 'pix') => {
      try {
        game.update(0.016);
        renderer.render(scene, camera);
      } catch (error) {
        // 抓帧失败也要把错误落到 dataset 上，别静默
        document.body.dataset[tag] = 'err:' + (error && error.message);
      }
      dumpPixels(tag);
      return {
        chase: document.body.dataset.chase || null,
        diag: document.body.dataset.diag || null,
        pix: document.body.dataset[tag] || null,
      };
    };
    shoot('pix');
    // ?audiotest=1：在真浏览器里把三个采样真拉一遍、真解码一遍，
    // 结果写进 body.dataset.audio（键名 | AudioContext 状态 | 采样率）。
    // 无头环境没有用户手势，所以要配合 --autoplay-policy=no-user-gesture-required。
    if (probeParams.get('audiotest') === '1') {
      try {
        audio.unlock();
      } catch (error) {
        document.body.dataset.audio = 'unlock-err:' + (error && error.message);
      }
      setTimeout(() => {
        const keys = Object.keys(audio.samples || {}).sort().join(',');
        const ctx = audio.ctx;
        document.body.dataset.audio = `${keys || 'none'}|${ctx ? ctx.state : 'no-ctx'}|${ctx ? Math.round(ctx.sampleRate) : 0}`;
      }, 2400);
    }
    setTimeout(() => {
      // 3.2 秒后：模型 / 眼睛 / 灯光着色器都已就位，这一帧才是有参考价值的成片帧
      shoot('pixLate');
      // ?turn=<弧度>：把视角强转到某方向再采一帧，用来量安全屋各朝向的照度
      const turn = Number(probeParams.get('turn'));
      if (probeParams.get('turn') && Number.isFinite(turn)) {
        player.endAutoTurn();
        player.endLookLock();
        player.yaw = turn;
        player.pitch = 0;
        shoot('pixTurn');
      }
    }, 3200);
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
      // 性能取证用：draw call / 着色器程序 / 几何与贴图计数都在 renderer.info 上，
      // 没有这一层就只能靠肉眼猜「卡在哪」。（只在 dev 块里暴露，不影响正式流程）
      renderer,
      scene,
      camera,
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
          'epilogue': 'ending',
          'ending': 'ending',
          'badend': 'badend',
          'win': 'badend',
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
