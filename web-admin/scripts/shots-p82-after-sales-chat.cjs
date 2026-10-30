// §82 售后详情面板（协商对话 + 凭证大图 + 状态时间线）后台截图（390×844 dpr=2）
//   01 售后列表：卡片带「点击查看详情」入口
//   02 详情面板：凭证九宫格 + 状态时间线
//   03 详情面板：协商记录（顾客气泡 + 商家回复）
//   04 输入并发送：右侧新增商家气泡 + toast
//   05 已退款单：输入框置灰（只读提示）
//   06 凭证大图预览（uni.previewImage，弹层留最后一张）
//   node scripts/shots-p82-after-sales-chat.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p82-after-sales-chat');
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
/** 本地 SVG 占位图：避免外链图片 404 导致凭证/大图空白 */
const img = (label, color) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="${color}"/><text x="160" y="172" font-size="26" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`,
);

let rows = [
    {
        id: '801', orderId: '301', orderCode: 'A2400001', state: 'Pending', type: 'refund_only',
        reason: '菜品与描述不符', description: '点的是微辣，实际非常辣，孩子吃不了；希望退款。',
        refundAmount: 3250, rejectReason: null, evidenceImages: [img('异物照片 1', '#d46b08'), img('异物照片 2', '#d4380d'), img('餐品整体', '#531dab')],
        messageCount: 2, customerName: '李同学', createdAt: at(26), refundedAt: null, overdue: false,
    },
    {
        id: '802', orderId: '302', orderCode: 'A2400004', state: 'Pending', type: 'refund_only',
        reason: '少送商品', description: '少了一份米饭，打包袋里只有菜。',
        refundAmount: 200, rejectReason: null, evidenceImages: [img('打包袋', '#096dd9')],
        messageCount: 0, customerName: '王同学', createdAt: at(74), refundedAt: null, overdue: false,
    },
    {
        id: '803', orderId: '303', orderCode: 'A2400005', state: 'Refunded', type: 'refund_only',
        reason: '配送超时', description: '等了 50 分钟才到，菜已经凉了。',
        refundAmount: 2900, rejectReason: null, evidenceImages: [], messageCount: 3,
        customerName: '赵同学', createdAt: at(190), refundedAt: at(150), overdue: false,
    },
];

/** 每单的对话与时间线 */
const chats = {
    '801': {
        messages: [
            { id: '9001', senderType: 'customer', senderName: '李同学', content: '你好，菜里有异物，麻烦看一下。', images: [img('异物特写', '#d4380d')], createdAt: at(24) },
            { id: '9002', senderType: 'admin', senderName: '第一食堂', content: '收到，我们马上核实后厨出品记录。', images: [], createdAt: at(20) },
        ],
        stateHistory: [
            { fromState: null, toState: 'Pending', createdAt: at(26) },
        ],
    },
    '802': { messages: [], stateHistory: [{ fromState: null, toState: 'Pending', createdAt: at(74) }] },
    '803': {
        messages: [
            { id: '9003', senderType: 'customer', senderName: '赵同学', content: '等太久，菜都凉了。', images: [], createdAt: at(180) },
            { id: '9004', senderType: 'admin', senderName: '第一食堂', content: '非常抱歉，本次已原路退款 ¥29.00。', images: [], createdAt: at(160) },
            { id: '9005', senderType: 'customer', senderName: '赵同学', content: '收到退款了，谢谢。', images: [], createdAt: at(120) },
        ],
        stateHistory: [
            { fromState: null, toState: 'Pending', createdAt: at(190) },
            { fromState: 'Pending', toState: 'Approved', createdAt: at(170) },
            { fromState: 'Approved', toState: 'Refunded', createdAt: at(150) },
        ],
    },
};

const pendingCount = () => rows.filter((r) => r.state === 'Pending').length;

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        let vars = {};
        try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantAfterSalesReply')) {
            const id = String(vars.id || '');
            const chat = chats[id];
            const msg = {
                id: '9' + String(9000 + id.length + Date.now() % 1000),
                senderType: 'admin', senderName: '第一食堂',
                content: String(vars.content || ''), images: [], createdAt: at(0),
            };
            if (chat) chat.messages.push(msg);
            const row = rows.find((r) => String(r.id) === id);
            if (row) row.messageCount += 1;
            return fulfill({ campusMerchantAfterSalesReply: msg });
        }
        if (raw.includes('campusMerchantAfterSalesDetail')) {
            const id = String(vars.id || '');
            const row = rows.find((r) => String(r.id) === id);
            const chat = chats[id] || { messages: [], stateHistory: [] };
            return fulfill({
                campusMerchantAfterSalesDetail: {
                    request: row,
                    messages: chat.messages,
                    messageTotal: chat.messages.length,
                    stateHistory: chat.stateHistory,
                    refundError: null,
                    actualRefundAmount: row.state === 'Refunded' ? row.refundAmount : null,
                    timeoutHours: 48,
                },
            });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p82');
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
        cards: Array.from(document.querySelectorAll('.as')).map((r) => ({
            code: r.querySelector('.a-code')?.textContent?.trim() || '',
            state: r.querySelector('.a-state')?.textContent?.trim() || '',
            detailHint: r.querySelector('.a-detail')?.textContent?.trim() || '',
        })),
        panel: !!document.querySelector('.panel'),
        code: document.querySelector('.panel__code')?.textContent?.trim() || '',
        blocks: Array.from(document.querySelectorAll('.p-title')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
        evidence: document.querySelectorAll('.p-grid__i').length,
        timeline: Array.from(document.querySelectorAll('.p-tl__t')).map((n) => n.textContent.trim()),
        msgs: Array.from(document.querySelectorAll('.msg')).map((n) => ({
            side: n.classList.contains('mine') ? 'admin' : 'customer',
            text: n.querySelector('.msg__text')?.textContent?.trim() || '',
        })),
        footer: document.querySelector('.panel__ro')?.textContent?.trim()
            || document.querySelector('.panel__ipt input')?.getAttribute('placeholder') || '',
        toast: (() => {
            const t = document.querySelector('.uni-toast') || document.querySelector('[class*="uni-toast"]');
            return t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
        })(),
    }));

    // ── 01 售后列表：卡片带详情入口 ─────────────────────────────────────────
    await page.goto(BASE + '#/pages/campus/merchant-after-sales', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.as, .hint', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-list-detail-entry.png');

    // ── 02 详情面板：凭证九宫格 + 时间线 ────────────────────────────────────
    await page.locator('.as').first().click();
    await page.waitForSelector('.panel .p-block', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-panel-evidence-timeline.png');

    // ── 03 第二单（A2400004）：无凭证/无留言，展示空对话态 ────────────────────
    await page.locator('.panel__x').click();
    await page.waitForTimeout(500);
    await page.locator('.as').nth(1).click();
    await page.waitForSelector('.panel .p-block', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-panel-chat-empty.png');

    // ── 04 输入并发送：右侧新增商家气泡 + 列表留言数 +1 ─────────────────────
    await page.locator('.panel__ipt input').fill('马上给您补一份米饭，师傅已重新出锅～');
    await page.locator('.panel__send').click();
    await page.waitForTimeout(800);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-reply-sent.png');

    // 关闭面板，回到列表
    await page.locator('.panel__x').click();
    await page.waitForTimeout(600);
    await page.locator('.flt__i', { hasText: '已退款' }).first().click();
    await page.waitForTimeout(800);
    console.log('05 list', JSON.stringify(await readState()));

    // ── 05 已退款单：输入框置灰（只读提示）──────────────────────────────────
    await page.locator('.as').first().click();
    await page.waitForSelector('.panel .p-block', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    console.log('05 state', JSON.stringify(await readState()));
    await shot(page, '05-panel-readonly.png');

    // ── 06 凭证大图预览（uni.previewImage，弹层留最后一张）───────────────────
    await page.locator('.panel__x').click();
    await page.waitForTimeout(500);
    await page.locator('.flt__i', { hasText: '待处理' }).first().click();
    await page.waitForTimeout(700);
    await page.locator('.as').first().click();
    await page.waitForSelector('.p-grid__i', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    await page.locator('.p-grid__i').first().click();
    await page.waitForTimeout(900);
    console.log('06 state', JSON.stringify(await readState()));
    await shot(page, '06-evidence-preview.png');

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
