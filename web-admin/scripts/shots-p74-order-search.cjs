// §74 工作台订单检索 / 筛选 / 按楼栋分组 后台截图（390×844 dpr=2）
//   01 关键词检索命中（单号/楼栋/备注/手机尾号）· 结果计数 共 N / M 单
//   02 按楼栋分组拣单（组头：楼栋 + 单数 + 最早等待）
//   03 检索无结果专属空态（附「清除筛选」）
//   node scripts/shots-p74-order-search.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p74-order-search');
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

/** 顾客手机为脱敏号（与后端号码保护同口径），前端不做二次脱敏 */
const mkOrder = (id, code, minutesAgo, extra = {}) => ({
    id, code,
    createdAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    total: 3250, shipping: 200, building: '3 号宿舍楼', zone: '东区',
    slotText: '尽快送达', route: 'R1', riderName: null, printedAt: null,
    provider: null, thirdPartyNo: null, handoverCode: null, customerPhone: '138****1111',
    lines: [{ name: '宫保鸡丁', quantity: 1, price: 2600 }, { name: '米饭', quantity: 2, price: 300 }],
    ...extra,
});

const BOARD = {
    paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
    merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
    storeName: '第一食堂', storePhone: '13800001111',
    pending: [
        mkOrder('101', 'A2400007', 6, { customerPhone: '138****1111', note: '加辣，多花生' }),
        mkOrder('102', 'A2400008', 18, { zone: '西区', building: '7 号教学楼', customerPhone: '139****2222' }),
        mkOrder('103', 'A2400009', 25, { building: '1 号宿舍楼', customerPhone: '137****3333' }),
        mkOrder('104', 'A2400010', 2, { customerPhone: '136****4444', note: '不要香菜' }),
    ],
    cooking: [mkOrder('105', 'A2400006', 31, { zone: '北区', building: '2 号宿舍楼', customerPhone: '135****5555', route: 'R2' })],
    awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
    ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 23, completedTodayAmount: 68400,
    closedToday: false, closureNote: null, unfinishedOrders: 5,
};

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p74');
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
    await page.waitForSelector('.searchbar', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1200);

    // ── 01 关键词检索命中（楼栋关键词命中 3 单 / 本栏 4 单）───────────────
    await page.locator('.searchbar .s-input input').fill('宿舍');
    await page.waitForTimeout(600);
    console.log('01 state', JSON.stringify(await page.evaluate(() => ({
        count: document.querySelector('.countbar .c-txt')?.textContent?.trim() || '',
        clear: document.querySelector('.countbar .c-clear')?.textContent?.trim() || '',
        cards: Array.from(document.querySelectorAll('.card .code')).map((c) => c.textContent.trim()),
        phones: Array.from(document.querySelectorAll('.card .phone-lbl')).map((c) => c.textContent.trim()),
        chips: Array.from(document.querySelectorAll('.filters .f-chip')).map((c) => c.textContent.trim()),
        tabs: Array.from(document.querySelectorAll('.tabs .tab')).map((t) => t.textContent.trim()),
    }))));
    await shot(page, '01-workbench-order-search-hit.png');

    // ── 02 按楼栋分组拣单（组头：楼栋 + 单数 + 最早等待）────────────────
    await page.locator('.countbar .c-clear').click();
    await page.waitForTimeout(400);
    await page.locator('.filters .f-group').click();
    await page.waitForTimeout(600);
    console.log('02 state', JSON.stringify(await page.evaluate(() => ({
        groupOn: !!document.querySelector('.filters .f-group.on'),
        heads: Array.from(document.querySelectorAll('.group-head')).map((h) => ({
            name: h.querySelector('.gh-name')?.textContent?.trim() || '',
            num: h.querySelector('.gh-num')?.textContent?.trim() || '',
            wait: h.querySelector('.gh-wait')?.textContent?.trim() || '',
        })),
        cards: Array.from(document.querySelectorAll('.card .code')).map((c) => c.textContent.trim()),
    }))));
    await shot(page, '02-workbench-group-by-building.png');

    // ── 03 检索无结果专属空态 ────────────────────────────────────────────
    await page.locator('.searchbar .s-input input').fill('zzz');
    await page.waitForTimeout(600);
    console.log('03 state', JSON.stringify(await page.evaluate(() => ({
        empty: !!document.querySelector('.hint.empty'),
        text: document.querySelector('.hint.empty text')?.textContent?.trim() || '',
        act: document.querySelector('.hint.empty .empty-act')?.textContent?.trim() || '',
        count: document.querySelector('.countbar .c-txt')?.textContent?.trim() || '',
        cards: document.querySelectorAll('.card').length,
        batchbar: !!document.querySelector('.batchbar'),
    }))));
    await shot(page, '03-workbench-order-search-empty.png');

    await ctx.close();
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
