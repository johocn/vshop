// P4-1 经营分析 + P4-1-4 商品结构导出 CSV · 后台线上取证（Playwright + 真实 admin-api）
//   02 今日（空态/时段柱）  03 近 7 日  04 近 30 日  05 导出 CSV
//   node scripts/shots-p24-sales-bi.cjs
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

  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('shot ' + name);
  };
  const readState = () => ({
    seg: Array.from(document.querySelectorAll('.seg-item')).map((e) => e.innerText.trim()),
    on: document.querySelector('.seg-item.on')?.innerText?.trim() || '',
    kpis: Array.from(document.querySelectorAll('.kpi')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    bars: document.querySelectorAll('.col').length,
    products: Array.from(document.querySelectorAll('.prow')).slice(0, 5).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    empty: Array.from(document.querySelectorAll('.muted')).map((e) => e.innerText.trim()).join(' | '),
  });

  await page.goto(BASE + '#/pages/campus/sales', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.seg', { timeout: 30000 });
  await page.waitForTimeout(2500);
  // 页面默认档位可能是「近 7 日」，先显式切回「今日」
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.seg-item')).find((e) => e.innerText.trim() === '今日')?.click();
  });
  await page.waitForTimeout(2500);
  console.log('02 state', JSON.stringify(await page.evaluate(readState)));
  await shot('02-admin-sales-today.png');

  const switchRange = async (label, file, tag) => {
    const ok = await page.evaluate((l) => {
      const t = Array.from(document.querySelectorAll('.seg-item')).find((e) => e.innerText.trim() === l);
      if (!t) return false;
      t.click();
      return true;
    }, label);
    await page.waitForTimeout(2500);
    console.log(tag, 'switch', ok, JSON.stringify(await page.evaluate(readState)));
    await shot(file);
  };
  await switchRange('近 7 日', '03-admin-sales-7d.png', '03');
  await switchRange('近 30 日', '04-admin-sales-30d.png', '04');

  // ── 商品结构明细导出 CSV（P4-1-4） ──
  await page.evaluate(() => document.querySelector('.expo')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(600);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => document.querySelector('.expo')?.click()),
  ]);
  const csvName = '商品结构明细-20261028.csv';
  await dl.saveAs(path.join(OUT, csvName));
  const csv = fs.readFileSync(path.join(OUT, csvName), 'utf8');
  console.log('05 csv', csvName, '\n' + csv.split('\n').slice(0, 4).join('\n'));
  await shot('05-admin-sales-csv-export.png');

  await ctx.close();
  await browser.close();
  console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
