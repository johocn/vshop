// §102 售后处置详情 + 标签/回复模板 + 工作台处置入口 后台截图（390×844 dpr=2）
//   01 处置详情首屏：概览 + 商品 + 标签
//   02 处置动作区（按状态给出）
//   03 退款复核卡（大额二次确认）
//   04 指派处理人弹层
//   05 线下退款弹层
//   06 售后标签弹层
//   07 退货单：退货物流 + 回访 + 内部备注
//   08 运营页「售后标签」tab
//   09 运营页「回复模板」tab
//   10 回复模板编辑弹层
//   11 工作台「处置」入口
//   node scripts/shots-p102-after-sales-detail.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p102-after-sales-detail');
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
const inMin = (min) => new Date(Date.now() + min * 60 * 1000).toISOString();

const ev = (bg, label) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${bg}"/><text x="150" y="160" font-size="22" font-family="sans-serif" fill="#ffffff" text-anchor="middle">${label}</text></svg>`,
)}`;

const IMG_MEAL = ev('#9aa4b2', '餐品实拍');
const IMG_BOX = ev('#7c8aa0', '包装照片');

const ASSIGNEES = [
  { id: '3', name: '张伟', identifier: 'zhangwei' },
  { id: '5', name: '李娜', identifier: 'lina' },
  { id: '7', name: '王强', identifier: 'wangqiang' },
];

const TAGS = [
  { id: 't1', name: '配送超时', usedCount: 6 },
  { id: 't2', name: '少送漏送', usedCount: 4 },
  { id: 't3', name: '异物投诉', usedCount: 2 },
  { id: 't4', name: '老客', usedCount: 9 },
];

let TEMPLATES = [
  { id: 'r1', content: '非常抱歉给您带来不便，我们已为您全额退款，预计 1-3 个工作日原路到账。', createdAt: at(2880), category: '退款安抚', keywords: '退款 到账 抱歉', sortOrder: 0 },
  { id: 'r2', content: '今天运力确实紧张，让您久等了实在抱歉，已为您补偿 5 元无门槛券。', createdAt: at(1440), category: '配送超时', keywords: '超时 运力 补偿', sortOrder: 1 },
  { id: 'r3', content: '少送的商品已为您按差额退款，麻烦您确认下是否到账。', createdAt: at(720), category: '少送漏送', keywords: '少送 差额', sortOrder: 2 },
];

const NOTES_801 = [
  { id: 'n1', content: '已核对出餐记录：13:02 已完成，骑手 13:20 才取走，属配送超时。', createdBy: '张伟', createdAt: at(300) },
];

const REVIEWS = [
  { id: 'rv1', requestId: '801', orderId: '1001', orderCode: 'A2400001', amount: 3250, status: 'Pending', requestedBy: '3', requestedByName: '张伟', requestedAt: at(90), reviewedBy: null, reviewedByName: null, reviewedAt: null, note: null, selfRequested: false },
];

const D801 = {
  request: {
    id: '801', orderId: '1001', orderCode: 'A2400001', state: 'Pending', type: 'refund_only',
    reason: '出餐超时 35 分钟，到手米饭已经凉了', description: '顾客上传了餐品与包装照片，希望全额退款。',
    refundAmount: 3250, rejectReason: null, evidenceImages: [IMG_MEAL, IMG_BOX], messageCount: 2,
    customerName: '李同学', createdAt: at(600), refundedAt: null, overdue: true, unread: true, dueSoon: false,
    tags: ['配送超时', '老客'], assigneeUserId: '3', assigneeName: '张伟', riskReason: null,
    slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: true,
    exchangeTrackingNo: null, exchangeCarrier: null,
  },
  messages: [
    { id: 'm1', senderType: 'customer', senderName: '李同学', content: '等了快 40 分钟，饭都凉了，能退全款吗？', images: [IMG_MEAL], createdAt: at(420) },
    { id: 'm2', senderType: 'admin', senderName: '张伟', content: '实在抱歉，我先核对出餐记录，马上给您处理～', images: [], createdAt: at(300) },
  ],
  messageTotal: 2,
  stateHistory: [
    { fromState: null, toState: 'Pending', createdAt: at(600), operatorUserId: '9', operatorName: '李同学' },
    { fromState: 'Pending', toState: 'Appealed', createdAt: at(300), operatorUserId: '9', operatorName: '李同学' },
  ],
  refundError: null, actualRefundAmount: null, timeoutHours: 16,
  customerPhone: '138****5678',
  shippingAddress: { fullName: '李同学', phoneNumber: '138****5678', address: '东区 3 号宿舍楼 502' },
  orderItems: [
    { name: '宫保鸡丁', quantity: 1, unitPrice: 1800 },
    { name: '米饭', quantity: 2, unitPrice: 200 },
    { name: '可乐', quantity: 1, unitPrice: 450 },
  ],
  orderTotal: 3250,
  assignHistory: [
    { fromUserId: null, fromName: null, toUserId: '3', toName: '张伟', reason: '超时单优先处理', createdAt: at(480) },
  ],
  followUps: [
    { id: 'f1', method: 'phone', result: 'pending', note: '已电话联系顾客，等待其确认退款金额', nextAt: inMin(120), operatorName: '张伟', createdAt: at(240) },
  ],
  slaPauses: [
    { id: 's1', reason: '等待顾客补充照片', pausedAt: at(200), resumedAt: at(120), pausedMs: 4800000 },
    { id: 's2', reason: '等待物流回传签收时间', pausedAt: at(60), resumedAt: null, pausedMs: 0 },
  ],
  escalations: [
    { id: 'e1', requestId: '801', reason: '顾客要求平台介入，不接受部分退款', priority: 'urgent', status: 'open', createdBy: '3', creatorName: '张伟', createdAt: at(100), resolvedAt: null, resolution: null },
  ],
};

const D805 = {
  request: {
    id: '805', orderId: '1005', orderCode: 'A2400005', state: 'Received', type: 'return_refund',
    reason: '餐品撒漏，汤洒了一袋子', description: '顾客已把商品寄回门店，等待签收确认。',
    refundAmount: 4200, rejectReason: null, evidenceImages: [], messageCount: 1,
    customerName: '孙同学', createdAt: at(2880), refundedAt: null, overdue: false, unread: false, dueSoon: true,
    tags: ['少送漏送'], assigneeUserId: '5', assigneeName: '李娜', riskReason: null,
    slaPaused: true, slaPausedReason: '等待顾客寄回', escalated: false, refundReviewPending: false,
    exchangeTrackingNo: 'SF1234567890', exchangeCarrier: '顺丰',
  },
  messages: [
    { id: 'm3', senderType: 'customer', senderName: '孙同学', content: '已经用顺丰寄回了，单号 SF1234567890。', images: [], createdAt: at(1200) },
  ],
  messageTotal: 1,
  stateHistory: [
    { fromState: null, toState: 'Pending', createdAt: at(2880), operatorUserId: '9', operatorName: '孙同学' },
    { fromState: 'Pending', toState: 'Approved', createdAt: at(2000), operatorUserId: '5', operatorName: '李娜' },
    { fromState: 'Approved', toState: 'Received', createdAt: at(1200), operatorUserId: '5', operatorName: '李娜' },
  ],
  refundError: null, actualRefundAmount: null, timeoutHours: 40,
  customerPhone: '139****2244',
  shippingAddress: { fullName: '孙同学', phoneNumber: '139****2244', address: '西区 7 号教学楼 301' },
  orderItems: [
    { name: '酸菜鱼（大份）', quantity: 1, unitPrice: 3800 },
    { name: '米饭', quantity: 1, unitPrice: 200 },
  ],
  orderTotal: 4200,
  assignHistory: [
    { fromUserId: null, fromName: null, toUserId: '5', toName: '李娜', reason: null, createdAt: at(2800) },
  ],
  followUps: [
    { id: 'f2', method: 'wechat', result: 'resolved', note: '顾客已寄回，物流显示在途', nextAt: null, operatorName: '李娜', createdAt: at(1000) },
  ],
  slaPauses: [
    { id: 's3', reason: '等待顾客寄回', pausedAt: at(1500), resumedAt: null, pausedMs: 0 },
  ],
  escalations: [],
};

const LOGI_805 = {
  requestId: '805', orderCode: 'A2400005', type: 'return_refund', state: 'transit',
  trackingNo: 'SF1234567890', carrier: '顺丰',
  events: [
    { status: 'shipped', description: '顾客已寄出，顺丰已揽收', occurredAt: at(1600), source: 'customer' },
    { status: 'transit', description: '快件已到达门店所在片区中转场', occurredAt: at(900), source: 'carrier' },
    { status: 'exception', description: '门店当日休息，顺丰将改派次日', occurredAt: at(300), source: 'merchant' },
  ],
};

const NOTES_805 = [
  { id: 'n2', content: '已提醒顾客寄回时保留原包装，签收后按全额退款。', createdBy: '李娜', createdAt: at(1100) },
  { id: 'n3', content: '顺丰反馈门店休息改派次日，已同步顾客。', createdBy: '李娜', createdAt: at(260) },
];

const RETURN_ADDR = { fullName: '第一食堂 1 号档口', phoneNumber: '13800001111', address: '东区 3 号宿舍楼 1 层收餐点' };

const RULES = {
  timeoutHours: 24, autoApproveHours: 2, refundAutoRetry: 3,
  firstResponseTargetHours: 1, resolveTargetHours: 24, dueSoonHours: 4, refundReviewThreshold: 2000,
};

const WORKBENCH = {
  toApprove: 3, toReceive: 1, refundFailed: 1, pendingReply: 2, overdue: 1, dueSoon: 2,
  slaPaused: 1, followUpDue: 1, escalated: 1, oldestPendingAt: at(600), oldestPendingHours: 10,
};

const ROWS = [
  { id: '801', orderId: '1001', orderCode: 'A2400001', state: 'Pending', type: 'refund_only', reason: '出餐超时 35 分钟', description: null, refundAmount: 3250, rejectReason: null, evidenceImages: [], messageCount: 2, customerName: '李同学', createdAt: at(600), refundedAt: null, overdue: true, unread: true, dueSoon: false, tags: ['配送超时'], assigneeUserId: '3', assigneeName: '张伟', riskReason: null, slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: true, exchangeTrackingNo: null, exchangeCarrier: null },
  { id: '805', orderId: '1005', orderCode: 'A2400005', state: 'Received', type: 'return_refund', reason: '餐品撒漏', description: null, refundAmount: 4200, rejectReason: null, evidenceImages: [], messageCount: 1, customerName: '孙同学', createdAt: at(2880), refundedAt: null, overdue: false, unread: false, dueSoon: true, tags: [], assigneeUserId: '5', assigneeName: '李娜', riskReason: null, slaPaused: true, slaPausedReason: '等待顾客寄回', escalated: false, refundReviewPending: false, exchangeTrackingNo: 'SF1234567890', exchangeCarrier: '顺丰' },
];

function makeRoute() {
  return async (route) => {
    const raw = route.request().postData() || '';
    const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    let vars = {};
    try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }
    const id = String(vars.id || '');

    if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
    if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
    if (raw.includes('campusMerchantAfterSalesDisposalDetail')) return fulfill({});
    if (raw.includes('orderItems') && raw.includes('campusMerchantAfterSalesDetail')) {
      return fulfill({ campusMerchantAfterSalesDetail: id === '805' ? D805 : D801 });
    }
    if (raw.includes('campusMerchantAfterSalesNotes')) return fulfill({ campusMerchantAfterSalesNotes: id === '805' ? NOTES_805 : NOTES_801 });
    if (raw.includes('campusMerchantAfterSalesRefundReviews')) return fulfill({ campusMerchantAfterSalesRefundReviews: id === '805' ? [] : REVIEWS });
    if (raw.includes('campusMerchantAfterSalesReturnLogistics')) return fulfill({ campusMerchantAfterSalesReturnLogistics: id === '805' ? LOGI_805 : null });
    if (raw.includes('campusMerchantAfterSalesReturnAddress')) return fulfill({ campusMerchantAfterSalesReturnAddress: JSON.stringify(RETURN_ADDR) });
    if (raw.includes('campusMerchantAfterSalesRules')) return fulfill({ campusMerchantAfterSalesRules: RULES });
    if (raw.includes('campusMerchantAfterSalesTags')) return fulfill({ campusMerchantAfterSalesTags: TAGS });
    if (raw.includes('campusMerchantAfterSalesReplyTemplates')) return fulfill({ campusMerchantAfterSalesReplyTemplates: TEMPLATES });
    if (raw.includes('campusMerchantAfterSalesAssignees')) return fulfill({ campusMerchantAfterSalesAssignees: ASSIGNEES });
    if (raw.includes('campusMerchantSaveAfterSalesReplyTemplate')) {
      const saved = { id: id || 'r9', content: String(vars.content || ''), createdAt: at(0), category: vars.category ?? null, keywords: vars.keywords ?? null, sortOrder: Number(vars.sortOrder ?? 0) };
      TEMPLATES = id ? TEMPLATES.map((t) => (t.id === id ? saved : t)) : [saved, ...TEMPLATES];
      return fulfill({ campusMerchantSaveAfterSalesReplyTemplate: saved });
    }
    if (raw.includes('campusMerchantDeleteAfterSalesReplyTemplate')) return fulfill({ campusMerchantDeleteAfterSalesReplyTemplate: true });
    if (raw.includes('campusMerchantSaveAfterSalesTag')) {
      const saved = { id: id || 't9', name: String(vars.name || ''), usedCount: 0 };
      return fulfill({ campusMerchantSaveAfterSalesTag: saved });
    }
    if (raw.includes('campusMerchantSetAfterSalesTags')) return fulfill({ campusMerchantSetAfterSalesTags: ['配送超时', '老客'] });
    if (raw.includes('campusMerchantAfterSalesOfflineRefund')) {
      return fulfill({ campusMerchantAfterSalesOfflineRefund: { id, state: 'Refunded', actualRefundAmount: Number(vars.amount || 0), refundedAt: at(0) } });
    }
    if (raw.includes('campusMerchantAfterSalesAddFollowUp')) return fulfill({ campusMerchantAfterSalesAddFollowUp: D801.followUps });
    if (raw.includes('campusMerchantAfterSalesAddNote')) {
      return fulfill({ campusMerchantAfterSalesAddNote: { id: 'n9', content: String(vars.content || ''), createdBy: '张伟', createdAt: at(0) } });
    }
    if (raw.includes('campusMerchantAfterSalesAssign')) {
      const a = ASSIGNEES.find((x) => x.id === String(vars.userId || ''));
      return fulfill({ campusMerchantAfterSalesAssign: { ...D801.request, assigneeUserId: a ? a.id : null, assigneeName: a ? a.name : null } });
    }
    if (raw.includes('campusMerchantAfterSalesWorkbench')) return fulfill({ campusMerchantAfterSalesWorkbench: WORKBENCH });
    if (raw.includes('campusMerchantAfterSales')) {
      return fulfill({
        campusMerchantAfterSales: {
          items: ROWS, pendingCount: 3, total: ROWS.length,
          stateCounts: [{ state: 'Pending', count: 3 }, { state: 'Received', count: 2 }],
          skip: Number(vars.skip || 0), take: Number(vars.take || 20),
        },
      });
    }
    if (raw.includes('campusMerchantBoard')) {
      return fulfill({ campusMerchantBoard: {
        paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
        merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
        storeName: 'canteen-a', storePhone: '13800001111',
        pending: [], cooking: [], awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
        ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
        completedToday: 5, completedTodayAmount: 16250,
        closedToday: false, closureNote: null, unfinishedOrders: 0, urgedCount: 0,
      } });
    }
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
    localStorage.setItem('wa_auth_token', 'mock-admin-token-p102');
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
    pills: Array.from(document.querySelectorAll('.pills .pill')).map((n) => n.textContent.trim()),
    cards: Array.from(document.querySelectorAll('.card .title')).map((n) => n.textContent.trim()),
    acts: Array.from(document.querySelectorAll('.act-b')).map((n) => n.textContent.trim()),
    sheet: document.querySelector('.sheet__t')?.textContent?.trim() || '',
    opts: Array.from(document.querySelectorAll('.sheet .opt .opt__t')).map((n) => n.textContent.trim()),
    kv: Array.from(document.querySelectorAll('.kv .k')).map((n) => n.textContent.trim()),
    lines: Array.from(document.querySelectorAll('.line .l-name')).map((n) => n.textContent.trim()),
    recs: Array.from(document.querySelectorAll('.rec .rec__t')).map((n) => n.textContent.trim()),
    tpls: Array.from(document.querySelectorAll('.tpls .tpl, .pl-content')).map((n) => n.textContent.trim().slice(0, 30)),
    tags: Array.from(document.querySelectorAll('.plan .pl-name')).map((n) => n.textContent.trim()),
  }));

  const scrollToCard = async (title) => {
    await page.evaluate((t) => {
      const cards = Array.from(document.querySelectorAll('.card'));
      const card = cards.find((c) => (c.querySelector('.title')?.textContent || '').includes(t));
      if (card) card.scrollIntoView({ block: 'center' });
    }, title);
    await page.waitForTimeout(600);
  };

  // ── 01 处置详情首屏（Pending / 仅退款 / 待复核 / 超时 / 未读） ─────────────
  await page.goto(BASE + '#/pages/campus/after-sales-detail?id=801', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.card .title, .hint', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  console.log('01 state', JSON.stringify(await readState()));
  await shot(page, '01-detail-overview.png');

  // ── 02 处置动作区 ───────────────────────────────────────────────────────
  await scrollToCard('处置动作');
  console.log('02 state', JSON.stringify(await readState()));
  await shot(page, '02-detail-actions.png');

  // ── 03 退款复核卡 ───────────────────────────────────────────────────────
  await scrollToCard('退款复核');
  console.log('03 state', JSON.stringify(await readState()));
  await shot(page, '03-detail-refund-review.png');

  // ── 04 指派处理人弹层 ───────────────────────────────────────────────────
  await page.locator('.act-b', { hasText: '指派处理人' }).first().click();
  await page.waitForSelector('.sheet .opt', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  console.log('04 state', JSON.stringify(await readState()));
  await shot(page, '04-detail-assign-sheet.png');

  // ── 05 线下退款弹层 ─────────────────────────────────────────────────────
  await page.locator('.sheet__x').click();
  await page.waitForTimeout(400);
  await page.locator('.act-b', { hasText: '线下退款' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.sheet input').nth(0).fill('20.00');
  await page.waitForTimeout(300);
  console.log('05 state', JSON.stringify(await readState()));
  await shot(page, '05-detail-offline-sheet.png');

  // ── 06 售后标签弹层 ─────────────────────────────────────────────────────
  await page.locator('.sheet__x').click();
  await page.waitForTimeout(400);
  await page.locator('.card .act', { hasText: '编辑标签' }).first().click();
  await page.waitForSelector('.sheet .opt', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await page.locator('.sheet .opt').nth(0).click();
  await page.waitForTimeout(300);
  console.log('06 state', JSON.stringify(await readState()));
  await shot(page, '06-detail-tags-sheet.png');

  // ── 07 退货单（Received）：物流轨迹 + 回访 + 备注 ─────────────────────────
  await page.goto(BASE + '?r=805#/pages/campus/after-sales-detail?id=805', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.card .title', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  await scrollToCard('退货物流');
  console.log('07 state', JSON.stringify(await readState()));
  await shot(page, '07-detail-return-logistics.png');
  await page.evaluate(() => window.scrollTo(0, document.querySelectorAll('.card')[3]?.offsetTop || 0));
  await page.waitForTimeout(400);

  // ── 08 运营页「售后标签」 ────────────────────────────────────────────────
  await page.goto(BASE + '#/pages/campus/after-sales-ops', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.tab', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  await page.locator('.tab', { hasText: '售后标签' }).click();
  await page.waitForTimeout(900);
  console.log('08 state', JSON.stringify(await readState()));
  await shot(page, '08-ops-tags.png');

  // ── 09 运营页「回复模板」 ────────────────────────────────────────────────
  await page.locator('.tab', { hasText: '回复模板' }).click();
  await page.waitForTimeout(900);
  console.log('09 state', JSON.stringify(await readState()));
  await shot(page, '09-ops-templates.png');

  // ── 10 回复模板编辑弹层 ─────────────────────────────────────────────────
  await page.locator('.card .act', { hasText: '新增' }).click();
  await page.waitForSelector('.sheet .area', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await page.locator('.area textarea').first().fill('您的退款已提交，预计 1-3 个工作日原路到账，如未到账请随时联系我们。');
  await page.locator('.sheet input').nth(0).fill('退款安抚');
  await page.locator('.sheet input').nth(1).fill('退款 到账');
  await page.waitForTimeout(300);
  console.log('10 state', JSON.stringify(await readState()));
  await shot(page, '10-ops-template-sheet.png');

  // ── 11 工作台「处置」入口 ────────────────────────────────────────────────
  await page.goto(BASE + '#/pages/campus/after-sales-workbench', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.row, .hint', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  const goCount = await page.locator('.r-go').count();
  let goOk = true;
  if (goCount) {
    await page.locator('.r-go').first().click();
    await page.waitForTimeout(900);
    goOk = (await page.locator('.card .title').count()) > 0;
  }
  console.log('11 state', JSON.stringify({ goCount, goOk, sheet: await page.locator('.sheet__t').count() }));
  await page.goBack();
  await page.waitForTimeout(900);
  await shot(page, '11-workbench-dispose-entry.png');

  await ctx.close();
  await browser.close();
  console.log('SHOTS DONE ->', OUT);
  server.close();
  process.exit(0);
})().catch((e) => {
  console.error('SHOTS ERROR:', e.message);
  server.close();
  process.exit(1);
});
