// §80 商家营业日报 后台截图（390×844 dpr=2）
//   01 工作台入口「营业日报」在列（备餐汇总下方）
//   02 日报页（今天）：KPI + 对比 + 时段分布 + 商品 Top5
//   03 切「昨天」：同一页另一份数据
//   04 复制日报 → toast 回执
//   node scripts/shots-p80-daily-report.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p80-daily-report');
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
    id, code, createdAt: at(minutesAgo), total: 3250, shipping: 200,
    building: '3 号宿舍楼', zone: '东区', slotText: '尽快送达', route: 'R1',
    riderName: null, note: null, printedAt: at(minutesAgo), provider: null, thirdPartyNo: null,
    handoverCode: null, customerPhone: '138****1111', urged: false, urgedAt: null,
    lines: [{ name: '宫保鸡丁', quantity: 1, price: 2650 }, { name: '米饭', quantity: 2, price: 0 }],
});
const board = {
    paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
    merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
    storeName: 'canteen-a', storePhone: '13800001111',
    pending: [mkOrder('301', 'A2400001', 4)], cooking: [mkOrder('302', 'A2400002', 12)],
    awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
    ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 3, completedTodayAmount: 9750,
    closedToday: false, closureNote: null, unfinishedOrders: 2, urgedCount: 0,
};

/** 时段分布：午市 11-13 点、晚市 17-19 点为峰值（金额按分） */
function hourlyOf(points) {
    const rows = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, gross: 0 }));
    for (const [h, orders, gross] of points) { rows[h].orders = orders; rows[h].gross = gross; }
    return rows;
}

const today = {
    date: '2026-10-30', orders: 23, gross: 68400, avgTicket: 2974, cancelled: 1, cancelledAmount: 2600,
    hourly: hourlyOf([[10, 1, 2100], [11, 6, 18600], [12, 7, 21400], [13, 3, 8900], [17, 2, 6200], [18, 3, 8100], [19, 1, 3100]]),
    topProducts: [
        { name: '宫保鸡丁', qty: 18, amount: 129600 },
        { name: '米饭', qty: 15, amount: 4500 },
        { name: '香菇滑鸡饭', qty: 9, amount: 21600 },
        { name: '凉拌黄瓜', qty: 6, amount: 7200 },
        { name: '可乐', qty: 5, amount: 2500 },
    ],
    prev: { orders: 20, gross: 59800, avgTicket: 2990 },
    last7Avg: { orders: 21, gross: 61200, avgTicket: 2914 },
};

const yesterday = {
    date: '2026-10-29', orders: 19, gross: 58900, avgTicket: 3100, cancelled: 2, cancelledAmount: 5200,
    hourly: hourlyOf([[11, 5, 15600], [12, 6, 19100], [13, 2, 6100], [17, 3, 9200], [18, 2, 6200], [19, 1, 2700]]),
    topProducts: [
        { name: '宫保鸡丁', qty: 14, amount: 100800 },
        { name: '米饭', qty: 12, amount: 3600 },
        { name: '香菇滑鸡饭', qty: 10, amount: 24000 },
        { name: '凉拌黄瓜', qty: 4, amount: 4800 },
        { name: '可乐', qty: 3, amount: 1500 },
    ],
    prev: { orders: 24, gross: 72600, avgTicket: 3025 },
    last7Avg: { orders: 21, gross: 61200, avgTicket: 2914 },
};

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        let date = null;
        try { date = JSON.parse(raw).variables?.date ?? null; } catch { /* ignore */ }
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantDailyReport')) {
            return fulfill({ campusMerchantDailyReport: date && date !== '2026-10-30' ? yesterday : today });
        }
        if (raw.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: board });
        if (raw.includes('campusMerchantPrepSummary')) return fulfill({ campusMerchantPrepSummary: [] });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p80');
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
        date: document.querySelector('.card .pill')?.textContent?.trim() || '',
        quick: Array.from(document.querySelectorAll('.seg-i.on')).map((n) => n.textContent.trim()),
        kpis: Array.from(document.querySelectorAll('.kpi-num')).map((n) => n.textContent.trim()),
        kpiLbls: Array.from(document.querySelectorAll('.kpi-lbl')).map((n) => n.textContent.trim()),
        cmp: Array.from(document.querySelectorAll('.cmp')).map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
        peak: document.querySelector('.peak')?.textContent?.trim() || '',
        bars: document.querySelectorAll('.bar-col').length,
        hotBars: Array.from(document.querySelectorAll('.bar.hot')).map((b) => b.parentElement?.querySelector('.bar-x')?.textContent?.trim()),
        products: Array.from(document.querySelectorAll('.prow')).map((r) => ({
            name: r.querySelector('.pname')?.textContent?.trim() || '',
            qty: r.querySelector('.pqty')?.textContent?.trim() || '',
            amt: r.querySelector('.pamt')?.textContent?.trim() || '',
        })),
        copyBtn: document.querySelector('.copy')?.textContent?.trim() || '',
        toast: document.querySelector('.uni-toast')?.textContent?.trim() || '',
    }));

    // ── 01 工作台：入口「营业日报」在「备餐汇总」下方 ─────────────────────
    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.entrybar', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const entries = await page.evaluate(() => Array.from(document.querySelectorAll('.entrybar .e-lbl')).map((n) => n.textContent.trim()));
    console.log('01 entries', JSON.stringify(entries));
    await page.locator('.entrybar', { hasText: '营业日报' }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, '01-workbench-daily-report-entry.png');

    // ── 02 日报页（今天）：KPI + 对比 + 时段 + Top5 ────────────────────────
    await page.locator('.entrybar', { hasText: '营业日报' }).first().click();
    await page.waitForSelector('.kpi-num', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-daily-report-today.png');

    // ── 03 切「昨天」：同页另一份数据 ──────────────────────────────────────
    await page.locator('.seg-i', { hasText: '昨天' }).first().click();
    await page.waitForTimeout(900);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-daily-report-yesterday.png');

    // ── 04 复制日报：toast 回执 ────────────────────────────────────────────
    await page.locator('.copy').click();
    await page.waitForTimeout(400);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-daily-report-copy-toast.png');

    await ctx.close();
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
