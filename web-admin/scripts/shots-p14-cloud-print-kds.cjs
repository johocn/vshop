// P1-4 云打印 / KDS 出餐屏 后台截图（390×844 dpr=2；出餐屏另给 1280 桌面版）
//   01 商家工作台：云打印已配置 + 出餐屏入口
//   02 出餐屏（桌面大屏 1280×900）：待接单/备餐中两列 + 超时标红 + 加料/备注
//   03 出餐屏（手机 390）：窄屏堆叠
//   04 拾光达配置：打印通道 = 飞鹅云（账号/设备/密钥/联数）
//   05 拾光达配置：打印通道 = 本地（C-Lodop，云字段隐藏）
//   node scripts/shots-p14-cloud-print-kds.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p14-cloud-print-kds');
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

const order = (id, code, minutesAgo, lines, extra = {}) => ({
    id, code, createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    total: 3250, shipping: 200, building: '3 号宿舍楼', zone: '东区', slotText: '尽快送达',
    route: 'R2', riderName: null, printedAt: null, provider: null, thirdPartyNo: null, handoverCode: null,
    lines, ...extra,
});

const PENDING_ORDER = order('901', 'A2400007', 6, [
    { name: '宫保鸡丁', quantity: 1, price: 1800 },
    { name: '米饭', quantity: 2, price: 300 },
]);

const BOARD = {
    paused: false, merchantConfirmEnabled: true, printMode: 'onPaid',
    printProvider: 'feie', cloudPrintConfigured: true,
    storeName: '第一食堂', storePhone: '13800001111',
    pending: [PENDING_ORDER], cooking: [], awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
    ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 23, completedTodayAmount: 68400,
};

const KITCHEN = {
    pendingCount: 2, cookingCount: 1, lateCount: 1, warnMinutes: 15, lateMinutes: 25,
    tickets: [
        {
            id: '901', code: 'A2400007', stage: 'pending', createdAt: new Date(Date.now() - 6 * 60000).toISOString(),
            waitingMinutes: 6, urgency: 'normal', zone: '东区', building: '3 号宿舍楼', slotText: '尽快送达',
            note: null, printedAt: new Date().toISOString(), total: 3250,
            lines: [
                { name: '宫保鸡丁', quantity: 1, addons: ['加辣 / 多花生'] },
                { name: '米饭', quantity: 2, addons: [] },
            ],
        },
        {
            id: '902', code: 'A2400008', stage: 'pending', createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
            waitingMinutes: 18, urgency: 'warn', zone: '西区', building: '7 号教学楼', slotText: '12:10-12:25',
            note: '少放盐，餐具两副', printedAt: null, total: 2680,
            lines: [
                { name: '香菇滑鸡饭', quantity: 1, addons: ['加饭'] },
                { name: '凉拌黄瓜', quantity: 1, addons: [] },
            ],
        },
        {
            id: '903', code: 'A2400006', stage: 'cooking', createdAt: new Date(Date.now() - 31 * 60000).toISOString(),
            waitingMinutes: 31, urgency: 'late', zone: '北区', building: '2 号宿舍楼', slotText: '尽快送达',
            note: null, printedAt: new Date().toISOString(), total: 4180,
            lines: [
                { name: '套餐 · 双人餐', quantity: 1, addons: ['可乐 ×2'] },
                { name: '可乐', quantity: 2, addons: [] },
            ],
        },
    ],
};

const PRINT_JOBS = [
    { id: '71', orderId: '903', orderCode: 'A2400006', provider: 'feie', deviceSn: 'SN-91827364', status: 'ok', triggerType: 'auto', copies: 2, dryRun: false, errorMessage: null, durationMs: 412, createdAt: new Date(Date.now() - 31 * 60000).toISOString() },
    { id: '70', orderId: null, orderCode: null, provider: 'feie', deviceSn: 'SN-91827364', status: 'failed', triggerType: 'test', copies: 1, dryRun: false, errorMessage: '打印机离线', durationMs: 8000, createdAt: new Date(Date.now() - 44 * 60000).toISOString() },
];

