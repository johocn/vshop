// §101 售后工作台（概览 / 自动化任务 / 批量处置 / 一键补偿）后台截图（390×844 dpr=2）
//   01 工作台首屏：待办概览 + 自动化任务
//   02 列表多选：底部批量操作条
//   03 批量驳回：原因弹层
//   04 批量指派：处理人弹层
//   05 一键补偿：方案选择弹层
//   06 退款失败筛选
//   07 任务「显示全部」
//   node scripts/shots-p101-after-sales-workbench.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p101-after-sales-workbench');
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

const WORKBENCH = {
    toApprove: 6, toReceive: 2, refundFailed: 3, pendingReply: 4, overdue: 2, dueSoon: 3,
    slaPaused: 1, followUpDue: 2, escalated: 1, oldestPendingAt: at(600), oldestPendingHours: 10,
};

let TASKS = [
    { id: '11', type: 'pending_auto_approve', requestId: 801, status: 'pending', dueAt: at(-35), attempt: 0, maxAttempt: 0, retryCount: 0, lastError: null, executedAt: null },
    { id: '12', type: 'refund_retry', requestId: 804, status: 'failed', dueAt: at(20), attempt: 2, maxAttempt: 3, retryCount: 1, lastError: '微信退款通道返回 SYSTEMERROR', executedAt: null },
    { id: '13', type: 'pending_remind', requestId: 806, status: 'pending', dueAt: at(-10), attempt: 0, maxAttempt: 0, retryCount: 0, lastError: null, executedAt: null },
    { id: '14', type: 'refund_retry', requestId: 802, status: 'executed', dueAt: at(90), attempt: 1, maxAttempt: 3, retryCount: 0, lastError: null, executedAt: at(88) },
];

const ASSIGNEES = [
    { id: '3', name: '张伟', identifier: 'zhangwei' },
    { id: '5', name: '李娜', identifier: 'lina' },
];

const PLANS = [
    { id: '901', name: '出餐超时补偿', refundAmount: 500, couponTemplateId: 'c1', note: '出餐超过 20 分钟，退款 5 元 + 5 元券', enabled: true, createdAt: at(4320) },
    { id: '902', name: '撒漏安抚券', refundAmount: 0, couponTemplateId: 'c2', note: '仅发券，不退款', enabled: true, createdAt: at(2880) },
    { id: '903', name: '老客挽留（大额）', refundAmount: 1500, couponTemplateId: null, note: '客诉严重时人工判断', enabled: false, createdAt: at(1440) },
];

