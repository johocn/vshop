// 静默 uni-h5 内置 vue-router 的 deprecated 告警（只去掉模块内那行 console.warn，零行为影响）。
// uni-app 以旧路径 "vue-router/dist/vue-router.esm-bundler.js" 引入 vue-router@4.6.4，
// 该文件第一行有一条无条件的 console.warn，每次页面加载都会打印。此脚本幂等移除它。
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRNAME = 'vue-router.esm-bundler.js';
const REMOVABLE = /^[^\n]*vue-router\.esm-bundler\.js' is deprecated[^\n]*\n/gm;
const MAX_DEPTH = 10;

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// 遍历 node_modules 树（含嵌套 node_modules），收集所有 vue-router/dist/vue-router.esm-bundler.js
function find(dir, depth, out) {
  if (depth > MAX_DEPTH) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    let isDirFlag = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDirFlag = statSync(p).isDirectory();
      } catch {
        continue;
      }
    }
    if (!isDirFlag) continue;
    if (e.name === 'vue-router') {
      const f = join(p, 'dist', DIRNAME);
      if (isDir(join(p, 'dist')) && f) {
        try {
          if (statSync(f).isFile()) out.push(f);
        } catch { /* ignore */ }
      }
    }
    out = find(p, depth + 1, out);
  }
  return out;
}

let patched = 0;
for (const f of find(join(root, 'node_modules'), 0, [])) {
  const src = readFileSync(f, 'utf8');
  if (!REMOVABLE.test(src)) continue;
  writeFileSync(f, src.replace(REMOVABLE, ''));
  patched += 1;
  console.log(`[patch-vue-router-warn] removed deprecated warn in ${f}`);
}
if (patched === 0) {
  console.log('[patch-vue-router-warn] no vue-router esm-bundler deprecation found (already patched or version changed)');
}