/** 取景器：相机屏幕式大面积取景层。eye=肉眼模式（隐藏），camera=相机模式（显示 + 效果）。 */
const STATUS_TEXT = {
  none: 'STBY',
  holstered: 'STBY',
  drawing: 'READY',
  raised: 'REC',
  shooting: 'SHOT',
  lowering: 'STBY',
};

export class Viewfinder {
  constructor() {
    this.viewfinder = document.getElementById('viewfinder');
    this.vfScreen = document.getElementById('vf-screen');
    this.vfTint = document.getElementById('vf-tint');
    this.vfGrain = document.getElementById('vf-grain');
    this.vfOverlay = document.getElementById('vf-overlay');
    this.vfStatus = document.getElementById('vf-status');

    if (!this.viewfinder) throw new Error('Viewfinder: 缺失 #viewfinder 元素');
    if (!this.vfScreen) throw new Error('Viewfinder: 缺失 #vf-screen 元素');
    if (!this.vfTint) throw new Error('Viewfinder: 缺失 #vf-tint 元素');
    if (!this.vfGrain) throw new Error('Viewfinder: 缺失 #vf-grain 元素');
    if (!this.vfOverlay) throw new Error('Viewfinder: 缺失 #vf-overlay 元素');
    if (!this.vfStatus) throw new Error('Viewfinder: 缺失 #vf-status 元素');

    this.mode = 'eye';
    this.provider = null;
    this.hideTimer = null;
  }

  setState(state) {
    // 新 setState 到来时清除旧 hideTimer
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.vfStatus.textContent = STATUS_TEXT[state] ?? 'STBY';

    // 辅助：清除所有状态类
    const clearStateClasses = () => {
      this.viewfinder.classList.remove('opening', 'on', 'shooting', 'closing');
    };

    if (state === 'none' || state === 'holstered') {
      // 立即隐藏
      clearStateClasses();
      this.viewfinder.classList.add('hidden');
      this.viewfinder.classList.remove('opening', 'on', 'shooting', 'closing');
      this.mode = 'eye';
    } else if (state === 'drawing') {
      // 显示 + opening
      this.viewfinder.classList.remove('hidden');
      clearStateClasses();
      this.viewfinder.classList.add('opening');
      this.mode = 'camera';
    } else if (state === 'raised') {
      // 显示 + on
      this.viewfinder.classList.remove('hidden');
      clearStateClasses();
      this.viewfinder.classList.add('on');
      this.mode = 'camera';
    } else if (state === 'shooting') {
      // 显示 + shooting（重触发动画）
      this.viewfinder.classList.remove('hidden');
      clearStateClasses();
      this.viewfinder.classList.add('shooting');
      this.mode = 'camera';
    } else if (state === 'lowering') {
      // 显示 + closing，400ms 后加 hidden
      this.viewfinder.classList.remove('hidden');
      clearStateClasses();
      this.viewfinder.classList.add('closing');
      this.mode = 'camera';

      this.hideTimer = setTimeout(() => {
        this.viewfinder.classList.add('hidden');
        this.viewfinder.classList.remove('closing');
        this.hideTimer = null;
      }, 400);
    }
  }

  setMode(mode) {
    if (mode !== 'eye' && mode !== 'camera') return;

    this.mode = mode;
    this.viewfinder.dataset.mode = mode;

    if (mode === 'eye') {
      this.viewfinder.classList.add('hidden');
    } else {
      this.viewfinder.classList.remove('hidden');
    }
  }

  setPerceptionProvider(provider) {
    if (typeof provider === 'function') {
      this.provider = provider;
      provider(this.vfOverlay);
    } else if (provider === null) {
      this.provider = null;
      this.vfOverlay.innerHTML = '';
    }
  }
}
