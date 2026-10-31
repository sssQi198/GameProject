import { CONFIG } from './config.js';

/** 打开 `http://localhost:5173/?debug` 时出现。用来调速度、雾和灯光。 */
export async function attachDebug({ renderer, level }) {
  const { GUI } = await import('../vendor/lil-gui.esm.js');
  const gui = new GUI({ title: '错层 debug' });
  const move = gui.addFolder('移动');
  move.add(CONFIG, 'walkSpeed', 1, 8, 0.05);
  move.add(CONFIG, 'sprintSpeed', 2, 10, 0.05);
  move.add(CONFIG, 'entitySpeed', 1, 8, 0.05);
  move.add(CONFIG, 'entityCatch', 0.6, 3, 0.05);
  const look = gui.addFolder('画面');
  look.add(CONFIG, 'brightness', 0.2, 8, 0.05).name('场景亮度');
  look.add(CONFIG, 'exposure', 0.2, 2.5, 0.01).onChange((value) => {
    renderer.toneMappingExposure = value;
  });
  look.add(CONFIG, 'ambient', 0, 2, 0.01);
  look.add(CONFIG, 'roomLight', 0, 140, 1);
  look.add(CONFIG, 'lamp', 0, 140, 1);
  look.add(CONFIG, 'fogRoom', 0.005, 0.2, 0.005);
  look.add(CONFIG, 'fogHall', 0.01, 0.45, 0.005);
  look.add(CONFIG, 'fogChase', 0.01, 0.3, 0.005);
  const flags = { colliders: false };
  gui.add(flags, 'colliders').name('碰撞框').onChange((value) => level.setColliderDebug(value));
  move.open();
  look.open();
}
