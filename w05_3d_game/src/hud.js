import { Viewfinder } from './viewfinder.js';
import { panelCopy } from './team/p1.js';

/** DOM 界面：标题、HUD、暂停 / 胜负、音量。不碰 Three 场景。 */
export class Hud {
  constructor(audio) {
    this.audio = audio;
    this.viewfinder = new Viewfinder();
    this.menu = byId('menu');
    this.hud = byId('hud');
    this.panel = byId('screen-panel');
    this.panelTitle = byId('panel-title');
    this.panelText = byId('panel-text');
    this.record = byId('record');
    this.timer = byId('timer');
    this.objective = byId('objective');
    this.subtitle = byId('subtitle');
    this.prompt = byId('prompt');
    this.crosshair = byId('crosshair');
    this.danger = byId('danger');
    this.demoBadge = byId('demo-badge');
    this.exitDemo = byId('btn-exit-demo');
    this.muteButtons = [...document.querySelectorAll('[data-mute]')];
    this.menuNote = byId('menu-note');
    this.chase = byId('chase');
    this.chaseFlash = byId('chase-flash');
    // 注意命名：DOM 节点叫 *Node，方法叫 fadeWhite/fadeBlack。
    // 之前两者同名，实例属性把原型方法挡住了，hud.fadeWhite(1) 会直接 TypeError。
    this.fadeWhiteNode = document.getElementById('fade-white') || null;
    this.fadeBlackNode = document.getElementById('fade-black') || null;
    // 演示收尾用的第三层：z-index 6，能压住 #menu。只由 fadeCut/dissolveCut 写。
    this.fadeCutNode = document.getElementById('fade-cut') || null;
    this.fadeShown = { white: -1, black: -1 };
    this.cutShown = -1;
    this.cutAnim = 0;
    // 开场衔接（第二十一轮）：z-5 的黑幕 + 正中那行「按 F11 获得沉浸式体验」。
    // 黑幕比 #menu（z-4）高一层，所以「渐黑」能真的把标题页压下去。
    this.bootCurtainNode = document.getElementById('boot-curtain') || null;
    this.bootHintNode = document.getElementById('boot-hint') || null;
    this.bootShown = -1;
    this.bootHintShown = -1;
    this.buttons = {
      resume: byId('btn-resume'),
      retry: byId('btn-retry'),
      restart: byId('btn-restart'),
      menu: byId('btn-back'),
    };
    this.menuVolume = byId('menu-volume');
    this.panelVolume = byId('panel-volume');
    this.menuVolume.value = String(audio.volume);
    this.panelVolume.value = String(audio.volume);
    syncSliderFill(this.menuVolume);
    syncSliderFill(this.panelVolume);
    this.syncMute(audio.muted);

    const pushVolume = (value) => {
      audio.unlock();
      audio.setVolume(value);
      this.menuVolume.value = String(value);
      this.panelVolume.value = String(value);
      syncSliderFill(this.menuVolume);
      syncSliderFill(this.panelVolume);
      audio.blip();
    };
    this.menuVolume.addEventListener('input', () => pushVolume(this.menuVolume.value));
    this.panelVolume.addEventListener('input', () => pushVolume(this.panelVolume.value));
  }

  bind(handlers) {
    bindPress(byId('btn-start'), () => {
      this.audio.unlock();
      handlers.onStart();
    });
    bindPress(byId('btn-demo'), () => {
      this.audio.unlock();
      handlers.onDemo();
    });
    bindPress(this.buttons.resume, handlers.onResume);
    bindPress(this.buttons.retry, handlers.onRetry);
    bindPress(this.buttons.restart, () => {
      this.audio.unlock();
      handlers.onRestart();
    });
    bindPress(this.buttons.menu, handlers.onMenu);
    bindPress(this.exitDemo, handlers.onExitDemo);
    for (const button of this.muteButtons) {
      button.addEventListener('click', () => {
        this.audio.unlock();
        this.syncMute(this.audio.toggleMute());
      });
    }
  }

  showMenu(note = '') {
    this.menu.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.panel.classList.add('hidden');
    this.exitDemo.classList.add('hidden');
    this.demoBadge.classList.add('hidden');
    this.menuNote.textContent = note;
    this.syncScreen();
  }

  showPlay() {
    this.menu.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.panel.classList.add('hidden');
    this.syncScreen();
  }

  setDemo(on) {
    this.demoBadge.classList.toggle('hidden', !on);
    this.exitDemo.classList.toggle('hidden', !on);
  }

