// P4-4 前端埋点 + 错误上报闭环 · 后台「系统监控」线上取证（Playwright + 真实 admin-api）
//   01 概览（4 KPI + 7 日趋势）
//   02 Top 事件榜
//   03 埋点明细（事件页签）
//   04 错误明细（错误页签）
//   node scripts/shots-p44-monitor.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium, request } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p44-telemetry');
const BASE = 'https://e.joho.cn/guanli/';
const API = 'https://e.joho.cn/admin-api';
const CHANNEL = 'canteen-a-token';
const ADMIN_USER = 'superadmin';
const ADMIN_PWD = 'z123123';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const rc = await request.newContext({
    extraHTTPHeaders: { 'Content-Type': 'application/json', 'vendure-token': CHANNEL },
  });
  const loginRes = await rc.post(API, {
    data: {
      query: 'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id identifier } } }',
      variables: { u: ADMIN_USER, p: ADMIN_PWD },
    },
  });
  const token = loginRes.headers()['vendure-auth-token'];
  if (!token) throw new Error('admin 登录失败：未拿到 vendure-auth-token');
  console.log('admin token ok');
  await rc.dispose();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(([t, ch]) => {
    localStorage.setItem('wa_auth_token', t);
    localStorage.setItem('wa_channel_token', ch);
    localStorage.setItem('wa_channel_code', 'canteen-a');
  }, [token, CHANNEL]);

  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
  page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });

  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('shot ' + name);
  };

  await page.goto(BASE + '#/pages/campus/monitor', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.kpis', { timeout: 30000 });
  await page.waitForTimeout(1500);

  const readState = () => ({
    kpis: Array.from(document.querySelectorAll('.kpi')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    bars: Array.from(document.querySelectorAll('.col')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    top: Array.from(document.querySelectorAll('.trow')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    items: Array.from(document.querySelectorAll('.item')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)),
    tabs: Array.from(document.querySelectorAll('.seg-item')).map((e) => e.innerText.trim()),
  });
  console.log('01 state', JSON.stringify(await page.evaluate(readState)));
  await shot('01-admin-monitor-overview.png');

  // ── Top 事件榜（滚动到卡片） ──
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    cards[1]?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(700);
  console.log('02 state', JSON.stringify(await page.evaluate(() => ({
    top: Array.from(document.querySelectorAll('.trow')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
  }))));
  await shot('02-admin-monitor-top-events.png');

  // ── 埋点明细（回到顶部下方列表） ──
  await page.evaluate(() => {
    document.querySelector('.seg')?.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -20);
  });
  await page.waitForTimeout(600);
  console.log('03 state', JSON.stringify(await page.evaluate(() => ({
    tab: document.querySelector('.seg-item.on')?.innerText?.trim() || '',
    items: Array.from(document.querySelectorAll('.item')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)),
  }))));
  await shot('03-admin-monitor-events.png');

  // ── 切到错误明细 ──
  const switched = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.seg-item')).find((e) => e.innerText.trim().includes('错误'));
    if (!t) return false;
    t.click();
    return true;
  });
  console.log('04 switch errors', switched);
  await page.waitForTimeout(2500);
  console.log('04 state', JSON.stringify(await page.evaluate(() => ({
    tab: document.querySelector('.seg-item.on')?.innerText?.trim() || '',
    items: Array.from(document.querySelectorAll('.item')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)),
  }))));
  await shot('04-admin-monitor-errors.png');

  await ctx.close();
  await browser.close();
  console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
