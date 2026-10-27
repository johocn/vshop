// P3-2 商家经营数据导出 CSV 截图 + 实导出取证（390×844 dpr=2）
//   01 经营设置页「导出 CSV（近 30 日）」按钮与说明
//   02 点击导出：捕获真实下载文件，校验表头/行数/金额口径
//   node scripts/shots-p20-csv-export.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p20-csv-export');
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

// 近 30 日逐日明细（09-28 ~ 10-27），金额单位：分
const DAYS30 = [];
for (let i = 0; i < 30; i++) {
    const orders = i === 29 ? 23 : 12 + ((i * 7) % 18);
    const gross = i === 29 ? 68400 : orders * (2500 + ((i * 130) % 900));
    const cancelled = i % 5 === 0 ? 1 : 0;
    const monthDay = ['09-28', '09-29', '09-30'][i] || `10-${String(i - 2).padStart(2, '0')}`;
    DAYS30.push({ date: monthDay, orders, gross, cancelled, cancelledAmount: cancelled ? 2600 : 0 });
}
const REVENUE = {
    today: { orders: 23, gross: 68400, avgTicket: 2974, cancelled: 1, cancelledAmount: 2600 },
    last7: { orders: 156, gross: 458600, avgTicket: 2940, cancelled: 5, cancelledAmount: 13200 },
    days: DAYS30.slice(-7),
    days30: DAYS30,
};

async function makeRoute(route) {
    const body = route.request().postData() || '';
    const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
    if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
    if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: BOARD });
    if (body.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: PROFILE });
    if (body.includes('campusMerchantRevenue')) return fulfill({ campusMerchantRevenue: REVENUE });
    if (body.includes('me {')) return fulfill({ me: { id: '9' } });
    return fulfill({});
}

async function newPage(browser) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai', acceptDownloads: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p20');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute);
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

    // ── 01 导出入口（近 7 日分段 + 卡片底部导出按钮）─────────
    {
        const { ctx, page } = await newPage(browser);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.export-btn', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const state = await page.evaluate(() => ({
            btn: document.querySelector('.export-btn')?.innerText.replace(/\s+/g, ' ').trim() || '',
            hint: document.querySelector('.export')?.innerText.replace(/\s+/g, ' ').trim() || '',
        }));
        console.log('01 state', JSON.stringify(state));
        await page.evaluate(() => document.querySelector('.export')?.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(400);
        await shot(page, '01-store-settings-export-entry.png', true);
        await ctx.close();
    }

    // ── 02 点击导出：捕获真实 CSV 下载 ─────────────────────
    {
        const { ctx, page } = await newPage(browser);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.export-btn', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 20000 }),
            page.click('.export-btn'),
        ]);
        const csvPath = path.join(OUT, '02-exported-revenue-last30d.csv');
        await download.saveAs(csvPath);
        const name = download.suggestedFilename();
        const buf = fs.readFileSync(csvPath);
        const text = buf.toString('utf8');
        const rows = text.replace(/^\uFEFF/, '').split('\r\n');
        console.log('02 download', JSON.stringify({ name, bytes: buf.length, rows: rows.length }));
        console.log('02 head', JSON.stringify(rows.slice(0, 3)));
        console.log('02 tail', JSON.stringify(rows.slice(-2)));
        await page.waitForTimeout(600);
        await shot(page, '02-store-settings-export-window.png');
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
