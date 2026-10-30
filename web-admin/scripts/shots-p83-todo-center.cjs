// §83 商家工作台「今日待办」中心截图（390×844 dpr=2）
//   01 待办条（有数）：售后 2 · 催单 1 · 退款失败 1 · 出餐超时 1，入口条带角标
//   02 待办条（清零）：4 项全 0 → 整条不占位，角标消失
//   03 仅两类待办：只剩「售后 3 · 退款失败 2」，0 的项不渲染
//   node scripts/shots-p83-todo-center.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p83-todo-center');
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

// 三种待办状态：1=有数 2=全清零 3=只有售后与退款失败
const MODES = {
    1: { afterSalesPending: 2, urgedCount: 1, refundFailed: 1, overdueOrders: 1 },
    2: { afterSalesPending: 0, urgedCount: 0, refundFailed: 0, overdueOrders: 0 },
    3: { afterSalesPending: 3, urgedCount: 0, refundFailed: 2, overdueOrders: 0 },
};
let mode = 1;

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantPrepSummary')) return fulfill({ campusMerchantPrepSummary: [] });
        if (raw.includes('campusMerchantBoard')) {
            const counts = MODES[mode];
            return fulfill({ campusMerchantBoard: {
                paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
                merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
                storeName: 'canteen-a', storePhone: '13800001111',
                pending: [], cooking: [], awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
                ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
                completedToday: 23, completedTodayAmount: 68400,
                closedToday: false, closureNote: null, unfinishedOrders: 0,
                ...counts,
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p83');
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
        todoBar: !!document.querySelector('.todobar'),
        title: document.querySelector('.t-lbl')?.textContent?.trim() || '',
        chips: Array.from(document.querySelectorAll('.t-chip')).map((n) => ({
            text: n.textContent.replace(/\s+/g, ' ').trim(),
            warn: n.classList.contains('warn'),
        })),
        badges: Array.from(document.querySelectorAll('.e-badge')).map((n) => n.textContent.trim()),
    }));

    let first = true;
    const goto = async (m) => {
        mode = m;
        if (first) {
            first = false;
            await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
        } else {
            // 仅改 hash 不会重新加载应用，必须整页 reload 才能读到新的 mock 计数
            await page.reload({ waitUntil: 'load', timeout: 60000 });
        }
        await page.waitForSelector('.entrybar', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1000);
    };

    // ── 01 有数：四个待办 chip + 入口角标 ────────────────────────────────────
    await goto(1);
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-todo-bar-with-counts.png');

    // ── 02 清零：待办条整条消失 ──────────────────────────────────────────────
    await goto(2);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-todo-bar-cleared.png');

    // ── 03 只有两类：0 的项不渲染 ────────────────────────────────────────────
    await goto(3);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-todo-bar-partial.png');

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
