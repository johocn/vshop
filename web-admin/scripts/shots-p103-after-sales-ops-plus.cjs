// §103 售后运营增强包 后台截图（390×844 dpr=2，mock admin-api）
//   01 运营页「售后处理规则」（SLA 阈值七项）
//   02 保存规则（toast）
//   03 退货收件地址
//   04 顾客黑名单
//   05 顾客售后档案弹层
//   06 工作台「处理人负载」
//   07 批量「更多」工具弹层
//   08 批量备注
//   09 批量打标
//   10 批量打印处理小票
//   11 处置详情动作区（标记风险 / 打印小票 / 智能话术）
//   12 打印处理小票弹层
//   13 智能话术弹层
//   node scripts/shots-p103-after-sales-ops-plus.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p103-after-sales-ops-plus');
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
const inMin = (m) => new Date(Date.now() + m * 60 * 1000).toISOString();

let RULES = {
  timeoutHours: 48, autoApproveHours: 0, refundAutoRetry: 1,
  firstResponseTargetHours: 4, resolveTargetHours: 24, dueSoonHours: 12, refundReviewThreshold: 0,
};
let ADDR = { fullName: '张伟', phoneNumber: '13800001111', address: '第一食堂 1 号档口 · 退货暂存柜' };

const BLACKLIST = [
  { id: 'b1', customerId: '149', customerName: '王同学', phone: '138****5678', reason: '7 天内 3 次售后，均为少送', createdBy: '张伟', createdAt: at(2880) },
  { id: 'b2', customerId: '171', customerName: '赵同学', phone: '137****3333', reason: '恶意差评 + 重复退款', createdBy: '李娜', createdAt: at(720) },
];

const PROFILE = {
  customerId: '149', name: '王同学', phone: '138****5678', blacklisted: true,
  requestCount: 5, refundedCount: 4, refundAmount: 8600,
  firstAt: at(43200), lastAt: at(600),
  recent: [
    { id: '801', orderCode: 'A2400001', type: 'refund_only', state: 'Refunded', amount: 3250, createdAt: at(600) },
    { id: '803', orderCode: 'A2400003', type: 'refund_only', state: 'RefundFailed', amount: 200, createdAt: at(1440) },
    { id: '806', orderCode: 'A2400006', type: 'return_refund', state: 'Pending', amount: 2800, createdAt: at(2880) },
  ],
};

const WORKBENCH = {
  toApprove: 6, toReceive: 2, refundFailed: 3, pendingReply: 4, overdue: 2, dueSoon: 3,
  slaPaused: 1, followUpDue: 2, escalated: 1, oldestPendingAt: at(600), oldestPendingHours: 10,
};

const LOADS = [
  { assigneeUserId: '3', assigneeName: '张伟', openCount: 6, overdueCount: 2, dueSoonCount: 1 },
  { assigneeUserId: '5', assigneeName: '李娜', openCount: 3, overdueCount: 0, dueSoonCount: 2 },
];

const TASKS = [
  { id: '11', type: 'pending_auto_approve', requestId: 801, status: 'pending', dueAt: at(-35), attempt: 0, maxAttempt: 0, retryCount: 0, lastError: null, executedAt: null },
  { id: '12', type: 'refund_retry', requestId: 804, status: 'failed', dueAt: at(20), attempt: 2, maxAttempt: 3, retryCount: 1, lastError: '微信退款通道返回 SYSTEMERROR', executedAt: null },
];

