/**
 * 读取拆好关节的角色 glb。
 * 根节点 extras 里的 legs / arms / body 等是节点名，
 * 这里换成场景里的物体，供走路和木偶动作转动。
 * 左右顺序都是先左后右。
 */
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const loader = new GLTFLoader();

export function loadCharacter(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      const root = gltf.scene;
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.scale.set(1, 1, 1);
      resolve(bindCharacter(root));
    }, undefined, reject);
  });
}

export function disposeCharacter(bound) {
  const geometries = new Set();
  const materials = new Set();
  bound.root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      if (material) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function bindCharacter(root) {
  const named = new Map();
  root.traverse((node) => {
    if (node.name) named.set(node.name, node);
  });
  const extras = findExtras(root);
  return {
    root,
    legs: resolveList(extras.legs, named, root, 'leg'),
    shins: resolveList(extras.shins, named, root, 'shin'),
    feet: resolveList(extras.feet, named, root, 'foot'),
    arms: resolveList(extras.arms, named, root, 'arm'),
    forearms: resolveList(extras.forearms, named, root, 'forearm'),
    hands: resolveList(extras.hands, named, root, 'hand'),
    body: resolveOne(extras.body, named, root, 'body'),
    head: resolveOne(extras.head, named, root, 'head'),
    materials: collectMaterials(root),
  };
}

function findExtras(root) {
  if (Array.isArray(root.userData?.legs) || Array.isArray(root.userData?.arms)) return root.userData;
  let found = null;
  root.traverse((node) => {
    if (!found && (Array.isArray(node.userData?.legs) || Array.isArray(node.userData?.arms))) {
      found = node.userData;
    }
  });
  return found ?? {};
}

function resolveOne(name, named, root, role) {
  if (typeof name === 'string' && named.has(name)) return named.get(name);
  return findRole(root, role)[0] ?? null;
}

function resolveList(names, named, root, role) {
  if (Array.isArray(names) && names.length && names.every((name) => typeof name === 'string')) {
    const found = names.map((name) => named.get(name)).filter(Boolean);
    if (found.length === names.length) return found.sort(byName);
  }
  const byRole = findRole(root, role);
  if (byRole.length) return byRole.sort(byName);
  // 旧的木偶导出把 feet 裁成了 fee。
  if (role === 'foot') return findRole(root, 'fee').sort(byName);
  return byRole;
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

function findRole(root, role) {
  const found = [];
  root.traverse((node) => {
    if (node !== root && node.userData?.role === role) found.push(node);
  });
  return found;
}

function collectMaterials(root) {
  const materials = [];
  const seen = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      materials.push(material);
    }
  });
  return materials;
}
