// deploy.mjs：本地构建 → 产物校验 → tar → scp → 服务器解压 + 备份轮转
// 部署铁律：本地构建，服务器只解压不构建
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // scripts/
const REMOTE = process.env.WA_REMOTE || 'qing'; // ~/.ssh/config 主机
// 容器 /www/sites/e.joho.cn 挂载自宿主机 /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn
const SITE = process.env.WA_SITE || '/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/guanli';
const BUILD = path.resolve(ROOT, '..', 'dist', 'build', 'h5');
const TAR_NAME = '_wa_admin.tar';
const TAR = path.resolve(ROOT, TAR_NAME);
const KEEP_BACKUPS = Number(process.env.WA_KEEP_BACKUPS || 3); // 服务器保留最近 N 份备份
const MIN_SIZE = 100 * 1024; // 产物最小字节数，低于视为构建异常

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

  // 3. 打包 + 上传
  sh(`tar -C "${BUILD}" -cf "${TAR}" .`);
  sh(`scp "${TAR}" ${REMOTE}:/tmp/${TAR_NAME}`);

  // 4. 服务器：解压到站点目录 + 备份轮转（只留最近 KEEP_BACKUPS 份）+ reload nginx
  const skipOld = KEEP_BACKUPS + 1;
  const remoteCmds = [
    `sudo mkdir -p ${SITE}`,
    `sudo cp -r ${SITE} ${SITE}.bak_$(date +%s) 2>/dev/null || true`,
    `ls -dt ${SITE}.bak_* 2>/dev/null | tail -n +${skipOld} | xargs -r sudo rm -rf`,
    `sudo rm -rf ${SITE}/assets`,
    `sudo tar -xf /tmp/${TAR_NAME} -C ${SITE}`,
    `sudo rm -f /tmp/${TAR_NAME}`,
    `docker exec 1Panel-openresty-3I6S openresty -t && docker exec 1Panel-openresty-3I6S openresty -s reload`,
  ].join(' && ');
  sh(`ssh ${REMOTE} "${remoteCmds.replace(/"/g, '\\"')}"`);
  console.log('deploy done');
} catch (err) {
  console.error(`[deploy] 失败: ${err.message}`);
  process.exitCode = 1;
} finally {
  // 5. 清理本地临时 tar，避免污染 git 工作区
  if (fs.existsSync(TAR)) fs.unlinkSync(TAR);
}
