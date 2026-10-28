// P4-2 扩展 · 预警导出时间段选择 线上取证
//   node scripts/shots-p25-alert-range.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium, request } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p25-review-alert');
const BASE = 'https://e.joho.cn/guanli/';
const API = 'https://e.joho.cn/admin-api';
const CHANNEL = 'canteen-a-token';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const rc = await request.newContext({ extraHTTPHeaders: { 'Content-Type': 'application/json', 'vendure-token': CHANNEL } });
  const loginRes = await rc.post(API, {
    data: { query: 'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id } } }', variables: { u: 'superadmin', p: 'z123123' } },
  });
  const token = loginRes.headers()['vendure-auth-token'];
  if (!token) throw new Error('admin 登录失败');
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

  await page.goto(BASE + '#/pages/review/list/index', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.tabs', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.tabs > *')).find((e) => e.innerText.trim().includes('品质预警'))?.click();
  });
  await page.waitForTimeout(2500);
  // 默认筛选是「待处理」，冒烟数据只有已回评 → 先切「全部」
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.filters > *')).find((e) => e.innerText.trim() === '全部')?.click();
  });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.a-rule__btn')).find((e) => e.innerText.trim().includes('导出'))?.click();
  });
  await page.waitForSelector('.uni-actionsheet__cell', { timeout: 15000 });
  console.log('sheet', JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.uni-actionsheet__cell')).map((e) => e.innerText.trim()))));
  await page.screenshot({ path: path.join(OUT, '07-admin-review-alert-export-range.png') });
  console.log('shot 07-admin-review-alert-export-range.png');

  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => {
      Array.from(document.querySelectorAll('.uni-actionsheet__cell')).find((e) => e.innerText.trim().includes('近 7 天'))?.click();
    }),
  ]);
  const name = '品质预警明细-近7天-20261028.csv';
  await dl.saveAs(path.join(OUT, name));
  console.log('csv ' + name + '\n' + fs.readFileSync(path.join(OUT, name), 'utf8'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '08-admin-review-alert-export-toast.png') });
  console.log('shot 08-admin-review-alert-export-toast.png');

  await ctx.close();
  await browser.close();
  console.log('SHOTS DONE');
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
