// 自提点 ↔ 门店关联 / 列表检索 后台截图（390×844 dpr=2，mock admin-api）
//   01 我的自提点：列表卡展示「关联门店」标签 + 搜索/城市筛选条
//   02 关键字筛选命中
//   03 城市筛选生效
//   04 无匹配结果提示
//   05 全局自提点池：筛选条同样可用
//   06 编辑页「关联门店」未选择（含说明）
//   07 编辑页打开「关联门店」选择弹层
//   08 编辑页已关联门店回显
//   node scripts/shots-pickup-store-link.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'pickup-store-link');
const ROOT = path.resolve(__dirname, '..', 'dist', 'build', 'h5');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/guanli' || p === '/guanli/') p = '/guanli/index.html';
  const rel = p.replace(/^\/guanli\//, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

const ACCESS = {
  isSuperAdmin: true,
  channels: [{ id: '201', code: 'canteen-a', token: 'canteen-a-token', name: '第一食堂', enabled: true, tenantNo: 1, isOfficial: true, memberEnabled: true, mustChangePassword: false }],
  permissions: [], mustChangePassword: false,
};

const STORES = [
  { id: '11', merchantId: 'm1', code: 'C01', name: '第一食堂', storeType: 'canteen', sortOrder: 1, weight: 10, province: '北京市', city: '北京市', district: '海淀区', street: '学院路', addressLine: '学院路 1 号', status: 'active', acceptingOrders: true, supportsRedemption: true, requiresReservation: false, supportsDelivery: true, isPublic: true, enabled: true, createdAt: '', updatedAt: '' },
  { id: '12', merchantId: 'm1', code: 'C02', name: '第二食堂', storeType: 'canteen', sortOrder: 2, weight: 9, province: '北京市', city: '北京市', district: '海淀区', street: '学院路', addressLine: '学院路 2 号', status: 'active', acceptingOrders: true, supportsRedemption: true, requiresReservation: false, supportsDelivery: true, isPublic: true, enabled: true, createdAt: '', updatedAt: '' },
  { id: '13', merchantId: 'm2', code: 'S01', name: '西门便利店', storeType: 'grocery', sortOrder: 3, weight: 8, province: '上海市', city: '上海市', district: '杨浦区', street: '四平路', addressLine: '四平路 88 号', status: 'active', acceptingOrders: true, supportsRedemption: true, requiresReservation: false, supportsDelivery: false, isPublic: true, enabled: true, createdAt: '', updatedAt: '' },
];

const base = (id, name, city, district, street, extra = {}) => ({
  id, name, type: 'point', contactPerson: '张伟', phoneNumber: '138****1111',
  businessHours: '早8:30至16:30', coordinates: { lat: 39.99, lng: 116.31 }, photos: [],
  remark: '', sortOrder: 0, enabled: true, isPublic: false,
  province: city, city, district, street, address: `${city}${district}${street}`,
  ...extra,
});

const MINE = [
  base('pl1', '东区 1 号宿舍楼自提点', '北京市', '海淀区', '东区 1 号', { merchantStoreId: '11' }),
  base('pl2', '西区 7 号教学楼自提点', '北京市', '海淀区', '西区 7 号', { merchantStoreId: '12' }),
  base('pl3', '西门便利店取货点', '上海市', '杨浦区', '四平路 88 号', { merchantStoreId: '13', type: 'store' }),
  base('pl4', '南区快递驿站取货点', '上海市', '杨浦区', '南区 5 号', { type: 'employee', isPublic: false }),
];

const POOL = [
  base('gp1', '学院路东门共享驿站', '北京市', '海淀区', '学院路东门', { isPublic: true, enabled: true }),
  base('gp2', '四平路地铁站自提点', '上海市', '杨浦区', '四平路地铁站', { isPublic: true, enabled: true }),
];

function makeRoute() {
  return async (route) => {
    const raw = route.request().postData() || '';
    const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    let vars = {};
    try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }

    if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
    if (raw.includes('me {')) return fulfill({ me: { id: '9' } });
    if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
    if (raw.includes('merchantStores(') || raw.includes('MerchantStores')) {
      return fulfill({ merchantStores: { items: STORES, totalItems: STORES.length } });
    }
    if (raw.includes('MerchantStore(')) {
      const id = String(vars.id || '');
      return fulfill({ merchantStore: STORES.find((s) => s.id === id) || null });
    }
    if (raw.includes('PickupLocation(')) {
      const id = String(vars.id || '');
      return fulfill({ pickupLocation: [...MINE, ...POOL].find((s) => s.id === id) || null });
    }
    if (raw.includes('pickupLocations(') || raw.includes('PickupLocations')) {
      const isPool = raw.includes('filter: { isPublic');
      return fulfill({ pickupLocations: { items: isPool ? POOL : MINE, totalItems: (isPool ? POOL : MINE).length } });
    }
    return fulfill({});
  };
}