  /**
   * 显示暂停 / 胜负面板。
   * 文案默认取 panelCopy[mode]，也可以由调用方传入覆盖值（devtools 用）。
   * 按钮文案也来自 panelCopy[mode].actions，按钮 id 缺失时自动隐藏。
   */
  showPanel(mode, titleOverride, textOverride) {
    const preset = panelCopy[mode];
    this.panel.classList.remove('hidden');
    this.panel.dataset.mode = mode;
    this.renderScared(this.panelTitle, titleOverride ?? preset?.title ?? '');
    this.renderScared(this.panelText, textOverride ?? preset?.body ?? '');
    const actions = preset?.actions ?? {};
    const show = {
      pause: ['resume', 'restart', 'menu'],
      lose: ['retry', 'restart', 'menu'],
      win: ['restart', 'menu'],
      badEnd: ['restart', 'menu'],
    }[mode];
    for (const [name, el] of Object.entries(this.buttons)) {
      el.classList.toggle('hidden', !show.includes(name));
      const label = actions[name];
      if (label) el.textContent = label;
    }
    this.syncScreen();
  }

  /**
   * 渲染带「划掉」标记的文案。
   * ~~文字~~ 会被拆成 <span class="scared-strike">，CSS 负责画划痕和腐蚀感。
   * 用 textContent 逐段写入，不走 innerHTML，避免文案里的尖括号被当标签解析。
   * 同时把纯文本存进 data-text，给 CSS 的重影层（::before 的 content）用。
   */
  renderScared(el, text) {
    el.textContent = '';
    const parts = String(text).split('~~');
    parts.forEach((part, index) => {
      if (!part) return;
      if (index % 2 === 1) {
        const span = document.createElement('span');
        span.className = 'scared-strike';
        span.textContent = part;
        el.appendChild(span);
      } else {
        el.appendChild(document.createTextNode(part));
      }
    });
    el.dataset.text = el.textContent;
  }

  hidePanel() {
    this.panel.classList.add('hidden');
    this.syncScreen();
  }

  syncScreen() {
    const open = !this.menu.classList.contains('hidden') || !this.panel.classList.contains('hidden');
    document.getElementById('app').classList.toggle('screen-open', open);
  }

  setRecord(done, total) {
    this.writeText(this.record, 'record', `记录  ${done} / ${total}`);
  }

  setTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    this.writeText(this.timer, 'time', `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`);
  }

  setObjective(text) {
    this.writeText(this.objective, 'objective', text);
  }

  setSubtitle(text, who = '') {
    // 直接写 textContent，避免 writeText 去重导致同文本不同说话人被吞掉
    const newValue = who ? `${who}：${text}` : text;
    if (this.subtitle.textContent !== newValue) {
      this.subtitle.textContent = newValue;
    }
    this.subtitle.dataset.who = who || '';
  }

  setFade(kind, alpha) {
    // kind='white'|'black'；alpha 夹到 0..1
    const node = kind === 'white' ? this.fadeWhiteNode : this.fadeBlackNode;
    if (!node) return;
    const clamped = Math.max(0, Math.min(1, alpha));
    const formatted = clamped.toFixed(3);
    const cacheKey = kind === 'white' ? 'white' : 'black';
    if (Math.abs(this.fadeShown[cacheKey] - clamped) < 0.001) return;
    this.fadeShown[cacheKey] = clamped;
    node.style.opacity = formatted;
  }

  fadeWhite(alpha) {
    this.setFade('white', alpha);
  }

  fadeBlack(alpha) {
    this.setFade('black', alpha);
  }

  clearFade() {
    if (this.fadeWhiteNode) this.fadeWhiteNode.style.opacity = '0';
    if (this.fadeBlackNode) this.fadeBlackNode.style.opacity = '0';
    this.fadeShown = { white: -1, black: -1 };
  }

  /** 演示收尾第三层（z-6）：1 = 满屏白，盖住标题页。 */
  setCut(alpha) {
    if (!this.fadeCutNode) return;
    const clamped = Math.max(0, Math.min(1, alpha));
    if (Math.abs(this.cutShown - clamped) < 0.002) return;
    this.cutShown = clamped;
    this.fadeCutNode.style.opacity = clamped.toFixed(3);
  }

  /** 把第三层从当前值淡到 0，durationMs 毫秒；结束后彻底清 0。 */
  dissolveCut(durationMs = 600) {
    if (!this.fadeCutNode) return;
    const start = performance.now();
    const begin = this.cutShown < 0 ? 0 : this.cutShown;
    const token = (this.cutAnim += 1);
    const step = () => {
      if (token !== this.cutAnim) return; // 被新的 dissolve/clear 取代
      const k = Math.min(1, (performance.now() - start) / Math.max(1, durationMs));
      this.setCut(begin * (1 - k));
      if (k < 1) requestAnimationFrame(step);
      else {
        this.cutShown = 0;
        this.fadeCutNode.style.opacity = '0';
      }
    };
    requestAnimationFrame(step);
  }

  clearCut() {
    this.cutAnim += 1;
    this.cutShown = 0;
    if (this.fadeCutNode) this.fadeCutNode.style.opacity = '0';
  }

  /**
   * 开场衔接的黑幕（z-5，盖得住标题页）：0 = 全透明，1 = 全黑。
   * 和 setFade 一样做 0.001 的重复值去抖，别每帧写 style。
   */
  setBoot(alpha) {
    if (!this.bootCurtainNode) return;
    const clamped = Math.max(0, Math.min(1, alpha));
    if (Math.abs(this.bootShown - clamped) < 0.001) return;
    this.bootShown = clamped;
    this.bootCurtainNode.style.opacity = clamped.toFixed(3);
  }

  /** 黑幕正中那行「按 F11 获得沉浸式体验」。节点挂在黑幕里面，两层 opacity 相乘。 */
  setBootHint(alpha) {
    if (!this.bootHintNode) return;
    const clamped = Math.max(0, Math.min(1, alpha));
    if (Math.abs(this.bootHintShown - clamped) < 0.002) return;
    this.bootHintShown = clamped;
    this.bootHintNode.style.opacity = clamped.toFixed(3);
    // 完全透明时顺手藏起来，免得它盖住画面中心（pointer-events 是 none，但不再参与绘制更干净）
    this.bootHintNode.style.visibility = clamped <= 0.001 ? 'hidden' : 'visible';
  }

  /** 黑幕没退完之前先把 HUD 收起来，画面露完再让它一起出来。 */
  setPlayChromeVisible(on) {
    if (this.hud) this.hud.classList.toggle('hidden', !on);
  }

  setPrompt(text) {
    this.writeText(this.prompt, 'prompt', text);
  }

  setCameraState(state) {
    this.viewfinder.setState(state);
  }

  setAimHot(on) {
    if (this._aimHot === on) return;
    this._aimHot = on;
    this.crosshair.classList.toggle('hot', on);
  }

  setDanger(amount) {
    // 每帧改 style.opacity 会让整块 HUD 重新合成，取两位小数并跳过重复值
    const value = Math.round(Math.max(0, Math.min(1, amount)) * 100) / 100;
    if (this._danger === value) return;
    this._danger = value;
    this.danger.style.opacity = String(value);
  }

  setChase(on) {
    this.chase.classList.toggle('hidden', !on);
    // 进追逐时那一下「快跑！」还没淡完就输了，别让它停在半透明上
    if (!on) this.chaseFlash.classList.remove('on');
  }

  /**
   * 屏幕正中闪一次「快跑！」（约 1 秒后自动淡掉）。
   * 动画靠 CSS，这里只负责重播：先摘 .on、强制一次回流让浏览器忘记上一轮，
   * 再加回去。不这样写的话，第二次进追逐（重开一局）字不会再出现。
   */
  flashChase() {
    const el = this.chaseFlash;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  /**
   * 同步静音状态到 UI。
   * 界面上已经没有静音按钮了（主菜单的图片按钮和 HUD 的文本按钮都已移除），
   * 现在只能按 M 切换；这里保留遍历逻辑，以后再加带 data-mute 的按钮会自动接上。
   */
  syncMute(muted) {
    const label = muted ? 'Unmute  恢复声音' : 'Mute  静音';
    for (const button of this.muteButtons) {
      if (button.classList.contains('mute-toggle')) {
        button.classList.toggle('muted', muted);
      } else {
        button.textContent = label;
      }
    }
  }

  /**
   * 只在文本真的变了才写 DOM。HUD 每帧都会调 setPrompt / setTime，
   * 无条件赋值会让浏览器每帧重排一次覆盖层，直接表现为掉帧。
   */
  writeText(element, key, value) {
    this._text = this._text || {};
    if (this._text[key] === value) return;
    this._text[key] = value;
    element.textContent = value;
  }
}

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少界面节点 #${id}`);
  return el;
}

/** 音量条的红色填充段由 --fill 控制，值变化时同步。 */
function syncSliderFill(slider) {
  const percent = Math.round(Number(slider.value) * 1000) / 10;
  slider.style.setProperty('--fill', `${percent}%`);
}

/** pointerup 和 click 都接。嵌入预览里经常只有其中一个能送到按钮。 */
function bindPress(el, fn) {
  let last = 0;
  const run = (event) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    if (now - last < 350) return;
    last = now;
    fn();
  };
  el.addEventListener('pointerup', run);
  el.addEventListener('click', run);
}
