// §117 备餐面板「本面板期间新增 N 单」提示条截图（390×844 dpr=2）
//   01 打开面板：无新单，提示条不出现
//   02 等 11s（board 10s 刷新把新单计入）：提示条「本面板期间新增 1 单」
//   03 再等 10s（又来一单）：提示条「本面板期间新增 2 单」
//   04 关闭面板再打开：计数归零，提示条消失
//   node scripts/shots-p85-prep-new-orders.cjs
//   注：脚本真实等待 ~21s，用真实 board 轮询验证「不用手点也不用重开面板」。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p85-prep-new-orders');
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
const mkOrder = (id, code, minutesAgo) => ({
    id, code, createdAt: at(minutesAgo), total: 2650, shipping: 200,
    building: '3 号宿舍楼', zone: '东区', slotText: '尽快送达', route: 'R1',
    riderName: null, note: null, printedAt: at(minutesAgo), provider: null, thirdPartyNo: null,
    handoverCode: null, customerPhone: '138****1111',
    urged: false, urgedAt: null,
    lines: [{ name: '宫保鸡丁', quantity: 1, price: 2450 }, { name: '米饭', quantity: 1, price: 0 }],
});

// ── mock 演进：第 1 次 board 无单，第 2 次 +1 单，第 3 次再 +1 单（之后的刷新不再新增）──
let boardCalls = 0;
function pendingOf(call) {
    const out = [];
    if (call >= 2) out.push(mkOrder('305', 'A2400005', 1));
    if (call >= 3) out.push(mkOrder('306', 'A2400006', 0.2));
    return out;
}
let prepCalls = 0;
function prepItems() {
    prepCalls += 1;
    const grow = prepCalls - 1;
    return [
        { name: '宫保鸡丁', todoQty: 3 + grow, doneQty: 5, addons: [{ name: '加辣', quantity: 2 }, { name: '多花生', quantity: 1 }] },
        { name: '香菇滑鸡饭', todoQty: 2 + grow, doneQty: 3, addons: [{ name: '加饭', quantity: 1 }] },
        { name: '凉拌黄瓜', todoQty: 1, doneQty: 2, addons: [] },
    ];
}

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantPrepSummary')) return fulfill({ campusMerchantPrepSummary: prepItems() });
        if (raw.includes('campusMerchantBoard')) {
            boardCalls += 1;
            const pending = pendingOf(boardCalls);
            return fulfill({ campusMerchantBoard: {
                paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
                merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
                storeName: 'canteen-a', storePhone: '13800001111',
                pending, cooking: [], awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
                ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
                completedToday: 5, completedTodayAmount: 16250,
                closedToday: false, closureNote: null,
                unfinishedOrders: pending.length, urgedCount: 0,
                afterSalesPending: 0, refundFailed: 0, overdueOrders: 0,
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p117');
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
        open: !!document.querySelector('.prep-sheet'),
        sync: document.querySelector('.ps-sync')?.textContent?.trim() || '',
        newBar: document.querySelector('.ps-new')?.textContent?.trim() || '',
        newBarFont: (() => { const el = document.querySelector('.ps-new'); return el ? getComputedStyle(el).fontSize : ''; })(),
        rows: Array.from(document.querySelectorAll('.ps-row')).map((r) => ({
            name: r.querySelector('.ps-name')?.textContent?.trim() || '',
            todo: r.querySelector('.ps-todo')?.textContent?.trim() || '',
        })),
    }));

    // ── 01 打开面板：尚无新单，提示条不出现 ────────────────────────────────────
    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.entrybar', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    await page.locator('.entrybar', { hasText: '备餐汇总' }).first().click();
    await page.waitForSelector('.prep-sheet', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-prep-panel-no-new-orders.png');

    // ── 02 等 11s：board 刷新把新单计入 ──────────────────────────────────────
    await page.waitForTimeout(11000);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-prep-panel-new-1-order.png');

    // ── 03 再等 10s：又来一单 ────────────────────────────────────────────────
    await page.waitForTimeout(10500);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-prep-panel-new-2-orders.png');

    // ── 04 关闭重开：计数归零，提示条消失 ────────────────────────────────────
    await page.locator('.ps-close').first().click();
    await page.waitForTimeout(400);
    await page.locator('.entrybar', { hasText: '备餐汇总' }).first().click();
    await page.waitForSelector('.prep-sheet', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-prep-panel-reopen-reset.png');

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
