// 楼栋坐标维护页手机视口截图（390×844 dpr=2）
//   node scripts/shots-campus-buildings.cjs
// 通过 localStorage 注入后台会话 + 渠道 token，直接进入页面（无需 UI 登录）
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const BASE = process.env.WA_ADMIN_BASE || 'https://e.joho.cn/guanli/';
const ADMIN_API = 'https://e.joho.cn/admin-api';
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'campus-buildings');

const SHOTS = [
  { file: '01-list-missing.png', channel: { code: 'canteen-a', token: 'canteen-a-token' }, edit: false, label: '列表（待标注）' },
  { file: '02-list-marked.png', channel: { code: '__default_channel__', token: 'cnx87ezvmjx8nn3bth6c' }, edit: false, label: '列表（已标注）' },
  { file: '03-editor-map.png', channel: { code: '__default_channel__', token: 'cnx87ezvmjx8nn3bth6c' }, edit: true, label: '编辑 + 地图选点' },
  { file: '04-editor-no-key.png', channel: { code: 'canteen-a', token: 'canteen-a-token' }, edit: true, stripKey: true, label: '未配置 Key 降级' },
];

const MAP_KEY = 'HUSBZ-P7VEV-M3OPP-5OYDB-U6UDS-WCBIJ';

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
    }, { tk: token, ch: s.channel });
    const page = await context.newPage();
    if (s.stripKey) {
      await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
        const res = await route.fetch();
        const body = (await res.text()).split(MAP_KEY).join('');
        await route.fulfill({ response: res, body });
      });
    }
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${BASE}#/pages/campus/buildings`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(s.edit ? 9000 : 6000);
    if (s.edit) {
      await page.click('.row');
      await page.waitForTimeout(7000);
      // 上移一点，让地图与「取地图中心点 / 保存坐标」按钮同屏
      await page.evaluate(() => window.scrollTo(0, 260));
      await page.waitForTimeout(600);
    }
    const info = await page.evaluate(() => ({
      rows: document.querySelectorAll('.row').length,
      summary: document.querySelector('.summary')?.textContent?.trim() ?? '',
      mapCanvas: document.querySelectorAll('.pick-map canvas').length,
      mapImg: document.querySelectorAll('.pick-map img').length,
      editor: !!document.querySelector('.editor'),
      hint: document.querySelector('.hint')?.textContent?.trim() ?? '',
    }));
    await page.screenshot({ path: path.join(OUT, s.file) });
    console.log(`[shot] ${s.file} ${s.label} ${JSON.stringify(info)} errs=${errors.slice(0, 2).join(' | ')}`);
    await context.close();
  }
  await browser.close();
  console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  process.exit(1);
});
