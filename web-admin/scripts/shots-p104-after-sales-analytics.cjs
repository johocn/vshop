// §104 售后数据报表与导出 后台截图（390×844 dpr=2，mock admin-api）
//   01 区间 + 当前态势 + 区间概览
//   02 响应与解决时效
//   03 按天趋势
//   04 类型/状态分布 + 原因分布
//   05 商品退款 Top
//   06 售后评价满意度
//   07 高频售后顾客
//   08 员工处理绩效
//   09 退款流水 + 加载更多
//   10 导出 CSV 弹层
//   11 售后申请页新增入口（售后分析 / 售后自动化）
//   node scripts/shots-p104-after-sales-analytics.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p104-after-sales-analytics');
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

const at = (minAgo) => new Date(Date.now() - minAgo * 60 * 1000).toISOString();
const day = (offset) => new Date(Date.now() + 8 * 3600_000 - offset * 86_400_000).toISOString().slice(0, 10);

const STATS = {
  pending: 6, overdue: 2, timeoutHours: 16, todayHandled: 9, todayRefunded: 3,
  todayRefundAmount: 6850, pendingReply: 4, dueSoon: 3, dueSoonHours: 4,
};

const REPORT = {
  from: day(6), to: day(0), total: 28, refunded: 17, refundAmount: 48650, overdue: 3,
  byType: [
    { type: 'refund_only', count: 18 },
    { type: 'return_refund', count: 8 },
    { type: 'exchange', count: 2 },
  ],
  byState: [
    { state: 'Refunded', count: 12 },
    { state: 'Pending', count: 6 },
    { state: 'Rejected', count: 4 },
    { state: 'Closed', count: 3 },
    { state: 'RefundFailed', count: 2 },
    { state: 'Received', count: 1 },
  ],
  byDay: [
    { date: day(6), count: 3, refunded: 2, refundAmount: 5800 },
    { date: day(5), count: 5, refunded: 3, refundAmount: 9200 },
    { date: day(4), count: 2, refunded: 1, refundAmount: 2100 },
    { date: day(3), count: 6, refunded: 4, refundAmount: 11400 },
    { date: day(2), count: 4, refunded: 2, refundAmount: 6900 },
    { date: day(1), count: 5, refunded: 3, refundAmount: 8100 },
    { date: day(0), count: 3, refunded: 2, refundAmount: 5150 },
  ],
  reasons: [
    { reason: '出餐超时', count: 9 },
    { reason: '少送漏送', count: 6 },
    { reason: '餐品撒漏', count: 5 },
  ],
  rejectReasons: [{ reason: '非出品问题', count: 2 }],
  firstResponseAvgMinutes: 6.4, firstResponseMaxMinutes: 48,
  resolveAvgMinutes: 182, resolveMaxMinutes: 780,
  firstResponseOnTargetRate: 0.86, resolveOnTargetRate: 0.78,
  firstResponseOverdue: 2, resolveOverdue: 1,
  previousTotal: 24, previousRefunded: 13, previousRefundAmount: 39800, previousOverdue: 5,
};

const REASONS = [
  { reason: '出餐超时', requestCount: 9, refundCount: 6, refundAmount: 18600, share: 0.321, previousCount: 7, changeRate: 0.286 },
  { reason: '少送漏送', requestCount: 6, refundCount: 4, refundAmount: 9800, share: 0.214, previousCount: 8, changeRate: -0.25 },
  { reason: '餐品撒漏', requestCount: 5, refundCount: 4, refundAmount: 8650, share: 0.179, previousCount: 3, changeRate: 0.667 },
  { reason: '口味差异', requestCount: 4, refundCount: 2, refundAmount: 4400, share: 0.143, previousCount: 4, changeRate: 0 },
  { reason: '异物投诉', requestCount: 2, refundCount: 1, refundAmount: 3200, share: 0.071, previousCount: 1, changeRate: 1 },
  { reason: '配送超时', requestCount: 2, refundCount: 0, refundAmount: 0, share: 0.071, previousCount: 1, changeRate: 1 },
];