async function newPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('wa_auth_token', 'mock-admin-token-pickup');
    localStorage.setItem('wa_channel_token', 'canteen-a-token');
    localStorage.setItem('wa_channel_code', 'canteen-a');
    localStorage.setItem('wa_locale', 'zh-Hans');
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e && e.message)));
  page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
  await page.route('**/admin-api', makeRoute());
  return { ctx, page };
}

const readList = (page) => page.evaluate(() => ({
  keyword: document.querySelector('.filters .search input')?.value || '',
  city: document.querySelector('.filters .city')?.innerText?.trim() || '',
  cards: Array.from(document.querySelectorAll('.card .name')).map((n) => n.textContent.trim()),
  metas: Array.from(document.querySelectorAll('.card .meta')).map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim()),
  empty: document.querySelector('.empty')?.innerText?.trim() || '',
}));

const readEdit = (page) => page.evaluate(() => ({
  labels: Array.from(document.querySelectorAll('.field .label')).map((n) => n.textContent.trim()).slice(0, 3),
  pickers: Array.from(document.querySelectorAll('.field .vpicker')).map((n) => n.innerText.replace(/\s+/g, ' ').trim()).slice(0, 2),
  tip: Array.from(document.querySelectorAll('.field .tip')).map((n) => n.textContent.trim())[0] || '',
  pickerOpen: (() => {
    const pc = document.querySelector('.uni-picker-container');
    return !!pc && getComputedStyle(pc).display !== 'none' && pc.getBoundingClientRect().height > 0;
  })(),
}));

async function pickCity(page, name) {
  await page.locator('.filters .city').first().click();
  await page.waitForTimeout(300);
  await page.locator('.uni-picker-item', { hasText: name }).first().click();
  await page.locator('.uni-picker-action-confirm').first().click();
  await page.waitForTimeout(300);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const BASE = `http://127.0.0.1:${port}/guanli/`;
  console.log('static server', BASE);

  const browser = await chromium.launch();
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };
  const { ctx, page } = await newPage(browser);

  await page.goto(BASE + '#/pages/pickup/index', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('01 state', JSON.stringify(await readList(page)));
  await shot(page, '01-pickup-list-store-chip.png');

  await page.locator('.filters .search input').first().fill('西门');
  await page.waitForTimeout(400);
  console.log('02 state', JSON.stringify(await readList(page)));
  await shot(page, '02-pickup-keyword-filter.png');

  await page.locator('.filters .search input').first().fill('');
  await pickCity(page, '上海市');
  console.log('03 state', JSON.stringify(await readList(page)));
  await shot(page, '03-pickup-city-filter.png');

  await page.locator('.filters .search input').first().fill('不存在的点');
  await page.waitForTimeout(400);
  console.log('04 state', JSON.stringify(await readList(page)));
  await shot(page, '04-pickup-empty-match.png');

  await pickCity(page, '全部城市');
  await page.locator('.filters .search input').first().fill('');
  await page.locator('.tabs uni-text', { hasText: '全局自提点池' }).first().click();
  await page.waitForTimeout(800);
  console.log('05 state', JSON.stringify(await readList(page)));
  await shot(page, '05-pickup-pool-filters.png');

  await page.goto(BASE + '#/pages/pickup/edit/index?id=pl4', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('06 state', JSON.stringify(await readEdit(page)));
  await shot(page, '06-pickup-edit-store-unlinked.png');

  await page.locator('.field .vpicker').nth(1).click();
  await page.waitForTimeout(400);
  console.log('07 state', JSON.stringify(await readEdit(page)));
  await shot(page, '07-pickup-edit-store-picker-open.png');

  await page.goto(BASE + '?r=08#/pages/pickup/edit/index?id=pl3', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('08 state', JSON.stringify(await readEdit(page)));
  await shot(page, '08-pickup-edit-store-linked.png');

  await ctx.close();
  await browser.close();
  server.close();
  console.log('SHOTS DONE ->', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
