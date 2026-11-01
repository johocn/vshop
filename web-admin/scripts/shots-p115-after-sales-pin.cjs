// §115 售后管理（退款失败单全局置顶）后台截图（390×844 dpr=2）
//   01 「全部」首屏：顶部置顶汇总条 + 3 条退款失败单排在最前（它们的申请时间最旧，靠服务端排序才到首屏）
//   02 加载更多：25 条全部加载，失败单只出现一次（跨分页不重复）
//   03 点汇总条切「退款失败」：只剩 3 条，汇总条隐藏（筛选态不叠加置顶提示）
//   04 切「待处理」：置顶条不出现，筛选语义不被置顶破坏
//   node scripts/shots-p115-after-sales-pin.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p115-after-sales-pin');
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
    permissions: [],
    mustChangePassword: false,
};

const at = (minAgo) => new Date(Date.now() - minAgo * 60 * 1000).toISOString();
const FAIL_ERROR = '支付渠道返回：订单已关闭，无法原路退回';

function row(base) {
    return {
        rejectReason: null,
        evidenceImages: [],
        messageCount: 0,
        refundedAt: null,
        overdue: false,
        unread: false,
        dueSoon: false,
        tags: [],
        assigneeUserId: null,
        assigneeName: null,
        riskReason: null,
        slaPaused: false,
        slaPausedReason: null,
        escalated: false,
        refundReviewPending: false,
        exchangeTrackingNo: null,
        exchangeCarrier: null,
        refundError: null,
        ...base,
    };
}

// 失败单刻意做成「最旧」的 3 条（createdAt 320/340/360 分钟前）：
// 仅按申请时间倒序时它们会落到第 2 页，置顶排序保证仍出现在首屏
const rows = [
    row({ id: '701', orderId: '401', orderCode: 'A2400011', state: 'RefundFailed', type: 'refund_only',
        reason: '菜品与描述不符', description: '点的是不辣，实际很辣。', refundAmount: 3250,
        messageCount: 2, customerName: '李同学', createdAt: at(320), overdue: true, refundError: FAIL_ERROR }),
    row({ id: '702', orderId: '402', orderCode: 'A2400013', state: 'RefundFailed', type: 'refund_only',
        reason: '少送商品', description: '少了一份米饭。', refundAmount: 1200,
        messageCount: 1, customerName: '王同学', createdAt: at(340), overdue: true, refundError: FAIL_ERROR }),
    row({ id: '703', orderId: '403', orderCode: 'A2400015', state: 'RefundFailed', type: 'refund_only',
        reason: '口味差异', description: '口味和上次不一样。', refundAmount: 2900,
        messageCount: 0, customerName: '赵同学', createdAt: at(360), refundError: null }),
    row({ id: '704', orderId: '404', orderCode: 'A2400012', state: 'Pending', type: 'refund_only',
        reason: '少送商品', description: '少了一份米饭。', refundAmount: 1200,
        messageCount: 2, customerName: '周同学', createdAt: at(12), unread: true }),
    row({ id: '705', orderId: '405', orderCode: 'A2400014', state: 'Pending', type: 'refund_only',
        reason: '食品安全', description: '菜里有异物。', refundAmount: 1800,
        messageCount: 1, customerName: '孙同学', createdAt: at(20), dueSoon: true }),
    ...Array.from({ length: 20 }, (_, i) => {
        const n = 20 + i;
        return row({
            id: String(800 + i), orderId: String(500 + i),
            orderCode: 'A24000' + String(n).padStart(2, '0'),
            state: 'Refunded', type: i % 5 === 0 ? 'return_refund' : 'refund_only',
            reason: i % 3 === 0 ? '配送超时' : '商品缺货',
            description: '',
            refundAmount: 300 + i * 100,
            messageCount: i % 4 === 0 ? 1 : 0,
            customerName: '顾客' + String(i + 1).padStart(2, '0'),
            createdAt: at(130 + i * 12),
            refundedAt: at(120 + i * 12),
        });
    }),
];