const PRODUCTS = [
  { productId: 'p1', productName: '宫保鸡丁', requestCount: 8, refundCount: 5, refundAmount: 15900, requestRate: 0.062 },
  { productId: 'p2', productName: '酸菜鱼（大份）', requestCount: 6, refundCount: 4, refundAmount: 15200, requestRate: 0.075 },
  { productId: 'p3', productName: '米饭', requestCount: 5, refundCount: 3, refundAmount: 1500, requestRate: 0.024 },
  { productId: 'p4', productName: '凉拌黄瓜', requestCount: 3, refundCount: 2, refundAmount: 2400, requestRate: 0.038 },
  { productId: 'p5', productName: '可乐', requestCount: 2, refundCount: 1, refundAmount: 450, requestRate: 0.016 },
  { productId: 'p6', productName: '香菇滑鸡饭', requestCount: 2, refundCount: 1, refundAmount: 3200, requestRate: 0.021 },
];

const REVIEW = {
  total: 19, avgScore: 4.2, lowScoreCount: 4,
  distribution: [
    { score: 5, count: 11 }, { score: 4, count: 4 }, { score: 3, count: 2 },
    { score: 2, count: 1 }, { score: 1, count: 1 },
  ],
  lowScores: [
    { id: 'rv1', requestId: '801', orderCode: 'A2400001', customerName: '李同学', score: 2, comment: '等了 40 分钟，饭都凉了，退款处理很慢。', followedUp: false, createdAt: at(600) },
    { id: 'rv2', requestId: '805', orderCode: 'A2400005', customerName: '孙同学', score: 1, comment: '汤洒了一半，包装也没封好。', followedUp: true, createdAt: at(2880) },
    { id: 'rv3', requestId: '812', orderCode: 'A2400009', customerName: '王同学', score: 3, comment: '少送了一份米饭，后来补了券，还行。', followedUp: false, createdAt: at(1440) },
  ],
  topTags: [
    { tag: '处理及时', count: 9 },
    { tag: '态度友好', count: 6 },
    { tag: '退款到账快', count: 5 },
    { tag: '等待较久', count: 3 },
  ],
};

const CUSTOMERS = [
  { customerId: 'c1', name: '李同学', phone: '138****5678', count: 5, refundAmount: 18600, blacklisted: false },
  { customerId: 'c2', name: '王同学', phone: '137****3333', count: 4, refundAmount: 9200, blacklisted: true },
  { customerId: 'c3', name: '孙同学', phone: '139****2244', count: 3, refundAmount: 8600, blacklisted: false },
  { customerId: 'c4', name: '赵同学', phone: '136****4444', count: 2, refundAmount: 4400, blacklisted: false },
];

const STAFF = [
  { operatorUserId: '160', operatorName: '张伟（店长）', handled: 11, resolved: 9, firstActionAvgMinutes: 3, resolveAvgMinutes: 96, overdueCount: 1, escalatedCount: 2, resolveRate: 82, reviewCount: 8, reviewAvgScore: 4.4 },
  { operatorUserId: '161', operatorName: '李静（客服）', handled: 9, resolved: 6, firstActionAvgMinutes: 5, resolveAvgMinutes: 142, overdueCount: 1, escalatedCount: 1, resolveRate: 67, reviewCount: 6, reviewAvgScore: 4.0 },
  { operatorUserId: '1', operatorName: 'SuperAdmin', handled: 8, resolved: 2, firstActionAvgMinutes: 12, resolveAvgMinutes: 246, overdueCount: 2, escalatedCount: 0, resolveRate: 25, reviewCount: 5, reviewAvgScore: 3.6 },
  { operatorUserId: '162', operatorName: '王强（后厨）', handled: 3, resolved: 0, firstActionAvgMinutes: 28, resolveAvgMinutes: 0, overdueCount: 0, escalatedCount: 0, resolveRate: 0, reviewCount: 0, reviewAvgScore: 0 },
];

