// P4-1-4 任意起止日期导出 · 线上取证（导出 → 自定义日期 → 确定 → CSV）
//   node scripts/shots-sales-custom-range.cjs
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
  page.on('console', (m) => {
    const t = String(m.text());
    if (/error|failed/.test(t)) console.log('[console]', t.slice(0, 240));
  });
  const tapText = (sel, txt) => page.evaluate(([s, t]) => {
    const el = Array.from(document.querySelectorAll(s)).find((e) => e.innerText.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')));
    if (!el) return false;
    el.click();
    return true;
  }, [sel, txt]);

  await page.goto(BASE + '#/pages/campus/sales', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.kpis', { timeout: 30000 });
  await page.waitForTimeout(2000);

  // 01 导出趋势 → 动作面板含「自定义日期…」
  console.log('01 tap export', await tapText('.expo', '导出趋势'));
  await page.waitForSelector('.uni-actionsheet__cell', { timeout: 15000 });
  console.log('01 items', JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.uni-actionsheet__cell')).map((e) => e.innerText.trim()))));
  await page.screenshot({ path: path.join(OUT, '11-admin-sales-export-custom-entry.png') });
  console.log('shot 11-admin-sales-export-custom-entry.png');

  // 02 选「自定义日期…」→ 起止日期层（默认最近 7 个自然日）
  await tapText('.uni-actionsheet__cell', '自定义日期');
  await page.waitForSelector('.sheet .stitle', { timeout: 15000 });
  const sheet = await page.evaluate(() => ({
    title: document.querySelector('.stitle')?.innerText,
    hint: document.querySelector('.shint')?.innerText,
    dates: Array.from(document.querySelectorAll('.sheet .dv')).map((e) => e.innerText.trim()),
    acts: Array.from(document.querySelectorAll('.dacts .dbtn')).map((e) => e.innerText.trim()),
  }));
  console.log('02 sheet', JSON.stringify(sheet));
  await page.screenshot({ path: path.join(OUT, '12-admin-sales-export-custom-sheet.png') });
  console.log('shot 12-admin-sales-export-custom-sheet.png');

  // 03 确定 → 拉取自定义区间并下载 CSV
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    tapText('.dacts .dbtn', '确定'),
  ]);
  const name = dl.suggestedFilename();
  await dl.saveAs(path.join(OUT, name));
  console.log('csv ' + name);
  console.log(fs.readFileSync(path.join(OUT, name), 'utf8'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '13-admin-sales-export-custom-toast.png') });
  console.log('shot 13-admin-sales-export-custom-toast.png');

  await ctx.close();
  await browser.close();
  console.log('SHOTS DONE');
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
