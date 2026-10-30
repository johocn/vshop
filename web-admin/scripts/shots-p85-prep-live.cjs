// §85 备餐汇总实时刷新（面板 10s 轮询 + 静默降频 + 更新时间提示）后台截图（390×844 dpr=2）
//   01 打开面板：显示「自动刷新 · 刚刚更新」+ 初始份数
//   02 10s 后自动刷新：份数自己涨（未点刷新），文案仍「刚刚更新」
//   03 手动点「刷新」：立即拉新数据并重置节流
//   node scripts/shots-p85-prep-live.cjs
//   注：脚本真实等待 ~11s 以验证「无需点击自动更新」，故整体耗时比其它脚本长。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p85-prep-live');
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

// 份数随「第几次拉取」递增，模拟新单不断进来的后厨实况
let prepCalls = 0;
function prepItems() {
    prepCalls += 1;
    const grow = prepCalls - 1; // 0 / 1 / 2 ...
    return [
        { name: '宫保鸡丁', todoQty: 3 + grow * 2, doneQty: 5, addons: [{ name: '加辣', quantity: 2 + grow }, { name: '多花生', quantity: 1 }] },
        { name: '香菇滑鸡饭', todoQty: 2 + grow, doneQty: 3, addons: [{ name: '加饭', quantity: 1 }] },
        { name: '凉拌黄瓜', todoQty: 1 + grow, doneQty: 2, addons: [] },
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
            return fulfill({ campusMerchantBoard: {
                paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
                merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
                storeName: 'canteen-a', storePhone: '13800001111',
                pending: [], cooking: [], awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
                ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
                completedToday: 5, completedTodayAmount: 16250,
                closedToday: false, closureNote: null, unfinishedOrders: 0, urgedCount: 0,
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p85');
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
        sync: document.querySelector('.ps-sync')?.textContent?.trim() || '',
        rows: Array.from(document.querySelectorAll('.ps-row')).map((r) => ({
            name: r.querySelector('.ps-name')?.textContent?.trim() || '',
            todo: r.querySelector('.ps-todo')?.textContent?.trim() || '',
            done: r.querySelector('.ps-done')?.textContent?.trim() || '',
        })),
        footer: Array.from(document.querySelectorAll('.ps-btn')).map((b) => b.textContent.trim()),
    }));

    // ── 01 打开面板：首屏份数 + 「刚刚更新」 ──────────────────────────────────
    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.entrybar', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    await page.locator('.entrybar', { hasText: '备餐汇总' }).first().click();
    await page.waitForSelector('.prep-sheet', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-prep-panel-just-updated.png');

    // ── 02 不点任何按钮，等 11s：10s 轮询自动把份数拉上来 ─────────────────────
    await page.waitForTimeout(11000);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-auto-poll-counts-grew.png');

    // ── 03 手动「刷新」：立刻拉一次并重置节流 ────────────────────────────────
    await page.locator('.ps-btn', { hasText: '刷新' }).first().click();
    await page.waitForTimeout(800);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-manual-refresh.png');

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
