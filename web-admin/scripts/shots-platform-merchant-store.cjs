// 平台端「商户管理 / 门店管理」后台截图（390×844 dpr=2，mock admin-api）
//   01 商户列表：状态/认领徽章、门店数量
//   02 商户列表关键字筛选（回车触发）
//   03 商户列表按状态筛选（已停用）
//   04 商户详情：基础信息 + 资质证照
//   05 商户详情：合作与结算 + 名下门店
//   06 门店列表：状态/停用/全局徽章、地址与坐标缺失提示
//   07 门店列表按商户筛选（?merchantId=）
//   08 门店详情：基本 + 联系方式
//   09 门店详情：营业 / 兑换 / 配送设置
//   10 门店详情：关联自提点 + 门店员工 + 认领渠道
//   11 门店详情：新增员工弹窗
//   12 新建门店：空白表单 + 所属商户选择
//   node scripts/shots-platform-merchant-store.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'platform-merchant-store');
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

const MERCHANTS = [
  {
    id: 'm1', code: 'CF-M-101', name: '第一食堂运营有限公司', shortName: '第一食堂', brand: '第一食堂',
    merchantType: 'ENTERPRISE', industry: '餐饮', category: '食堂', legalName: '第一食堂运营有限公司',
    licenseNo: '91330100MA2XXXX1', licenseImage: '', licenseExpiry: '2028-06-30',
    contactName: '王强', contactPhone: '13900002222', servicePhone: '0571-88880001',
    province: '浙江省', city: '杭州市', district: '西湖区', street: '文一西路', address: '西湖区文一西路 100 号',
    claimStatus: 'CLAIMED', ownerChannelId: '201', contractNo: 'HT-2026-001',
    cooperationStart: '2026-01-01', cooperationEnd: '2028-12-31', commissionRate: 8.5,
    source: 'PLATFORM', settlementType: 'T+1', bankName: '招商银行', bankAccountName: '第一食堂运营有限公司',
    bankAccountNo: '6225 **** **** 8801', taxNo: '91330100MA2XXXX1', invoiceTitle: '第一食堂运营有限公司',
    status: 'ACTIVE', statusReason: null, closedAt: null,
    tags: ['食堂', '团餐'], intro: '园区食堂，覆盖早中晚三餐。',
    createdAt: '2026-01-05', updatedAt: '2026-10-20',
  },
  {
    id: 'm2', code: 'CF-M-102', name: '西门便利店', shortName: '西门便利', brand: '西门便利',
    merchantType: 'INDIVIDUAL', industry: '零售', category: '便利店', legalName: '西门便利店',
    licenseNo: '92330100MA2XXXX2', licenseImage: '', licenseExpiry: '2027-03-31',
    contactName: '李娜', contactPhone: '13700003333', servicePhone: '',
    province: '浙江省', city: '杭州市', district: '西湖区', street: '西溪路', address: '西溪路 88 号',
    claimStatus: 'CLAIMED', ownerChannelId: '202', contractNo: 'HT-2026-002',
    cooperationStart: '2026-02-01', cooperationEnd: '2027-01-31', commissionRate: 6,
    source: 'MERCHANT_SELF', settlementType: 'T+3', bankName: '工商银行', bankAccountName: '李娜',
    bankAccountNo: '6222 **** **** 3301', taxNo: '', invoiceTitle: '',
    status: 'SUSPENDED', statusReason: '证照到期未更新', closedAt: null,
    tags: ['零食', '饮料'], intro: '园区西门 24 小时便利店。',
    createdAt: '2026-02-03', updatedAt: '2026-10-25',
  },
  {
    id: 'm3', code: 'CF-M-103', name: '南门咖啡工作室', shortName: '南门咖啡', brand: '南门咖啡',
    merchantType: 'INDIVIDUAL', industry: '餐饮', category: '咖啡', legalName: '南门咖啡工作室',
    licenseNo: '92330100MA2XXXX3', licenseImage: '', licenseExpiry: '2027-09-30',
    contactName: '赵敏', contactPhone: '13600004444', servicePhone: '',
    province: '浙江省', city: '杭州市', district: '滨江区', street: '江南大道', address: '江南大道 500 号',
    claimStatus: 'UNCLAIMED', ownerChannelId: null, contractNo: '',
    cooperationStart: null, cooperationEnd: null, commissionRate: null,
    source: 'PLATFORM', settlementType: '', bankName: '', bankAccountName: '',
    bankAccountNo: '', taxNo: '', invoiceTitle: '',
    status: 'ACTIVE', statusReason: null, closedAt: null,
    tags: ['咖啡', '甜点'], intro: '新入驻商户，待认领。',
    createdAt: '2026-10-12', updatedAt: '2026-10-12',
  },
];

