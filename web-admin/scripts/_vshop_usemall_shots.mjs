// vshop 对齐 usemall 的手机视口截图（Playwright，390×844 dpr=2）
//
// 用法（脚本目录即 web-admin/scripts/）：
//   node web-admin/scripts/_vshop_usemall_shots.mjs                     # 游客态（首页/分类/购物车游客态/秒杀/拼团）
//   node web-admin/scripts/_vshop_usemall_shots.mjs --user U --pwd P    # 追加登录态（详情 SKU 弹层 / 购物车勾选真生效）
//
// 环境变量：SITE_URL（默认 https://e.joho.cn）
// 注意：登录态会经详情页 SKU 弹层向生产购物车加购 1 件，用于复现「勾选真生效」的金额/按钮态。
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
// 不执行 `npx playwright install` 也能跑：直接挑一个已存在的 chromium 可执行文件
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

const argv = process.argv.slice(2);
const arg = (k) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : '';
};
const USER = arg('user');
const PWD = arg('pwd');
const PHONE = arg('phone');
const CODE = arg('code');
const ONLY = arg('only');
const LOGGED = Boolean((USER && PWD) || (PHONE && CODE));
// --only category 只跑分类页（避免重跑时影响购物车存量），多个用逗号分隔
const want = (k) => !ONLY || ONLY.split(',').includes(k);

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };

async function shopApi(query, variables) {
  const r = await fetch(`${URL}/shop-api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'vendure-token': process.env.VENDURE_TOKEN || '' },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(CHROMIUM ? { executablePath: CHROMIUM } : {}) });
  const ctx = await browser.newContext({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    deviceScaleFactor: MOBILE.deviceScaleFactor,
    locale: 'zh-CN',
    isMobile: false,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e.message).slice(0, 140)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log('  [console.' + m.type() + ']', m.text().slice(0, 200));
  });
  page.on('response', async (r) => {
    if (!r.url().includes('/shop-api')) return;
    try {
      const j = await r.json();
      if (j?.errors) console.log('  [gql-errors]', JSON.stringify(j.errors).slice(0, 400));
    } catch (e) {}
  });
  // 登录页 onMounted 在存在 SSO 提供商时会自动跳 h.joho.cn 统一登录页；
  // 预置标记以留在本站登录页，走「账号登录」（native）。
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('sso_auto_jumped', '1');
    } catch (e) {}
  });

  const go = async (hash, wait = 3500) => {
    await page.goto(`${URL}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(wait);
  };
  const shot = async (name, full = false) => {
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: full });
    console.log(`  -> ${name}`);
  };
  const text = async () =>
    (await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200))) || 'EMPTY';
  const clickAny = async (labels) => {
    for (const l of labels) {
      try {
        const b = page.locator(`text=${l}`).first();
        if (await b.isVisible()) {
          await b.click();
          return l;
        }
      } catch (e) {}
    }
    return '';
  };

  // ---------- 登录 ----------
  // 走 shop-api 原生登录拿 Bearer token，再注入 localStorage（auth_token / auth_userId）。
  // 不走登录页 UI：登录页 onMounted 会因存在 SSO 提供商自动跳 h.joho.cn，且 authMethods
  // 依赖异步接口，UI 路径不稳定。注入方式与 stores/auth.ts 的 setAuth 存储格式一致。
  if (LOGGED) {
    console.log('[0] 登录（shop-api 原生登录 → 注入 localStorage）');
    if (USER && PWD) {
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
      const uid = u.id;
      const tk = token;
      await ctx.addInitScript(([t, id]) => {
        try {
          localStorage.setItem('auth_token', t);
          localStorage.setItem('auth_userId', id);
        } catch (e) {}
      }, [tk, uid]);
    } else {
      console.log('  仅 --phone/--code 时无法用原生登录，跳过（请改用 --user/--pwd）');
    }
  }

  // ---------- 1 首页 ----------
  if (want('home')) {
    console.log('[1] 首页');
    await go('/pages/home/index', 6000);
    console.log('  text =', await text());
    await shot('home-flash-floor.png');
  }

  // ---------- 2 分类页 ----------
  if (want('category')) {
    console.log('[2] 分类页');
    await go('/pages/category/index', 4500);
    console.log('  text =', await text());
    await shot('category-modes.png');
    try {
      const sub = page.locator('.sub-item').first();
      if (await sub.isVisible()) {
        const subName = (await sub.innerText()).trim();
        await sub.click();
        await page.waitForTimeout(3000);
        console.log(`  点二级分类「${subName}」-> ${page.url()}`);
        console.log('  text =', await text());
        await shot('category-sub-list.png');
        await page.goBack();
        await page.waitForTimeout(2500);
      } else {
        console.log('  二级分类格不可见');
      }
    } catch (e) {
      console.log('  二级分类点击 err', String(e.message).slice(0, 120));
    }
    try {
      const toggles = page.locator('text=⇄');
      if (await toggles.first().isVisible()) {
        await toggles.first().click();
        await page.waitForTimeout(2500);
        await shot('category-mode-list.png');
        console.log('  已切到另一模式（category-mode-list.png）');
      } else {
        console.log('  ⇄ 悬浮按钮不可见');
      }
    } catch (e) {
      console.log('  toggle err', e.message.slice(0, 100));
    }
  }

  // 只跑分类页时到此结束（详情/购物车/秒杀/拼团都未请求）
  if (ONLY && !['detail', 'cart', 'flash', 'groupbuy'].some(want)) {
    await browser.close();
    console.log('screenshots done ->', SHOTS);
    return;
  }

  // ---------- 3 详情页 + SKU 弹层 ----------
  console.log('[3] 详情页');
  const s = await shopApi('query { search(input: { take: 20, groupByProduct: true }) { items { slug productName } } }');
  const list = s?.data?.search?.items || [];
  // 部分商品 slug 为空字符串（历史数据），必须挑有 slug 的，且中文 slug 用 URI 编码
  const item = list.find((x) => x?.slug && x.slug.trim()) || null;
  console.log('  slug =', JSON.stringify(item?.slug), '|', item?.productName);
  if (item?.slug) {
    await go(`/pkg-product/pages/detail?slug=${encodeURIComponent(item.slug)}`, 6000);
    console.log('  text =', (await text()).slice(0, 120));
    await shot('detail-page.png');
    const hit = await clickAny(['加入购物车', '立即购买', '选规格', '选择规格', '购买']);
    if (hit) {
      await page.waitForTimeout(2500);
      await shot('detail-sku-sheet.png');
      console.log('  SKU 弹层由「' + hit + '」触发');
      console.log('  弹层文本 =', await text());
      // 弹层遮罩打开后，页面底栏同名按钮被遮挡，必须按类名点弹层内的「加入购物车」
      let ok = '';
      try {
        const btn = page.locator('.sku-sheet__btn--cart').first();
        if (await btn.isVisible()) {
          await btn.click();
          ok = '加入购物车(弹层)';
        }
      } catch (e) {
        console.log('  弹层加购 err', String(e.message).slice(0, 100));
      }
      console.log('  弹层确认按钮 =', ok || '(未找到)');
      await page.waitForTimeout(3500);
      console.log('  加购后文本 =', await text());
    } else {
      console.log('  未找到触发 SKU 弹层的按钮');
    }
  } else {
    console.log('  search 未返回带 slug 的商品');
  }

  // S1 验收：钉死 slug 的两个探针（Step 2 实测 / 2026-09-29 用户裁定）
  //   MULTI  = fresh-crayfish  鲜活小龙虾（规格组「规格」×2；数据层无图 → 弹层灰底不作为断言）
  //   SINGLE = 温泉门票        国信南山温泉工作日门票（无规格组、imgs=2 → 断言 3 缩略图非灰底由它取证）
  const MULTI_SLUG = 'fresh-crayfish';
  const SINGLE_SLUG = '温泉门票';

  // S1 验收：多规格商品——规格组标题带 (N) 计数
  // 【必须 reload】同 hash 路由二次 page.goto 不会重载：SPA 复用同一详情组件，onMounted 不再执行，
  // 页面仍是上一个商品（手册 §5.7 已记录此坑）。先 goto 再 page.reload 才会真正取新 slug 的数据。
  await go(`/pkg-product/pages/detail?slug=${encodeURIComponent(MULTI_SLUG)}`, 1500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  console.log('  多规格页文本 =', await text());
  await shot('detail-page.png');
  const hitMulti = await clickAny(['加入购物车', '立即购买', '选规格', '选择规格', '购买']);
  if (hitMulti) {
    await page.waitForTimeout(2500);
    await shot('detail-sku-sheet.png');
    console.log('  多规格弹层文本 =', await text());
  } else {
    console.log('  多规格商品未找到触发 SKU 弹层的按钮');
  }

  // S1 验收：单规格商品——详情页已选行显示变体名（Task 3）
  await go(`/pkg-product/pages/detail?slug=${encodeURIComponent(SINGLE_SLUG)}`, 1500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  console.log('  单规格页文本 =', await text());
  await shot('detail-single-spec.png');
  // S1 验收：单规格弹层——规格区整段不渲染 + `pickedText` 取变体名 + 头部缩略图非灰底（Task 1/2 取证）
  // 单规格商品点加购同样会打开弹层；弹层里的「已选：…」就是 pickedText
  const hitSingle = await clickAny(['加入购物车', '立即购买', '选规格', '选择规格', '购买']);
  if (hitSingle) {
    await page.waitForTimeout(2500);
    await shot('detail-sku-sheet-single.png');
    console.log('  单规格弹层文本 =', await text());
  } else {
    console.log('  单规格商品未找到触发 SKU 弹层的按钮');
  }

  // ---------- 4 购物车 ----------
  console.log('[4] 购物车');
  await go('/pages/cart/index', 5000);
  console.log('  text =', await text());
  if (LOGGED) {
    await shot('cart-select-real.png');
    // 尝试取消勾选第一行，验证「勾选真生效」的交互态
    await clickAny(['☑', '✓']);
    await page.waitForTimeout(1500);
    await shot('cart-select-partial.png');
  } else {
    await shot('cart-guest-and-reco.png');
  }

  // ---------- 5 秒杀页 ----------
  console.log('[5] 秒杀页');
  await go('/pkg-promotion/pages/flash-sale', 5000);
  console.log('  text =', await text());
  await shot('flash-sale-page.png');

  // ---------- 6 拼团页（拼团列表 / 我的开团 / 我的参团） ----------
  console.log('[6] 拼团页');
  await go('/pkg-promotion/pages/group-buy', 5000);
  console.log('  text =', await text());
  await shot('group-buy-page.png');
  const mineTabs = LOGGED
    ? [['我的开团', 'group-buy-mine-leader.png'], ['我的参团', 'group-buy-mine-join.png']]
    : [['我的开团', 'group-buy-mine-guest.png']];
  for (const [label, file] of mineTabs) {
    try {
      const tab = page.locator(`.gb-tab:has-text("${label}")`).first();
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(3000);
        console.log(`  ${label} -> ${await text()}`);
        await shot(file);
      } else {
        console.log(`  ${label} tab 不可见`);
      }
    } catch (e) {
      console.log(`  ${label} err`, String(e.message).slice(0, 120));
    }
  }

  await browser.close();
  console.log('screenshots done ->', SHOTS);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
