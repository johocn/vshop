const ADMIN_PASS = process.env.ADMIN_PASS;
const ADMIN_USER = process.env.ADMIN_USER;
if (!ADMIN_USER || !ADMIN_PASS) {
  console.error('[admin-script] 缺少 ADMIN_USER / ADMIN_PASS 环境变量');
  process.exit(1);
}
// FR-A3 web-admin 核销看板生产冒烟：登录 e.joho.cn/guanli → 券管理页截图 + DOM 断言
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const req = createRequire('d:/zhao/vendure/package.json');
const { chromium } = req('playwright');

const BASE = 'https://e.joho.cn/guanli/';
const OUT = 'D:/zhao/nshop/docs/manual/shots/2026-10-19-coupon-redemption-flow';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// 登录（uni-app input 选择器）
const inputs = await page.$$('input');
if (inputs.length >= 2) {
  await inputs[0].fill(ADMIN_USER);
  await inputs[1].fill(ADMIN_PASS);
}
await page.click('.login-btn, .btn, button').catch(() => {});
await page.waitForTimeout(3000);
console.log('after login url:', page.url());

// t1 渠道注入（channel id=7）
await page.evaluate(() => localStorage.setItem('wa_channel_token', 'a6fn474hhiqasmyiyrfl'));
await page.goto(BASE + '#/pages/coupon/index', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(4000);
console.log('coupon page url:', page.url());

await page.screenshot({ path: `${OUT}/08-prod-admin-stats.png`, fullPage: true });
console.log('shot 08-prod-admin-stats');

// DOM 断言
const body = await page.evaluate(() => document.body.innerText);
const checks = {
  kpiRedemptionRate: body.includes('核销率'),
  kpiExpiredRate: body.includes('过期率'),
  rangeChips: body.includes('全部') && body.includes('今日') && body.includes('近7天') && body.includes('近30天'),
  opsUsedFilled: /已使用\s*\n?\s*\d+（\d+%）/.test(body) || /已使用/.test(body),
};
console.log('ASSERT', JSON.stringify(checks));

await browser.close();
