// §71 休业日未出餐订单提醒 后台截图（390×844 dpr=2）
//   01 商家工作台 · 今日休业 + 未出餐提醒条（红色，点击直达待接单/备餐中）
//   02 经营设置 · 营业日历卡内同款未出餐提醒
//   node scripts/shots-p71-closure-unfinished.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p71-closure-unfinished');
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

const BOARD = {
    paused: false, openNow: false, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
    merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
    storeName: '第一食堂', storePhone: '13800001111',
    pending: [mkOrder('101', 'A2400007', 6), mkOrder('102', 'A2400008', 18, { zone: '西区', building: '7 号教学楼' })],
    cooking: [mkOrder('103', 'A2400006', 31, { zone: '北区', building: '2 号宿舍楼' })],
    awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
    ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 23, completedTodayAmount: 68400,
    closedToday: true, closureNote: '设备检修', unfinishedOrders: 3,
};

const PROFILE_CLOSED = {
    storeName: '第一食堂',
    businessHours: '10:00-14:00,17:00-21:00',
    storeNotice: '今日推出新菜：香菇滑鸡饭，欢迎品尝～',
    storePhone: '13800001111',
    paused: false,
    openNow: false,
    closedToday: true,
    closureNote: '设备检修',
    closureDates: [
        { date: '2026-10-29', note: '设备检修' },
        { date: '2026-11-01', note: '校园运动会' },
    ],
    nextTransition: null,
    unfinishedOrders: 3,
};

function makeRoute(profile) {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: BOARD });
        if (body.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: profile });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

async function newPage(browser, profile) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p71');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute(profile));
    return { ctx, page };
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name, full = false) => { await page.screenshot({ path: path.join(OUT, name), fullPage: full }); console.log('shot ' + name); };

    // ── 01 商家工作台：今日休业 + 未出餐提醒条 ────────────────────────────
    {
        const { ctx, page } = await newPage(browser, PROFILE_CLOSED);
        await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.closedbar', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        console.log('01 state', JSON.stringify(await page.evaluate(() => ({
            bar: !!document.querySelector('.closedbar'),
            barText: document.querySelector('.closedbar .c-lbl')?.textContent?.trim() || '',
            tabs: Array.from(document.querySelectorAll('.tabs .tab')).map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
            cards: Array.from(document.querySelectorAll('.card .code')).map((c) => c.textContent.trim()),
        }))));
        await shot(page, '01-admin-workbench-closed-unfinished.png');
        await ctx.close();
    }

    // ── 02 经营设置：营业日历卡内未出餐提醒 ────────────────────────────
    {
        const { ctx, page } = await newPage(browser, PROFILE_CLOSED);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const ok = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.card')).find((c) => {
                const t = c.querySelector('.title');
                return t && t.textContent.includes('营业日历');
            });
            if (!card) return false;
            card.scrollIntoView({ block: 'start' });
            return true;
        });
        await page.waitForTimeout(600);
        console.log('02 state', JSON.stringify(await page.evaluate(() => ({
            found: !!document.querySelector('.unfinished'),
            hint: document.querySelector('.unfinished')?.textContent?.replace(/\s+/g, ' ').trim() || '',
            closureTodayHint: Array.from(document.querySelectorAll('.next'))[0]?.textContent?.replace(/\s+/g, ' ').trim() || '',
        }))));
        console.log('02 scroll', ok);
        await shot(page, '02-admin-store-settings-unfinished.png', true);
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
