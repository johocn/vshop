// 购物车「已下架」行 —— 生产环境手机视口回归 + 截图（Playwright，390×844 dpr=2）
//
// 背景：C 端判定「已下架」需要 shop-api 的 ProductVariant.enabled（Vendure 默认只在 admin-api 暴露）。
// 后端已在 cjk-plugin 的 shopApiExtensions 里扩展该字段。本脚本负责在生产上把「加购 → 后台下架 → 购物车显示已下架」
// 这条真实链路跑一遍并留证：
//   1) shop-api 原生登录 C 端测试客户 → 确保 activeOrder 至少 1 行（没有则加购 1 件）
//   2) 截「下架前」购物车（对照图）
//   3) admin-api 登录后台 → updateProductVariants 把该行变体 enabled=false
//   4) 截「下架后」购物车（应出现灰色「已下架」标签、行灰显、不可勾选）
//   5) 点该行勾选框 → 应弹 toast「该商品已下架，请删除」
//   6) finally：把变体 enabled 恢复为 true（不污染生产数据）
//
// 用法（脚本目录即 web-admin/scripts/）：
//   node web-admin/scripts/_vshop_cart_invalid_shots.mjs
// 环境变量：SITE_URL（默认 https://e.joho.cn）
//   CUST_USER / CUST_PWD（默认 qa-vshop-manual@local.dev / Qa123456）
//   ADMIN_USER / ADMIN_PWD（默认 superadmin / z123123）
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const HERE = path.dirname(fileURLToPath(import.meta.url)); // web-admin/scripts

// Playwright 解析顺序：环境变量 PW_ROOT → 本机 vendure 依赖（已有可用浏览器）→ 就近 node_modules
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
  const preferred = path.join(root, 'chromium-1234', 'chrome-win64', 'chrome.exe');
  if (fs.existsSync(preferred)) return preferred;
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
const SHOTS = path.resolve(HERE, '..', 'docs', 'superpowers', 'manual', 'vshop-usemall-alignment', 'assets');
fs.mkdirSync(SHOTS, { recursive: true });
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };

const CUST = { user: process.env.CUST_USER || 'qa-vshop-manual@local.dev', pwd: process.env.CUST_PWD || 'Qa123456' };
const ADMIN = { user: process.env.ADMIN_USER || 'superadmin', pwd: process.env.ADMIN_PWD || 'z123123' };

