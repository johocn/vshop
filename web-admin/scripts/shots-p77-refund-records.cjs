// §77 商家退款记录台账 + 工作台退款入口 后台截图（390×844 dpr=2）
//   01 退款台账：区间汇总（笔数/金额/失败笔数）+ 明细（来源/失败状态）
//   02 检索命中：单号后 4 位
//   03 空态：该区间无退款记录
//   04 工作台「已送达 · 可退款」入口
//   05 工作台退款面板（与对账页共用组件）
//   node scripts/shots-p77-refund-records.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p77-refund-records');
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

const NOW = new Date().toISOString();
const START = new Date(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00+08:00').toISOString();
const at = (minAgo) => new Date(Date.now() - minAgo * 60 * 1000).toISOString();

/** 退款单（§77）：source=merchant 商家发起 / platform 平台处置；Failed 单独留痕 */
const refunds = [
    { id: '901', orderId: '201', code: 'A2400001', amount: 800, state: 'Settled', reason: '少送一份米饭，按差额退款', source: 'merchant', createdAt: at(3), building: '3 号宿舍楼', zone: '东区' },
    { id: '902', orderId: '202', code: 'A2400002', amount: 2600, state: 'Settled', reason: '菜里有异物，全额退款', source: 'merchant', createdAt: at(26), building: '1 号教学楼', zone: '西区' },
    { id: '903', orderId: '203', code: 'A2400003', amount: 4500, state: 'Settled', reason: '商家缺货拒单，全额退款', source: 'platform', createdAt: at(52), building: '5 号宿舍楼', zone: '' },
    { id: '904', orderId: '205', code: 'A2400005', amount: 1200, state: 'Failed', reason: '餐洒漏，部分退款', source: 'merchant', createdAt: at(78), building: '7 号教学楼', zone: '西区' },
    { id: '905', orderId: '204', code: 'A2400004', amount: 2000, state: 'Settled', reason: '配送超时补偿', source: 'platform', createdAt: at(95), building: '3 号宿舍楼', zone: '东区' },
];

/** 区间汇总：成功笔数/金额排除 Failed，失败单只计数留痕 */
function refundSnapshot(list) {
    const ok = list.filter((r) => r.state !== 'Failed');
    const bad = list.filter((r) => r.state === 'Failed');
    return {
        items: list,
        count: ok.length,
        amount: ok.reduce((s, r) => s + r.amount, 0),
        failedCount: bad.length,
        failedAmount: bad.reduce((s, r) => s + r.amount, 0),
        total: list.length,
        start: START,
        end: NOW,
    };
}

/** 今日已完成订单（工作台退款入口 + 对账页共用） */
const mkDone = (id, code, minutesAgo, extra = {}) => ({
    id, code,
    deliveredAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - (minutesAgo + 25) * 60 * 1000).toISOString(),
    total: 3250, refundAmount: 0, refundable: 3250, netAmount: 3250,
    building: '3 号宿舍楼', zone: '东区', route: 'R1', riderName: null,
    customerPhone: '138****1111', lineText: '宫保鸡丁×1、米饭×2', note: null,
    ...extra,
});
const doneItems = [
    mkDone('201', 'A2400001', 3, { total: 3250, refundAmount: 800, refundable: 2450, netAmount: 2450 }),
    mkDone('202', 'A2400002', 26, { total: 2800, refundAmount: 2600, refundable: 200, netAmount: 200, building: '1 号教学楼', zone: '西区', lineText: '香菇滑鸡饭×1' }),
    mkDone('203', 'A2400003', 52, { total: 4500, refundAmount: 4500, refundable: 0, netAmount: 0, building: '5 号宿舍楼', lineText: '套餐·双人餐×1、可乐×2' }),
    mkDone('204', 'A2400004', 95, { total: 6100, refundAmount: 2000, refundable: 4100, netAmount: 4100, lineText: '红烧肉×2、米饭×3' }),
];
function doneSnapshot() {
    const totalAmount = doneItems.reduce((s, o) => s + o.total, 0);
    const refundAmount = doneItems.reduce((s, o) => s + o.refundAmount, 0);
    return {
        items: doneItems, total: doneItems.length, totalAmount, refundAmount,
        netAmount: totalAmount - refundAmount,
        avgTicket: Math.round((totalAmount - refundAmount) / doneItems.length),
        start: START, end: NOW,
    };
}

/** 工作台看板：一条待接单（供截图有真实感），其余列空 */
const boardOrder = {
    id: '301', code: 'A2400006', createdAt: at(4), total: 2900, shipping: 200,
    building: '2 号宿舍楼', zone: '北区', slotText: '尽快送达', route: 'R1',
    riderName: null, note: '不要香菜', printedAt: null, provider: null, thirdPartyNo: null,
    handoverCode: null, customerPhone: '138****6666',
    lines: [{ name: '香菇滑鸡饭', quantity: 1, price: 2690 }, { name: '米饭', quantity: 1, price: 0 }],
};
const board = {
    paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
    merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
    storeName: 'canteen-a', storePhone: '13800001111',
    pending: [boardOrder], cooking: [], awaitingRider: [], delivering: [],
    pendingDispatch: [], thirdParty: [], ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: doneItems.length,
    completedTodayAmount: doneItems.reduce((s, o) => s + o.total, 0),
    closedToday: false, closureNote: null, unfinishedOrders: 1,
};