const storeBase = (extra) => ({
  storeType: 'DIRECT', sortOrder: 0, weight: 0, province: '浙江省', city: '杭州市', cityCode: '330100',
  district: '西湖区', street: '文一西路', detail: '', postalCode: '310000', navigationAddress: '',
  phoneNumber: '0571-88880001', backupPhone: '', managerName: '王强', managerPhone: '13900002222',
  servicePhone: '0571-88880002', businessHours: '{"mon":["07:00","20:00"]}',
  businessHoursText: '07:00-20:00', statusNote: null, acceptingOrders: true, coverImage: '', photos: [],
  notice: '园区食堂，支持自取与配送。', tags: ['自取', '堂食'], facilities: ['wifi', '座位'], externalIds: '',
  supportsRedemption: true, redemptionHours: '09:00-18:00', dailyRedeemLimit: 50,
  requiresReservation: false, reservationPhone: '', supportsDelivery: true, deliveryRadiusKm: 3,
  deliveryFee: 200, minOrderAmount: 0, deliveryMinutes: 30, isPublic: true, enabled: true,
  createdAt: '2026-01-06', updatedAt: '2026-10-20', ...extra,
});

const STORES = [
  storeBase({ id: '11', merchantId: 'm1', code: 'C01', name: '第一食堂', lat: 30.28, lng: 120.02, addressLine: '文一西路 100 号 1 号楼 1 层', status: 'OPEN' }),
  storeBase({
    id: '12', merchantId: 'm1', code: 'C02', name: '第二食堂', lat: null, lng: null,
    addressLine: '文一西路 100 号 2 号楼 2 层', status: 'CLOSED', enabled: false,
    acceptingOrders: false, businessHoursText: '整修中', notice: '档口改造，暂停营业。',
  }),
  storeBase({
    id: '13', merchantId: 'm2', code: 'S01', name: '西门便利店', city: '杭州市', district: '西湖区',
    street: '西溪路', addressLine: '西溪路 88 号', lat: 30.27, lng: 120.05, status: 'OPEN',
    isPublic: false, supportsDelivery: false, deliveryRadiusKm: null, deliveryFee: null,
    minOrderAmount: null, deliveryMinutes: null, supportsRedemption: true, tags: ['零食'],
  }),
  storeBase({
    id: '14', merchantId: 'm3', code: 'S02', name: '南门咖啡', city: '杭州市', district: '滨江区',
    street: '江南大道', addressLine: '江南大道 500 号', lat: 30.21, lng: 120.19, status: 'SUSPENDED',
    tags: ['咖啡'], supportsRedemption: false, requiresReservation: true, reservationPhone: '13600004444',
  }),
];

const CHANNELS = [
  { id: '201', code: 'canteen-a', token: 'canteen-a-token', name: '第一食堂', tenantNo: 1, isOfficial: true, enabled: true },
  { id: '202', code: 'canteen-b', token: 'canteen-b-token', name: '第二食堂', tenantNo: 2, isOfficial: false, enabled: true },
];

const CLAIMS = [
  { id: 'c1', storeId: '11', channelId: '201', role: 'OWNER', status: 'ACTIVE', contractNo: 'HT-2026-001', claimedAt: '2026-01-06', verifiedAt: '2026-01-07' },
  { id: 'c2', storeId: '11', channelId: '202', role: 'PARTNER', status: 'PENDING', contractNo: '', claimedAt: '2026-10-18', verifiedAt: null },
];

const STAFF = [
  { id: 'sf1', storeId: '11', userId: '5', name: '王强', phone: '13900002222', role: 'MANAGER', status: 'ACTIVE', lastLoginAt: '2026-10-30', createdAt: '', updatedAt: '' },
  { id: 'sf2', storeId: '11', userId: '6', name: '李娜', phone: '13700003333', role: 'CLERK', status: 'DISABLED', lastLoginAt: null, createdAt: '', updatedAt: '' },
];

