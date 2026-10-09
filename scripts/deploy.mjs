#!/usr/bin/env node
/**
 * tcm-workbench H5 静态站部署脚本（参照 nshop/scripts/deploy.mjs）
 *
 * 遵守部署铁律：本地构建 → scp 产物到服务器 → 拷入 1Panel 站点目录（绝不在服务器构建）。
 * hash 路由 + vite base=/workbench/，服务器无需 history 回退配置，静态目录替换即时生效。
 *
 * 环境变量（从 .env / 进程环境读取，不硬编码域名）：
 *   SERVER_HOST     SSH 主机或别名（必填，如 joho）
 *   SERVER_USER     SSH 用户名（默认空，走 ssh 别名配置）
 *   SERVER_PORT     SSH 端口（默认 22）
 *   REMOTE_DIR      服务器站点目录（必填，如 /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index/workbench）
 *   SITE_URL        部署完成后打印的访问地址（仅展示用）
 *   SKIP_BUILD      设为 1 时跳过本地构建（仅上传）
 *
 * 用法：
 *   node scripts/deploy.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = process.cwd();
const scriptDir = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const baseEnv = { ...process.env };
  const env = { ...process.env };
  const envPath = resolve(scriptDir, "..", ".env.deploy");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in baseEnv)) env[key] = value;
    }
  }
  return env;
}

const env = loadEnv();

const SERVER_HOST = env.SERVER_HOST;
const SERVER_USER = env.SERVER_USER || "";
const SERVER_PORT = env.SERVER_PORT || "";
const REMOTE_DIR = env.REMOTE_DIR;
const SITE_URL = env.SITE_URL || "";
const SKIP_BUILD = env.SKIP_BUILD === "1";

const SSH_ARGS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new"];
if (SERVER_PORT) SSH_ARGS.push("-p", SERVER_PORT);
if (SERVER_USER) SSH_ARGS.push("-l", SERVER_USER);
const target = SERVER_USER ? `${SERVER_USER}@${SERVER_HOST}` : SERVER_HOST;

// uni-app H5 构建产物目录（vite base=/workbench/）
const outputDir = resolve(cwd, "dist", "build", "h5");

function fail(msg) {
  console.error(`\n[deploy] 错误：${msg}`);
  process.exit(1);
}

function run(label, argv, opts = {}) {
  const { shellCat, ...rest } = opts;
  console.log(`\n[deploy] >> ${label}\n  ${shellCat ?? argv.join(" ")}`);
  const res = spawnSync(shellCat ?? argv[0], shellCat ? undefined : argv.slice(1), {
    stdio: "inherit",
    cwd,
    ...(shellCat ? { shell: true } : {}),
    ...rest,
  });
  if (res.status !== 0) fail(`${label} 失败（exit=${res.status}）`);
  return res.stdout;
}

function ssh(remoteCmd) {
  run("远端执行", ["ssh", ...SSH_ARGS, target, remoteCmd]);
}

const requires = [
  ["SERVER_HOST", SERVER_HOST],
  ["REMOTE_DIR", REMOTE_DIR],
];
for (const [name, val] of requires) {
  if (!val) fail(`缺少环境变量 ${name}（可在 .env.deploy 中配置）`);
}

// 1) 本地构建
if (!SKIP_BUILD) {
  run("本地构建", ["pnpm", "build:h5"], { shellCat: "pnpm build:h5" });
} else {
  console.log("\n[deploy] 已设置 SKIP_BUILD=1，跳过本地构建。");
}

// 2) 校验产物
if (!existsSync(resolve(outputDir, "index.html"))) {
  fail(`未找到产物 ${resolve(outputDir, "index.html")}，请先在本地执行 pnpm build:h5。`);
}

// 3) 上传产物到服务器（先 scp 到暂存区，再用 sudo 清空拷入站点目录，规避权限问题）
const STAGING = "/tmp/tcm-workbench-deploy";
console.log(`\n[deploy] >> 上传 dist/build/h5 到 ${target}:${REMOTE_DIR}`);
run("准备暂存目录", ["ssh", ...SSH_ARGS, target, `rm -rf ${STAGING} && mkdir -p ${STAGING}`]);
run("SCP 上传产物到暂存区", ["scp", ...SSH_ARGS, "-r", outputDir, `${target}:${STAGING}`]);
ssh(
  `sudo rm -rf ${REMOTE_DIR} && sudo mkdir -p ${REMOTE_DIR} && ` +
    `sudo cp -r ${STAGING}/h5/. ${REMOTE_DIR}/ && ` +
    `sudo chown -R \$(whoami):\$(whoami) ${REMOTE_DIR} && rm -rf ${STAGING}`
);

console.log(`\n[deploy] 完成。站点：${SITE_URL || REMOTE_DIR}`);
console.log(`[deploy] 验证：ssh ${target} "curl -s -o /dev/null -w '%{http_code}' ${SITE_URL || REMOTE_DIR}/"`);