/** 空态开关：切换「近 7 日」时返回空台账 */
let emptyMode = false;

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: board });
        if (body.includes('campusMerchantRefunds')) {
            const vars = JSON.parse(body).variables || {};
            // 近 7 日且 emptyMode：返回空台账，用于空态截图
            const list = emptyMode && String(vars.from || '') !== START ? [] : refunds;
            const payload = { campusMerchantRefunds: refundSnapshot(list) };
            return fulfill(payload);
        }
        if (body.includes('campusMerchantCompletedOrders')) return fulfill({ campusMerchantCompletedOrders: doneSnapshot() });
        if (body.includes('campusMerchantRefundOrder')) {
            const vars = JSON.parse(body).variables || {};
            const done = doneItems.find((o) => String(o.id) === String(vars.orderId));
            if (done) {
                done.refundAmount += vars.amount;
                done.refundable -= vars.amount;
                done.netAmount = done.total - done.refundAmount;
            }
            return fulfill({
                campusMerchantRefundOrder: { ok: true, amount: vars.amount, refundedTotal: done ? done.refundAmount : 0, refundable: done ? done.refundable : 0 },
            });
        }
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p77');
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

    const readLedger = () => page.evaluate(() => ({
        kpis: Array.from(document.querySelectorAll('.card .kpi')).map((k) => k.textContent.trim().replace(/\s+/g, ' ')),
        failedTip: document.querySelector('.failed-tip')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        rows: Array.from(document.querySelectorAll('.list .refund')).map((r) => ({
            code: r.querySelector('.r-code')?.textContent?.trim() || '',
            amount: r.querySelector('.r-amount')?.textContent?.trim() || '',
            src: r.querySelector('.r-src')?.textContent?.trim() || '',
            state: r.querySelector('.r-state')?.textContent?.trim() || '',
            reason: r.querySelector('.r-reason')?.textContent?.trim() || '',
        })),
        count: document.querySelector('.count')?.textContent?.trim() || '',
        empty: document.querySelector('.hint.empty')?.textContent?.trim().replace(/\s+/g, ' ') || '',
    }));
    const readBoard = () => page.evaluate(() => ({
        box: !!document.querySelector('.refund-box'),
        rows: Array.from(document.querySelectorAll('.rb-row')).map((r) => ({
            code: r.querySelector('.rb-code')?.textContent?.trim() || '',
            place: r.querySelector('.rb-place')?.textContent?.trim().replace(/\s+/g, ' ') || '',
            btn: r.querySelector('.rb-btn')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        })),
        sheet: document.querySelector('.sheet') ? {
            title: document.querySelector('.sheet__t')?.textContent?.trim() || '',
            sub: document.querySelector('.sheet__sub')?.textContent?.trim().replace(/\s+/g, ' ') || '',
            kpis: Array.from(document.querySelectorAll('.sheet__kpis > text')).map((t) => t.textContent.trim().replace(/\s+/g, ' ')),
            amount: (document.querySelector('.sheet__input input'))?.value ?? '',
        } : null,
    }));

    // ── 01 退款台账列表 ──────────────────────────────────────────────────
    await page.goto(BASE + '#/pages/campus/refund-records', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.card .kpis', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    console.log('01 state', JSON.stringify(await readLedger()));
    await shot(page, '01-refund-ledger.png');

    // ── 02 检索命中：单号后 4 位 ──────────────────────────────────────────
    await page.locator('.searchbar .s-input input').fill('0001');
    await page.waitForTimeout(400);
    console.log('02 state', JSON.stringify(await readLedger()));
    await shot(page, '02-refund-ledger-search-hit.png');

    // ── 03 空态：切到近 7 日（mock 返回空）────────────────────────────────
    await page.locator('.searchbar .s-clear').click();
    await page.waitForTimeout(300);
    emptyMode = true;
    await page.locator('.seg .seg-i').nth(1).click();
    await page.waitForTimeout(1000);
    console.log('03 state', JSON.stringify(await readLedger()));
    await shot(page, '03-refund-ledger-empty.png');

    // ── 04 工作台「已送达 · 可退款」入口 ─────────────────────────────────
    emptyMode = false;
    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.tabs', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    console.log('04 state', JSON.stringify(await readBoard()));
    await shot(page, '04-workbench-refund-entry.png');

    // ── 05 工作台退款面板（部分退款金额 + 原因）────────────────────────────
    await page.locator('.rb-row').first().locator('.rb-btn').click();
    await page.waitForTimeout(400);
    await page.locator('.sheet__input input').fill('8');
    await page.locator('.sheet__area textarea').fill('少送一份米饭，按差额退款');
    await page.waitForTimeout(300);
    console.log('05 state', JSON.stringify(await readBoard()));
    await shot(page, '05-workbench-refund-sheet.png');

    await ctx.close();
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