const ADMINS = [
  { administratorId: '5', channelId: '201', enabled: true, displayName: '王强', remark: '', phone: '13900002222', emailAddress: 'wangqiang@example.com', roleIds: [], shippingProfileIds: [], createdAt: '', canResetPassword: true },
  { administratorId: '6', channelId: '201', enabled: true, displayName: '李娜', remark: '', phone: '13700003333', emailAddress: 'lina@example.com', roleIds: [], shippingProfileIds: [], createdAt: '', canResetPassword: true },
];

const PICKUPS = [
  { id: 'pl1', name: '第一食堂东门自提柜', type: 'point', address: '杭州市西湖区文一西路 100 号东门', province: '浙江省', city: '杭州市', district: '西湖区', street: '文一西路', contactPerson: '王强', phoneNumber: '13900002222', businessHours: '07:00-20:00', coordinates: { lat: 30.281, lng: 120.021 }, photos: [], remark: '', sortOrder: 1, enabled: true, isPublic: false, merchantStoreId: '11' },
  { id: 'pl2', name: '2 号楼连廊取餐点', type: 'store', address: '杭州市西湖区文一西路 100 号 2 号楼', province: '浙江省', city: '杭州市', district: '西湖区', street: '文一西路', contactPerson: '李娜', phoneNumber: '13700003333', businessHours: '07:00-20:00', coordinates: { lat: 30.279, lng: 120.023 }, photos: [], remark: '午高峰临时取餐', sortOrder: 2, enabled: false, isPublic: false, merchantStoreId: '11' },
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

    if (raw.includes('merchantStoreClaims')) {
      return fulfill({ merchantStoreClaims: CLAIMS });
    }
    if (raw.includes('merchantStoreStaff') || raw.includes('UpsertStoreStaff')) {
      return fulfill({ merchantStoreStaff: STAFF, upsertMerchantStoreStaff: STAFF[0] });
    }
    if (raw.includes('tenantAdministrators') || raw.includes('TenantAdministrators')) {
      const items = ADMINS.map((a) => ({ id: `tm-${a.administratorId}`, ...a }));
      return fulfill({ tenantAdministrators: items });
    }
    if (raw.includes('query Tenants')) return fulfill({ tenants: { items: CHANNELS, totalItems: CHANNELS.length } });

    if (raw.includes('MerchantStores(') || raw.includes('merchantStores(')) {
      const o = vars.options || {};
      let items = STORES.slice();
      if (o.merchantId) items = items.filter((s) => s.merchantId === o.merchantId);
      if (o.city) items = items.filter((s) => s.city === o.city);
      if (o.status) items = items.filter((s) => s.status === o.status);
      if (o.keyword) items = items.filter((s) => `${s.name} ${s.code}`.includes(o.keyword));
      return fulfill({ merchantStores: { items, totalItems: items.length } });
    }
    if (raw.includes('MerchantStore(')) {
      const id = String(vars.id || '');
      return fulfill({ merchantStore: STORES.find((s) => s.id === id) || null });
    }
    if (raw.includes('PickupLocationsByStore') || raw.includes('pickupLocations(')) {
      const byStore = raw.includes('merchantStoreId: { eq');
      const items = byStore ? PICKUPS : PICKUPS;
      return fulfill({ pickupLocations: { items, totalItems: items.length } });
    }
    if (raw.includes('Merchant(')) {
      const id = String(vars.id || '');
      return fulfill({ merchant: MERCHANTS.find((m) => m.id === id) || null });
    }
    if (raw.includes('merchants(') || raw.includes('Merchants')) {
      const o = vars.options || {};
      let items = MERCHANTS.slice();
      if (o.status) items = items.filter((m) => m.status === o.status);
      if (o.claimStatus) items = items.filter((m) => m.claimStatus === o.claimStatus);
      if (o.keyword) items = items.filter((m) => `${m.name} ${m.code} ${m.shortName || ''}`.includes(o.keyword));
      return fulfill({ merchants: { items, totalItems: items.length } });
    }
    if (raw.includes('CreateMerchant') || raw.includes('UpdateMerchant')) {
      return fulfill({ createMerchant: MERCHANTS[0], updateMerchant: MERCHANTS[0] });
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
    localStorage.setItem('wa_auth_token', 'mock-admin-token-platform');
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
  search: document.querySelector('.toolbar .search input')?.value || '',
  filters: Array.from(document.querySelectorAll('.filters .pick')).map((n) => n.innerText.trim()),
  cards: Array.from(document.querySelectorAll('.card .head')).map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim()),
  codes: Array.from(document.querySelectorAll('.card .code')).map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim()),
  meta: Array.from(document.querySelectorAll('.card .meta')).map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim()),
  empty: document.querySelector('.empty')?.innerText?.trim() || '',
}));

