const listeners = new Map();

/** 订阅门、拍照、强制注视。返回取消函数。 */
export function on(event, handler) {
  const list = listeners.get(event) ?? [];
  list.push(handler);
  listeners.set(event, list);
  return () => {
    const next = (listeners.get(event) ?? []).filter((item) => item !== handler);
    listeners.set(event, next);
  };
}

export function emit(event, detail = {}) {
  for (const handler of listeners.get(event) ?? []) handler(detail);
}
