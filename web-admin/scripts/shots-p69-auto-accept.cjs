// §69 商家自动接单后台截图（390×844 dpr=2）
//   01 经营设置 · 自动接单卡片（关闭态 + 未开接单确认提示）
//   02 经营设置 · 自动接单卡片（开启态：延迟 5s / 每日上限 2 / 今日已自动接单 1）
//   node scripts/shots-p69-auto-accept.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p69-auto-accept');
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

const BOARD = {
    paused: false, merchantConfirmEnabled: true, printMode: 'off',
    storeName: '第一食堂', storePhone: '13800001111',
    pending: [], cooking: [], awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
    ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 23, completedTodayAmount: 68400,
};

const PROFILE = {
    storeName: '第一食堂',
    businessHours: '10:00-14:00,17:00-21:00',
    storeNotice: '今日推出新菜：香菇滑鸡饭，欢迎品尝～',
    storePhone: '13800001111',
    paused: false,
    openNow: true,
};

const REVENUE = {
    today: { orders: 23, gross: 68400, avgTicket: 2974, cancelled: 1, cancelledAmount: 2600 },
    last7: { orders: 156, gross: 458600, avgTicket: 2940, cancelled: 5, cancelledAmount: 13200 },
    days: [
        { date: '10-21', orders: 18, gross: 52800 },
        { date: '10-22', orders: 25, gross: 74500 },
        { date: '10-23', orders: 21, gross: 61200 },
        { date: '10-24', orders: 30, gross: 89200 },
        { date: '10-25', orders: 24, gross: 68900 },
        { date: '10-26', orders: 15, gross: 43600 },
        { date: '10-27', orders: 23, gross: 68400 },
    ],
};

const AUTO_OFF = {
    enabled: false, delaySeconds: 30, dailyLimit: 0, routes: ['R1', 'R2', 'R3'],
    acceptedToday: 0, openNow: true, merchantConfirmEnabled: false,
};
const AUTO_ON = {
    enabled: true, delaySeconds: 5, dailyLimit: 2, routes: ['R1', 'R2', 'R3'],
    acceptedToday: 1, openNow: true, merchantConfirmEnabled: true,
};

function makeRoute(autoRef) {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: BOARD });
        if (body.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: PROFILE });
        if (body.includes('campusMerchantRevenue')) return fulfill({ campusMerchantRevenue: REVENUE });
        if (body.includes('campusMerchantUpdateAutoAccept')) {
            autoRef.value = { ...autoRef.value, ...(body.includes('true') ? { enabled: true } : {}) };
            return fulfill({ campusMerchantUpdateAutoAccept: autoRef.value });
        }
        if (body.includes('campusMerchantAutoAccept')) return fulfill({ campusMerchantAutoAccept: autoRef.value });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

async function newPage(browser, initialAuto) {
    const autoRef = { value: initialAuto };
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p69');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute(autoRef));
    return { ctx, page, autoRef };
}

const readAuto = () => {
    const card = Array.from(document.querySelectorAll('.card')).find((c) => {
        const t = c.querySelector('.title');
        return t && t.textContent.includes('自动接单');
    });
    if (!card) return { found: false };
    return {
        found: true,
        pill: card.querySelector('.pill')?.textContent?.trim() || '',
        on: !!card.querySelector('.sw input:checked, .sw[checked]'),
        inputs: Array.from(card.querySelectorAll('.ipt input')).map((i) => i.value),
        tips: Array.from(card.querySelectorAll('.tip, .next')).map((e) => e.textContent.trim()),
        chips: Array.from(card.querySelectorAll('.preset')).map((e) => (e.className.includes('on') ? '*' : '') + e.textContent.trim()),
        save: card.querySelector('.save')?.textContent?.trim() || '',
    };
};

async function scrollToAuto(page) {
    const ok = await page.evaluate(() => {
        const card = Array.from(document.querySelectorAll('.card')).find((c) => {
            const t = c.querySelector('.title');
            return t && t.textContent.includes('自动接单');
        });
        if (!card) return false;
        card.scrollIntoView({ block: 'start' });
        return true;
    });
    await page.waitForTimeout(700);
    return ok;
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name, full = false) => { await page.screenshot({ path: path.join(OUT, name), fullPage: full }); console.log('shot ' + name); };

    // ── 01 自动接单：关闭态 ────────────────────────────────
    {
        const { ctx, page } = await newPage(browser, AUTO_OFF);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        await scrollToAuto(page);
        console.log('01 state', JSON.stringify(await page.evaluate(readAuto)));
        await shot(page, '01-admin-auto-accept-off.png', true);
        await ctx.close();
    }

    // ── 02 自动接单：开启态 ────────────────────────────────
    {
        const { ctx, page } = await newPage(browser, AUTO_ON);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        await scrollToAuto(page);
        console.log('02 state', JSON.stringify(await page.evaluate(readAuto)));
        await shot(page, '02-admin-auto-accept-on.png', true);
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
