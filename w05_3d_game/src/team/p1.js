/**
 * P1 底层逻辑 + UI。
 * 改文案只改这个文件。胜负和进度仍在 game.js，不要在这里重写状态机。
 * 门开、拍照成功会从 bus 发出 EVENT.door / EVENT.photoOk。
 */
export const hints = {
  1: '有人还坐在后排。',
  2: '黑板在自己写字。',
  3: '窗边的布在呼吸。',
  4: '角落里多了一个不该在的东西。',
  5: '天花板在裂开……抬头，拍下那对眼睛。',
};

export const successLines = {
  1: '有人还坐在这里。',
  2: '它不想被擦掉。',
  3: '它在布后面看着你。',
  4: '它在盯着你笑。',
  5: '血肉在呼吸，墙缝里的眼睛闭上了。',
};

export const introDialog = [
  '到了，就是前面那间。',
  '……真的要半夜进去？',
  '传闻要是真的，拍到东西我们就走。',
  '我还是有点怕……我在这等你吧，转一圈赶紧出来。',
  '瞧你那熊样，那就在这等着吧。',
];

export const introAftermath = '发生什么了！我得去看看……';

export const skipHint = 'E 跳过剧情';

export const copy = {
  follow: '跟着前面的人',
  wait: '等等我。',
  pauseTitle: '暂停',
  pauseBody: 'M 静音。Esc 或 Resume 回到楼里。',
  doorStillOpen: '门还开着。',
  someoneGone: '……人呢？',
  cameraOnFloor: '地上有一台相机。',
  roomChanged: '这间教室和刚才不一样。',
  backToDoor: '回到那扇门',
  corridorLoop: '走廊的两端连着自己。',
  runToExit: '跑向绿色 EXIT',
  itCame: '它来了。',
  stillAhead: '……他还在前面吗？',
  whereAreYou: '你去哪里了？我到处在找你。',
  eyesOnYou: '他回头看你的那双眼睛，和你刚才逃的一模一样。',
  photoHint: 'E  拿出相机 · F  拍摄',
  photoMiss: '没有记录到新异常。',
  doorOpen: '门开了',
  aheadPerson: '前面那个人',
  winTitle: '你出来了',
  loseTitle: '它碰到你了',
  loseBody: '按住 Shift 冲刺。它比走路更快。',
};