const ROWS = [
    { id: '801', orderId: '1001', orderCode: 'A2400001', state: 'Pending', type: 'refund_only', reason: '出餐超时 35 分钟', description: null, refundAmount: 3250, rejectReason: null, evidenceImages: [], messageCount: 2, customerName: '李同学', createdAt: at(600), refundedAt: null, overdue: true, unread: true, dueSoon: false, tags: ['超时', '老客'], assigneeUserId: '3', assigneeName: '张伟', riskReason: null, slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: false, exchangeTrackingNo: null, exchangeCarrier: null },
    { id: '802', orderId: '1002', orderCode: 'A2400002', state: 'Pending', type: 'return_refund', reason: '餐品撒漏', description: null, refundAmount: 2800, rejectReason: null, evidenceImages: [], messageCount: 0, customerName: '王同学', createdAt: at(420), refundedAt: null, overdue: false, unread: false, dueSoon: true, tags: ['撒漏'], assigneeUserId: '5', assigneeName: '李娜', riskReason: null, slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: false, exchangeTrackingNo: null, exchangeCarrier: null },
    { id: '803', orderId: '1003', orderCode: 'A2400003', state: 'RefundFailed', type: 'refund_only', reason: '少送一份米饭', description: null, refundAmount: 200, rejectReason: null, evidenceImages: [], messageCount: 3, customerName: '赵同学', createdAt: at(1440), refundedAt: null, overdue: false, unread: true, dueSoon: false, tags: ['退款异常'], assigneeUserId: null, assigneeName: null, riskReason: '同一顾客 7 天内 3 次售后', slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: false, exchangeTrackingNo: null, exchangeCarrier: null },
    { id: '804', orderId: '1004', orderCode: 'A2400004', state: 'Pending', type: 'exchange', reason: '菜品与图片不符', description: null, refundAmount: 1800, rejectReason: null, evidenceImages: [], messageCount: 1, customerName: '陈同学', createdAt: at(180), refundedAt: null, overdue: false, unread: true, dueSoon: false, tags: ['品质'], assigneeUserId: '3', assigneeName: '张伟', riskReason: null, slaPaused: false, slaPausedReason: null, escalated: true, refundReviewPending: true, exchangeTrackingNo: null, exchangeCarrier: null },
    { id: '805', orderId: '1005', orderCode: 'A2400005', state: 'Received', type: 'return_refund', reason: '商品破损', description: null, refundAmount: 4200, rejectReason: null, evidenceImages: [], messageCount: 0, customerName: '孙同学', createdAt: at(2880), refundedAt: null, overdue: false, unread: false, dueSoon: false, tags: [], assigneeUserId: '5', assigneeName: '李娜', riskReason: null, slaPaused: true, slaPausedReason: '等待顾客寄回', escalated: false, refundReviewPending: false, exchangeTrackingNo: 'SF1234567890', exchangeCarrier: '顺丰' },
    { id: '806', orderId: '1006', orderCode: 'A2400006', state: 'Pending', type: 'refund_only', reason: '口味不符', description: null, refundAmount: 1500, rejectReason: null, evidenceImages: [], messageCount: 0, customerName: '周同学', createdAt: at(150), refundedAt: null, overdue: false, unread: false, dueSoon: true, tags: [], assigneeUserId: null, assigneeName: null, riskReason: null, slaPaused: false, slaPausedReason: null, escalated: false, refundReviewPending: false, exchangeTrackingNo: null, exchangeCarrier: null },
];

