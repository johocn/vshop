// §79 商家工作台备餐汇总 后台截图（390×844 dpr=2）
//   01 工作台入口「备餐汇总」→ 面板：商品待做份数 + 加料份数 + 已出参考
//   02 面板底部「复制备货清单」→ toast「清单已复制」
//   node scripts/shots-p79-prep-summary.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p79-prep-summary');
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

const mkOrder = (id, code, minutesAgo, extra = {}) => ({
    id, code, createdAt: at(minutesAgo), total: 3250, shipping: 200,
    building: '3 号宿舍楼', zone: '东区', slotText: '尽快送达', route: 'R1',
    riderName: null, note: null, printedAt: at(minutesAgo), provider: null, thirdPartyNo: null,
    handoverCode: null, customerPhone: '138****1111',
    urged: false, urgedAt: null,
    lines: [{ name: '宫保鸡丁', quantity: 1, price: 2650 }, { name: '米饭', quantity: 2, price: 0 }],
    ...extra,
});

const board = {
    paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
    merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
    storeName: 'canteen-a', storePhone: '13800001111',
    pending: [mkOrder('301', 'A2400001', 4, { note: '不要香菜' })],
    cooking: [mkOrder('302', 'A2400002', 12, { total: 2600, lines: [{ name: '香菇滑鸡饭', quantity: 1, price: 2400 }] })],
    awaitingRider: [], delivering: [],
    pendingDispatch: [], thirdParty: [], ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 3, completedTodayAmount: 9750,
    closedToday: false, closureNote: null, unfinishedOrders: 2, urgedCount: 0,
};

/** 备餐汇总（§79）：待做 = 待接单 + 备餐中；已出 = 今日已送达份数 */
const prep = [
    {
        name: '宫保鸡丁', pendingQty: 2, cookingQty: 1, doneQty: 5, todoQty: 3, totalQty: 8,
        addons: [{ name: '加辣', quantity: 3 }, { name: '多花生', quantity: 2 }],
    },
    {
        name: '香菇滑鸡饭', pendingQty: 1, cookingQty: 0, doneQty: 2, todoQty: 1, totalQty: 3,
        addons: [{ name: '加饭', quantity: 2 }],
    },
    { name: '米饭', pendingQty: 3, cookingQty: 1, doneQty: 7, todoQty: 4, totalQty: 11, addons: [] },
];

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: board });
        if (body.includes('campusMerchantPrepSummary')) return fulfill({ campusMerchantPrepSummary: prep });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p79');
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
        entry: document.querySelector('.entrybar .e-lbl:last-of-type')?.textContent?.trim() || '',
        open: !!document.querySelector('.prep-sheet'),
        title: document.querySelector('.prep-sheet .ps-title')?.textContent?.trim() || '',
        rows: Array.from(document.querySelectorAll('.prep-sheet .ps-row')).map((r) => ({
            name: r.querySelector('.ps-name')?.textContent?.trim() || '',
            addons: r.querySelector('.ps-addons')?.textContent?.trim() || '',
            todo: r.querySelector('.ps-todo')?.textContent?.trim() || '',
            done: r.querySelector('.ps-done')?.textContent?.trim() || '',
        })),
        buttons: Array.from(document.querySelectorAll('.prep-sheet .ps-btn')).map((b) => b.textContent.trim()),
        toast: document.querySelector('.uni-toast')?.textContent?.trim() || '',
    }));

    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.tabs', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1500);

    // ── 01 打开「备餐汇总」面板：待做份数 + 加料份数 + 已出参考 ─────────────
    await page.locator('.entrybar', { hasText: '备餐汇总' }).first().click();
    await page.waitForSelector('.prep-sheet', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-prep-summary-sheet.png');

    // ── 02 复制备货清单：toast 回执 ─────────────────────────────────────
    await page.locator('.prep-sheet .ps-btn').last().click();
    await page.waitForTimeout(400);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-prep-copy-toast.png');

    await ctx.close();
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
