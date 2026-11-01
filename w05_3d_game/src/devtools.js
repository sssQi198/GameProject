/**
 * devtools.js — 开发者模式
 *
 * 提供关卡跳转面板，可在游戏任意阶段直接跳到指定关卡。
 * 不修改 game.js / player.js / level.js / hud.js 等核心文件。
 *
 * 入口：main.js 在 if (dev) 块中调用 setupDevTools()。
 * 移除：删除本文件 + main.js 中 import 和调用行 + index.html 中 #dev-panel 与对应 CSS。
 */

import { LAYOUT } from './layout.js';
import { CONFIG } from './config.js';
import { copy } from './team/p1.js';

const LEVELS = 5;

/**
 * 初始化开发者面板。
 * @param {object} deps
 * @param {import('./game.js').Game} deps.game
 * @param {import('./player.js').Player} deps.player
 * @param {import('./level.js').Level} deps.level
 */
export function setupDevTools({ game, player, level }) {
  const panel = document.getElementById('dev-panel');
  if (!panel) {
    console.warn('[devtools] #dev-panel not found — skipped');
    return;
  }

  const closeBtn = panel.querySelector('#dev-close');
  const escPanelBtn = document.getElementById('btn-dev-panel');
  const navBtns = panel.querySelectorAll('[data-dev-go]');
  const hintEl = panel.querySelector('#dev-hint');
  const body = document.body;

  /** 面板可见 */
  let visible = false;
  /** 无敌人 */
  let noEnemy = false;
  /** 穿墙 */
  let noclip = false;
  /** 碰撞框 */
  let showColliders = false;

  function showHint(msg, duration = 2500) {
    if (!hintEl) return;
    hintEl.textContent = msg;
    hintEl.classList.remove('hidden');
    clearTimeout(hintEl._timeout);
    hintEl._timeout = setTimeout(() => {
      hintEl.classList.add('hidden');
    }, duration);
  }

  function setPanel(v) {
    visible = v;
    panel.classList.toggle('hidden', !v);
    if (v) {
      // 打开面板 → 释放指针锁定，让玩家操作面板
      document.exitPointerLock?.();
    } else {
      // 关闭面板 → 申请指针锁定（如果游戏已开始）
      // 注意：跳转后 SetPanel(false) 也会走到这里
      if (game.isLive()) game.requestLock();
    }
  }

  function openPanel() {
    setPanel(true);
  }

  function closePanel() {
    setPanel(false);
  }

  // ---- 关闭 ----
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  // ---- ESC 菜单中的 Dev Panel 按钮 ----
  if (escPanelBtn) escPanelBtn.addEventListener('click', openPanel);

  // ---- 快捷键 Ctrl+Shift+D ----
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
      e.preventDefault();
      openPanel(); // 快捷键只打开面板，不关闭
    }
  });

  // ---- 跳转逻辑 ----
  function doJump(target) {
    if (!game.isLive()) {
      // 如果当前在菜单/胜负画面，先启动游戏再跳
      game.start(false);
      // start 设置了 phase='intro'，我们需要覆盖它
    }

    // 确保演示模式关闭
    if (game.demoActive) {
      game.finishDemo();
      // 回到菜单后再 start
      game.start(false);
    }

    // 停止一切锁定/动画
    player.endLookLock();
    player.clearCourse();
    player.setControl(false);
    game.setCameraState('none');
    game.autoLowerCamera();
    level.reset();

    // 准备跳转：清空相位相关状态
    game.phase = 'level'; // 临时占位，下面会覆盖
    game.paused = false;
    game.demoActive = false;
    game.cleared = false;
    game.photoLock = 0;
    game.lookT = 0;
    game.epilogueT = 0;
    game.endingFade = 0;
    game.saidEnd = false;
    game.notedNpc = false;
    game.saidWait = false;
    game.prepareShoot = false;
    game.shakeX = 0;
    game.shakeY = 0;
    game.shakeT = 0;
    game.lineT = 0;
    game.pendingLine = null;
    game.controlHints = [];
    game.wasInside = false;
    game.hud.setSubtitle(''); // 清除序章对话字幕残留
    game.hud.setDanger(0);
    game.hud.setChase(false);
    game.hud.setAimHot(false);
    game.audio.setMood('play');
    game.audio.stopHeartbeat();
    game.hud.showPlay();
    game.hud.hidePanel();

    // 重置速度比例，避免前一个跳转残留 prologue 限速
    player.speedScale = 1;

    // 解析 level1–level5 → 调用 jumpToLevel
    const levelMatch = target.match(/^level(\d+)$/);
    if (levelMatch) {
      const levelNum = parseInt(levelMatch[1], 10);
      jumpToLevel(levelNum);
      return;
    }

    switch (target) {
      case 'intro': {
        // 跳转到序章对话
        game.phase = 'intro';
        game.levelIndex = 0;
        player.reset(LAYOUT.spawn.x, LAYOUT.spawn.z, LAYOUT.spawn.yaw);
        player.setScripted(false);
        player.setLamp(CONFIG.lampDim);
        level.setDoorAjar(true);
        level.setNpcState('idle');
        level.beginPrologue();
        // 重置 intro 状态
        game.introCooldown = 0;
        game.introIndex = 0;
        game.introPhase = 0;
        game.introWait = 0;
        game.hud.setRecord(0, LEVELS);
        game.hud.setObjective(copy.follow);
        game.say('你醒过来了。前面有一个人…', 2.4);
        showHint('已跳转到序章> 对话阶段');
        break;
      }

      case 'prologue': {
        // 跳转到序章探索（出事之后）
        game.phase = 'prologue';
        game.levelIndex = 0;
        player.reset(LAYOUT.spawn.x, LAYOUT.spawn.z, LAYOUT.spawn.yaw);
        player.setScripted(false);
        player.setControl(true);
        player.setLamp(CONFIG.lampDim);
        level.reset();
        level.beginPrologue();
        level.setDoorOpen(true);
        level.hideNpc(); // npc 已进教室
        game.notedNpc = true;
        game.hud.setRecord(0, LEVELS);
        game.hud.setObjective(copy.follow);
        player.speedScale = CONFIG.prologueSpeed / CONFIG.walkSpeed;
        showHint('已跳转到序章> 探索阶段');
        break;
      }

      case 'level': {
        // 跳转到第 1–5 关
        const levelNum = game.levelIndex || 1;
        jumpToLevel(levelNum);
        break;
      }

      case 'finalelook': {
        // 终局注视
        game.levelIndex = LEVELS + 1;
        player.reset(0.4, LAYOUT.hall.z, -Math.PI / 2);
        player.setScripted(false);
        player.setLamp(CONFIG.lampChase);
        level.reset();
        level.spawnUpTo(LEVELS);
        level.loopEnabled = false;
        level.setDoorOpen(false);
        level.showExit(true);
        level.hideNpc();
        level.hidePickup();
        // 委托原版 beginFinale 设置终局注视状态（含 objective、say、audio 等）
        game.beginFinale();
        showHint('已跳转到终局> 注视阶段');
        break;
      }

      case 'finalechase': {
        // 终局追逐
        game.levelIndex = LEVELS + 1;
        player.reset(40, LAYOUT.hall.z, 0);
        player.setScripted(false);
        player.setControl(true);
        player.setLamp(CONFIG.lampChase);
        level.reset();
        level.spawnUpTo(LEVELS);
        level.loopEnabled = false;
        level.setDoorOpen(false);
        level.showExit(true);
        level.hideNpc();
        level.hidePickup();
        const z2 = Math.max(LAYOUT.hall.minZ + 0.45, Math.min(LAYOUT.hall.maxZ - 0.45, LAYOUT.hall.z));
        level.placeEntity(player.x - CONFIG.entityGap, z2);
        player.endLookLock();
        game.phase = 'finaleChase';
        game.audio.startHeartbeat();
        game.audio.setMood('chase');
        game.hud.setObjective(copy.runToExit);
        game.hud.setChase(true);
        game.autoLowerCamera();
        game.say('反方向 · 按住 Shift · EXIT', 2.4);
        showHint('已跳转到终局> 追逐阶段');
        break;
      }

      case 'epilogue': {
        // 尾声
        player.reset(LAYOUT.exitX + 0.5, LAYOUT.hall.maxZ - 0.5, Math.PI);
        player.setScripted(false);
        player.setControl(true);
        player.setLamp(CONFIG.lamp * 0.7);
        level.reset();
        level.spawnUpTo(LEVELS);
        level.hideEntity();
        level.hideNpc();
        level.hidePickup();
        level.showExit(true);
        game.phase = 'epilogue';
        game.epilogueT = 0;
        game.endingFade = 0;
        game.saidEnd = false;
        game.audio.stopHeartbeat();
        game.audio.setMood('calm');
        game.hud.setChase(false);
        game.hud.setDanger(0);
        game.hud.setObjective(copy.aheadPerson);
        game.hud.setRecord(LEVELS, LEVELS);
        showHint('已跳转到尾声');
        break;
      }

      case 'win': {
        // 胜利画面
        game.phase = 'win';
        game.hud.showPanel('win', '胜利', '一切还未结束…');
        game.audio.setMood('calm');
        game.audio.stopHeartbeat();
        game.audio.win();
        showHint('已跳转到胜利画面');
        break;
      }

      default:
        showHint(`未知目标: ${target}`);
        return;
    }

    // 跳转成功后自动关闭面板并锁定鼠标
    closePanel();
  }

  function jumpToLevel(num) {
    if (num < 1 || num > LEVELS) {
      showHint(`关卡 ${num} 无效（1–${LEVELS}）`);
      return;
    }
    game.levelIndex = num - 1;
    game.phase = 'level';
    game.cleared = false;
    game.hasCamera = num > 1; // 从第 2 关起认为已有相机
    game.time = 0;
    player.reset(LAYOUT.pickup.x, LAYOUT.room.maxZ - 2.5, 0);
    player.setControl(true);
    player.setScripted(false);
    player.setLamp(game.hasCamera ? CONFIG.lamp : CONFIG.lampDim);
    level.reset();
    // 委托原版 beginLevel 设置关卡状态（含异常提示 objective）
    game.beginLevel(num);
    level.loopEnabled = num > 1; // 第 2 关起走廊可循环（覆盖 beginLevel 默认值）
    game.setCameraState(game.hasCamera ? 'holstered' : 'none');
    showHint(`已跳转到第 ${num} 关`);
  }

  // ---- 按钮绑定 ----
  for (const btn of navBtns) {
    const target = btn.getAttribute('data-dev-go');
    btn.addEventListener('click', () => doJump(target));
  }

  // ---- 给予相机 ----
  const giveCamBtnEl = document.getElementById('dev-give-camera');
  if (giveCamBtnEl) {
    giveCamBtnEl.addEventListener('click', () => {
      if (!game.isLive()) { showHint('游戏未进行中'); return; }
      game.setCameraState('holstered');
      game.hasCamera = true;
      level.hidePickup();
      game.player.setLamp(CONFIG.lamp);
      showHint('已给予相机（E 拿出）');
    });
  }

  // ---- 强制通关 ----
  const forceClearBtnEl = document.getElementById('dev-force-clear');
  if (forceClearBtnEl) {
    forceClearBtnEl.addEventListener('click', () => {
      if (game.phase !== 'level') { showHint('当前不在关卡中'); return; }
      game.forceCurrentPhoto();
      showHint('当前关卡已清除');
    });
  }

  // ---- 碰撞框 ----
  const collidersBtnEl = document.getElementById('dev-colliders');
  if (collidersBtnEl) {
    collidersBtnEl.addEventListener('click', () => {
      showColliders = !showColliders;
      level.setColliderDebug(showColliders);
      collidersBtnEl.classList.toggle('active', showColliders);
      showHint(showColliders ? '碰撞框显示' : '碰撞框隐藏');
    });
  }

  // ---- 无敌人 ----
  const noEnemyBtnEl = document.getElementById('dev-no-enemy');
  if (noEnemyBtnEl) {
    noEnemyBtnEl.addEventListener('click', () => {
      noEnemy = !noEnemy;
      if (noEnemy && level.entity) {
        level.entity.visible = false;
        level.entityLight.intensity = 0;
      } else if (level.entity) {
        level.entity.visible = true;
        if (game.phase === 'finaleChase' || game.phase === 'finaleLook') {
          level.entityLight.intensity = 0.6;
        }
      }
      noEnemyBtnEl.classList.toggle('active', noEnemy);
      showHint(noEnemy ? '敌人已隐藏' : '敌人已恢复');
    });
  }

  // ---- 穿墙 ----
  const noclipBtnEl = document.getElementById('dev-noclip');
  if (noclipBtnEl) {
    noclipBtnEl.addEventListener('click', () => {
      noclip = !noclip;
      // 穿墙通过劫持 player 的碰撞半径实现
      if (noclip) {
        game.player.radius = 0.01; // 极小半径≈穿墙
      } else {
        game.player.radius = CONFIG.playerRadius;
      }
      noclipBtnEl.classList.toggle('active', noclip);
      showHint(noclip ? '穿墙模式开启（碰撞半径 0.01）' : '穿墙模式关闭');
    });
  }
}
