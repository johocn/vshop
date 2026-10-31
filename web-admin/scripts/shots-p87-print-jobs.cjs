// §87 云打印任务排障面板 后台截图（390×844 dpr=2）
//   01 打印条：云通道下新增「打印任务」入口
//   02 面板：最近 20 条留痕（服务商 / 触发方式 / 联数 / 耗时 / 失败原因），失败行标红
//   03 点「重打」：按订单重新出票 → toast「已重新出票」，该行状态转成功
//   node scripts/shots-p87-print-jobs.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p87-print-jobs');
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

/** 工作台看板：云通道（printProvider=feie）→ 打印条出现「打印任务」入口 */
const board = {
    paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
    merchantConfirmEnabled: true, printMode: 'onPaid', printProvider: 'feie', cloudPrintConfigured: true,
    storeName: 'canteen-a', storePhone: '13800001111',
    pending: [mkOrder('301', 'A2400001', 4, { note: '不要香菜' })],
    cooking: [mkOrder('302', 'A2400002', 9, {
        total: 2600, building: '1 号教学楼', zone: '西区', customerPhone: '137****2222',
        lines: [{ name: '香菇滑鸡饭', quantity: 1, price: 2400 }, { name: '米饭', quantity: 1, price: 0 }],
    })],
    awaitingRider: [], delivering: [],
    pendingDispatch: [], thirdParty: [], ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 3, completedTodayAmount: 9750,
    closedToday: false, closureNote: null, unfinishedOrders: 2,
    urgedCount: 0,
};

/** 打印留痕：成功 3 条 + 失败 1 条 + 测试 1 条（按时间倒序） */
const jobs = [
    { id: '91', orderId: '302', orderCode: 'A2400002', provider: 'feie', deviceSn: 'SN-91827364',
        status: 'failed', triggerType: 'auto', copies: 2, dryRun: false,
        errorMessage: '飞鹅云返回 1002：打印机不在线（设备 SN-91827364），请检查打印机电源与网络。',
        durationMs: 3120, createdAt: at(3) },
    { id: '90', orderId: '301', orderCode: 'A2400001', provider: 'feie', deviceSn: 'SN-91827364',
        status: 'ok', triggerType: 'auto', copies: 2, dryRun: false,
        errorMessage: null, durationMs: 860, createdAt: at(5) },
    { id: '89', orderId: null, orderCode: null, provider: 'feie', deviceSn: 'SN-91827364',
        status: 'ok', triggerType: 'test', copies: 1, dryRun: true,
        errorMessage: null, durationMs: 410, createdAt: at(12) },
    { id: '88', orderId: '297', orderCode: 'A2399997', provider: 'feie', deviceSn: 'SN-91827364',
        status: 'ok', triggerType: 'manual', copies: 2, dryRun: false,
        errorMessage: null, durationMs: 1230, createdAt: at(48) },
    { id: '87', orderId: '295', orderCode: 'A2399995', provider: 'feie', deviceSn: 'SN-91827364',
        status: 'ok', triggerType: 'auto', copies: 2, dryRun: false,
        errorMessage: null, durationMs: 700, createdAt: at(66) },
];

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: board });
        if (body.includes('campusMerchantCompletedOrders')) {
            return fulfill({ campusMerchantCompletedOrders: {
                items: [], total: 0, totalAmount: 0, refundAmount: 0, netAmount: 0,
                avgTicket: 0, start: '', end: '',
            } });
        }
        if (body.includes('campusMerchantPrintJobs')) return fulfill({ campusMerchantPrintJobs: jobs });
        if (body.includes('campusMerchantCloudPrint')) {
            // 模拟重打成功：对应订单的失败留痕转成功并新增一条手动补打
            const vars = JSON.parse(body).variables || {};
            const target = jobs.find((j) => String(j.orderId) === String(vars.orderId));
            if (target) { target.status = 'ok'; target.errorMessage = null; target.durationMs = 940; }
            return fulfill({ campusMerchantCloudPrint: { ok: true, provider: 'feie', dryRun: false, jobId: '92', error: null } });
        }
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p87');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute());

    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };
    const readBar = () => page.evaluate(() => ({
        printbar: !!document.querySelector('.printbar'),
        mode: document.querySelector('.printbar .p-mode')?.textContent?.trim() || '',
        ops: Array.from(document.querySelectorAll('.printbar .p-ops .p-btn')).map((b) => b.textContent.trim()),
    }));
    const readPanel = () => page.evaluate(() => ({
        open: !!document.querySelector('.prep-mask .prep-sheet'),
        title: document.querySelector('.ps-title')?.textContent?.trim() || '',
        hint: document.querySelector('.ps-hint')?.textContent?.trim() || '',
        rows: Array.from(document.querySelectorAll('.prep-sheet .ps-row')).map((r) => ({
            name: r.querySelector('.ps-name')?.textContent?.trim() || '',
            meta: r.querySelector('.ps-addons')?.textContent?.trim() || '',
            err: r.querySelector('.pj-err')?.textContent?.trim() || '',
            tag: r.querySelector('.pj-tag')?.textContent?.trim() || '',
            cls: r.querySelector('.pj-tag')?.className || '',
            retry: r.querySelector('.pj-retry')?.textContent?.trim() || '',
        })),
        toast: document.querySelector('.uni-toast')?.textContent?.trim() || '',
    }));

    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.tabs', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1500);

    // ── 01 打印条：云通道 + 「打印任务」入口 ───────────────────────────────
    await page.locator('.printbar').first().scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(300);
    console.log('01 state', JSON.stringify(await readBar()));
    await shot('01-print-jobs-entry.png');

    // ── 02 打开面板：留痕列表（失败行标红 + 服务商原因）────────────────────
    await page.locator('.printbar .p-ops .p-btn', { hasText: '打印任务' }).first().click();
    await page.waitForTimeout(800);
    console.log('02 state', JSON.stringify(await readPanel()));
    await shot('02-print-jobs-panel.png');

    // ── 03 失败行点「重打」：toast 已重新出票 + 该行转成功 ─────────────────
    await page.locator('.prep-sheet .ps-row .pj-retry').first().click();
    await page.waitForTimeout(900);
    console.log('03 state', JSON.stringify(await readPanel()));
    await shot('03-print-jobs-reprint.png');

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