const STATE_COUNTS = [
    { state: 'Pending', count: 6 }, { state: 'RefundFailed', count: 3 }, { state: 'Received', count: 2 },
    { state: 'Refunded', count: 9 }, { state: 'Rejected', count: 4 }, { state: 'Closed', count: 2 },
];

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        let vars = {};
        try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantAfterSalesWorkbench')) return fulfill({ campusMerchantAfterSalesWorkbench: WORKBENCH });
        if (raw.includes('campusMerchantAfterSalesTasks')) {
            const status = String(vars.status || '');
            const list = status ? TASKS.filter((t) => t.status === status) : TASKS;
            return fulfill({ campusMerchantAfterSalesTasks: { items: list, total: list.length } });
        }
        if (raw.includes('campusMerchantAfterSalesRunTask')) {
            TASKS = TASKS.map((t) => (t.id === String(vars.id || '') ? { ...t, status: 'executed', executedAt: at(0) } : t));
            return fulfill({ campusMerchantAfterSalesRunTask: TASKS.find((t) => t.id === String(vars.id || '')) });
        }
        if (raw.includes('campusMerchantAfterSalesBatchApprove') || raw.includes('campusMerchantAfterSalesBatchReject')
            || raw.includes('campusMerchantAfterSalesBatchClose') || raw.includes('campusMerchantAfterSalesBatchAssign')) {
            const ids = (vars.ids || []).map(String);
            return fulfill({
                campusMerchantAfterSalesBatchApprove: ids.map((id) => ({ id, success: true, state: 'Refunded', message: null })),
                campusMerchantAfterSalesBatchReject: ids.map((id) => ({ id, success: true, state: 'Rejected', message: null })),
                campusMerchantAfterSalesBatchClose: ids.map((id) => ({ id, success: true, state: 'Closed', message: null })),
                campusMerchantAfterSalesBatchAssign: ids.map((id) => ({ id, success: true, state: 'Pending', message: null })),
            });
        }
        if (raw.includes('campusMerchantAfterSalesApplyCompensation')) {
            return fulfill({ campusMerchantAfterSalesApplyCompensation: { ok: true, refundAmount: 500, couponGranted: true, message: null } });
        }
        if (raw.includes('campusMerchantAfterSalesAssignees')) return fulfill({ campusMerchantAfterSalesAssignees: ASSIGNEES });
        if (raw.includes('campusMerchantAfterSalesCompensationPlans')) return fulfill({ campusMerchantAfterSalesCompensationPlans: PLANS });
        if (raw.includes('campusMerchantAfterSales')) {
            const state = String(vars.state || '');
            const attention = String(vars.attention || '');
            let list = ROWS;
            if (state) list = list.filter((r) => r.state === state);
            if (attention === 'overdue') list = list.filter((r) => r.overdue);
            if (attention === 'dueSoon') list = list.filter((r) => r.dueSoon);
            if (attention === 'unread') list = list.filter((r) => r.unread);
            if (attention === 'followUp') list = [];
            return fulfill({
                campusMerchantAfterSales: {
                    items: list, pendingCount: 6, total: list.length, stateCounts: STATE_COUNTS,
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p101');
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
        chips: Array.from(document.querySelectorAll('.ch')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
        tasks: Array.from(document.querySelectorAll('.task')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
        seg: Array.from(document.querySelectorAll('.seg-i.on')).map((n) => n.textContent.trim()),
        rows: Array.from(document.querySelectorAll('.row')).length,
        selected: document.querySelector('.bar-n')?.textContent?.trim() || '',
        sheet: document.querySelector('.sheet-t')?.textContent?.trim() || '',
        opts: Array.from(document.querySelectorAll('.sheet .opt')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    }));

    // ── 01 工作台首屏 ─────────────────────────────────────────────────────
    await page.goto(BASE + '#/pages/campus/after-sales-workbench', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.ch, .hint', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-workbench-overview.png');

    // ── 02 多选：批量操作条 ───────────────────────────────────────────────
    await page.locator('.row').nth(0).click();
    await page.locator('.row').nth(1).click();
    await page.waitForTimeout(400);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-workbench-bulk-bar.png');

    // ── 03 批量驳回弹层 ───────────────────────────────────────────────────
    await page.locator('.bar-b', { hasText: '批量驳回' }).click();
    await page.waitForTimeout(500);
    await page.locator('.area textarea').first().fill('核实出品记录与顾客描述一致，不符合退款条件');
    await page.waitForTimeout(300);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-workbench-batch-reject-sheet.png');

    // ── 04 批量指派弹层 ───────────────────────────────────────────────────
    await page.locator('.sheet-x').click();
    await page.waitForTimeout(400);
    await page.locator('.bar-b', { hasText: '批量指派' }).click();
    await page.waitForSelector('.opt', { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-workbench-batch-assign-sheet.png');

    // ── 05 一键补偿方案弹层（需单选） ─────────────────────────────────────
    await page.locator('.sheet-x').click();
    await page.waitForTimeout(400);
    await page.locator('.row').nth(1).click();
    await page.waitForTimeout(300);
    await page.locator('.bar-b', { hasText: '补偿挽留' }).click();
    await page.waitForSelector('.opt', { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await page.locator('.opt').nth(0).click();
    await page.waitForTimeout(300);
    console.log('05 state', JSON.stringify(await readState()));
    await shot(page, '05-workbench-compensation-sheet.png');

    // ── 06 退款失败筛选 ───────────────────────────────────────────────────
    await page.locator('.sheet-x').click();
    await page.waitForTimeout(400);
    await page.locator('.seg-i', { hasText: '退款失败' }).first().click();
    await page.waitForTimeout(900);
    console.log('06 state', JSON.stringify(await readState()));
    await shot(page, '06-workbench-refund-failed.png');

    // ── 07 任务「全部」 ───────────────────────────────────────────────────
    await page.locator('.card .seg-i', { hasText: '全部' }).first().click();
    await page.waitForTimeout(900);
    console.log('07 state', JSON.stringify(await readState()));
    await shot(page, '07-workbench-tasks-all.png');

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
