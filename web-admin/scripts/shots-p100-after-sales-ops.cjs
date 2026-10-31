// §100 售后管理（操作审计 / 值班排班 / 补偿挽留）后台截图（390×844 dpr=2）
//   01 售后申请页三个管理入口
//   02 操作审计：默认今日筛选 + 记录列表
//   03 操作审计：自定义区间 + 动作/处理人筛选
//   04 值班排班：周视图（含跨零点班次）
//   05 值班排班：新增值班弹层（跨零点提示）
//   06 补偿挽留：方案列表
//   07 补偿挽留：编辑方案弹层
//   node scripts/shots-p100-after-sales-ops.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p100-after-sales-ops');
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

const ASSIGNEES = [
    { id: '3', name: '张伟', identifier: 'zhangwei' },
    { id: '5', name: '李娜', identifier: 'lina' },
];

let duty = [
    { weekday: 1, startMin: 540, endMin: 900, userId: '3', userName: '张伟' },
    { weekday: 1, startMin: 1080, endMin: 1620, userId: '5', userName: '李娜' },
    { weekday: 3, startMin: 600, endMin: 840, userId: '5', userName: '李娜' },
    { weekday: 5, startMin: 1020, endMin: 1560, userId: '3', userName: '张伟' },
];

let plans = [
    { id: '901', name: '出餐超时补偿', refundAmount: 500, couponTemplateId: 'c1', note: '出餐超过 20 分钟自动建议发放', enabled: true, createdAt: at(4320) },
    { id: '902', name: '撒漏安抚券', refundAmount: 0, couponTemplateId: 'c2', note: '仅发券，不退款', enabled: true, createdAt: at(2880) },
    { id: '903', name: '老客挽留（大额）', refundAmount: 1500, couponTemplateId: null, note: '客诉严重时人工判断', enabled: false, createdAt: at(1440) },
];

const LOGS = [
    { id: '1', requestId: '801', orderCode: 'A2400001', action: 'approve', actorUserId: '3', actorName: '张伟', detail: '退款 ¥32.50，原路退回微信支付', createdAt: at(12) },
    { id: '2', requestId: '804', orderCode: 'A2400007', action: 'reject', actorUserId: '5', actorName: '李娜', detail: '驳回理由：核查出品记录与顾客描述一致，不符合退款条件', createdAt: at(38) },
    { id: '3', requestId: '803', orderCode: 'A2400005', action: 'retryRefund', actorUserId: '3', actorName: '张伟', detail: '第 2 次重试退款成功 ¥29.00', createdAt: at(65) },
    { id: '4', requestId: '805', orderCode: 'A2400009', action: 'transfer', actorUserId: '5', actorName: '李娜', detail: '转交给 王强，原因：餐品撒漏需现场核实', createdAt: at(120) },
    { id: '5', requestId: '802', orderCode: 'A2400004', action: 'assign', actorUserId: '3', actorName: '张伟', detail: '指派给处理人 #5', createdAt: at(180) },
];

