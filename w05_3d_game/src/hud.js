import { Viewfinder } from './viewfinder.js';

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
    this.syncMute(audio.muted);

    const pushVolume = (value) => {
      audio.unlock();
      audio.setVolume(value);
      this.menuVolume.value = String(value);
      this.panelVolume.value = String(value);
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

  showPanel(mode, title, text) {
    this.panel.classList.remove('hidden');
    this.panelTitle.textContent = title;
    this.panelText.textContent = text;
    const show = {
      pause: ['resume', 'restart', 'menu'],
      lose: ['retry', 'restart', 'menu'],
      win: ['restart', 'menu'],
    }[mode];
    for (const [name, el] of Object.entries(this.buttons)) {
      el.classList.toggle('hidden', !show.includes(name));
    }
    this.syncScreen();
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

  setSubtitle(text) {
    this.writeText(this.subtitle, 'subtitle', text);
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
  }

  syncMute(muted) {
    const label = muted ? 'Unmute  恢复声音' : 'Mute  静音';
    for (const button of this.muteButtons) button.textContent = label;
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
