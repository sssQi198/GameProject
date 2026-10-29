/** DOM 界面：标题、HUD、暂停 / 胜负、音量。不碰 Three 场景。 */
export class Hud {
  constructor(audio) {
    this.audio = audio;
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
    this.flash = byId('flash');
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
    byId('btn-start').addEventListener('click', () => {
      this.audio.unlock();
      handlers.onStart();
    });
    byId('btn-demo').addEventListener('click', () => {
      this.audio.unlock();
      handlers.onDemo();
    });
    this.buttons.resume.addEventListener('click', handlers.onResume);
    this.buttons.retry.addEventListener('click', handlers.onRetry);
    this.buttons.restart.addEventListener('click', () => {
      this.audio.unlock();
      handlers.onRestart();
    });
    this.buttons.menu.addEventListener('click', handlers.onMenu);
    this.exitDemo.addEventListener('click', handlers.onExitDemo);
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
  }

  showPlay() {
    this.menu.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.panel.classList.add('hidden');
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
  }

  hidePanel() {
    this.panel.classList.add('hidden');
  }

  setRecord(done, total) {
    this.record.textContent = `记录  ${done} / ${total}`;
  }

  setTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    this.timer.textContent = `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  setObjective(text) {
    this.objective.textContent = text;
  }

  setSubtitle(text) {
    this.subtitle.textContent = text;
  }

  setPrompt(text) {
    this.prompt.textContent = text;
  }

  setAimHot(on) {
    this.crosshair.classList.toggle('hot', on);
  }

  setDanger(amount) {
    this.danger.style.opacity = String(Math.max(0, Math.min(1, amount)));
  }

  setChase(on) {
    this.chase.classList.toggle('hidden', !on);
  }

  flash() {
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
  }

  syncMute(muted) {
    const label = muted ? 'Unmute  恢复声音' : 'Mute  静音';
    for (const button of this.muteButtons) button.textContent = label;
  }
}

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少界面节点 #${id}`);
  return el;
}
