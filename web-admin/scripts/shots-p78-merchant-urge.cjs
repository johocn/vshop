// §78 顾客催单商家侧闭环 后台截图（390×844 dpr=2）
//   01 工作台：顶部催单提醒条 + 卡片催单行（顾客催单 / 时间 / 已知晓）
//   02 工作台：点击「已知晓」后催单消失、计数减一、toast 提示
//   03 出餐屏：顶部催单统计 + 票据催单标签，催单票据置顶
//   node scripts/shots-p78-merchant-urge.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p78-merchant-urge');
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

/** 工作台订单（§78）：两单待接单，其中 A2400002 顾客已催单 */
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
    pending: [
        mkOrder('301', 'A2400001', 4, { note: '不要香菜', customerPhone: '138****1111' }),
        mkOrder('302', 'A2400002', 9, {
            urged: true, urgedAt: at(2), total: 2600, building: '1 号教学楼', zone: '西区',
            customerPhone: '137****2222',
            lines: [{ name: '香菇滑鸡饭', quantity: 1, price: 2400 }, { name: '米饭', quantity: 1, price: 0 }],
        }),
    ],
    cooking: [], awaitingRider: [], delivering: [],
    pendingDispatch: [], thirdParty: [], ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 3, completedTodayAmount: 9750,
    closedToday: false, closureNote: null, unfinishedOrders: 2,
    urgedCount: 1,
};

/** 出餐屏队列（§78）：待接单 2 单，其中 A2400002 已催单（置顶） */
const kitchen = {
    pendingCount: 2, cookingCount: 1, lateCount: 0, urgedCount: 1, warnMinutes: 15, lateMinutes: 25,
    tickets: [
        {
            id: '302', code: 'A2400002', stage: 'pending', createdAt: at(9), waitingMinutes: 9,
            urgency: 'normal', zone: '西区', building: '1 号教学楼', slotText: '尽快送达',
            note: null, printedAt: at(9), total: 2600, urged: true,
            lines: [{ name: '香菇滑鸡饭', quantity: 1, addons: ['加饭'] }, { name: '米饭', quantity: 1, addons: [] }],
        },
        {
            id: '301', code: 'A2400001', stage: 'pending', createdAt: at(4), waitingMinutes: 4,
            urgency: 'normal', zone: '东区', building: '3 号宿舍楼', slotText: '尽快送达',
            note: '不要香菜', printedAt: at(4), total: 3250, urged: false,
            lines: [{ name: '宫保鸡丁', quantity: 1, addons: ['加辣', '多花生'] }, { name: '米饭', quantity: 2, addons: [] }],
        },
        {
            id: '303', code: 'A2400003', stage: 'cooking', createdAt: at(18), waitingMinutes: 18,
            urgency: 'warn', zone: '北区', building: '2 号宿舍楼', slotText: '12:10-12:25',
            note: null, printedAt: at(18), total: 2900, urged: false,
            lines: [{ name: '套餐 · 双人餐', quantity: 1, addons: ['可乐'] }],
        },
    ],
};

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: board });
        if (body.includes('campusMerchantKitchenQueue')) return fulfill({ campusMerchantKitchenQueue: kitchen });
        if (body.includes('campusMerchantAckUrge')) {
            const vars = JSON.parse(body).variables || {};
            // 模拟服务端 ack：对应单 urged 置 false，urgedCount 减一
            for (const list of [board.pending, board.cooking, board.merchantDelivering, board.thirdParty]) {
                for (const o of list) {
                    if (String(o.id) === String(vars.orderId)) o.urged = false;
                }
            }
            board.urgedCount = Math.max(0, board.urgedCount - 1);
            if (kitchen.tickets.some((t) => String(t.id) === String(vars.orderId))) {
                kitchen.tickets.forEach((t) => { if (String(t.id) === String(vars.orderId)) t.urged = false; });
                kitchen.urgedCount = Math.max(0, kitchen.urgedCount - 1);
            }
            return fulfill({ campusMerchantAckUrge: { ok: true } });
        }
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p78');
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

    const readBoard = () => page.evaluate(() => ({
        urgebar: document.querySelector('.urgebar .u-lbl')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        rows: Array.from(document.querySelectorAll('.card .urge-row')).map((r) => ({
            code: r.closest('.card')?.querySelector('.code')?.textContent?.trim() || '',
            tag: r.querySelector('.urge-tag')?.textContent?.trim() || '',
            time: r.querySelector('.urge-time')?.textContent?.trim() || '',
            ack: r.querySelector('.urge-ack')?.textContent?.trim() || '',
        })),
        toast: document.querySelector('.uni-toast')?.textContent?.trim() || '',
    }));
    const readKitchen = () => page.evaluate(() => ({
        stats: Array.from(document.querySelectorAll('.stats .stat')).map((s) => s.textContent.trim().replace(/\s+/g, ' ')),
        urgedStat: !!document.querySelector('.stats .stat.urge'),
        tickets: Array.from(document.querySelectorAll('.ticket')).map((t) => ({
            code: t.querySelector('.tk-code')?.textContent?.trim() || '',
            urged: !!t.querySelector('.tk-urged'),
            wait: t.querySelector('.tk-wait')?.textContent?.trim() || '',
        })),
    }));

    // ── 01 出餐屏：催单统计 + 票据催单标签（先拍，避免后续 ack 污染 mock 状态）──────
    await page.goto(BASE + '#/pages/campus/kitchen', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.cols', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    console.log('01 state', JSON.stringify(await readKitchen()));
    await shot(page, '01-kitchen-urged.png');

    // ── 02 工作台：催单提醒条 + 卡片催单行 ────────────────────────────────
    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.tabs', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    // 滚到催单卡片，确保催单行在视口内
    await page.locator('.card .urge-row').first().scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(300);
    console.log('02 state', JSON.stringify(await readBoard()));
    await shot(page, '02-workbench-urge.png');

    // ── 03 点击「已知晓」：催单消失 + 计数减一 + toast ────────────────────
    await page.locator('.card .urge-ack').first().click();
    await page.waitForTimeout(350);
    console.log('03 state', JSON.stringify(await readBoard()));
    await shot(page, '03-workbench-urged-acked.png');

    await ctx.close();
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