const ROWS = [
  { id: '801', orderId: '1001', orderCode: 'A2400001', state: 'Pending', type: 'refund_only', reason: '出餐超时 35 分钟', description: null, refundAmount: 3250, rejectReason: null, evidenceImages: [], messageCount: 2, customerName: '李同学', createdAt: at(600), refundedAt: null, overdue: true, unread: true, dueSoon: false, tags: ['配送超时', '老客'], assigneeUserId: '3', assigneeName: '张伟', riskReason: null, slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: false, exchangeTrackingNo: null, exchangeCarrier: null },
  { id: '803', orderId: '1003', orderCode: 'A2400003', state: 'RefundFailed', type: 'refund_only', reason: '少送一份米饭', description: null, refundAmount: 200, rejectReason: null, evidenceImages: [], messageCount: 3, customerName: '赵同学', createdAt: at(1440), refundedAt: null, overdue: false, unread: true, dueSoon: false, tags: ['退款异常'], assigneeUserId: null, assigneeName: null, riskReason: '同一顾客 7 天内 3 次售后', slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: false, exchangeTrackingNo: null, exchangeCarrier: null },
  { id: '806', orderId: '1006', orderCode: 'A2400006', state: 'Pending', type: 'refund_only', reason: '口味不符', description: null, refundAmount: 1500, rejectReason: null, evidenceImages: [], messageCount: 0, customerName: '周同学', createdAt: at(150), refundedAt: null, overdue: false, unread: false, dueSoon: true, tags: [], assigneeUserId: null, assigneeName: null, riskReason: null, slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: false, exchangeTrackingNo: null, exchangeCarrier: null },
];

const STATE_COUNTS = [
  { state: 'Pending', count: 6 }, { state: 'RefundFailed', count: 3 }, { state: 'Received', count: 2 },
  { state: 'Refunded', count: 9 }, { state: 'Rejected', count: 4 }, { state: 'Closed', count: 2 },
];

const TAGS = [
  { id: 't1', name: '配送超时', usedCount: 12 },
  { id: 't2', name: '少送漏送', usedCount: 9 },
  { id: 't3', name: '异物投诉', usedCount: 4 },
  { id: 't4', name: '老客', usedCount: 7 },
];

const ASSIGNEES = [
  { id: '3', name: '张伟', identifier: 'zhangwei' },
  { id: '5', name: '李娜', identifier: 'lina' },
];

const AUDIT_LOGS = [
  { id: 'a1', orderCode: 'A2400001', action: 'approve', actorName: '张伟', actorUserId: '3', detail: '同意退款 ¥32.50（仅退款）', createdAt: at(600) },
  { id: 'a2', orderCode: 'A2400003', action: 'refund_retry', actorName: '系统', actorUserId: null, detail: '退款重试第 2 次，通道返回 SYSTEMERROR', createdAt: at(1440) },
];

