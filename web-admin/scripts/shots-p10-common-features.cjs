// 常用功能 P0 收尾（在线客服 IM + 差评申诉）后台手机视口截图（390×844 dpr=2）
//   01 评价管理「差评申诉」页签（待审核列表 + 通过/驳回）
//   02 申诉审核弹窗（通过申诉，审核说明选填）
//   03 在线客服会话列表（待回复角标 + 已结束态）
//   04 客服聊天面板（顾客/客服气泡 + 输入区）
//   node scripts/shots-p10-common-features.cjs
// 本轮未部署 → 本地静态服务（dist/build/h5，前缀 /guanli/）+ admin-api 全 mock。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p10-common-features');
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

const IMG = (bg, fg) => 'data:image/svg+xml;base64,' + Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${bg}"/><circle cx="60" cy="48" r="22" fill="${fg}"/><rect x="30" y="80" width="60" height="10" rx="5" fill="#ffb27a"/></svg>`,
).toString('base64');
const IMG_A = IMG('#ffd9c2', '#ff6600');
const IMG_B = IMG('#d9e8ff', '#2d5bd1');

const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();

// 评价（普通页签）：一条待审核 + 一条已通过且带申诉驳回留痕
const REVIEWS = [
    {
        id: 'r9', customerId: '1', customerName: '陈同学', productId: 'p1', rating: 5,
        content: '牛肉面分量足，汤头很香，下次还点！', images: [IMG_B], tags: ['分量足'],
        isAnonymous: false, status: 'pending', reply: null, helpfulCount: 0,
        parentId: null, createdAt: iso(30), appealStatus: null,
    },
    {
        id: 'r8', customerId: '2', customerName: '周同学', productId: 'p1', rating: 2,
        content: '等了四十分钟才送到，饭都凉了。', images: [], tags: [], isAnonymous: true,
        status: 'approved', reply: '已优化出餐与派单流程，抱歉。', helpfulCount: 2,
        parentId: null, createdAt: iso(600),
        appealStatus: 'rejected', appealReason: '当天运力紧张，申请撤回评价。',
        appealResult: '配送超时属实，维持原评价。', appealAt: iso(500),
    },
];

// 差评申诉（待审核）
const APPEALS = [
    {
        id: 'r1', customerId: '1', customerName: '李同学', productId: 'p1', rating: 1,
        content: '菜里有头发，配送也超时了半小时，体验很差。', images: [IMG_A], tags: ['分量足'],
        isAnonymous: false, status: 'approved', reply: '十分抱歉，已为您申请补偿。', helpfulCount: 0,
        parentId: null, createdAt: iso(60 * 24 * 2),
        appealStatus: 'pending', appealReason: '异物为打包时混入的包装纸，非出品问题，申请复核。',
        appealImages: [IMG_B], appealAt: iso(120), appealResult: null, appealReviewedAt: null,
    },
    {
        id: 'r4', customerId: '3', customerName: '吴同学', productId: 'p1', rating: 2,
        content: '宫保鸡丁太咸，米饭也偏硬。', images: [], tags: [], isAnonymous: false,
        status: 'approved', reply: null, helpfulCount: 0, parentId: null, createdAt: iso(60 * 24 * 4),
        appealStatus: 'pending', appealReason: '当天顾客自行要求重口味，口味差异非出品问题。',
        appealImages: [IMG_A, IMG_B], appealAt: iso(240), appealResult: null, appealReviewedAt: null,
    },
];

