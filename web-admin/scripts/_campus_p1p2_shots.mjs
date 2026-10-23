// 校园配送 P1/P2 补齐项：生产后台手机视口（390×844 dpr2）截图 + DOM 断言
// 覆盖：履约参数/时段容量、楼栋+分区管理、改址台账、调度中心外部快递、订单详情配送信息与改址历史
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
const ADMIN = 'https://e.joho.cn/admin-api';
const CHANNEL = process.env.WA_CHANNEL || 'canteen-a-token';
const CHANNEL_CODE = process.env.WA_CHANNEL_CODE || 'canteen-a';
const OUT = 'D:/zhao/vshop/docs/screenshots/2026-10-23-campus-p1p2';
mkdirSync(OUT, { recursive: true });

async function adminGql(query) {
  const r = await fetch(ADMIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return (await r.json()).data;
}

// 找一个真实校园订单 id（有 buildingId）
const login = await adminGql(`mutation{login(username:"superadmin",password:"z123123"){... on CurrentUser{identifier} ... on InvalidCredentialsError{message}}}`);
if (!login?.login?.identifier) console.warn('admin login failed');
const tokenRes = await fetch(ADMIN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `mutation{login(username:"superadmin",password:"z123123"){... on CurrentUser{id}}}` }),
});
const authToken = tokenRes.headers.get('vendure-auth-token') || '';
const orders = await (await fetch(ADMIN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
  body: JSON.stringify({ query: `{orders(options:{take:30,sort:{createdAt:DESC}}){items{id code state customFields{buildingId fulfillmentRoute}}}}` }),
})).json();
const items = orders?.data?.orders?.items || [];
let campusOrder = items.find((o) => o.customFields?.buildingId);
console.log('order probe:', items.length, 'campus:', campusOrder?.id, campusOrder?.code, campusOrder?.customFields?.fulfillmentRoute, 'err:', JSON.stringify(orders?.errors || []).slice(0, 200));

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
await page.evaluate(([t, c]) => {
  localStorage.setItem('wa_channel_token', t);
  localStorage.setItem('wa_channel_code', c);
}, [CHANNEL, CHANNEL_CODE]);

const asserts = {};
async function shot(name, hash, { clickText, wait = 3500, assertText = [] } = {}) {
  await page.goto(BASE + '#' + hash, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(wait);
  if (clickText) {
    const el = page.locator(`text=${clickText}`).first();
    if (await el.count()) {
      await el.click().catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const body = await page.evaluate(() => document.body.innerText);
  asserts[name] = assertText.map((t) => [t, body.includes(t)]);
  console.log('shot', name, page.url(), JSON.stringify(asserts[name]));
}

await shot('01-campus-config', '/pages/campus/config', { assertText: ['履约参数', '时段容量'] });
await shot('02-campus-buildings', '/pages/campus/buildings', { clickText: '分区管理', assertText: ['分区管理', '保存'] });
await shot('03-campus-address-changes', '/pages/campus/address-changes', { assertText: ['改址台账', '结清'] });
await shot('04-campus-dispatch', '/pages/campus/dispatch', { assertText: ['调度中心'] });
await shot('05-campus-stats', '/pages/campus/stats', { assertText: ['配送看板'] });
if (campusOrder) {
  // 校园测试订单在默认渠道：切渠道后打开订单详情
  await page.evaluate((t) => {
    localStorage.setItem('wa_channel_token', t);
    localStorage.setItem('wa_channel_code', '__default_channel__');
  }, 'cnx87ezvmjx8nn3bth6c');
  await shot('06-order-detail', `/pages/order/detail/index?id=${campusOrder.id}`, { wait: 4500, assertText: ['校园配送信息', '改址'] });
}

console.log('ASSERTS', JSON.stringify(asserts, null, 1));
console.log('console errors:', errors.slice(0, 5));
await browser.close();