const configRef = { value: null };
const STORE_CONFIG_BASE = {
    channelId: '201', channelCode: 'canteen-a', channelName: '第一食堂', channelToken: 'canteen-a-token',
    routesEnabled: ['R2'], routeFirstLeg: [], handoverPoints: [], providerShopNo: [],
    merchantAcceptMinutes: 5, externalPushTimeoutMinutes: 3, externalFallbackMinutes: 5,
    storeLat: 30.5, storeLng: 114.3, deliveryMinutes: 30, minOrderAmount: 0, deliveryFee: 200,
    storeAddress: '第一食堂 1 号档口', storePhone: '13800001111', storeNotice: '今日推出新菜：香菇滑鸡饭',
    errandBaseFee: 500, thirdPartyBaseFee: 600, freeShippingThreshold: 2000,
    notifyTemplateAccepted: '', notifyTemplateRiderAssigned: '', notifyTemplateCookingDone: '',
    notifyTemplateDelivered: '', notifyTemplateExceptionHandled: '', notifyTemplateOrderPlaced: '',
    notifyTemplatePaymentPending: '', notifyTemplateCancelled: '', notifyTemplateAfterSales: '',
    notifyTemplateAddressChanged: '', h5BaseUrl: 'https://www.yourbao.cn',
    printMode: 'onPaid', printProvider: 'feie',
    printAccount: 'feie-user-001', printDeviceSn: 'SN-91827364', printDeviceKey: 'ukey-demo', printCopies: 2,
    timeoutCompensationEnabled: false, timeoutGraceMinutes: 10, timeoutCompensationWindowHours: 24,
    timeoutCompensationCouponTemplateId: null, dynamicPricing: null,
    privacyNumberEnabled: false, privacyNumberProvider: 'mask', privacyNumberTtlMinutes: 60, privacyNumberPrefix: null,
    foodLicenseNo: 'JY24403000012345', foodLicenseImage: '', foodLicenseExpiry: '2027-12-31',
    foodSafetyGrade: 'A', foodSafetyCommitmentImage: '', kitchenLiveUrl: '', kitchenLiveEnabled: true,
    packingFeeEnabled: true, packingFeeMode: 'perItem', packingFeeAmount: 100, packingFeeCap: 500, packingFeeLabel: '打包费',
};

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: BOARD });
        if (body.includes('campusMerchantKitchenQueue')) return fulfill({ campusMerchantKitchenQueue: KITCHEN });
        if (body.includes('campusMerchantPrintJobs')) return fulfill({ campusMerchantPrintJobs: PRINT_JOBS });
        if (body.includes('campusMerchantCloudPrintTest')) {
            return fulfill({ campusMerchantCloudPrintTest: { ok: true, provider: 'feie', dryRun: false, jobId: '72', error: null } });
        }
        if (body.includes('campusMerchantCloudPrint')) {
            return fulfill({ campusMerchantCloudPrint: { ok: true, provider: 'feie', dryRun: false, jobId: '73', error: null } });
        }
        if (body.includes('campusMerchantAcceptOrder')) return fulfill({ campusMerchantAcceptOrder: { ok: true } });
        if (body.includes('campusMerchantCookingDone')) return fulfill({ campusMerchantCookingDone: { ok: true } });
        if (body.includes('campusStoreConfigs')) return fulfill({ campusStoreConfigs: [configRef.value] });
        if (body.includes('campusUpdateStoreConfig')) return fulfill({ campusUpdateStoreConfig: configRef.value });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

