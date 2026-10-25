// 配送体系 P8 收口：生产后台手机视口（390×844 dpr2）截图 + DOM 断言
// 覆盖：提现打款失败入口（PAID 卡片）、楼栋页新增分区、商品页跑腿商品初始化
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
const OUT = 'D:/zhao/vshop/docs/screenshots/waimai/p8';
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

await shot('01-withdraw-pending', '/pages/rider/withdraw/index', { assertText: ['提现审核'] });
// 切「已打款」tab：PAID 卡片才出现「标记打款失败」按钮
await page.getByText('已打款', { exact: true }).first().click().catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/02-withdraw-paid-tab.png`, fullPage: true });
const paidBody = await page.evaluate(() => document.body.innerText);
asserts['02-withdraw-paid-tab'] = [
  ['已打款', paidBody.includes('已打款')],
  ['标记打款失败', paidBody.includes('标记打款失败')],
];
console.log('shot 02-withdraw-paid-tab', page.url(), JSON.stringify(asserts['02-withdraw-paid-tab']));
await shot('03-buildings-new-zone', '/pages/campus/buildings', { assertText: ['分区'] });
// 展开「分区管理」面板：底部为新增分区（名称 + 运费 + 新增）
await page.getByText('分区管理', { exact: true }).first().click().catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03b-buildings-zone-panel.png`, fullPage: true });
const zonePanel = await page.evaluate(() => {
  const body = document.body.innerText;
  return {
    text: body.includes('新增'),
    newNamePh: body.includes('新增分区名称'),
  };
});
asserts['03b-buildings-zone-panel'] = [['新增', zonePanel.text], ['新增分区名称', zonePanel.newNamePh]];
console.log('shot 03b-buildings-zone-panel', JSON.stringify(asserts['03b-buildings-zone-panel']));
await shot('04-products-errand-init', '/pages/campus/products', { assertText: ['跑腿', '初始化跑腿商品'] });

console.log('ASSERTS', JSON.stringify(asserts, null, 1));
console.log('console errors:', errors.slice(0, 5));
await browser.close();
