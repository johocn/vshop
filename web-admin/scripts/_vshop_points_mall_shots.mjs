// 积分商城 + 商品收藏 手机视口截图（Playwright，390×844 dpr=2）
//
// 用法（脚本目录即 web-admin/scripts/）：
//   node web-admin/scripts/_vshop_points_mall_shots.mjs
//   node web-admin/scripts/_vshop_points_mall_shots.mjs --only list,detail
//
// 环境变量：SITE_URL（默认 https://e.joho.cn）、SHOT_USER / SHOT_PWD（默认测试客户 points-probe@joho.cn）
// 前置造数：存在测试客户 + 积分商品（洗车/黄金珠宝/温泉门票）+ 5 笔积分订单 + 2 条收藏。
// 本脚本只做浏览与截图，不触发任何下单/收藏写操作。
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
    try {
      return require(c);
    } catch (e) {}
  }
  throw new Error('未找到 playwright，请先安装依赖或设置 PW_ROOT');
}
function findChromium() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  try {
    const dirs = fs
      .readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
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

const argv = process.argv.slice(2);
const arg = (k) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : '';
};
const ONLY = arg('only');
const want = (k) => !ONLY || ONLY.split(',').includes(k);

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(CHROMIUM ? { executablePath: CHROMIUM } : {}) });
  const ctx = await browser.newContext({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    deviceScaleFactor: MOBILE.deviceScaleFactor,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e.message).slice(0, 160)));
  page.on('response', async (r) => {
    if (!r.url().includes('/shop-api')) return;
    try {
      const j = await r.json();
      if (j?.errors) console.log('  [gql-errors]', JSON.stringify(j.errors).slice(0, 300));
    } catch (e) {}
  });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('sso_auto_jumped', '1');
    } catch (e) {}
  });

  // ---------- 登录（shop-api 原生登录 → 注入 localStorage，与 stores/auth.ts 格式一致） ----------
  // 必须先注入再 boot：restoreSession 从 localStorage 恢复，注入晚了整轮都是游客态。
  console.log('[0] 登录注入');
  const r = await fetch(`${URL}/shop-api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query:
        'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }',
      variables: { u: USER, p: PWD },
    }),
  });
  const token = r.headers.get('vendure-auth-token') || '';
  const j = await r.json();
  const u = j?.data?.login;
  console.log('  login =', JSON.stringify(u), '| authToken =', token ? '有' : '无');
  if (!u?.id || !token) throw new Error('登录失败，无法采集登录态截图');
  await ctx.addInitScript(([t, id]) => {
    try {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_userId', id);
    } catch (e) {}
  }, [token, String(u.id)]);

  // Boot 一次并等 restoreSession 完成：直读 pinia auth store 的 token。首次加载不要用
  // reload 打断（boot 早期 reload 会留下半初始化的 tenant_code 触发「店铺不存在」回退），
  // 就绪后一律 SPA hash 导航（onLoad 同步检查 auth.isLoggedIn 的页面在整页 reload 下会竞态）。
  const readStoreToken = () =>
    page.evaluate(() => {
      let app = null;
      for (const el of document.querySelectorAll('*')) {
        if (el.__vue_app__) {
          app = el.__vue_app__;
          break;
        }
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
    if (!storeToken) console.log(`  [retry ${round + 1}] 登录态未恢复，重新 boot…`);
  }
  console.log('  store auth token =', storeToken ? '已恢复(' + storeToken.slice(0, 8) + '…)' : '未恢复!');
  if (!storeToken) throw new Error('登录态未恢复（restoreSession 竞态/租户解析失败），无法采集登录态截图');
  const go = async (hash, wait = 5000) => {
    await page.goto(`${URL}/#${hash}`, { timeout: 60000 });
    await page.waitForTimeout(wait);
    const t = await readStoreToken();
    if (!t) throw new Error('SPA 导航后登录态丢失: ' + hash);
  };
  const shot = async (name, full = false) => {
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: full });
    console.log(`  -> ${name}`);
  };
  const text = async () =>
    (await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 240))) || 'EMPTY';

  // ---------- 1 会员中心入口 ----------
  if (want('member')) {
    console.log('[1] 会员中心入口');
    await go('/pkg-user/pages/member-center', 6000);
    console.log('  text =', await text());
    await shot('points-member-center-entry.png');
    // 积分商品/我的收藏入口若在折叠线以下，滚到底再补一张
    try {
      const fav = page.locator('text=我的收藏').first();
      if ((await fav.count()) && !(await fav.isVisible())) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);
        await shot('points-member-center-entry-bottom.png');
      }
    } catch (e) {}
  }

  // ---------- 2 积分商品列表 ----------
  if (want('list')) {
    console.log('[2] 积分商品列表');
    await go('/pkg-user/pages/points-goods-list', 6000);
    console.log('  text =', await text());
    await shot('points-goods-list.png');
  }

  // ---------- 3 积分商品详情（收藏激活态） ----------
  if (want('detail')) {
    console.log('[3] 积分商品详情·洗车（已收藏）');
    await go('/pkg-user/pages/points-goods-detail?id=4', 6000);
    console.log('  text =', await text());
    await shot('points-goods-detail-favorited.png');
    console.log('[3b] 积分商品详情·黄金珠宝（混合价 + 已收藏）');
    // 同路由不同参数：SPA 复用组件不重挂载。详情页 onLoad 无登录同步检查（favoriteMeta 游客可查、
    // myMemberInfo 失败仅显示 --），整页 reload 安全：boot 后按新 id 重新取数。
    await page.goto(`${URL}/#/pkg-user/pages/points-goods-detail?id=5`, { timeout: 60000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    console.log('  text =', await text());
    await shot('points-goods-detail-mixed-price.png');
  }

  // ---------- 4 兑换确认页（混合价 + 地址） ----------
  if (want('confirm')) {
    console.log('[4] 兑换确认页');
    await go('/pkg-user/pages/points-goods-confirm?id=5', 6000);
    console.log('  text =', await text());
    await shot('points-goods-confirm.png');
  }

  // ---------- 5 积分订单列表 ----------
  if (want('orders')) {
    console.log('[5] 积分订单列表');
    await go('/pkg-user/pages/points-orders', 6000);
    console.log('  text =', await text());
    await shot('points-orders.png');
    // 长列表：滚到底补一张（5 单可能超一屏）
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await shot('points-orders-bottom.png');
  }

  // ---------- 6 我的收藏 ----------
  if (want('favorites')) {
    console.log('[6] 我的收藏');
    await go('/pkg-user/pages/favorites', 6000);
    console.log('  text =', await text());
    await shot('favorites-list.png');
  }

  await browser.close();
  console.log('screenshots done ->', SHOTS);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
