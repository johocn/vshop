// C 端积分订单退款状态展示验证截图（Playwright，390×844 dpr=2）
// 覆盖：points-orders 订单卡金额区 refundStatus 标签（线上当前无退款单，标签不显示属预期，截图证明页面无回归）
// 用法：node web-admin/scripts/_vshop_points_refund_shots.mjs
// 环境变量：SITE_URL（默认 https://e.joho.cn）、SHOT_USER / SHOT_PWD
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const HERE = path.dirname(fileURLToPath(import.meta.url));
function loadPlaywright() {
  const candidates = [
    process.env.PW_ROOT ? path.join(process.env.PW_ROOT, 'node_modules', 'playwright') : '',
    'd:/zhao/vendure/node_modules/playwright',
    path.resolve(HERE, '..', 'node_modules', 'playwright'),
    path.resolve(HERE, '..', '..', 'node_modules', 'playwright'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (e) {}
  }
  throw new Error('未找到 playwright');
}
function findChromium() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  try {
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      const exe = path.join(root, d, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) {}
  return '';
}
const { chromium } = loadPlaywright();
const CHROMIUM = findChromium();

const URL = process.env.SITE_URL || 'https://e.joho.cn';
const USER = process.env.SHOT_USER || 'points-probe@joho.cn';
const PWD = process.env.SHOT_PWD || 'Pp123456';
const SHOTS = path.resolve(HERE, '..', 'docs', 'superpowers', 'manual', 'usemall-parity-points-mall', 'assets');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, ...(CHROMIUM ? { executablePath: CHROMIUM } : {}) });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  await ctx.addInitScript(() => { try { sessionStorage.setItem('sso_auto_jumped', '1'); } catch (e) {} });

  // ---------- 登录注入（与 _vshop_points_mall_shots.mjs 同款） ----------
  console.log('[0] 登录注入');
  const r = await fetch(`${URL}/shop-api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }',
      variables: { u: USER, p: PWD },
    }),
  });
  const token = r.headers.get('vendure-auth-token') || '';
  const j = await r.json();
  const u = j?.data?.login;
  console.log('  login =', JSON.stringify(u), '| authToken =', token ? '有' : '无');
  if (!u?.id || !token) throw new Error('登录失败');
  await ctx.addInitScript(([t, id]) => {
    try {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_userId', id);
    } catch (e) {}
  }, [token, String(u.id)]);

  const readStoreToken = () =>
    page.evaluate(() => {
      let app = null;
      for (const el of document.querySelectorAll('*')) {
        if (el.__vue_app__) { app = el.__vue_app__; break; }
      }
      const pinia = app?.config?.globalProperties?.$pinia;
      return String(pinia?.state?.value?.auth?.token || '');
    });
  let storeToken = '';
  for (let round = 0; round < 3 && !storeToken; round++) {
    await page.goto(`${URL}/#/pkg-user/pages/member-center`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1000);
      storeToken = await readStoreToken();
      if (storeToken) break;
    }
  }
  if (!storeToken) throw new Error('登录态未恢复');
  console.log('  store auth token 已恢复');

  // ---------- points-orders：退款状态标签（无退款单时标签不显示属预期） ----------
  console.log('[1] points-orders 页');
  await page.goto(`${URL}/#/pkg-user/pages/points-orders`, { timeout: 60000 });
  await page.waitForTimeout(7000);
  const text = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 240));
  console.log('  text =', text);
  await page.screenshot({ path: path.join(SHOTS, 'points-c-orders-refund.png') });
  console.log('  -> points-c-orders-refund.png');

  await browser.close();
  console.log('screenshots done ->', SHOTS);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
