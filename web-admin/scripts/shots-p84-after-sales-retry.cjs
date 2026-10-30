// §84 售后异常收口（退款失败置顶 + 一键重试 + 状态筛选）后台截图（390×844 dpr=2）
//   01 列表：退款失败单置顶，卡片带「重试退款」按钮
//   02 重试确认弹窗（订单号与金额写进弹窗）
//   03 重试成功：状态变「已退款」+ toast
//   04 筛选「退款失败」：列表只剩失败单
//   node scripts/shots-p84-after-sales-retry.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p84-after-sales-retry');
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

let rows = [
    {
        id: '811', orderId: '311', orderCode: 'A2400006', state: 'RefundFailed', type: 'refund_only',
        reason: '菜品与描述不符', description: '点的是不辣，实际很辣。',
        refundAmount: 3250, rejectReason: null, evidenceImages: [], messageCount: 1,
        customerName: '李同学', createdAt: at(120), refundedAt: null, overdue: true,
    },
    {
        id: '812', orderId: '312', orderCode: 'A2400007', state: 'RefundFailed', type: 'refund_only',
        reason: '少送商品', description: '少了一份米饭。',
        refundAmount: 1200, rejectReason: null, evidenceImages: [], messageCount: 0,
        customerName: '王同学', createdAt: at(96), refundedAt: null, overdue: false,
    },
    {
        id: '813', orderId: '313', orderCode: 'A2400008', state: 'Rejected', type: 'refund_only',
        reason: '口味差异', description: '口味和上次不一样。',
        refundAmount: 2900, rejectReason: '核查出品记录与顾客描述一致，不符合退款条件',
        evidenceImages: [], messageCount: 2, customerName: '赵同学', createdAt: at(150), refundedAt: null, overdue: false,
    },
    {
        id: '814', orderId: '314', orderCode: 'A2400009', state: 'Refunded', type: 'refund_only',
        reason: '配送超时', description: '等了很久。',
        refundAmount: 200, rejectReason: null, evidenceImages: [], messageCount: 1,
        customerName: '钱同学', createdAt: at(210), refundedAt: at(180), overdue: false,
    },
    {
        id: '815', orderId: '315', orderCode: 'A2400010', state: 'Pending', type: 'refund_only',
        reason: '食品安全', description: '菜里有异物。',
        refundAmount: 1800, rejectReason: null, evidenceImages: [], messageCount: 1,
        customerName: '孙同学', createdAt: at(14), refundedAt: null, overdue: false,
    },
];

const pendingCount = () => rows.filter((r) => r.state === 'Pending').length;

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        let vars = {};
        try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        // 注意：重试 mutation 先于列表查询匹配
        if (raw.includes('campusMerchantAfterSalesRetryRefund')) {
            const row = rows.find((r) => String(r.id) === String(vars.id));
            if (row) {
                row.state = 'Refunded';
                row.refundedAt = at(0);
            }
            return fulfill({ campusMerchantAfterSalesRetryRefund: row });
        }
        if (raw.includes('campusMerchantAfterSales')) {
            const state = vars.state || null;
            return fulfill({
                campusMerchantAfterSales: {
                    items: state ? rows.filter((r) => r.state === state) : rows,
                    pendingCount: pendingCount(),
                    total: rows.length,
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p84');
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
        filters: Array.from(document.querySelectorAll('.flt__i')).map((n) => ({
            text: n.textContent.trim(),
            on: n.classList.contains('on'),
        })),
        cards: Array.from(document.querySelectorAll('.as')).map((r) => ({
            code: r.querySelector('.a-code')?.textContent?.trim() || '',
            state: r.querySelector('.a-state')?.textContent?.trim() || '',
            retry: r.querySelector('.op-retry')?.textContent?.trim() || '',
            failHint: r.querySelector('.op-fail')?.textContent?.trim() || '',
            approve: r.querySelector('.op-approve')?.textContent?.trim() || '',
        })),
        modal: (() => {
            const m = document.querySelector('.uni-modal');
            return m ? m.textContent.replace(/\s+/g, ' ').trim() : '';
        })(),
        toast: (() => {
            const t = document.querySelector('.uni-toast') || document.querySelector('[class*="uni-toast"]');
            return t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
        })(),
    }));

    // ── 01 列表：退款失败置顶 + 重试按钮 ────────────────────────────────────
    await page.goto(BASE + '#/pages/campus/merchant-after-sales', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.as, .hint', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-failed-pinned-retry-entry.png');

    // ── 02 重试确认弹窗 ────────────────────────────────────────────────────
    await page.locator('.op-retry').first().click();
    await page.waitForSelector('.uni-modal', { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-retry-confirm-modal.png');

    // ── 03 确认重试：状态变已退款 + toast ────────────────────────────────────
    await page.locator('.uni-modal__btn_primary').click();
    await page.waitForTimeout(1200);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-retry-success-toast.png');

    // ── 04 筛选「退款失败」：只剩失败单 ──────────────────────────────────────
    await page.locator('.flt__i', { hasText: '退款失败' }).first().click();
    await page.waitForTimeout(700);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-filter-refund-failed.png');

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