const REFUNDS = [
  { id: 'r1', orderCode: 'A2400001', type: 'refund_only', reason: '出餐超时 35 分钟', amount: 3250, refundedAt: at(600), refundTransactionId: 'TX20261031001' },
  { id: 'r2', orderCode: 'A2400005', type: 'return_refund', reason: '餐品撒漏', amount: 4200, refundedAt: at(2880), refundTransactionId: 'TX20261030002' },
  { id: 'r3', orderCode: 'A2400009', type: 'refund_only', reason: '少送一份米饭', amount: 800, refundedAt: at(1500), refundTransactionId: 'TX20261030003' },
  { id: 'r4', orderCode: 'A2400011', type: 'refund_only', reason: '口味与描述不符', amount: 2200, refundedAt: at(1800), refundTransactionId: 'TX20261030004' },
  { id: 'r5', orderCode: 'A2400014', type: 'exchange', reason: '包装破损', amount: 1800, refundedAt: at(2400), refundTransactionId: 'TX20261029005' },
  { id: 'r6', orderCode: 'A2400016', type: 'return_refund', reason: '异物投诉', amount: 3200, refundedAt: at(3300), refundTransactionId: 'TX20261029006' },
  { id: 'r7', orderCode: 'A2400018', type: 'refund_only', reason: '出餐超时', amount: 1600, refundedAt: at(3600), refundTransactionId: 'TX20261028007' },
  { id: 'r8', orderCode: 'A2400020', type: 'refund_only', reason: '少送饮料', amount: 450, refundedAt: at(4200), refundTransactionId: 'TX20261028008' },
];

const REFUNDS_PAGE2 = [
  { id: 'r9', orderCode: 'A2400022', type: 'refund_only', reason: '出餐超时', amount: 1500, refundedAt: at(4500), refundTransactionId: 'TX20261027009' },
  { id: 'r10', orderCode: 'A2400025', type: 'return_refund', reason: '餐品洒漏', amount: 3600, refundedAt: at(5100), refundTransactionId: 'TX20261027010' },
];

const CSV = '订单号,售后单号,类型,状态,退款金额\nA2400001,801,仅退款,已退款,32.50\n';

