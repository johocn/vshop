// deploy.mjs：本地构建 → 产物校验 → tar → scp → 服务器临时目录解压 + 原子切换 + 失败回滚
// 部署铁律：本地构建，服务器只解压不构建
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // scripts/
const REMOTE = process.env.WA_REMOTE || 'joho'; // ~/.ssh/config 主机
// 容器 /www/sites/e.joho.cn 挂载自宿主机 /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn
const SITE = process.env.WA_SITE || '/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/guanli';
const BUILD = path.resolve(ROOT, '..', 'dist', 'build', 'h5');
const KEEP_BACKUPS = Number(process.env.WA_KEEP_BACKUPS || 3); // 服务器保留最近 N 份备份
const MIN_SIZE = 100 * 1024; // 产物最小字节数，低于视为构建异常

// 时间戳 + pid 保证并发/重跑时临时文件不冲突
const TS = `${Date.now()}_${process.pid}`;
const TAR_NAME = `_wa_admin_${TS}.tar`;
const SCRIPT_NAME = `_wa_deploy_${TS}.sh`;
const TAR = path.resolve(ROOT, TAR_NAME);
const SCRIPT = path.resolve(ROOT, SCRIPT_NAME);

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

// 服务器侧脚本：解压到临时目录 → 校验 → rename 原子切换 → 失败回滚 → 备份轮转 → reload
function remoteScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
SITE='${SITE}'
TAR='/tmp/${TAR_NAME}'
TS='${TS}'
KEEP=${KEEP_BACKUPS}
NEW="\${SITE}.new_\${TS}"
BAK="\${SITE}.bak_\${TS}"

cleanup() { rm -f "$TAR"; }
trap cleanup EXIT

# 1) 临时目录解压，不触碰线上目录
rm -rf "$NEW"
mkdir -p "$NEW"
tar -xf "$TAR" -C "$NEW"

# 2) 产物完整性校验（缺 index.html / assets 为空即中止）
if [ ! -s "$NEW/index.html" ]; then
  echo "[deploy] 校验失败：缺少 index.html"; rm -rf "$NEW"; exit 1
fi
if [ ! -d "$NEW/assets" ] || [ -z "$(ls -A "$NEW/assets" 2>/dev/null)" ]; then
  echo "[deploy] 校验失败：assets 缺失或为空"; rm -rf "$NEW"; exit 1
fi

# 3) rename 原子切换：旧目录先移为备份，新目录再就位；任一步失败回滚
if [ -d "$SITE" ]; then
  mv "$SITE" "$BAK"
fi
if ! mv "$NEW" "$SITE"; then
  echo "[deploy] 切换失败，回滚到上一版"
  if [ -d "$BAK" ]; then mv "$BAK" "$SITE"; fi
  exit 1
fi

# 4) 切换后二次校验，异常则回滚
if [ ! -s "$SITE/index.html" ] || [ ! -d "$SITE/assets" ]; then
  echo "[deploy] 切换后校验失败，回滚到上一版"
  rm -rf "$SITE"
  if [ -d "$BAK" ]; then mv "$BAK" "$SITE"; fi
  exit 1
fi

# 5) 备份轮转：仅保留最近 KEEP 份
ls -dt "\${SITE}.bak_"* 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -rf || true

# 6) 配置检查通过后再 reload，避免坏配置导致整站 502
docker exec 1Panel-openresty-3I6S openresty -t
docker exec 1Panel-openresty-3I6S openresty -s reload

echo "[deploy] OK -> $SITE (backup: $BAK)"
`;
}

try {
  // 1. 本地构建（失败即退出，不触发部署）
  sh('npm run build:h5', { cwd: path.resolve(ROOT, '..') });

  // 2. 产物校验：关键文件存在 + assets 非空 + 总大小达标，防止把空白/残缺产物推上线
  const indexPath = path.join(BUILD, 'index.html');
  const assetsDir = path.join(BUILD, 'assets');
  if (!fs.existsSync(indexPath)) throw new Error(`产物缺少 ${indexPath}`);
  if (!fs.existsSync(assetsDir) || fs.readdirSync(assetsDir).length === 0) {
    throw new Error('产物 assets 目录为空，构建异常');
  }
  const size = dirSize(BUILD);
  if (size < MIN_SIZE) throw new Error(`产物异常过小 (${size} bytes < ${MIN_SIZE})`);
  console.log(`[deploy] 产物校验通过: ${(size / 1024).toFixed(0)} KB`);

  // 3. 打包 + 上传（tar/脚本名带时间戳 + pid）
  sh(`tar -C "${BUILD}" -cf "${TAR}" .`);
  fs.writeFileSync(SCRIPT, remoteScript(), { mode: 0o755 });
  sh(`scp "${TAR}" "${SCRIPT}" ${REMOTE}:/tmp/`);

  // 4. 服务器执行：临时目录解压 + 原子切换 + 失败回滚 + 备份轮转 + reload
  sh(`ssh ${REMOTE} "sudo bash /tmp/${SCRIPT_NAME}"`);
  console.log('deploy done');
} catch (err) {
  console.error(`[deploy] 失败: ${err.message}`);
  process.exitCode = 1;
} finally {
  // 5. 清理本地临时 tar/脚本，避免污染 git 工作区
  for (const f of [TAR, SCRIPT]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}