const COUPONS = [
    { id: 'c1', name: '满 20 减 5 券', enabled: true },
    { id: 'c2', name: '满 30 减 8 券', enabled: true },
];

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        let vars = {};
        try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantAfterSalesAssignees')) return fulfill({ campusMerchantAfterSalesAssignees: ASSIGNEES });
        if (raw.includes('campusMerchantAfterSalesAuditLogs')) return fulfill({ campusMerchantAfterSalesAuditLogs: LOGS });
        if (raw.includes('campusMerchantAfterSalesAuditExport')) return fulfill({ campusMerchantAfterSalesAuditExport: '' });
        if (raw.includes('campusMerchantSetAfterSalesDutyRoster')) {
            const entries = JSON.parse(String(vars.entries || '[]'));
            duty = entries.map((e) => ({ ...e, userId: String(e.userId), userName: ASSIGNEES.find((a) => a.id === String(e.userId))?.name || '' }));
            return fulfill({ campusMerchantSetAfterSalesDutyRoster: duty });
        }
        if (raw.includes('campusMerchantAfterSalesDutyRoster')) return fulfill({ campusMerchantAfterSalesDutyRoster: duty });
        if (raw.includes('campusMerchantSaveAfterSalesCompensationPlan')) {
            const id = vars.id ? String(vars.id) : String(2000 + plans.length);
            const row = {
                id, name: String(vars.name || ''), refundAmount: Number(vars.refundAmount || 0),
                couponTemplateId: vars.couponTemplateId || null, note: vars.note || null,
                enabled: vars.enabled !== false, createdAt: at(0),
            };
            plans = [row, ...plans.filter((p) => p.id !== id)];
            return fulfill({ campusMerchantSaveAfterSalesCompensationPlan: plans });
        }
        if (raw.includes('campusMerchantDeleteAfterSalesCompensationPlan')) {
            plans = plans.filter((p) => p.id !== String(vars.id || ''));
            return fulfill({ campusMerchantDeleteAfterSalesCompensationPlan: plans });
        }
        if (raw.includes('campusMerchantAfterSalesCompensationPlans')) return fulfill({ campusMerchantAfterSalesCompensationPlans: plans });
        if (raw.includes('couponTemplates')) return fulfill({ couponTemplates: { items: COUPONS, totalItems: COUPONS.length } });
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
        if (raw.includes('campusMerchantAfterSales')) {
            return fulfill({ campusMerchantAfterSales: { items: [], pendingCount: 2, total: 0 } });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p100');
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
        tabs: Array.from(document.querySelectorAll('.tabs .tab')).map((n) => (n.classList.contains('on') ? '*' : '') + n.textContent.trim()),
        logs: Array.from(document.querySelectorAll('.log')).map((r) => ({
            code: r.querySelector('.l-code')?.textContent?.trim() || '',
            act: r.querySelector('.l-act')?.textContent?.trim() || '',
            who: r.querySelector('.l-who')?.textContent?.replace(/\s+/g, ' ').trim() || '',
            detail: r.querySelector('.l-detail')?.textContent?.trim() || '',
            time: r.querySelector('.l-time')?.textContent?.trim() || '',
        })),
        seg: Array.from(document.querySelectorAll('.seg-i.on')).map((n) => n.textContent.trim()),
        filters: Array.from(document.querySelectorAll('.filters .picker')).map((n) => n.textContent.trim()),
        dutyRows: Array.from(document.querySelectorAll('.duty-row')).map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
        sheet: document.querySelector('.sheet__t')?.textContent?.trim() || '',
        plans: Array.from(document.querySelectorAll('.plan')).map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
        pickers: Array.from(document.querySelectorAll('.sheet .picker')).map((n) => n.textContent.trim()),
    }));

    // ── 01 售后申请页：三个管理入口 ────────────────────────────────────────
    await page.goto(BASE + '#/pages/campus/merchant-after-sales', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.ops-entry, .hint', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    const entries = await page.evaluate(() => Array.from(document.querySelectorAll('.ops-entry .oe-i')).map((n) => n.textContent.trim()));
    console.log('01 entries', JSON.stringify(entries));
    await shot(page, '01-after-sales-ops-entries.png');

    // ── 02 操作审计：今日 ─────────────────────────────────────────────────
    await page.locator('.oe-i', { hasText: '操作审计' }).first().click();
    await page.waitForSelector('.log', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-audit-log-today.png');

    // ── 03 操作审计：自定义区间 + 动作/处理人筛选 ──────────────────────────
    await page.locator('.seg-i', { hasText: '自定义' }).first().click();
    await page.waitForTimeout(900);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-audit-custom-range.png');

    // ── 04 值班排班：周视图 ────────────────────────────────────────────────
    await page.locator('.tabs .tab', { hasText: '值班排班' }).first().click();
    await page.waitForSelector('.duty-row', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-duty-roster.png');

    // ── 05 新增值班弹层 ────────────────────────────────────────────────────
    await page.locator('.d-add').first().click();
    await page.waitForTimeout(600);
    console.log('05 state', JSON.stringify(await readState()));
    await shot(page, '05-duty-add-sheet.png');

    // ── 06 补偿挽留：方案列表 ──────────────────────────────────────────────
    await page.locator('.sheet__x').click();
    await page.waitForTimeout(400);
    await page.locator('.tabs .tab', { hasText: '补偿挽留' }).first().click();
    await page.waitForSelector('.plan, .hint', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    console.log('06 state', JSON.stringify(await readState()));
    await shot(page, '06-compensation-plans.png');

    // ── 07 编辑方案弹层 ───────────────────────────────────────────────────
    await page.locator('.pl-edit').first().click();
    await page.waitForTimeout(700);
    console.log('07 state', JSON.stringify(await readState()));
    await shot(page, '07-compensation-edit-sheet.png');

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
