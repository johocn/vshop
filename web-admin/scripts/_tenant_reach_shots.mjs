// 多租户渠道「永久可达」改造的截图取证（Playwright，390×844 dpr=2）
//
// 用法（脚本目录即 web-admin/scripts/）：
//   node web-admin/scripts/_tenant_reach_shots.mjs
//
// 环境变量：NSHOP_URL（默认 https://www.youshop.cn）、VSHOP_URL（默认 https://e.joho.cn）
// 取证点：nshop 侧 /<code> 与 /<locale>/<code> 的渠道命中、未知首段 404；
//        vshop 侧 ?tenant= 优先级生效、TenantBar 真实店铺列表。
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const HERE = path.dirname(fileURLToPath(import.meta.url)); // web-admin/scripts
// 与 _vshop_usemall_shots.mjs 同一套 Playwright 解析策略
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

const NSHOP = process.env.NSHOP_URL || 'https://www.youshop.cn';
const VSHOP = process.env.VSHOP_URL || 'https://e.joho.cn';
const SHOTS = path.resolve(HERE, '..', 'docs', 'superpowers', 'manual', 'vshop-usemall-alignment', 'assets');
fs.mkdirSync(SHOTS, { recursive: true });

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };

/** 一个 URL 一个干净 context（避免 vshop 的 localStorage.tenant_code 串味） */
async function capture(browser, { url, name, wait = 6000, full = false, action, log = '' }) {
  const ctx = await browser.newContext({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    deviceScaleFactor: MOBILE.deviceScaleFactor,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  const tokens = new Set();
  page.on('request', (r) => {
    if (!r.url().includes('/shop-api')) return;
    const t = r.headers()['vendure-token'] || '(无)';
    if (tokens.size < 3) tokens.add(t);
  });
  let status = 0;
  page.on('response', (r) => {
    if (r.url().split('#')[0] === url.split('#')[0]) status = r.status();
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(wait);
    if (action) await action(page);
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: full });
    const title = await page.title();
    const text = ((await page.evaluate(() => document.body.innerText || '')) || '').replace(/\s+/g, ' ').slice(0, 120);
    console.log(`  -> ${name}`);
    console.log(`     http=${status} title="${title}" vendure-token=${[...tokens].join(',') || '(未见 shop-api 请求)'}`);
    console.log(`     text="${text}"`);
    if (log) console.log(`     ${log}`);
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(CHROMIUM ? { executablePath: CHROMIUM } : {}) });

  console.log('[nshop] 渠道 URL 可达性');
  await capture(browser, { url: `${NSHOP}/`, name: 'nshop-default-home.png' });
  await capture(browser, { url: `${NSHOP}/t1`, name: 'nshop-t1-home.png' });
  await capture(browser, { url: `${NSHOP}/en/t1`, name: 'nshop-en-t1-home.png' });
  await capture(browser, { url: `${NSHOP}/t3/product/guoxin-nanshan-ticket`, name: 'nshop-t3-product.png' });
  await capture(browser, { url: `${NSHOP}/nonexistent-xyz`, name: 'nshop-unknown-tenant-404.png', wait: 3000 });

  console.log('[vshop] ?tenant= 优先级 + 真实店铺列表');
  await capture(browser, { url: `${VSHOP}/#/pages/home/index`, name: 'vshop-default-home.png' });
  await capture(browser, {
    url: `${VSHOP}/?tenant=t1#/pages/home/index`,
    name: 'vshop-t1-home.png',
  });
  await capture(browser, {
    url: `${VSHOP}/#/pages/home/index`,
    name: 'vshop-tenant-switcher.png',
    action: async (page) => {
      await page.locator('.tenant-bar__current').first().click();
      await page.waitForTimeout(1200);
      const n = await page.locator('.tenant-bar__option').count();
      console.log(`     TenantBar 选项数 = ${n}`);
    },
  });
  await capture(browser, {
    url: `${VSHOP}/?tenant=nope#/pages/home/index`,
    name: 'vshop-unknown-tenant-fallback.png',
  });

  await browser.close();
  console.log('screenshots done ->', SHOTS);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
