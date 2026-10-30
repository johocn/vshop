// §81 商家端售后申请处理 后台截图（390×844 dpr=2）
//   01 工作台入口「售后申请」在列（营业日报下方）
//   02 售后申请页（待处理）：2 单待处理，含凭证/留言角标
//   03 同意退款：确认弹窗（金额/单号）
//   04 驳回：理由弹层（必填，顾客可见）
//   05 切「已处理」：已退款/已驳回/退款失败三种终态
//   node scripts/shots-p81-after-sales.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p81-merchant-after-sales');
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

/** 售后单：待处理 2 + 已处理 3（已退款 / 已驳回 / 退款失败） */
let rows = [
    {
        id: '801', orderId: '301', orderCode: 'A2400001', state: 'Pending', type: 'refund_only',
        reason: '菜品与描述不符', description: '点的是微辣，实际非常辣，孩子吃不了；希望退款。',
        refundAmount: 3250, rejectReason: null, evidenceImages: ['https://x/1.jpg', 'https://x/2.jpg'],
        messageCount: 2, customerName: '李同学', createdAt: at(26), refundedAt: null,
    },
    {
        id: '802', orderId: '302', orderCode: 'A2400004', state: 'Pending', type: 'refund_only',
        reason: '少送商品', description: '少了一份米饭，打包袋里只有菜。',
        refundAmount: 200, rejectReason: null, evidenceImages: ['https://x/3.jpg'],
        messageCount: 0, customerName: '王同学', createdAt: at(74), refundedAt: null,
    },
    {
        id: '803', orderId: '303', orderCode: 'A2400005', state: 'Refunded', type: 'refund_only',
        reason: '配送超时', description: '等了 50 分钟才到，菜已经凉了。',
        refundAmount: 2900, rejectReason: null, evidenceImages: [],
        messageCount: 1, customerName: '赵同学', createdAt: at(190), refundedAt: at(150),
    },
    {
        id: '804', orderId: '304', orderCode: 'A2400007', state: 'Rejected', type: 'refund_only',
        reason: '口味不满意', description: '今天的宫保鸡丁偏甜。',
        refundAmount: 2650, rejectReason: '核查出品记录与顾客下单口味一致，甜度在标准范围内，不符合退款条件',
        evidenceImages: [], messageCount: 3, customerName: '钱同学', createdAt: at(320), refundedAt: null,
    },
    {
        id: '805', orderId: '305', orderCode: 'A2400009', state: 'RefundFailed', type: 'refund_only',
        reason: '餐品撒漏', description: '汤汁撒了一半，无法食用。',
        refundAmount: 3450, rejectReason: null, evidenceImages: ['https://x/4.jpg'],
        messageCount: 1, customerName: '孙同学', createdAt: at(420), refundedAt: null,
    },
];

/** 待处理数：不受筛选影响 */
const pendingCount = () => rows.filter((r) => r.state === 'Pending').length;

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        let vars = {};
        try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        // 变更先于查询判断（mutation 名称同样含 campusMerchantAfterSales 前缀）
        if (raw.includes('campusMerchantAfterSalesApprove')) {
            const id = String(vars.id || '');
            rows = rows.map((r) => (String(r.id) === id ? { ...r, state: 'Refunded', refundedAt: at(0) } : r));
            return fulfill({ campusMerchantAfterSalesApprove: rows.find((r) => String(r.id) === id) });
        }
        if (raw.includes('campusMerchantAfterSalesReject')) {
            const id = String(vars.id || '');
            rows = rows.map((r) => (String(r.id) === id ? { ...r, state: 'Rejected', rejectReason: String(vars.reason || '') } : r));
            return fulfill({ campusMerchantAfterSalesReject: rows.find((r) => String(r.id) === id) });
        }
        if (raw.includes('campusMerchantAfterSales')) {
            const state = vars.state || null;
            return fulfill({
                campusMerchantAfterSales: {
                    items: state ? rows.filter((r) => r.state === state) : rows,
                    pendingCount: pendingCount(),
                    total: rows.length,
                },
            });
        }
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p81');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute());
    return { ctx, page };
}

// 静态服务和 Playwright 会挂住事件循环，必须显式退出，否则命令一直不返回
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
        pill: document.querySelector('.card .pill')?.textContent?.trim() || '',
        seg: Array.from(document.querySelectorAll('.seg-i.on')).map((n) => n.textContent.trim()),
        cards: Array.from(document.querySelectorAll('.as')).map((r) => ({
            code: r.querySelector('.a-code')?.textContent?.trim() || '',
            amount: r.querySelector('.a-amount')?.textContent?.trim() || '',
            state: r.querySelector('.a-state')?.textContent?.trim() || '',
            type: r.querySelector('.a-type')?.textContent?.trim() || '',
            reason: r.querySelector('.a-reason')?.textContent?.trim() || '',
            meta: Array.from(r.querySelectorAll('.a-meta-i')).map((n) => n.textContent.trim()),
            reject: r.querySelector('.a-reject')?.textContent?.trim() || '',
            ops: Array.from(r.querySelectorAll('.a-ops .op-approve, .a-ops .op-reject')).map((n) => n.textContent.trim()),
        })),
        modal: document.querySelector('.uni-modal__bd')?.textContent?.trim() || '',
        sheet: document.querySelector('.sheet__t')?.textContent?.trim() || '',
        sheetInput: !!document.querySelector('.sheet__input'),
        toast: (() => {
            const t = document.querySelector('.uni-toast') || document.querySelector('[class*="uni-toast"]');
            return t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
        })(),
    }));

    // ── 01 工作台：入口「售后申请」在「营业日报」下方 ────────────────────────
    await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.entrybar', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const entries = await page.evaluate(() => Array.from(document.querySelectorAll('.entrybar .e-lbl')).map((n) => n.textContent.trim()));
    console.log('01 entries', JSON.stringify(entries));
    await page.locator('.entrybar', { hasText: '售后申请' }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, '01-workbench-after-sales-entry.png');

    // ── 02 售后申请页（待处理）─────────────────────────────────────────────
    await page.locator('.entrybar', { hasText: '售后申请' }).first().click();
    await page.waitForSelector('.as, .hint', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-after-sales-pending.png');

    // ── 03 驳回：理由弹层（必填）───────────────────────────────────────────
    await page.locator('.op-reject').last().click();
    await page.waitForTimeout(600);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-reject-sheet.png');

    // 真实提交一条驳回：填理由 → 提交 → toast + 列表刷新
    await page.locator('.sheet__input input').fill('核查出品与描述一致，不符合退款条件');
    await page.locator('.sheet__save').click();
    await page.waitForTimeout(700);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-reject-submitted-toast.png');

    // ── 05 切「已处理」：已退款/已驳回/退款失败终态 ─────────────────────────
    await page.locator('.seg-i', { hasText: '已处理' }).first().click();
    await page.waitForTimeout(900);
    console.log('05 state', JSON.stringify(await readState()));
    await shot(page, '05-after-sales-done.png');

    // ── 06 同意退款：确认弹窗（最后一张，弹窗无需中途关闭）────────────────────
    await page.locator('.seg-i', { hasText: '待处理' }).first().click();
    await page.waitForTimeout(800);
    await page.locator('.op-approve').first().click();
    await page.waitForTimeout(600);
    console.log('06 state', JSON.stringify(await readState()));
    await shot(page, '06-approve-confirm.png');

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