const CONVS = [
    {
        id: 'c1001', customerId: '1', customerName: '李同学', customerPhone: '138****5678',
        orderCode: 'A2400001', subject: null, status: 'open',
        lastMessage: '好的，马上为您催一下后厨～', lastMessageAt: iso(2), lastSenderType: 'admin',
        unreadForCustomer: 1, unreadForAdmin: 0, closedAt: null, createdAt: iso(60 * 24),
    },
    {
        id: 'c1002', customerId: '2', customerName: '王同学', customerPhone: '139****1122',
        orderCode: 'A2400002', subject: null, status: 'open',
        lastMessage: '菜里有异物，可以退款吗？', lastMessageAt: iso(6), lastSenderType: 'customer',
        unreadForCustomer: 0, unreadForAdmin: 2, closedAt: null, createdAt: iso(60),
    },
    {
        id: 'c1003', customerId: '3', customerName: '赵同学', customerPhone: '137****3344',
        orderCode: null, subject: '优惠券使用咨询', status: 'closed',
        lastMessage: '已解决，谢谢！', lastMessageAt: iso(300), lastSenderType: 'customer',
        unreadForCustomer: 0, unreadForAdmin: 0, closedAt: iso(280), createdAt: iso(2000),
    },
];

const MESSAGES = [
    { id: 'm1', conversationId: 'c1001', senderType: 'customer', senderId: '1', content: '你好，我的订单 A2400001 还没送到，能帮忙看下吗？', images: null, readAt: iso(30), createdAt: iso(20) },
    { id: 'm2', conversationId: 'c1001', senderType: 'admin', senderId: '9', content: '您好，已收到，正在为您核实骑手位置，请稍等。', images: null, readAt: iso(18), createdAt: iso(18) },
    { id: 'm3', conversationId: 'c1001', senderType: 'customer', senderId: '1', content: '这是我的取餐码截图。', images: [IMG_A], readAt: iso(8), createdAt: iso(9) },
    { id: 'm4', conversationId: 'c1001', senderType: 'admin', senderId: '9', content: '好的，马上为您催一下后厨～', images: null, readAt: null, createdAt: iso(2) },
];

const ACCESS = {
    isSuperAdmin: true,
    channels: [{ id: '1', code: 'canteen-a', token: 'canteen-a-token', name: '第一食堂', enabled: true, tenantNo: 1, isOfficial: true, memberEnabled: true, mustChangePassword: false }],
    permissions: [],
    mustChangePassword: false,
};

