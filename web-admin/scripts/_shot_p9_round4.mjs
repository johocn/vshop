// 校园配送第四轮审计 P1/P2 九项：生产后台手机视口（390×844 dpr2）截图 + DOM 断言
// 覆盖：骑手提现审核（原子认领）、调度中心（状态 CAS / 异常重派）、改址台账（外部取消失败留痕）
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const req = createRequire('d:/zhao/vendure/package.json');
let chromium;
try {
  ({ chromium } = req('playwright'));
} catch {
  ({ chromium } = createRequire('C:/nvm4w/nodejs/')('playwright'));
}

const BASE = 'https://e.joho.cn/guanli/';
const OUT = 'D:/zhao/vshop/docs/screenshots/waimai/p9-round4';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);
const inputs = await page.$$('input');
if (inputs.length >= 2) {
  await inputs[0].fill('superadmin');
  await inputs[1].fill('z123123');
  await page.click('.login-btn, .btn, button').catch(() => {});
  await page.waitForTimeout(3000);
}
await page.evaluate(() => {
  localStorage.setItem('wa_channel_token', 'canteen-a-token');
  localStorage.setItem('wa_channel_code', 'canteen-a');
});

const asserts = {};
async function shot(name, hash, { wait = 3500, assertText = [] } = {}) {
  await page.goto(BASE + '#' + hash, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const body = await page.evaluate(() => document.body.innerText);
  asserts[name] = assertText.map((t) => [t, body.includes(t)]);
  console.log('shot', name, page.url(), JSON.stringify(asserts[name]));
}

await shot('01-rider-withdraw', '/pages/rider/withdraw/index', { assertText: ['提现'] });
await shot('02-dispatch-board', '/pages/campus/dispatch', { assertText: ['调度中心'] });
await shot('03-address-changes', '/pages/campus/address-changes', { assertText: ['改址'] });

console.log('ASSERTS', JSON.stringify(asserts, null, 1));
console.log('console errors:', errors.slice(0, 5));
await browser.close();
