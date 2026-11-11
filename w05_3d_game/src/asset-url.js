/**
 * 资源地址：相对「应用根」而不是「域名根」。
 *
 * 为什么不能直接写 '/assets/models/x.glb'：
 *   那是域名根绝对路径。部署在子目录时（GitHub Pages 项目站点
 *   https://<user>.github.io/GameProject/w05_3d_game/）会去请求
 *   /assets/... → 404，GLTFLoader 的 catch 会把模型退化成程序化几何，
 *   画面上不报错、但整个游戏的模型全变样。
 *
 * 应用根取法：当前页面的目录。
 *   https://host/w05_3d_game/index.html   → '/w05_3d_game/'
 *   http://127.0.0.1:5173/index.html      → '/'
 * 于是 asset('models/x.glb') 分别得到
 *   '/w05_3d_game/assets/models/x.glb' 和 '/assets/models/x.glb'，两种部署都成立。
 *
 * 没有 document 的环境（Node 里的旧探针，现放在仓库 `_多余/开发临时文件/_probe/`）退回 '/'，
 * 行为和改成这版之前一模一样——探针里的 fetch 桩按 http://local/assets/... 匹配。
 */

/** 应用根，以 / 开头、以 / 结尾。 */
export const APP_ROOT = (() => {
  try {
    if (typeof document !== 'undefined' && document && document.baseURI) {
      const p = new URL('.', document.baseURI).pathname;
      return p.endsWith('/') ? p : p + '/';
    }
  } catch (e) {
    /* 老浏览器 / 异常 URL：退回域名根 */
  }
  return '/';
})();

/**
 * 拼一个资源地址。
 * @param {string} rel 相对 assets/ 的路径，如 'models/puppet_v03.glb'；
 *                     也接受 'assets/models/...' 或 '/assets/models/...' 这种写法。
 * @returns {string} 形如 '/w05_3d_game/assets/models/puppet_v03.glb'
 */
export function asset(rel) {
  const clean = String(rel).replace(/^\/+/, '').replace(/^assets\//, '');
  return APP_ROOT + 'assets/' + clean;
}