async function newPage(browser, viewport = { width: 390, height: 844 }) {
    const ctx = await browser.newContext({
        viewport, deviceScaleFactor: 2, isMobile: viewport.width < 700, hasTouch: viewport.width < 700,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p14');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute());
    return { ctx, page };
}

const readKitchen = () => ({
    stats: Array.from(document.querySelectorAll('.stat')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    threshold: document.querySelector('.threshold')?.textContent?.trim() || '',
    cols: Array.from(document.querySelectorAll('.col-hd')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    tickets: Array.from(document.querySelectorAll('.ticket')).map((e) => {
        const cls = e.className;
        const urgency = cls.includes('late') ? 'late' : cls.includes('warn') ? 'warn' : 'normal';
        return urgency + ' | ' + e.innerText.replace(/\s+/g, ' ').trim().slice(0, 80);
    }),
    addonLines: Array.from(document.querySelectorAll('.l-addons')).map((e) => e.textContent.trim()),
});

const readPrintSection = () => {
    const secs = Array.from(document.querySelectorAll('.sec-t'));
    const sec = secs.find((e) => e.innerText.includes('打印通道'));
    if (!sec) return { found: false };
    const card = sec.closest('.card') || document;
    const rows = Array.from(card.querySelectorAll('.pmode-row')).filter((r) => r.innerText.includes('打印通道'));
    const row = rows[0];
    return {
        found: true,
        section: sec.innerText.trim(),
        providers: row ? Array.from(row.querySelectorAll('.pmode')).map((e) => (e.className.includes('on') ? '*' : '') + e.innerText.trim()) : [],
        cells: Array.from(card.querySelectorAll('.cell'))
            .map((e) => e.innerText.replace(/\s+/g, ' ').trim())
            .filter((s) => /服务商账号|打印机编号|服务商密钥|打印联数/.test(s)),
        values: Array.from(card.querySelectorAll('.cell input'))
            .map((i) => i.value)
            .filter((v) => v !== ''),
        tip: Array.from(card.querySelectorAll('.notify-tip')).map((e) => e.innerText.trim()).find((s) => s.includes('本地通道')) || '',
    };
};

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name, full = false) => { await page.screenshot({ path: path.join(OUT, name), fullPage: full }); console.log('shot ' + name); };

    // ── 01 商家工作台：云打印 + 出餐屏入口 ──────────────────
    {
        const { ctx, page } = await newPage(browser);
        await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.entrybar', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const state = await page.evaluate(() => ({
            entries: Array.from(document.querySelectorAll('.entrybar')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
            printbar: document.querySelector('.printbar')?.innerText.replace(/\s+/g, ' ').trim() || '',
            testBtn: Array.from(document.querySelectorAll('.p-btn')).map((e) => e.innerText.trim()),
        }));
        console.log('01 state', JSON.stringify(state));
        await shot(page, '01-admin-merchant-cloud-print-entry.png');
        await ctx.close();
    }

    // ── 02 出餐屏（桌面大屏） ─────────────────────────────
    {
        const { ctx, page } = await newPage(browser, { width: 1280, height: 900 });
        await page.goto(BASE + '#/pages/campus/kitchen', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.ticket', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        console.log('02 state', JSON.stringify(await page.evaluate(readKitchen)));
        await shot(page, '02-admin-kitchen-desktop.png');
        await ctx.close();
    }

    // ── 03 出餐屏（手机窄屏堆叠） ─────────────────────────
    {
        const { ctx, page } = await newPage(browser);
        await page.goto(BASE + '#/pages/campus/kitchen', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.ticket', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        await shot(page, '03-admin-kitchen-mobile.png', true);
        await ctx.close();
    }

    // ── 04 配置页：打印通道 = 飞鹅云 ───────────────────────
    {
        configRef.value = JSON.parse(JSON.stringify(STORE_CONFIG_BASE));
        const { ctx, page } = await newPage(browser);
        await page.goto(BASE + '#/pages/campus/config', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.card .head', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1800);
        const expanded = await page.evaluate(() => {
            const head = document.querySelector('.card .head');
            if (!head) return false;
            head.click();
            return true;
        });
        console.log('04 expand card', expanded);
        await page.waitForSelector('.sec-t', { timeout: 15000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        const scrolled = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('.sec-t')).find((e) => e.innerText.includes('打印通道'));
            if (!t) return false;
            t.scrollIntoView({ block: 'start' });
            return true;
        });
        console.log('04 scroll to print channel', scrolled);
        await page.waitForTimeout(700);
        console.log('04 state', JSON.stringify(await page.evaluate(readPrintSection)));
        await shot(page, '04-admin-config-print-provider-cloud.png');
        await ctx.close();
    }

    // ── 05 配置页：打印通道 = 本地（云字段隐藏） ────────────
    {
        configRef.value = JSON.parse(JSON.stringify({ ...STORE_CONFIG_BASE, printProvider: 'local', printAccount: null, printDeviceSn: null, printDeviceKey: null, printCopies: 1 }));
        const { ctx, page } = await newPage(browser);
        await page.goto(BASE + '#/pages/campus/config', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.card .head', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1800);
        await page.evaluate(() => { document.querySelector('.card .head')?.click(); });
        await page.waitForSelector('.sec-t', { timeout: 15000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        const clicked = await page.evaluate(() => {
            const sec = Array.from(document.querySelectorAll('.sec-t')).find((e) => e.innerText.includes('打印通道'));
            const card = sec && (sec.closest('.card') || document);
            const row = card && Array.from(card.querySelectorAll('.pmode-row')).find((r) => r.innerText.includes('打印通道'));
            const local = row && Array.from(row.querySelectorAll('.pmode')).find((e) => e.innerText.includes('本地'));
            if (!local) return false;
            local.click();
            return true;
        });
        console.log('05 switch local', clicked);
        await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('.sec-t')).find((e) => e.innerText.includes('打印通道'));
            if (t) t.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(800);
        console.log('05 state', JSON.stringify(await page.evaluate(readPrintSection)));
        await shot(page, '05-admin-config-print-provider-local.png');
        await ctx.close();
    }

    await browser.close();
    server.close();
    console.log('SHOTS DONE ->', OUT);
    process.exit(0);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
