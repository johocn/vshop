// §121 备餐面板「新增 N 单」提示条可点直达截图（390×844 dpr=2）
//   01 打开面板：无新单，提示条不出现
//   02 等 11s：提示条「本面板期间新增 1 单 · 去接单 ›」
//   03 点提示条：面板关闭 + 切到「待接单」+ 立即拉取看板（<1s 内出现新单卡，不等 10s 轮询）
//   node scripts/shots-p121-prep-new-jump.cjs
//   注：脚本真实等待 ~12s 让 board 轮询产出一单，再点提示条验证「立即刷新」。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p121-prep-new-jump');
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

// ── mock：第 1 次 board 无单（面板打开时打底），第 2 次起 +1 单（10s 轮询记为新增）──
let boardCalls = 0;
function pendingOf(call) {
    return call >= 2 ? [mkOrder('305', 'A2400005', 0.5)] : [];
}
let prepCalls = 0;
function prepItems() {
    prepCalls += 1;
    const grow = Math.min(prepCalls - 1, 1);
    return [
        { name: '宫保鸡丁', todoQty: 3 + grow, doneQty: 5, addons: [{ name: '加辣', quantity: 2 }, { name: '多花生', quantity: 1 }] },
        { name: '香菇滑鸡饭', todoQty: 2, doneQty: 3, addons: [{ name: '加饭', quantity: 1 }] },
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p121');
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
        newBar: document.querySelector('.ps-new')?.textContent?.trim() || '',
        activeTab: document.querySelector('.tabs .tab.on')?.textContent?.trim() || '',
        cards: Array.from(document.querySelectorAll('.card')).map((c) => c.textContent.trim().slice(0, 40)),
    }));

    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.entrybar', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    await page.locator('.entrybar', { hasText: '备餐汇总' }).first().click();
    await page.waitForSelector('.prep-sheet', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const s1 = await readState();
    console.log('01 state', JSON.stringify(s1), 'boardCalls=', boardCalls);
    await shot(page, '01-prep-panel-no-new-orders.png');

    // 等一个 board 轮询周期，让第 2 次返回带出新单
    await page.waitForTimeout(11000);
    const s2 = await readState();
    console.log('02 state', JSON.stringify(s2), 'boardCalls=', boardCalls);
    await shot(page, '02-prep-panel-new-bar-clickable.png');

    // 点提示条：应关面板 + 切待接单 + 立即刷新（不等下一个 10s）
    const before = boardCalls;
    await page.locator('.ps-new').first().click();
    await page.waitForTimeout(350);
    const s3 = await readState();
    console.log('03 state', JSON.stringify(s3), 'boardCalls_before=', before, 'boardCalls_after=', boardCalls);
    await shot(page, '03-jump-to-pending-immediate.png');

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