const readDetail = (page) => page.evaluate(() => ({
  sections: Array.from(document.querySelectorAll('.card .section')).map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim()),
  heads: Array.from(document.querySelectorAll('.claim-head, .store-head')).map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim()),
  rows: Array.from(document.querySelectorAll('.claim, .store')).map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, 8),
  pop: (() => { const p = document.querySelector('.pop'); return p ? p.innerText.replace(/\s+/g, ' ').trim().slice(0, 180) : null; })(),
}));

async function pickOption(page, selector, text, index = 0) {
  await page.locator(selector).nth(index).click();
  await page.waitForTimeout(400);
  await page.locator('.uni-picker-item:visible', { hasText: text }).first().click();
  await page.waitForTimeout(300);
  // 页面上可能残留多个 uni-picker 容器，只点当前可见弹层的「完成」
  const confirm = page.locator('.uni-picker-container:visible .uni-picker-action-confirm').first();
  await confirm.click({ timeout: 5000 });
  await page.waitForTimeout(600);
}

async function scrollToSection(page, text) {
  const ok = await page.evaluate((t) => {
    const el = Array.from(document.querySelectorAll('.card .section')).find((n) => (n.innerText || '').includes(t));
    if (!el) return false;
    el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -10);
    return true;
  }, text);
  await page.waitForTimeout(400);
  return ok;
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

  // ---- 商户列表 ----
  await page.goto(BASE + '#/pages/platform/merchants/index', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('01 state', JSON.stringify(await readList(page)));
  await shot(page, '01-merchants-list.png');

  await page.locator('.toolbar .search input').first().fill('咖啡');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  console.log('02 state', JSON.stringify(await readList(page)));
  await shot(page, '02-merchants-keyword-filter.png');

  await page.locator('.toolbar .search input').first().fill('');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await pickOption(page, '.filters .pick', '暂停', 0);
  console.log('03 state', JSON.stringify(await readList(page)));
  await shot(page, '03-merchants-status-filter.png');

  // ---- 商户详情 ----
  await page.goto(BASE + '#/pages/platform/merchants/detail?id=m1', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('04 state', JSON.stringify(await readDetail(page)));
  await shot(page, '04-merchant-detail-basic.png');

  console.log('05 scroll', await scrollToSection(page, '合作'));
  console.log('05 state', JSON.stringify(await readDetail(page)));
  await shot(page, '05-merchant-detail-cooperation.png');

  // ---- 门店列表 ----
  await page.goto(BASE + '#/pages/platform/stores/index', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('06 state', JSON.stringify(await readList(page)));
  await shot(page, '06-stores-list.png');

  await page.goto(BASE + '?r=07#/pages/platform/stores/index?merchantId=m1', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('07 state', JSON.stringify(await readList(page)));
  await shot(page, '07-stores-list-by-merchant.png');

  // ---- 门店详情 ----
  await page.goto(BASE + '?r=08#/pages/platform/stores/detail?id=11', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('08 state', JSON.stringify(await readDetail(page)));
  await shot(page, '08-store-detail-basic.png');

  console.log('09 scroll', await scrollToSection(page, '配送'));
  console.log('09 state', JSON.stringify(await readDetail(page)));
  await shot(page, '09-store-detail-business-delivery.png');

  console.log('10 scroll', await scrollToSection(page, '关联自提点'));
  console.log('10 state', JSON.stringify(await readDetail(page)));
  await shot(page, '10-store-detail-pickups-staff-claims.png');

  await page.locator('.claim-head .link').nth(1).click();
  await page.waitForTimeout(400);
  console.log('11 state', JSON.stringify(await readDetail(page)));
  await shot(page, '11-store-detail-staff-modal.png');

  // ---- 新建门店 ----
  await page.goto(BASE + '?r=12#/pages/platform/stores/detail?merchantId=m1', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('12 state', JSON.stringify(await readDetail(page)));
  await shot(page, '12-store-create-empty.png');

  await ctx.close();
  await browser.close();
  server.close();
  console.log('SHOTS DONE ->', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
