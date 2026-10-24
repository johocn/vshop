// 第九轮配送体系补漏回归截图（390×844 dpr=2）
//   node scripts/shots-campus-round8.cjs
// 覆盖：调度中心（回厅/派单）、校园配置（时段容量/骑手状态白名单）、楼栋（公开只读接口）
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const BASE = process.env.WA_ADMIN_BASE || 'https://e.joho.cn/guanli/';
const ADMIN_API = 'https://e.joho.cn/admin-api';
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p9-round9');
const CHANNEL = { code: 'canteen-a', token: 'canteen-a-token' };

const SHOTS = [
    { file: '02-campus-config.png', route: 'pages/campus/config' },
  { file: '03-buildings.png', route: 'pages/campus/buildings' },
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
    await page.waitForFunction(
      () => !(document.body.innerText || '').includes('加载中'),
      null, { timeout: 30000 },
    ).catch(() => undefined);
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const info = await (async () => {
      for (let i = 0; i < 3; i++) {
        try {
          return await page.evaluate(() => ({
            rows: document.querySelectorAll('.row, .card, .order-card, .kpi').length,
            title: document.querySelector('.nav-title, .title')?.textContent?.trim() ?? '',
            bodyText: (document.body.innerText || '').slice(0, 160).replace(/\s+/g, ' '),
          }));
        } catch {
          await page.waitForTimeout(1500);
        }
      }
      return { rows: -1, title: '', bodyText: 'evaluate failed' };
    })();
    try {
      await page.screenshot({
        path: path.join(OUT, s.file),
        animations: 'disabled',
        caret: 'hide',
        timeout: 120000,
      });
    } catch (e) {
      await page.screenshot({ path: path.join(OUT, s.file), timeout: 120000 });
    }
    console.log(`[shot] ${s.file} ${JSON.stringify(info)} errs=${errors.slice(0, 2).join(' | ')}`);
    await context.close();
  }
  await browser.close();
  console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
