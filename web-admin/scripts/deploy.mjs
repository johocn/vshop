// deploy.mjs：本地构建 → tar → scp → 服务器解压到 /www/sites/e.joho.cn/guanli/
// 部署铁律：本地构建，服务器只解压不构建
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REMOTE = process.env.WA_REMOTE || 'qing'; // ~/.ssh/config 主机
// 容器 /www/sites/e.joho.cn 挂载自宿主机 /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn
const SITE = '/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/guanli';
const BUILD = 'dist/build/h5';
const TAR = '_wa_admin.tar';

try { execSync('npm run build:h5', { stdio: 'inherit', cwd: path.resolve('.') }); } catch { process.exit(1); }
if (!fs.existsSync(BUILD)) { console.error('no build dir', BUILD); process.exit(1); }
execSync(`tar -C ${BUILD} -cf ${TAR} .`);
execSync(`scp ${TAR} ${REMOTE}:/tmp/${TAR}`, { stdio: 'inherit' });
const remoteCmds = [
  `sudo mkdir -p ${SITE}`,
  `sudo cp -r ${SITE} ${SITE}.bak_$(date +%s) 2>/dev/null || true`,
  `sudo rm -rf ${SITE}/assets`,
  `sudo tar -xf /tmp/${TAR} -C ${SITE}`,
  `sudo rm -f /tmp/${TAR}`,
  `docker exec 1Panel-openresty-3I6S openresty -t && docker exec 1Panel-openresty-3I6S openresty -s reload`,
].join(' && ');
execSync(`ssh ${REMOTE} "${remoteCmds.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
console.log('deploy done');
