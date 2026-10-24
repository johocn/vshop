// 第五轮配送审计回归截图（390×844 dpr=2）
//   node scripts/shots-campus-round5.cjs
// 覆盖：调度中心（异常处置告警/大厅排除已取消）、商家接单、改址台账
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const BASE = process.env.WA_ADMIN_BASE || 'https://e.joho.cn/guanli/';
const ADMIN_API = 'https://e.joho.cn/admin-api';
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p9-round5');
const CHANNEL = { code: 'canteen-a', token: 'canteen-a-token' };

const SHOTS = [
  { file: '01-dispatch-board.png', route: 'pages/campus/dispatch' },
  { file: '02-merchant-orders.png', route: 'pages/campus/merchant' },
  { file: '03-address-changes.png', route: 'pages/campus/address-changes' },
];

async function adminToken() {
  const res = await fetch(ADMIN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'mutation { login(username: "superadmin", password: "z123123") { ... on CurrentUser { id } } }' }),
  });
  const body = await res.json();
  if (!body.data?.login?.id) throw new Error('admin login failed: ' + JSON.stringify(body));
  return res.headers.get('vendure-auth-token');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await adminToken();
  const browser = await chromium.launch();
  for (const s of SHOTS) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    await context.addInitScript(({ tk, ch }) => {
      localStorage.setItem('wa_auth_token', tk);
      localStorage.setItem('wa_channel_token', ch.token);
      localStorage.setItem('wa_channel_code', ch.code);
    }, { tk: token, ch: CHANNEL });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${BASE}#/${s.route}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(6000);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const info = await (async () => {
      for (let i = 0; i < 3; i++) {
        try {
          return await page.evaluate(() => ({
            alerts: document.querySelectorAll('.alert').length,
            rows: document.querySelectorAll('.row, .card, .order-card').length,
            title: document.querySelector('.nav-title, .title')?.textContent?.trim() ?? '',
            bodyText: (document.body.innerText || '').slice(0, 120).replace(/\s+/g, ' '),
          }));
        } catch {
          await page.waitForTimeout(1500);
        }
      }
      return { alerts: -1, rows: -1, title: '', bodyText: 'evaluate failed' };
    })();
    await page.screenshot({ path: path.join(OUT, s.file) });
    console.log(`[shot] ${s.file} ${JSON.stringify(info)} errs=${errors.slice(0, 2).join(' | ')}`);
    await context.close();
  }
  await browser.close();
  console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