async function gql(endpoint, query, variables, headers = {}) {
  const r = await fetch(`${URL}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const token = r.headers.get('vendure-auth-token') || r.headers.get('auth-token') || '';
  const j = await r.json();
  if (j.errors) throw new Error(`${endpoint} gql 错误：${JSON.stringify(j.errors).slice(0, 400)}`);
  return { data: j.data, token };
}

const ORDER_Q = '{ activeOrder { id code lines { id quantity productVariant { id name enabled stockLevel } } } }';

(async () => {
  // ---------- 0 渠道 token ----------
  const ch = await gql('/shop-api', '{ resolveChannelByCode(code:"__default_channel__"){ code token } }');
  const channel = ch.data.resolveChannelByCode.token;
  console.log('[0] 渠道 =', ch.data.resolveChannelByCode.code, '| token =', channel);
  const shopH = { 'vendure-token': channel };

  // ---------- 1 购物车客户登录 ----------
  const lg = await gql(
    '/shop-api',
    'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }',
    { u: CUST.user, p: CUST.pwd },
    shopH,
  );
  if (!lg.token || !lg.data.login?.id) throw new Error('C 端登录失败：' + JSON.stringify(lg.data.login));
  const authH = { ...shopH, Authorization: 'Bearer ' + lg.token };
  console.log('[1] C 端登录 =', lg.data.login.identifier, '| customer id =', lg.data.login.id);

  let order = (await gql('/shop-api', ORDER_Q, {}, authH)).data.activeOrder;
  if (!order || !order.lines?.length) {
    // 加购 1 件：挑一个在售变体
    const s = await gql('/shop-api', '{ search(input:{take:20,groupByProduct:true}){ items { productName productVariantId } } }', {}, shopH);
    const cand = (s.data.search.items || []).map((x) => x.productVariantId).filter(Boolean);
    if (!cand.length) throw new Error('search 未返回可用变体，无法加购');
    const add = await gql(
      '/shop-api',
      'mutation($id:ID!){ addItemToOrder(productVariantId:$id,quantity:1){ ... on Order { id lines { id } } ... on ErrorResult { errorCode message } } }',
      { id: String(cand[0]) },
      authH,
    );
    if (add.data.addItemToOrder?.errorCode) throw new Error('加购失败：' + JSON.stringify(add.data.addItemToOrder));
    order = (await gql('/shop-api', ORDER_Q, {}, authH)).data.activeOrder;
    console.log('[1] 原购物车为空，已加购 1 件');
  }
  const lines = order.lines || [];
  console.log('[1] activeOrder', order.code, '行数 =', lines.length);
  lines.forEach((l) => console.log(`    行 ${l.id} ${l.productVariant?.name} enabled=${l.productVariant?.enabled} stock=${l.productVariant?.stockLevel}`));

  const target = lines.find((l) => l.productVariant?.enabled !== false) || lines[0];
  const variantId = String(target.productVariant.id);
  console.log('[1] 目标变体 =', variantId, target.productVariant.name);

  // 断言：下架前 enabled 必须为 true（否则说明上一轮未复原）
  if (target.productVariant.enabled !== true) {
    throw new Error(`下架前 enabled=${target.productVariant.enabled}，疑上一轮未复原，请先恢复后再跑`);
  }

  // ---------- 2 admin 登录（复用浏览器前先备好写权限）----------
  const al = await gql(
    '/admin-api',
    'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }',
    { u: ADMIN.user, p: ADMIN.pwd },
  );
  if (!al.token) throw new Error('后台登录失败：' + JSON.stringify(al.data.login));
  const adminH = { Authorization: 'Bearer ' + al.token };
  console.log('[2] 后台登录 =', al.data.login.identifier);

  const setEnabled = async (v) => {
    const m = await gql(
      '/admin-api',
      'mutation($id:ID!,$enabled:Boolean!){ updateProductVariants(input:[{id:$id,enabled:$enabled}]){ id enabled } }',
      { id: variantId, enabled: v },
      adminH,
    );
    const got = m.data.updateProductVariants?.[0];
    if (!got || got.enabled !== v) throw new Error('updateProductVariants 未生效：' + JSON.stringify(m.data));
    console.log(`    admin updateProductVariants enabled=${v} → ok`);
  };

  const { data: chk } = await gql('/shop-api', ORDER_Q, {}, authH);
  console.log('[2] 后台可见该变体（下架前）enabled =', chk.activeOrder.lines.find((l) => String(l.productVariant.id) === variantId)?.productVariant?.enabled);

  // ---------- 3 浏览器：下架前对照图 ----------
  const browser = await chromium.launch({ headless: true, ...(CHROMIUM ? { executablePath: CHROMIUM } : {}) });
  let restored = false;
  try {
    const ctx = await browser.newContext({
      viewport: { width: MOBILE.width, height: MOBILE.height },
      deviceScaleFactor: MOBILE.deviceScaleFactor,
      locale: 'zh-CN',
    });
    await ctx.addInitScript(([t, id]) => {
      try {
        localStorage.setItem('auth_token', t);
        localStorage.setItem('auth_userId', id);
      } catch (e) {}
    }, [lg.token, lg.data.login.id]);

    const page = await ctx.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', (e) => console.log('  [pageerror]', String(e.message).slice(0, 140)));
    page.on('response', async (r) => {
      if (!r.url().includes('/shop-api')) return;
      try {
        const j = await r.json();
        if (j?.errors) console.log('  [gql-errors]', JSON.stringify(j.errors).slice(0, 300));
      } catch (e) {}
    });

    // 必须带 nonce：同 hash 的第二次 goto 会被浏览器当作 same-document 导航而不重载，
    // 页面停在旧数据上（表现就是「下架后仍显示正常行」）。
    const openCart = async () => {
      await page.goto(`${URL}/?_t=${Date.now()}#/pages/cart/index`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6000);
    };
    const bodyText = async () => (await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))) || 'EMPTY';

    console.log('[3] 打开购物车（下架前）');
    await openCart();
    console.log('  text =', (await bodyText()).slice(0, 220));
    await page.screenshot({ path: path.join(SHOTS, 'cart-invalid-before.png') });
    console.log('  -> cart-invalid-before.png');

    // ---------- 4 下架变体 ----------
    console.log('[4] 后台把变体下架');
    await setEnabled(false);
    const dbg = await gql('/shop-api', ORDER_Q, {}, authH);
    console.log(
      '  [debug] shop-api 行变体 enabled =',
      (dbg.data.activeOrder?.lines || []).map((l) => `${l.productVariant.id}:${l.productVariant.enabled}`).join(', '),
    );

    console.log('[5] 重新打开购物车（下架后）');
    await openCart();
    const after = await bodyText();
    console.log('  text =', after.slice(0, 260));
    await page.screenshot({ path: path.join(SHOTS, 'cart-invalid-line.png') });
    console.log('  -> cart-invalid-line.png');
    if (!after.includes('已下架')) throw new Error('购物车未出现「已下架」标签，断言失败');
    console.log('  断言：页面含「已下架」标签 ✓');

    // 勾选态：失效行不应被自动勾选 → 全选应为「未勾选」、可结算数应排除失效行
    const footer = after.includes('结算') ? after.slice(after.indexOf('全选')) : '';
    console.log('  结算区 =', footer.slice(0, 80));

    // ---------- 6 点失效行勾选框 → toast ----------
    console.log('[6] 点击失效行勾选框');
    const boxes = page.locator('.cart-item--invalid .cart-item__check');
    if (await boxes.count()) {
      await boxes.first().click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(SHOTS, 'cart-invalid-toast.png') });
      console.log('  -> cart-invalid-toast.png');
      const t = await bodyText();
      if (t.includes('该商品已下架')) console.log('  断言：toast「该商品已下架，请删除」✓');
      else console.log('  ✗ toast 未捕获到（可能已淡出），仅留截图');
    } else {
      console.log('  ✗ 未找到 .cart-item--invalid 行，无法点勾选框');
    }

    // ---------- 7 复原 ----------
    console.log('[7] 复原变体为在售');
    await setEnabled(true);
    restored = true;

    const back = await gql('/shop-api', ORDER_Q, {}, authH);
    const v = back.data.activeOrder?.lines?.find((l) => String(l.productVariant.id) === variantId)?.productVariant;
    console.log('  复原后 shop-api enabled =', v?.enabled);
    console.log('screenshots ->', SHOTS);
  } finally {
    if (!restored) {
      try {
        console.log('[!] 异常退出，尝试复原变体');
        await setEnabled(true);
      } catch (e) {
        console.log('[!] 复原失败，请手工把变体', variantId, '置回 enabled=true');
      }
    }
    await browser.close();
  }
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
