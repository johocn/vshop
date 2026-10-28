// P4-1-4 趋势导出 + P4-2 预警导出 线上取证
//   node scripts/shots-p4-exports.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium, request } = require('C:/nvm4w/nodejs/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai');
const SALES_OUT = path.join(ROOT, 'p24-sales-bi');
const ALERT_OUT = path.join(ROOT, 'p25-review-alert');
const BASE = 'https://e.joho.cn/guanli/';
const API = 'https://e.joho.cn/admin-api';
const CHANNEL = 'canteen-a-token';

(async () => {
  fs.mkdirSync(SALES_OUT, { recursive: true });
  fs.mkdirSync(ALERT_OUT, { recursive: true });

  const rc = await request.newContext({
    extraHTTPHeaders: { 'Content-Type': 'application/json', 'vendure-token': CHANNEL },
  });
  const loginRes = await rc.post(API, {
    data: {
      query: 'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id identifier } } }',
      variables: { u: 'superadmin', p: 'z123123' },
    },
  });
  const token = loginRes.headers()['vendure-auth-token'];
  if (!token) throw new Error('admin 登录失败：未拿到 vendure-auth-token');
  console.log('admin token ok');
  await rc.dispose();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(([t, ch]) => {
    localStorage.setItem('wa_auth_token', t);
    localStorage.setItem('wa_channel_token', ch);
    localStorage.setItem('wa_channel_code', 'canteen-a');
  }, [token, CHANNEL]);

  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));

  // ── 01 经营趋势导出（近 30 日） ──
  await page.goto(BASE + '#/pages/campus/sales', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.seg', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.seg-item')).find((e) => e.innerText.trim() === '近 30 日')?.click();
  });
  await page.waitForTimeout(2800);
  console.log('sales state', JSON.stringify(await page.evaluate(() => ({
    on: document.querySelector('.seg-item.on')?.innerText?.trim() || '',
    expoBtns: Array.from(document.querySelectorAll('.expo')).map((e) => e.innerText.trim()),
  }))));
  await page.evaluate(() => document.querySelector('.chart')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  const [dl1] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => {
      Array.from(document.querySelectorAll('.expo')).find((e) => e.innerText.trim().includes('趋势'))?.click();
    }),
  ]);
  await dl1.saveAs(path.join(SALES_OUT, '经营趋势明细-20261028.csv'));
  console.log('csv1\n' + fs.readFileSync(path.join(SALES_OUT, '经营趋势明细-20261028.csv'), 'utf8'));
  await page.screenshot({ path: path.join(SALES_OUT, '07-admin-sales-trend-export.png') });
  console.log('shot 07-admin-sales-trend-export.png');

  // ── 02 品质预警导出（全部） ──
  await page.goto(BASE + '#/pages/review/list/index', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.tabs', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const switched = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tabs > *')).find((e) => e.innerText.trim().includes('品质预警'));
    if (!t) return false;
    t.click();
    return true;
  });
  await page.waitForTimeout(2500);
  console.log('alert switch', switched, JSON.stringify(await page.evaluate(() => ({
    ruleBtns: Array.from(document.querySelectorAll('.a-rule__btn')).map((e) => e.innerText.trim()),
    cards: document.querySelectorAll('.card').length,
  }))));
  // 切「全部」以导出全部状态
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.filters > *')).find((e) => e.innerText.trim() === '全部')?.click();
  });
  await page.waitForTimeout(2200);
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => {
      Array.from(document.querySelectorAll('.a-rule__btn')).find((e) => e.innerText.trim().includes('导出'))?.click();
    }),
  ]);
  await dl2.saveAs(path.join(ALERT_OUT, '品质预警明细-20261028.csv'));
  console.log('csv2\n' + fs.readFileSync(path.join(ALERT_OUT, '品质预警明细-20261028.csv'), 'utf8'));
  await page.screenshot({ path: path.join(ALERT_OUT, '06-admin-review-alert-export.png') });
  console.log('shot 06-admin-review-alert-export.png');

  await ctx.close();
  await browser.close();
  console.log('SHOTS DONE');
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
