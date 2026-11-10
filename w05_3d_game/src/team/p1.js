/**
 * P1 底层逻辑 + UI。
 * 改文案只改这个文件。胜负和进度仍在 game.js，不要在这里重写状态机。
 * 门开、拍照成功会从 bus 发出 EVENT.door / EVENT.photoOk。
 */
export const hints = {
  1: '后黑板在自己写字。',
  2: '窗对面，墙根和地板的夹角里有一具羊头骨。',
  3: '教室正中有人画过阵。',
  4: '角落里多了一个不该在的东西。',
  5: '天花板在裂开……抬头，拍下那对眼睛。',
};

export const successLines = {
  1: '它不想被擦掉。',
  2: '供品已经摆上了。',
  3: '蜡烛自己还亮着。',
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

/**
 * 暂停 / 胜负面板的文案。
 * 标题和正文里用 ~~xx~~ 标记“这个字被划掉、被腐蚀掉了”，
 * hud.js 会把它渲染成带划痕的 span。
 * actions 是按钮文案，按钮 id 对应关系：resume / retry / restart / menu。
 */
export const panelCopy = {
  pause: {
    title: '意识~~涣~~散',
    body: '别挣扎了……它们正在门外。\n你的理智值正在流失……你确定要面对门后的东西吗？',
    actions: {
      resume: '送死（继续噩梦）',
      restart: '重新开始（无尽的折磨）',
      menu: '懦夫（放弃求生）',
    },
  },
  lose: {
    title: '逃不~~掉~~了',
    body: '它碰到你了。它没有体温。\n按住 Shift 冲刺，它比走路更快。',
    actions: {
      retry: '再挣扎一次',
      restart: '重新开始（无尽的折磨）',
      menu: '懦夫（放弃求生）',
    },
  },
  win: {
    title: '你~~出~~来了',
    body: '他回头看你的那双眼睛，和你刚才逃的一模一样。\n门已经关上了。恭喜你——你还在这栋楼里。',
    actions: {
      restart: '重新开始（无尽的折磨）',
      menu: '懦夫（放弃求生）',
    },
  },
};

export const copy = {
  follow: '跟着前面的人',
  wait: '等等我。',
  doorStillOpen: '门还开着。',
  someoneGone: '……人呢？',
  cameraOnFloor: '地上有一台相机。',
  roomChanged: '这间教室和刚才不一样。',
  backToDoor: '回到那扇门',
  corridorLoop: '试着离开吧……',
  /** 刚出门又立刻折回来：这一关的下一关还没铺，房间还是原来那间 */
  corridorAgain: '还是那间教室……得往走廊深处走。',
  /** 第 1 关捡到相机后的心声，提示"拍照"这个玩法 */
  cameraMind: '有奇怪的东西……我该拍下来',
  runToExit: '跑向走廊尽头那扇发光的门',
  itCame: '它来了。',
  stillAhead: '……他还在前面吗？',
  photoHint: 'E  拿出相机 · F  拍摄',
  photoMiss: '没有记录到新异常。',
  doorOpen: '门开了',
  aheadPerson: '前面那个人',
// ── 终局安全屋 ──
  // 旧 epilogue 文案（whereAreYou / eyesOnYou / winTitle）已作废。
  // 原因：现在玩家能隔着门听见同学的声音、看见他走进来，旧文案「你去哪里了？我到处在找你」
  // 是从「同学消失」直接跳结论，和新演出的时间线对不上。
  // 注：pauseTitle / winTitle / loseTitle / loseBody 已迁到上面的 panelCopy（PR #2 面板重构），
  // 这里只留 badEnd 卡用的两条。
  safeWhere: '你去哪里了？我找你找了好久，还碰到了怪物……',
  safeIsThatSo: '是吗……',
  badTitle: '游戏结束',
  badBody: '他不是你的同学……',
};