const D801 = {
  request: {
    id: '801', orderId: '1001', orderCode: 'A2400001', state: 'Pending', type: 'refund_only',
    reason: '出餐超时 35 分钟，到手米饭已经凉了', description: '顾客希望全额退款，并已上传餐品照片。',
    refundAmount: 3250, rejectReason: null, evidenceImages: [], messageCount: 2,
    customerName: '李同学', createdAt: at(600), refundedAt: null, overdue: true, unread: true, dueSoon: false,
    tags: ['配送超时', '老客'], assigneeUserId: '3', assigneeName: '张伟', riskReason: null,
    slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: true,
    exchangeTrackingNo: null, exchangeCarrier: null,
  },
  messages: [
    { id: 'm1', senderType: 'customer', senderName: '李同学', content: '等了快 40 分钟，饭都凉了，能退全款吗？', images: [], createdAt: at(420) },
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
  slaPauses: [],
  escalations: [],
};

const SUGGESTS = [
  { id: 's1', content: '非常抱歉让您久等了，本次出餐超时属实，我们已为您全额退款，并赠送一张 5 元无门槛券。', score: 96 },
  { id: 's2', content: '已核对出餐记录，确实超过承诺时限，退款会在 1-3 个工作日到账，请您留意。', score: 88 },
  { id: 's3', content: '感谢反馈！我们会调整高峰期出餐节奏，避免再次发生，祝您用餐愉快～', score: 76 },
];

const SLIP = [
  '════════ 售后处理小票 ════════',
  '单号：A2400001    类型：仅退款',
  '顾客：李同学     电话：138****5678',
  '原因：出餐超时 35 分钟',
  '金额：¥32.50',
  '处理人：张伟   时间：' + at(600).slice(0, 19).replace('T', ' '),
  '─────────────────────────────',
  '备注：顾客已上传凭证，同意全额退款',
  '═════════════════════════════',
].join('\n');

function makeRoute() {
  return async (route) => {
    const raw = route.request().postData() || '';
    const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    let vars = {};
    try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }
    const id = String(vars.id || '');

    if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
    if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });

    /* ---- §103 运营页 ---- */
    if (raw.includes('campusMerchantUpdateAfterSalesRules')) {
      for (const k of Object.keys(RULES)) {
        if (vars[k] !== null && vars[k] !== undefined) RULES[k] = Number(vars[k]);
      }
      return fulfill({ campusMerchantUpdateAfterSalesRules: { ...RULES } });
    }
    if (raw.includes('campusMerchantUpdateAfterSalesReturnAddress')) {
      const s = String(vars.address ?? '');
      ADDR = s ? JSON.parse(s) : { fullName: '', phoneNumber: '', address: '' };
      return fulfill({ campusMerchantUpdateAfterSalesReturnAddress: true });
    }
    if (raw.includes('campusMerchantBlacklistAfterSalesCustomer') || raw.includes('campusMerchantUnblacklistAfterSalesCustomer')) {
      return fulfill({
        campusMerchantBlacklistAfterSalesCustomer: true,
        campusMerchantUnblacklistAfterSalesCustomer: true,
      });
    }
    if (raw.includes('campusMerchantAfterSalesCustomerProfile')) {
      return fulfill({ campusMerchantAfterSalesCustomerProfile: { ...PROFILE, customerId: id || '149' } });
    }
    if (raw.includes('campusMerchantAfterSalesBlacklist')) return fulfill({ campusMerchantAfterSalesBlacklist: BLACKLIST });
    if (raw.includes('campusMerchantAfterSalesAuditLogs')) return fulfill({ campusMerchantAfterSalesAuditLogs: { items: AUDIT_LOGS, total: AUDIT_LOGS.length } });
    if (raw.includes('campusMerchantAfterSalesRules')) return fulfill({ campusMerchantAfterSalesRules: { ...RULES } });
    if (raw.includes('campusMerchantAfterSalesReturnAddress')) return fulfill({ campusMerchantAfterSalesReturnAddress: JSON.stringify(ADDR) });

    /* ---- §103 工作台 ---- */
    if (raw.includes('campusMerchantAfterSalesAssigneeLoad')) return fulfill({ campusMerchantAfterSalesAssigneeLoad: LOADS });
    if (raw.includes('campusMerchantAfterSalesBatchNote') || raw.includes('campusMerchantAfterSalesBatchRemind')
      || raw.includes('campusMerchantAfterSalesBatchTag')) {
      const ids = (vars.ids || []).map(String);
      return fulfill({
        campusMerchantAfterSalesBatchNote: ids.map((x) => ({ id: x, success: true, state: 'Pending', message: null })),
        campusMerchantAfterSalesBatchRemind: ids.map((x) => ({ id: x, success: true, state: 'Pending', message: null })),
        campusMerchantAfterSalesBatchTag: ids.map((x) => ({ id: x, success: true, state: 'Pending', message: null })),
      });
    }
    if (raw.includes('campusMerchantAfterSalesPrintSlips')) return fulfill({ campusMerchantAfterSalesPrintSlips: [SLIP, SLIP] });
    if (raw.includes('campusMerchantAfterSalesPrintSlip')) return fulfill({ campusMerchantAfterSalesPrintSlip: SLIP });
    if (raw.includes('campusMerchantAfterSalesSuggestedReplies')) return fulfill({ campusMerchantAfterSalesSuggestedReplies: SUGGESTS });
    if (raw.includes('campusMerchantAfterSalesRiskFlag') || raw.includes('campusMerchantAfterSalesRiskClear')) {
      return fulfill({
        campusMerchantAfterSalesRiskFlag: { ...D801.request, riskReason: '同一顾客 7 天内 3 次售后' },
        campusMerchantAfterSalesRiskClear: { ...D801.request, riskReason: null },
      });
    }

    /* ---- §103 处置详情 ---- */
    if (raw.includes('campusMerchantAfterSalesDisposalDetail')) return fulfill({});
    if (raw.includes('campusMerchantAfterSalesDetail')) return fulfill({ campusMerchantAfterSalesDetail: D801 });
    if (raw.includes('campusMerchantAfterSalesNotes')) return fulfill({ campusMerchantAfterSalesNotes: [] });
    if (raw.includes('campusMerchantAfterSalesRefundReviews')) return fulfill({ campusMerchantAfterSalesRefundReviews: [] });
    if (raw.includes('campusMerchantAfterSalesReturnLogistics')) return fulfill({ campusMerchantAfterSalesReturnLogistics: null });
    if (raw.includes('campusMerchantAfterSalesReplyTemplates')) return fulfill({ campusMerchantAfterSalesReplyTemplates: [] });
    if (raw.includes('campusMerchantAfterSalesTags')) return fulfill({ campusMerchantAfterSalesTags: TAGS });
    if (raw.includes('campusMerchantAfterSalesAssignees')) return fulfill({ campusMerchantAfterSalesAssignees: ASSIGNEES });

    /* ---- 工作台通用 ---- */
    if (raw.includes('campusMerchantAfterSalesWorkbench')) return fulfill({ campusMerchantAfterSalesWorkbench: WORKBENCH });
    if (raw.includes('campusMerchantAfterSalesTasks')) return fulfill({ campusMerchantAfterSalesTasks: { items: TASKS, total: TASKS.length } });
    if (raw.includes('campusMerchantAfterSales')) {
      return fulfill({
        campusMerchantAfterSales: {
          items: ROWS, pendingCount: 6, total: ROWS.length, stateCounts: STATE_COUNTS,
          skip: Number(vars.skip || 0), take: Number(vars.take || 20),
        },
      });
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
    localStorage.setItem('wa_auth_token', 'mock-admin-token-p103');
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
    tab: Array.from(document.querySelectorAll('.tabs .tab.on')).map((n) => n.textContent.trim()),
    cards: Array.from(document.querySelectorAll('.card .title')).map((n) => n.textContent.trim()),
    rules: Array.from(document.querySelectorAll('.fld .sheet__lbl')).map((n) => n.textContent.trim()),
    values: Array.from(document.querySelectorAll('.card input')).map((n) => (n.value ?? '')),
    bl: Array.from(document.querySelectorAll('.plan .pl-name')).map((n) => n.textContent.trim()),
    prof: document.querySelector('.prof-name')?.textContent?.trim() || '',
    kpis: Array.from(document.querySelectorAll('.pk')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    loads: Array.from(document.querySelectorAll('.ld')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    selected: document.querySelector('.bar-n')?.textContent?.trim() || '',
    sheet: document.querySelector('.sheet-t, .sheet__t')?.textContent?.trim() || '',
    opts: Array.from(document.querySelectorAll('.sheet .opt-t, .sheet .opt__t')).map((n) => n.textContent.trim()),
    acts: Array.from(document.querySelectorAll('.act-b')).map((n) => n.textContent.trim()),
    toast: document.querySelector('.uni-toast')?.textContent?.trim() || '',
  }));

  // ── 01 售后处理规则 ───────────────────────────────────────────────────────
  await page.goto(BASE + '?r=103#/pages/campus/after-sales-ops?tab=rules', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.tabs .tab.on', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  console.log('01 state', JSON.stringify(await readState()));
  await shot(page, '01-ops-rules.png');

  // ── 02 保存规则（改处理时限 24 小时） ────────────────────────────────────
  await page.locator('.fld input').nth(0).fill('24');
  await page.locator('.card .act', { hasText: '保存' }).first().click();
  await page.waitForTimeout(700);
  console.log('02 state', JSON.stringify(await readState()));
  await shot(page, '02-ops-rules-saved.png');
  await page.waitForTimeout(900);

  // ── 03 退货收件地址 ───────────────────────────────────────────────────────
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const card = cards.find((c) => (c.querySelector('.title')?.textContent || '').includes('退货收件地址'));
    if (card) card.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  console.log('03 state', JSON.stringify(await readState()));
  await shot(page, '03-ops-return-address.png');

  // ── 04 顾客黑名单 ─────────────────────────────────────────────────────────
  await page.goto(BASE + '?r=104#/pages/campus/after-sales-ops?tab=blacklist', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.plan, .hint', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  console.log('04 state', JSON.stringify(await readState()));
  await shot(page, '04-ops-blacklist.png');

  // ── 05 顾客售后档案 ───────────────────────────────────────────────────────
  await page.locator('.plan .pl-edit').first().click();
  await page.waitForSelector('.prof-name', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  console.log('05 state', JSON.stringify(await readState()));
  await shot(page, '05-ops-customer-profile.png');
  await page.locator('.sheet__x').click();
  await page.waitForTimeout(400);

  // ── 06 工作台处理人负载 ───────────────────────────────────────────────────
  await page.goto(BASE + '?r=106#/pages/campus/after-sales-workbench', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.ch, .hint', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  console.log('06 state', JSON.stringify(await readState()));
  await shot(page, '06-workbench-assignee-load.png');

  // ── 07 更多批量工具 ───────────────────────────────────────────────────────
  await page.locator('.row').nth(0).click();
  await page.locator('.row').nth(1).click();
  await page.waitForTimeout(400);
  await page.locator('.bar-b', { hasText: '更多' }).click();
  await page.waitForTimeout(500);
  console.log('07 state', JSON.stringify(await readState()));
  await shot(page, '07-workbench-batch-more.png');

  // ── 08 批量备注 ───────────────────────────────────────────────────────────
  await page.locator('.sheet .opt', { hasText: '批量备注' }).click();
  await page.waitForTimeout(500);
  await page.locator('.sheet .area textarea').fill('已电话安抚顾客，按门店补偿方案全额退款。');
  await page.waitForTimeout(300);
  console.log('08 state', JSON.stringify(await readState()));
  await shot(page, '08-workbench-batch-note.png');
  await page.locator('.sheet-x').click();
  await page.waitForTimeout(400);

  // ── 09 批量打标 ───────────────────────────────────────────────────────────
  await page.locator('.bar-b', { hasText: '更多' }).click();
  await page.waitForTimeout(400);
  await page.locator('.sheet .opt', { hasText: '批量打标' }).click();
  await page.waitForSelector('.sheet .chip', { timeout: 10000 }).catch(() => undefined);
  await page.locator('.sheet .chip').nth(0).click();
  await page.locator('.sheet .chip').nth(2).click();
  await page.waitForTimeout(400);
  console.log('09 state', JSON.stringify(await readState()));
  await shot(page, '09-workbench-batch-tag.png');
  await page.locator('.sheet-x').click();
  await page.waitForTimeout(400);

  // ── 10 批量打印处理小票 ───────────────────────────────────────────────────
  await page.locator('.bar-b', { hasText: '更多' }).click();
  await page.waitForTimeout(400);
  await page.locator('.sheet .opt', { hasText: '打印处理小票' }).click();
  await page.waitForSelector('.sheet .slip', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  console.log('10 state', JSON.stringify(await readState()));
  await shot(page, '10-workbench-batch-print.png');

  // ── 11 处置详情动作区 ─────────────────────────────────────────────────────
  await page.goto(BASE + '?r=111#/pages/campus/after-sales-detail?id=801', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.act-b', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const card = cards.find((c) => (c.querySelector('.title')?.textContent || '').includes('处置动作'));
    if (card) card.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  console.log('11 state', JSON.stringify(await readState()));
  await shot(page, '11-detail-actions-risk-slip-suggest.png');

  // ── 12 打印处理小票弹层 ───────────────────────────────────────────────────
  await page.locator('.act-b', { hasText: '打印处理小票' }).click();
  await page.waitForSelector('.slip-t', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  console.log('12 state', JSON.stringify(await readState()));
  await shot(page, '12-detail-print-slip.png');
  await page.locator('.sheet__x').click();
  await page.waitForTimeout(400);

  // ── 13 智能话术弹层 ───────────────────────────────────────────────────────
  await page.locator('.act-b', { hasText: '智能话术' }).click();
  await page.waitForSelector('.sheet .opt__t', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  console.log('13 state', JSON.stringify(await readState()));
  await shot(page, '13-detail-suggested-replies.png');

  await ctx.close();
  await browser.close();
  server.close();
  console.log('SHOTS DONE ->', OUT);
})();