function makeRoute() {
  return async (route) => {
    const raw = route.request().postData() || '';
    const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    let vars = {};
    try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }

    if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
    if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
    if (raw.includes('campusMerchantAfterSalesStaffStats')) return fulfill({ campusMerchantAfterSalesStaffStats: STAFF });
    if (raw.includes('campusMerchantAfterSalesStats')) return fulfill({ campusMerchantAfterSalesStats: STATS });
    if (raw.includes('campusMerchantAfterSalesReasonReport')) return fulfill({ campusMerchantAfterSalesReasonReport: REASONS });
    if (raw.includes('campusMerchantAfterSalesProductReport')) return fulfill({ campusMerchantAfterSalesProductReport: PRODUCTS });
    if (raw.includes('campusMerchantAfterSalesReviewSummary')) return fulfill({ campusMerchantAfterSalesReviewSummary: REVIEW });
    if (raw.includes('campusMerchantAfterSalesTopCustomers')) return fulfill({ campusMerchantAfterSalesTopCustomers: CUSTOMERS });
    if (raw.includes('campusMerchantAfterSalesExport')) return fulfill({ campusMerchantAfterSalesExport: CSV });
    if (raw.includes('campusMerchantAfterSalesRefunds')) {
      const skip = Number(vars.skip || 0);
      const items = skip > 0 ? REFUNDS_PAGE2 : REFUNDS;
      return fulfill({ campusMerchantAfterSalesRefunds: { items, total: REFUNDS.length + REFUNDS_PAGE2.length } });
    }
    if (raw.includes('campusMerchantAfterSalesReport')) {
      return fulfill({ campusMerchantAfterSalesReport: { ...REPORT, from: String(vars.from || REPORT.from), to: String(vars.to || REPORT.to) } });
    }
    if (raw.includes('campusMerchantAfterSalesWorkbench')) return fulfill({ campusMerchantAfterSalesWorkbench: {} });
    if (raw.includes('campusMerchantAfterSales')) return fulfill({ campusMerchantAfterSales: { items: [], total: 0, pendingCount: 0, stateCounts: [] } });
    if (raw.includes('me {')) return fulfill({ me: { id: '9' } });
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
    localStorage.setItem('wa_auth_token', 'mock-admin-token-p104');
    localStorage.setItem('wa_channel_token', 'canteen-a-token');
    localStorage.setItem('wa_channel_code', 'canteen-a');
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
  page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
  await page.route('**/admin-api', makeRoute());
  return { ctx, page };
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

  const readState = () => page.evaluate(() => ({
    cards: Array.from(document.querySelectorAll('.card .title')).map((n) => n.textContent.trim()),
    kpis: Array.from(document.querySelectorAll('.kpi')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    chips: Array.from(document.querySelectorAll('.chips .chip')).map((n) => n.textContent.trim()),
    reasons: Array.from(document.querySelectorAll('.reason .r-name')).map((n) => n.textContent.trim()),
    products: Array.from(document.querySelectorAll('.prod .p-name')).map((n) => n.textContent.trim()),
    refunds: Array.from(document.querySelectorAll('.refund .rf-code')).map((n) => n.textContent.trim()),
    customers: Array.from(document.querySelectorAll('.cust .c-name')).map((n) => n.textContent.trim()),
    staff: Array.from(document.querySelectorAll('.staff .s-name')).map((n) => n.textContent.trim()),
    staffMeta: Array.from(document.querySelectorAll('.staff')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    sheet: document.querySelector('.sheet__t')?.textContent?.trim() || '',
    kinds: Array.from(document.querySelectorAll('.kind')).map((n) => n.textContent.trim()),
    entries: Array.from(document.querySelectorAll('.oe-i')).map((n) => n.textContent.trim()),
  }));

  const scrollToCard = async (title) => {
    await page.evaluate((t) => {
      const cards = Array.from(document.querySelectorAll('.card'));
      const card = cards.find((c) => (c.querySelector('.title')?.textContent || '').includes(t));
      if (card) card.scrollIntoView({ block: 'center' });
    }, title);
    await page.waitForTimeout(600);
  };

  // ── 01 首屏：区间 + 当前态势 + 区间概览 ───────────────────────────────────
  await page.goto(BASE + '#/pages/campus/after-sales-analytics', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.card .title', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  console.log('01 state', JSON.stringify(await readState()));
  await shot(page, '01-analytics-overview.png');

  // ── 02 响应与解决时效 ─────────────────────────────────────────────────────
  await scrollToCard('响应与解决时效');
  console.log('02 state', JSON.stringify(await readState()));
  await shot(page, '02-analytics-sla.png');

  // ── 03 按天趋势 ───────────────────────────────────────────────────────────
  await scrollToCard('按天趋势');
  console.log('03 state', JSON.stringify(await readState()));
  await shot(page, '03-analytics-trend.png');

  // ── 04 类型/状态分布 + 原因分布 ───────────────────────────────────────────
  await scrollToCard('售后原因分布');
  console.log('04 state', JSON.stringify(await readState()));
  await shot(page, '04-analytics-reasons.png');

  // ── 05 商品退款 Top ───────────────────────────────────────────────────────
  await scrollToCard('商品退款');
  console.log('05 state', JSON.stringify(await readState()));
  await shot(page, '05-analytics-products.png');

  // ── 06 售后评价满意度 ─────────────────────────────────────────────────────
  await scrollToCard('售后评价满意度');
  console.log('06 state', JSON.stringify(await readState()));
  await shot(page, '06-analytics-reviews.png');

  // ── 07 高频售后顾客 ───────────────────────────────────────────────────────
  await scrollToCard('高频售后顾客');
  console.log('07 state', JSON.stringify(await readState()));
  await shot(page, '07-analytics-top-customers.png');

  // ── 08 员工处理绩效 ───────────────────────────────────────────────────────
  await scrollToCard('员工处理绩效');
  console.log('08 state', JSON.stringify(await readState()));
  await shot(page, '08-analytics-staff.png');

  // ── 09 退款流水 + 加载更多 ────────────────────────────────────────────────
  await scrollToCard('退款流水');
  console.log('09 state', JSON.stringify(await readState()));
  await shot(page, '09-analytics-refunds.png');
  await page.locator('.more').first().click();
  await page.waitForTimeout(900);
  console.log('09b state', JSON.stringify(await readState()));
  await shot(page, '09b-analytics-refunds-more.png');

  // ── 10 导出弹层（选中「员工处理绩效」，kind=staff） ──────────────────────
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.locator('.card .act').first().click();
  await page.waitForSelector('.sheet .kind', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await page.locator('.kind').nth(3).click();
  await page.waitForTimeout(300);
  console.log('10 state', JSON.stringify(await readState()));
  await shot(page, '10-analytics-export-sheet.png');

  // ── 11 售后申请页新增入口 ─────────────────────────────────────────────────
  await page.goto(BASE + '?r=104#/pages/campus/merchant-after-sales', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.ops-entry', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  console.log('11 state', JSON.stringify(await readState()));
  await shot(page, '11-merchant-after-sales-entries.png');

  await ctx.close();
  await browser.close();
  server.close();
  console.log('SHOTS DONE ->', OUT);
})();
