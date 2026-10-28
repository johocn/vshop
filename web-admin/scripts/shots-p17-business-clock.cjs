// P17 营业时间自动开关门 + 打烊前提醒（后台）截图（390×844 dpr=2）
//   01 工作台：营业中 + 下次打烊倒计时（橙条）
//   02 工作台：已打烊（营业时间外）+ 下次开门倒计时 + 打烊前横幅提醒
//   03 经营设置：下次打烊倒计时 + 打烊前提醒开关
//   node scripts/shots-p17-business-clock.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p17-business-clock');
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

const BOARD_OPEN = {
    paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00',
    nextTransition: { action: 'close', at: '21:00', inMinutes: 12, today: true },
    merchantConfirmEnabled: true, printMode: 'off',
    storeName: '第一食堂', storePhone: '13800001111',
    pending: [{
        id: '301', code: 'A2400031', createdAt: new Date().toISOString(), total: 3650, shipping: 200,
        building: '3 号楼', zone: '东区', slotText: '尽快送达', route: 'R1', riderName: null,
        note: null, printedAt: null, provider: null, thirdPartyNo: null, handoverCode: null,
        lines: [{ name: '宫保鸡丁', quantity: 1, price: 2200 }],
    }],
    cooking: [], awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
    ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 23, completedTodayAmount: 68400,
};

const BOARD_CLOSED = {
    ...BOARD_OPEN,
    openNow: false,
    nextTransition: { action: 'open', at: '10:00', inMinutes: 674, today: false },
    pending: [],
};

const PROFILE_CLOSING = {
    storeName: '第一食堂',
    businessHours: '10:00-14:00,17:00-21:00',
    storeNotice: '今日推出新菜：香菇滑鸡饭，欢迎品尝～',
    storePhone: '13800001111',
    paused: false,
    openNow: true,
    nextTransition: { action: 'close', at: '21:00', inMinutes: 12, today: true },
};

const REVENUE = {
    today: { orders: 23, gross: 68400, avgTicket: 2974, cancelled: 1, cancelledAmount: 2600 },
    last7: { orders: 156, gross: 458600, avgTicket: 2940, cancelled: 5, cancelledAmount: 13200 },
    days: [
        { date: '10-22', orders: 25, gross: 74500 },
        { date: '10-23', orders: 21, gross: 61200 },
        { date: '10-24', orders: 30, gross: 89200 },
        { date: '10-25', orders: 24, gross: 68900 },
        { date: '10-26', orders: 15, gross: 43600 },
        { date: '10-27', orders: 23, gross: 68400 },
        { date: '10-28', orders: 23, gross: 68400 },
    ],
};

function makeRoute(board) {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: board });
        if (body.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: PROFILE_CLOSING });
        if (body.includes('campusMerchantRevenue')) return fulfill({ campusMerchantRevenue: REVENUE });
        if (body.includes('campusMerchantSetPaused')) return fulfill({ campusMerchantSetPaused: { ok: true } });
        if (body.includes('campusMerchantUpdateStore')) return fulfill({ campusMerchantUpdateStore: PROFILE_CLOSING });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

async function newPage(browser, board) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p17');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
        localStorage.removeItem('closingWarnFiredAt');
        localStorage.removeItem('closingWarnMuted');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    await page.route('**/admin-api', makeRoute(board));
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

    // ── 01 工作台：营业中 + 打烊倒计时（打烊前 12 分钟，横幅+橙条同屏） ──
    {
        const { ctx, page } = await newPage(browser, BOARD_OPEN);
        await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.clockbar', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        const state = await page.evaluate(() => ({
            clock: document.querySelector('.clockbar')?.innerText.trim() || '',
            warn: !!document.querySelector('.clockbar.warn'),
            banner: Array.from(document.querySelectorAll('body > div'))
                .map((e) => e.innerText || '').find((t) => t.includes('打烊提醒')) || '',
            switchLbl: document.querySelector('.switch-lbl')?.textContent?.trim() || '',
        }));
        console.log('01 state', JSON.stringify(state));
        await shot(page, '01-admin-board-closing-soon.png');
        await ctx.close();
    }

    // ── 02 工作台：已打烊（营业时间外）+ 下次开门倒计时 ──
    {
        const { ctx, page } = await newPage(browser, BOARD_CLOSED);
        await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.clockbar', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        const state = await page.evaluate(() => ({
            clock: document.querySelector('.clockbar')?.innerText.trim() || '',
            switchLbl: document.querySelector('.switch-lbl')?.textContent?.trim() || '',
        }));
        console.log('02 state', JSON.stringify(state));
        await shot(page, '02-admin-board-closed-by-hours.png');
        await ctx.close();
    }

    // ── 03 经营设置：下次打烊倒计时 + 打烊前提醒开关 ──
    {
        const { ctx, page } = await newPage(browser, BOARD_OPEN);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        const state = await page.evaluate(() => ({
            pill: document.querySelector('.pill')?.innerText.trim() || '',
            next: document.querySelector('.next')?.innerText.trim() || '',
            rows: Array.from(document.querySelectorAll('.row .row-lbl')).map((e) => e.textContent.trim()),
            banner: Array.from(document.querySelectorAll('body > div'))
                .map((e) => e.innerText || '').find((t) => t.includes('打烊提醒')) || '',
        }));
        console.log('03 state', JSON.stringify(state));
        await shot(page, '03-admin-settings-next-close.png');
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
