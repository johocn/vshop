// P4-1-4 商品结构导出按分类筛选 · 线上取证
//   node scripts/shots-sales-category.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium, request } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p24-sales-bi');
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
  const tapText = (sel, txt) => page.evaluate(([s, t]) => {
    const el = Array.from(document.querySelectorAll(s)).find((e) => e.innerText.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')));
    if (!el) return false;
    el.click();
    return true;
  }, [sel, txt]);

  await page.goto(BASE + '#/pages/campus/sales', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.kpis', { timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('01 tap export', await tapText('.expo', '导出CSV'));
  await page.waitForSelector('.uni-actionsheet__cell', { timeout: 15000 });
  console.log('01 pick 30d', await tapText('.uni-actionsheet__cell', '近30日'));

  // 分类弹层（候选取自该窗口商品数据）
  await page.waitForSelector('.catlist', { timeout: 30000 });
  const sheet = await page.evaluate(() => ({
    title: document.querySelector('.stitle')?.innerText,
    hint: document.querySelector('.shint')?.innerText,
    chips: Array.from(document.querySelectorAll('.catchip')).map((e) => e.innerText.trim()),
  }));
  console.log('02 sheet', JSON.stringify(sheet));
  await page.screenshot({ path: path.join(OUT, '14-admin-sales-export-category-sheet.png') });
  console.log('shot 14-admin-sales-export-category-sheet.png');

  console.log('03 pick chip', await tapText('.catchip', '水产海鲜'));
  const picked = await page.evaluate(() => Array.from(document.querySelectorAll('.catchip.on')).map((e) => e.innerText.trim()));
  console.log('03 picked', JSON.stringify(picked));

  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    tapText('.dacts .dbtn', '确定'),
  ]);
  const name = dl.suggestedFilename();
  await dl.saveAs(path.join(OUT, name));
  console.log('csv ' + name);
  console.log(fs.readFileSync(path.join(OUT, name), 'utf8'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '15-admin-sales-export-category-toast.png') });
  console.log('shot 15-admin-sales-export-category-toast.png');

  await ctx.close();
  await browser.close();
  console.log('SHOTS DONE');
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
