// P4-1-4 扩展 · 用户结构导出线上取证（Playwright + 真实 admin-api）
//   node scripts/shots-p24-user-export.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium, request } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p24-sales-bi');
const BASE = 'https://e.joho.cn/guanli/';
const API = 'https://e.joho.cn/admin-api';
const CHANNEL = 'canteen-a-token';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

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

  await page.goto(BASE + '#/pages/campus/sales', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.seg', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.seg-item')).find((e) => e.innerText.trim() === '近 30 日')?.click();
  });
  await page.waitForTimeout(2800);

  console.log('state', JSON.stringify(await page.evaluate(() => ({
    on: document.querySelector('.seg-item.on')?.innerText?.trim() || '',
    cohorts: Array.from(document.querySelectorAll('.crow')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    expoBtns: Array.from(document.querySelectorAll('.expo')).map((e) => e.innerText.trim()),
  }))));

  // 找到「导出用户结构」按钮（复购分群卡片内）
  await page.evaluate(() => document.querySelector('.crow')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(600);

  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.expo')).find((e) => e.innerText.trim().includes('用户'));
      b?.click();
    }),
  ]);
  const csvName = '用户结构明细-20261028.csv';
  await dl.saveAs(path.join(OUT, csvName));
  console.log('csv ' + csvName + '\n' + fs.readFileSync(path.join(OUT, csvName), 'utf8'));

  await page.screenshot({ path: path.join(OUT, '06-admin-sales-user-export.png') });
  console.log('shot 06-admin-sales-user-export.png');

  await ctx.close();
  await browser.close();
  console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
