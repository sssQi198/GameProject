/** 导入即注册五人的接口。main.js 会加载这个文件。 */
import './p1.js';
import './p2.js';
import './p3.js';
import './m1.js';
import './m2.js';

export { TAG, EVENT, tagAnomaly } from './contract.js';
export { on, emit } from './bus.js';