function makeRoute(hits) {
    return async (route) => {
        const req = route.request();
        const body = req.postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        hits.push(body.slice(0, 40));
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('reviewAppeals')) return fulfill({ reviewAppeals: { totalItems: APPEALS.length, items: APPEALS } });
        if (body.includes('approveReviewAppeal')) return fulfill({ approveReviewAppeal: { ...APPEALS[0], appealStatus: 'approved', appealResult: '申诉通过，评价已隐藏。' } });
        if (body.includes('rejectReviewAppeal')) return fulfill({ rejectReviewAppeal: { ...APPEALS[0], appealStatus: 'rejected' } });
        if (body.includes('Reviews(')) return fulfill({ reviews: { totalItems: REVIEWS.length, items: REVIEWS } });
        if (body.includes('campusChatUnread')) return fulfill({ campusChatUnread: { conversationCount: 1, messageCount: 2 } });
        if (body.includes('campusChatConversations')) return fulfill({ campusChatConversations: { total: CONVS.length, items: CONVS } });
        if (body.includes('campusAdminChatMessages')) return fulfill({ campusAdminChatMessages: MESSAGES });
        if (body.includes('campusReplyChat')) return fulfill({ campusReplyChat: { id: 'm5', conversationId: 'c1001', senderType: 'admin', senderId: '9', content: '已为您催单，预计 5 分钟内送达。', images: null, readAt: null, createdAt: iso(0) } });
        if (body.includes('campusCloseChatConversation')) return fulfill({ campusCloseChatConversation: { ...CONVS[0], status: 'closed', closedAt: iso(0) } });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

async function newPage(browser, hits) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-40');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute(hits));
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

    // ── 01/02 评价管理 · 差评申诉 ─────────────────────────
    {
        const hits = [];
        const { ctx, page } = await newPage(browser, hits);
        await page.goto(BASE + '#/pages/review/list/index', { waitUntil: 'load', timeout: 60000 });
        // uni-app H5 会 <text> 渲染为 <uni-text>，故用标签名兼容两种选择器
        await page.waitForSelector('.tabs uni-text, .tabs text', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(2000);

        // 切到第 5 个页签「差评申诉」
        const switched = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('.tabs uni-text, .tabs text'));
            const t = tabs[4];
            if (!t) return false;
            t.click();
            return true;
        });
        console.log('01 switch appeal tab', switched);
        await page.waitForSelector('.filters', { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        const state1 = await page.evaluate(() => ({
            tabs: Array.from(document.querySelectorAll('.tabs uni-text, .tabs text')).map((e) => e.innerText.trim()),
            filters: Array.from(document.querySelectorAll('.filters uni-text, .filters text')).map((e) => e.innerText.trim()),
            cards: document.querySelectorAll('.card').length,
            ops: Array.from(document.querySelectorAll('.card .ops .op')).map((e) => e.innerText.trim()),
            appealTexts: Array.from(document.querySelectorAll('.appeal')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
        }));
        console.log('01 state', JSON.stringify(state1));
        await shot(page, '01-admin-review-appeal-pending.png');

        // 点「通过申诉」→ 审核弹窗
        const clicked = await page.evaluate(() => {
            const btn = document.querySelector('.card .ops .op.main');
            if (!btn) return false;
            btn.click();
            return true;
        });
        console.log('02 click approve', clicked);
        await page.waitForSelector('.am-sheet', { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        // 填审核说明，展示输入态
        await page.fill('.am-sheet__area', '已核对打包监控，异物为顾客自述，维持评价。').catch(() => undefined);
        await page.waitForTimeout(400);
        const state2 = await page.evaluate(() => {
            const sheet = document.querySelector('.am-sheet');
            return {
                open: !!sheet,
                title: document.querySelector('.am-sheet__title')?.textContent?.trim() || '',
                desc: document.querySelector('.am-sheet__desc')?.textContent?.trim() || '',
                note: document.querySelector('.am-sheet__area')?.value || '',
                buttons: Array.from(document.querySelectorAll('.am-sheet__ops .am-btn')).map((e) => e.innerText.trim()),
            };
        });
        console.log('02 state', JSON.stringify(state2));
        await shot(page, '02-admin-review-appeal-modal.png');
        await ctx.close();
    }

    // ── 03/04 在线客服 ────────────────────────────────────
    {
        const hits = [];
        const { ctx, page } = await newPage(browser, hits);
        await page.goto(BASE + '#/pages/campus/chat', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.card', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1800);
        const state3 = await page.evaluate(() => ({
            tabs: Array.from(document.querySelectorAll('.head .tabs text')).map((e) => e.innerText.trim()),
            cards: Array.from(document.querySelectorAll('.card')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)),
            badges: document.querySelectorAll('.card .badge').length,
            closedTags: document.querySelectorAll('.card .closed-tag').length,
        }));
        console.log('03 state', JSON.stringify(state3));
        await shot(page, '03-admin-chat-list.png');

        // 打开第一个会话 → 聊天面板
        const opened = await page.evaluate(() => {
            const c = document.querySelector('.card');
            if (!c) return false;
            c.click();
            return true;
        });
        console.log('04 open panel', opened);
        await page.waitForSelector('.panel', { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const state4 = await page.evaluate(() => ({
            panel: !!document.querySelector('.panel'),
            who: document.querySelector('.panel__name')?.textContent?.trim() || '',
            sub: document.querySelector('.panel__sub')?.innerText?.replace(/\s+/g, ' ').trim() || '',
            hint: document.querySelector('.panel__meta')?.innerText?.replace(/\s+/g, ' ').trim() || '',
            msgs: document.querySelectorAll('.msg').length,
            imgs: document.querySelectorAll('.msg__img').length,
            input: !!document.querySelector('.panel__area'),
            send: document.querySelector('.panel__send')?.innerText?.trim() || '',
        }));
        console.log('04 state', JSON.stringify(state4));
        await shot(page, '04-admin-chat-panel.png');
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
