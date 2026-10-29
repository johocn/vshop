// §73 工作台批量接单 / 批量出餐 后台截图（390×844 dpr=2）
//   01 待接单 · 多选态（全选 + 已选 N 单 + 批量接单）
//   02 批量接单二次确认弹窗
//   03 备餐中 · 批量出餐态（批量接单成功后单已进入备餐中）
//   node scripts/shots-p73-batch-orders.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p73-batch-orders');
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

const mkOrder = (id, code, minutesAgo, extra = {}) => ({
    id, code,
    createdAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    total: 3250, shipping: 200, building: '3 号宿舍楼', zone: '东区',
    slotText: '尽快送达', route: 'R1', riderName: null, printedAt: null,
    provider: null, thirdPartyNo: null, handoverCode: null,
    lines: [{ name: '宫保鸡丁', quantity: 1, price: 2600 }, { name: '米饭', quantity: 2, price: 300 }],
    ...extra,
});

// 可变的看板：批量接单/出餐后按真实状态机口径搬单（pending → cooking → 出餐离栏）
const BOARD = {
    paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
    merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
    storeName: '第一食堂', storePhone: '13800001111',
    pending: [mkOrder('101', 'A2400007', 6), mkOrder('102', 'A2400008', 18, { zone: '西区', building: '7 号教学楼' })],
    cooking: [mkOrder('103', 'A2400006', 31, { zone: '北区', building: '2 号宿舍楼' })],
    awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
    ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 23, completedTodayAmount: 68400,
    closedToday: false, closureNote: null, unfinishedOrders: 3,
};

/** 解析 GraphQL 请求体（variables 里的 orderIds） */
function pickIds(body) {
    try {
        const parsed = JSON.parse(body);
        return {
            query: String(parsed.query || ''),
            orderIds: (parsed.variables && parsed.variables.orderIds) || [],
        };
    } catch {
        return { query: body, orderIds: [] };
    }
}

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });

        const req = pickIds(body);
        if (req.query.includes('campusMerchantBatchAcceptOrders')) {
            const ids = new Set(req.orderIds.map(String));
            const moved = BOARD.pending.filter((o) => ids.has(o.id));
            BOARD.pending = BOARD.pending.filter((o) => !ids.has(o.id));
            BOARD.cooking = [...moved, ...BOARD.cooking];
            BOARD.unfinishedOrders = BOARD.pending.length + BOARD.cooking.length;
            return fulfill({ campusMerchantBatchAcceptOrders: { ok: moved.length, failed: [] } });
        }
        if (req.query.includes('campusMerchantBatchCookingDoneOrders')) {
            const ids = new Set(req.orderIds.map(String));
            const moved = BOARD.cooking.filter((o) => ids.has(o.id));
            BOARD.cooking = BOARD.cooking.filter((o) => !ids.has(o.id));
            BOARD.unfinishedOrders = BOARD.pending.length + BOARD.cooking.length;
            return fulfill({ campusMerchantBatchCookingDoneOrders: { ok: moved.length, failed: [] } });
        }
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: BOARD });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p73');
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

    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.batchbar', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1200);

    // ── 01 待接单 · 全选多选态 ───────────────────────────────────────────
    await page.locator('.batchbar .b-all').click();
    await page.waitForTimeout(400);
    console.log('01 state', JSON.stringify(await page.evaluate(() => ({
        bar: !!document.querySelector('.batchbar'),
        count: document.querySelector('.batchbar .b-count')?.textContent?.trim() || '',
        act: document.querySelector('.batchbar .b-act')?.textContent?.trim() || '',
        picks: document.querySelectorAll('.card .pick.on').length,
        selectedCards: document.querySelectorAll('.card.selected .code').length,
        codes: Array.from(document.querySelectorAll('.card.selected .code')).map((c) => c.textContent.trim()),
        tabBadge: document.querySelector('.tab.on .pick-badge')?.textContent?.trim() || '',
    }))));
    await shot(page, '01-workbench-batch-select.png');

    // ── 02 批量接单二次确认弹窗 ───────────────────────────────────────────
    await page.locator('.batchbar .b-act').click();
    await page.waitForSelector('.uni-modal__bd', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    console.log('02 state', JSON.stringify(await page.evaluate(() => ({
        modal: !!document.querySelector('.uni-modal__bd'),
        title: document.querySelector('.uni-modal__title')?.textContent?.trim() || '',
        body: document.querySelector('.uni-modal__bd')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        buttons: Array.from(document.querySelectorAll('.uni-modal__btn')).map((b) => b.textContent.trim()),
    }))));
    await shot(page, '02-batch-accept-confirm.png');

    // ── 03 备餐中 · 批量出餐态（确认后单已搬入备餐中） ─────────────────────
    await page.locator('.uni-modal__btn_primary').click();
    await page.waitForTimeout(2200); // 等 toast 消失 + 轮询刷新
    await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('.tabs .tab')).find((x) => x.textContent.includes('备餐中'));
        if (t) t.click();
    });
    await page.waitForTimeout(600);
    await page.locator('.batchbar .b-all').click();
    await page.waitForTimeout(400);
    console.log('03 state', JSON.stringify(await page.evaluate(() => ({
        count: document.querySelector('.batchbar .b-count')?.textContent?.trim() || '',
        act: document.querySelector('.batchbar .b-act')?.textContent?.trim() || '',
        codes: Array.from(document.querySelectorAll('.card.selected .code')).map((c) => c.textContent.trim()),
        pendingEmpty: Array.from(document.querySelectorAll('.tabs .tab')).find((x) => x.textContent.includes('待接单'))?.textContent.trim() || '',
    }))));
    await shot(page, '03-workbench-batch-cooking.png');

    await ctx.close();
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
