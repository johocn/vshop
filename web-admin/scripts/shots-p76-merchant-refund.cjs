// §76 商家发起退款/部分退款 后台截图（390×844 dpr=2）
//   01 对账列表退款入口（可退余额）
//   02 退款面板：全额退款一键填入
//   03 退款面板：部分金额 + 原因
//   04 二次确认弹窗
//   05 退款成功 toast（列表已退/可退即时刷新）
//   node scripts/shots-p76-merchant-refund.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p76-merchant-refund');
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

/** 已完成订单（含 §76 可退余额 refundable） */
const mkDone = (id, code, minutesAgo, extra = {}) => ({
    id, code,
    deliveredAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - (minutesAgo + 25) * 60 * 1000).toISOString(),
    total: 3250, refundAmount: 0, refundable: 3250, netAmount: 3250,
    building: '3 号宿舍楼', zone: '东区', route: 'R1', riderName: null,
    customerPhone: '138****1111', lineText: '宫保鸡丁×1、米饭×2', note: null,
    ...extra,
});
const items = [
    mkDone('201', 'A2400001', 8),
    mkDone('202', 'A2400002', 24, {
        total: 2800, refundAmount: 2600, refundable: 200, netAmount: 200,
        building: '1 号教学楼', zone: '西区', customerPhone: '139****2222',
        lineText: '香菇滑鸡饭×1', note: '少饭',
    }),
    mkDone('203', 'A2400003', 41, {
        total: 4500, refundAmount: 4500, refundable: 0, netAmount: 0,
        building: '5 号宿舍楼', customerPhone: '137****3333',
        lineText: '套餐·双人餐×1、可乐×2', route: 'R3',
    }),
    mkDone('204', 'A2400004', 63, {
        total: 6100, refundAmount: 0, refundable: 6100, netAmount: 6100,
        building: '3 号宿舍楼', customerPhone: '136****4444',
        lineText: '红烧肉×2、米饭×3', note: '不要香菜',
    }),
    mkDone('205', 'A2400005', 87, {
        total: 2900, refundAmount: 0, refundable: 2900, netAmount: 2900,
        building: '7 号教学楼', zone: '西区', customerPhone: '135****5555',
        lineText: '凉拌黄瓜×1、米饭×1', route: 'R2',
    }),
];
const NOW = new Date().toISOString();
const START = new Date(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00+08:00').toISOString();

const sumBy = (fn) => items.reduce((s, o) => s + fn(o), 0);
function snapshot() {
    const totalAmount = sumBy((o) => o.total);
    const refundAmount = sumBy((o) => o.refundAmount);
    return {
        items, total: items.length, totalAmount, refundAmount,
        netAmount: totalAmount - refundAmount,
        avgTicket: Math.round((totalAmount - refundAmount) / items.length),
        start: START, end: NOW,
    };
}

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        // 退款 mutation：按请求金额扣减可退、累加已退，返回与新口径一致的回执
        if (body.includes('campusMerchantRefundOrder')) {
            const vars = JSON.parse(body).variables || {};
            const order = items.find((o) => String(o.id) === String(vars.orderId));
            if (order) {
                order.refundAmount += vars.amount;
                order.refundable -= vars.amount;
                order.netAmount = order.total - order.refundAmount;
            }
            return fulfill({
                campusMerchantRefundOrder: {
                    ok: true, amount: vars.amount,
                    refundedTotal: order ? order.refundAmount : 0,
                    refundable: order ? order.refundable : 0,
                },
            });
        }
        if (body.includes('campusMerchantCompletedOrders')) return fulfill({ campusMerchantCompletedOrders: snapshot() });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p76');
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
        kpis: Array.from(document.querySelectorAll('.card .kpi')).map((k) => k.textContent.trim().replace(/\s+/g, ' ')),
        cards: Array.from(document.querySelectorAll('.list .order')).map((o) => ({
            code: o.querySelector('.o-code')?.textContent?.trim() || '',
            refundBtn: o.querySelector('.refund-btn')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        })),
        sheet: document.querySelector('.sheet') ? {
            title: document.querySelector('.sheet__t')?.textContent?.trim() || '',
            sub: document.querySelector('.sheet__sub')?.textContent?.trim() || '',
            kpis: Array.from(document.querySelectorAll('.sheet__kpis > text')).map((t) => t.textContent.trim().replace(/\s+/g, ' ')),
            amount: (document.querySelector('.sheet__input input'))?.value ?? '',
            reason: (document.querySelector('.sheet__area textarea'))?.value ?? '',
        } : null,
        modal: document.querySelector('.uni-modal') ? {
            title: document.querySelector('.uni-modal__hd title, .uni-modal__title')?.textContent?.trim() || '',
            body: document.querySelector('.uni-modal__bd')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        } : null,
        toast: (document.querySelector('uni-toast') || document.querySelector('.uni-toast'))?.textContent?.trim() || '',
    }));

    await page.goto(BASE + '#/pages/campus/completed-orders', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.card .kpis', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1200);

    // ── 01 列表退款入口（A2400002 已退 ¥26 可退 ¥2；A2400003 已全退无入口）──
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-completed-orders-refund-entry.png');

    // ── 02 退款面板：全额退款一键填入 ─────────────────────────────────────
    await page.locator('.list .order').first().locator('.refund-btn').click();
    await page.waitForTimeout(400);
    await page.locator('.amount-row .all-btn').click();
    await page.waitForTimeout(300);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-refund-sheet-full.png');

    // ── 03 部分退款：金额 ¥8.00 + 原因 ────────────────────────────────────
    await page.locator('.sheet__x').click();
    await page.waitForTimeout(300);
    await page.locator('.list .order').nth(3).locator('.refund-btn').click();
    await page.waitForTimeout(400);
    await page.locator('.sheet__input input').fill('8');
    await page.locator('.sheet__area textarea').fill('少送一份米饭，按差额退款');
    await page.waitForTimeout(300);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-refund-sheet-partial.png');

    // ── 04 二次确认弹窗 ──────────────────────────────────────────────────
    await page.locator('.sheet__save').click();
    await page.waitForTimeout(600);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-refund-confirm-modal.png');

    // ── 05 退款成功：toast + 列表已退/可退刷新 ────────────────────────────
    await page.locator('.uni-modal__btn_primary').click();
    await page.waitForTimeout(1200);
    console.log('05 state', JSON.stringify(await readState()));
    await shot(page, '05-refund-success-toast.png');

    await ctx.close();
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
