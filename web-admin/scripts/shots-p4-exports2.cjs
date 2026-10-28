// P4-1-4 / P4-2 导出扩展 · 线上取证：导出窗口选择 + 预警统计导出
//   node scripts/shots-p4-exports2.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium, request } = require('C:/nvm4w/nodejs/node_modules/playwright');

const SALES_OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p24-sales-bi');
const ALERT_OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p25-review-alert');
const BASE = 'https://e.joho.cn/guanli/';
const API = 'https://e.joho.cn/admin-api';
const CHANNEL = 'canteen-a-token';

(async () => {
  fs.mkdirSync(SALES_OUT, { recursive: true });
  fs.mkdirSync(ALERT_OUT, { recursive: true });
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
    if (/error|failed|undefined/.test(t)) console.log('[console]', t.slice(0, 240));
  });
  const tapText = (sel, txt) => page.evaluate(([s, t]) => {
    const el = Array.from(document.querySelectorAll(s)).find((e) => e.innerText.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')));
    if (!el) return false;
    el.click();
    return true;
  }, [sel, txt]);

  // ── 01 销售页：导出用户结构 → 选「近 30 日」 ──
  await page.goto(BASE + '#/pages/campus/sales', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.kpis', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.seg-item')).find((e) => e.innerText.includes('30'))?.click();
  });
  await page.waitForTimeout(2500);
  console.log('01 tap export', await tapText('.expo', '导出用户结构'));
  await page.waitForSelector('.uni-actionsheet__cell', { timeout: 15000 });
  console.log('01 sheet', JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.uni-actionsheet__cell')).map((e) => e.innerText.trim()))));
  await page.screenshot({ path: path.join(SALES_OUT, '09-admin-sales-export-range.png') });
  console.log('shot 09-admin-sales-export-range.png');

  const [dl1] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    tapText('.uni-actionsheet__cell', '近 30 日'),
  ]);
  const n1 = dl1.suggestedFilename();
  await dl1.saveAs(path.join(SALES_OUT, n1));
  console.log('csv ' + n1 + '\n' + fs.readFileSync(path.join(SALES_OUT, n1), 'utf8'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SALES_OUT, '10-admin-sales-export-toast.png') });
  console.log('shot 10-admin-sales-export-toast.png');

  // ── 02 预警页：导出统计（全部时间） ──
  await page.goto(BASE + '#/pages/review/list/index', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.tabs', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await tapText('.tabs > *', '品质预警');
  await page.waitForTimeout(2500);
  await tapText('.filters > *', '全部');
  await page.waitForTimeout(2000);
  console.log('02 tap stats', await tapText('.a-rule__btn', '导出统计'));
  await page.waitForSelector('.uni-actionsheet__cell', { timeout: 15000 });
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    tapText('.uni-actionsheet__cell', '全部时间'),
  ]);
  const n2 = '品质预警统计-20261028.csv';
  await dl2.saveAs(path.join(ALERT_OUT, n2));
  console.log('csv ' + n2 + '\n' + fs.readFileSync(path.join(ALERT_OUT, n2), 'utf8'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(ALERT_OUT, '09-admin-review-alert-stats.png') });
  console.log('shot 09-admin-review-alert-stats.png');

  await ctx.close();
  await browser.close();
  console.log('SHOTS DONE');
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
