#!/usr/bin/env node
/**
 * 防止生产后台凭据再次被写进仓库。
 * 扫描 git 已跟踪文件，命中即退出码 1：
 *   - 明文口令（模式已编码，避免自泄露）
 *   - 管理员口令的硬编码兜底（process.env.ADMIN_PASS || '<literal>' / os.environ.get(..., '<literal>')）
 * 用法：node scripts/check-secrets.cjs  或  pnpm check:secrets
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');

const files = execSync('git ls-files', { cwd: process.cwd(), encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !/\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|woff2?|ttf|eot|zip|gz)$/i.test(f))
  .filter((f) => fs.existsSync(f));

const PATTERNS = [
  { re: /z1[23]3123/, msg: '明文后台口令' },
  { re: /process\.env\.(ADMIN_PASS|ADMIN_PWD|ADMIN_USER)\s*\|\|\s*['"][^'"]+['"]/, msg: '管理员环境变量存在硬编码兜底' },
  { re: /os\.environ\.get\(\s*['"][^'"]*(USER|PWD|PASS)[^'"]*['"]\s*,\s*['"][^'"]+['"]\s*\)/, msg: '管理员环境变量存在硬编码兜底' },
  { re: /login\(\s*username:\s*["'][^"'$%{]+["']\s*,\s*password:\s*["'][^"'$%{]+["']\s*\)/i, msg: '源码内联登录账号密码' },
  { re: /you1[23]3123/, msg: '明文后台口令' },
];

let bad = 0;
for (const file of files) {
  if (file === 'scripts/check-secrets.cjs') continue;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const { re, msg } of PATTERNS) {
      if (re.test(line)) {
        bad++;
        console.error(`${file}:${i + 1}: ${msg}`);
        console.error(`  ${line.trim().slice(0, 160)}`);
      }
    }
  });
}
if (bad) {
  console.error(`\n发现 ${bad} 处疑似硬编码凭据，已阻断。`);
  process.exit(1);
}
console.log('check-secrets: OK（未发现硬编码管理员凭据）');
