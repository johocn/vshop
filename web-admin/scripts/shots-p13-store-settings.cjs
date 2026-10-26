// P1-3 商家自助经营后台截图（390×844 dpr=2）
//   01 商家工作台「经营设置」入口
//   02 经营设置页：营业中 + 营业时间/公告/电话 + 今日经营数据
//   03 经营设置页：近 7 日分段 + 逐日营业额柱状图
//   04 经营设置页：临时休息（已休息）+ 编辑态
//   node scripts/shots-p13-store-settings.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p13-merchant-self-service');
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

const PROFILE_OPEN = {
    storeName: '第一食堂',
    businessHours: '10:00-14:00,17:00-21:00',
    storeNotice: '今日推出新菜：香菇滑鸡饭，欢迎品尝～',
    storePhone: '13800001111',
    paused: false,
    openNow: true,
};
const PROFILE_PAUSED = { ...PROFILE_OPEN, paused: true, openNow: false };

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

function makeRoute(profileRef) {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: BOARD });
        if (body.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: profileRef.value });
        if (body.includes('campusMerchantRevenue')) return fulfill({ campusMerchantRevenue: REVENUE });
        if (body.includes('campusMerchantSetPaused')) {
            profileRef.value = body.includes('true') ? PROFILE_PAUSED : PROFILE_OPEN;
            return fulfill({ campusMerchantSetPaused: { ok: true } });
        }
        if (body.includes('campusMerchantUpdateStore')) return fulfill({ campusMerchantUpdateStore: profileRef.value });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

async function newPage(browser, initialProfile) {
    const profileRef = { value: initialProfile };
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p13');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute(profileRef));
    return { ctx, page, profileRef };
}

const readState = () => ({
    pill: document.querySelector('.pill')?.textContent?.trim() || '',
    pauseOn: !!document.querySelector('.sw input:checked, .sw[checked]'),
    hours: document.querySelector('.ipt input')?.value || '',
    notice: document.querySelector('.ta textarea')?.value || '',
    phone: document.querySelectorAll('.ipt input')[1]?.value || '',
    presets: Array.from(document.querySelectorAll('.preset')).map((e) => e.textContent.trim()),
    segs: Array.from(document.querySelectorAll('.seg-i')).map((e) => (e.className.includes('on') ? '*' : '') + e.textContent.trim()),
    kpis: Array.from(document.querySelectorAll('.kpi')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    bars: Array.from(document.querySelectorAll('.bar-col')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    saveText: document.querySelector('.save')?.textContent?.trim() || '',
});

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name, full = false) => { await page.screenshot({ path: path.join(OUT, name), fullPage: full }); console.log('shot ' + name); };

    // ── 01 工作台入口 ──────────────────────────────────────
    {
        const { ctx, page } = await newPage(browser, PROFILE_OPEN);
        await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.entrybar', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const state = await page.evaluate(() => ({
            entry: document.querySelector('.entrybar')?.innerText.replace(/\s+/g, ' ').trim() || '',
            stats: Array.from(document.querySelectorAll('.stat')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
        }));
        console.log('01 state', JSON.stringify(state));
        await shot(page, '01-admin-merchant-entry.png');
        await ctx.close();
    }

    // ── 02 经营设置：营业中 / 今日 ─────────────────────────
    {
        const { ctx, page } = await newPage(browser, PROFILE_OPEN);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        console.log('02 state', JSON.stringify(await page.evaluate(readState)));
        await shot(page, '02-admin-store-settings-today.png', true);
        await ctx.close();
    }

    // ── 03 经营设置：近 7 日 + 趋势柱 ──────────────────────
    {
        const { ctx, page } = await newPage(browser, PROFILE_OPEN);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const clicked = await page.evaluate(() => {
            const segs = Array.from(document.querySelectorAll('.seg-i'));
            const el = segs[1];
            if (!el) return false;
            el.click();
            return true;
        });
        console.log('03 switch last7', clicked);
        await page.waitForTimeout(600);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(600);
        console.log('03 state', JSON.stringify(await page.evaluate(readState)));
        await shot(page, '03-admin-store-settings-last7.png', true);
        await ctx.close();
    }

    // ── 04 经营设置：临时休息 + 编辑态 ─────────────────────
    {
        const { ctx, page } = await newPage(browser, PROFILE_PAUSED);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        await page.evaluate(() => {
            const ipt = document.querySelector('.ipt input');
            if (ipt) { ipt.value = '18:00-02:00'; ipt.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        await page.waitForTimeout(500);
        console.log('04 state', JSON.stringify(await page.evaluate(readState)));
        await shot(page, '04-admin-store-settings-paused-edit.png');
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