/** 模拟后端 §115 排序：失败单在前，其余按申请时间倒序 */
const ordered = rows.slice().sort((a, b) => {
    const pin = Number(b.state === 'RefundFailed') - Number(a.state === 'RefundFailed');
    return pin || (new Date(b.createdAt) - new Date(a.createdAt));
});

const stateCounts = [
    { state: 'Pending', count: rows.filter((r) => r.state === 'Pending').length },
    { state: 'Refunded', count: rows.filter((r) => r.state === 'Refunded').length },
    { state: 'RefundFailed', count: rows.filter((r) => r.state === 'RefundFailed').length },
];
const pendingCount = () => rows.filter((r) => r.state === 'Pending').length;

function detailOf(id) {
    const r = rows.find((x) => String(x.id) === String(id)) || rows[3];
    return {
        request: { ...r },
        messages: [{ id: 'm1', senderType: 'customer', senderName: '周同学', content: '少送一份米饭，能退一份的钱吗？', images: [], createdAt: at(20) }],
        messageTotal: 1,
        stateHistory: [{ fromState: null, toState: 'Pending', createdAt: at(12) }],
        refundError: r.refundError ?? null,
        actualRefundAmount: null,
        timeoutHours: 24,
    };
}

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        let vars = {};
        try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantAfterSalesDetail')) return fulfill({ campusMerchantAfterSalesDetail: detailOf(vars.id) });
        if (raw.includes('campusMerchantAfterSales')) {
            const state = vars.state || null;
            const skip = Number(vars.skip ?? 0);
            const take = Number(vars.take ?? 20);
            const matched = state ? ordered.filter((r) => r.state === state) : ordered;
            return fulfill({
                campusMerchantAfterSales: {
                    items: matched.slice(skip, skip + take),
                    pendingCount: pendingCount(),
                    total: matched.length,
                    stateCounts,
                    skip,
                    take,
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
        if (raw.includes('campusMerchantPrepSummary')) return fulfill({ campusMerchantPrepSummary: [] });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p115');
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
    const shot = async (page, name, full = false) => {
        await page.screenshot({ path: path.join(OUT, name), fullPage: full });
        console.log('shot ' + name);
    };
    const { ctx, page } = await newPage(browser);

    const readState = () => page.evaluate(() => {
        const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
        const cards = Array.from(document.querySelectorAll('.as'));
        return {
            pinbar: txt(document.querySelector('.pinbar')),
            pinAction: txt(document.querySelector('.pinbar__a')),
            chips: Array.from(document.querySelectorAll('.flt__i')).map((n) => ({
                text: n.textContent.replace(/\s+/g, '').trim(),
                on: n.classList.contains('on'),
            })),
            cardCount: cards.length,
            failedOnTop: cards.slice(0, 3).map((n) => txt(n.querySelector('.a-code')) + '|' + txt(n.querySelector('.a-state'))),
            failedTotal: cards.filter((n) => txt(n.querySelector('.a-state')).includes('退款失败')).length,
            more: txt(document.querySelector('.more__btn')),
            end: txt(document.querySelector('.more__end')),
        };
    });

    // ── 01 「全部」首屏：置顶汇总条 + 失败单排最前 ──────────────────────────────
    await page.goto(BASE + '#/pages/campus/merchant-after-sales', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.as, .hint', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-pin-banner-first-page.png', true);

    // ── 02 加载更多：25 条全部加载，失败单不重复 ─────────────────────────────────
    await page.locator('.more__btn').click();
    await page.waitForSelector('.more__end', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    await page.locator('.more__end').scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(400);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-load-more-no-dup.png');

    // ── 03 点汇总条 → 「退款失败」筛选：剩 3 条，汇总条隐藏 ──────────────────────
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.pinbar').click();
    await page.waitForFunction(() => document.querySelectorAll('.as').length === 3, null, { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-filter-refund-failed.png');

    // ── 04 切「待处理」：置顶条不出现 ───────────────────────────────────────────
    await page.locator('.flt__i', { hasText: '待处理' }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.as').length === 2, null, { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-filter-pending-no-pin.png');

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
