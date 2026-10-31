// §110 售后管理（服务端分页 + 筛选计数 + 列表直显退款失败原因 + 商家回复可发图）后台截图（390×844 dpr=2）
//   01 首屏列表：筛选 chip 带全店计数，3 条退款失败单置顶带原因条，底部「加载更多」
//   02 点「加载更多」一次：25 条全部加载，底部变「已显示全部」
//   03 筛选「退款失败」：服务端筛选后只剩 3 条失败单，chip 高亮
//   04 打开待处理单详情：回复区选图上传成功，缩略图 + ＋号 + 输入框 + 发送按钮
//   node scripts/shots-p110-after-sales-list.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p110-after-sales-list');
const ROOT = path.resolve(__dirname, '..', 'dist', 'build', 'h5');
/** 选图用仓库里已有的一张真实 png（§84 截图） */
const PICK_FILE = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p84-after-sales-retry', '01-failed-pinned-retry-entry.png');

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

// ── 纯色 PNG（data URL）：mock 上传返回的 source、凭证图与协商配图用它 ──────────
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
}
function solidPng(size, [r, g, b]) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const stride = size * 3 + 1;
    const raw = Buffer.alloc(stride * size);
    for (let y = 0; y < size; y += 1) {
        const off = y * stride;
        raw[off] = 0;
        for (let x = 0; x < size; x += 1) {
            const p = off + 1 + x * 3;
            raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
        }
    }
    const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
    return 'data:image/png;base64,' + png.toString('base64');
}
const IMG_BLUE = solidPng(32, [22, 119, 255]);
const IMG_ORANGE = solidPng(32, [250, 140, 22]);

const ACCESS = {
    isSuperAdmin: true,
    channels: [{ id: '201', code: 'canteen-a', token: 'canteen-a-token', name: '第一食堂', enabled: true, tenantNo: 1, isOfficial: true, memberEnabled: true, mustChangePassword: false }],
    permissions: [],
    mustChangePassword: false,
};

const at = (minAgo) => new Date(Date.now() - minAgo * 60 * 1000).toISOString();
const FAIL_ERROR = '支付渠道返回：订单已关闭，无法原路退回';

/** 每行补齐 §101/§110 字段（缺字段页面会崩） */
function row(base) {
    return {
        rejectReason: null,
        evidenceImages: [],
        messageCount: 0,
        refundedAt: null,
        overdue: false,
        unread: false,
        dueSoon: false,
        tags: [],
        assigneeUserId: null,
        assigneeName: null,
        riskReason: null,
        slaPaused: false,
        slaPausedReason: null,
        escalated: false,
        refundReviewPending: false,
        exchangeTrackingNo: null,
        exchangeCarrier: null,
        refundError: null,
        ...base,
    };
}

// 25 条：3 退款失败（2 条带原因、1 条原因为空）+ 2 待处理 + 20 已退款
const rows = [
    row({ id: '701', orderId: '401', orderCode: 'A2400011', state: 'RefundFailed', type: 'refund_only',
        reason: '菜品与描述不符', description: '点的是不辣，实际很辣。', refundAmount: 3250,
        evidenceImages: [IMG_BLUE], messageCount: 2, customerName: '李同学', createdAt: at(35),
        overdue: true, unread: true, refundError: FAIL_ERROR }),
    row({ id: '702', orderId: '402', orderCode: 'A2400013', state: 'RefundFailed', type: 'refund_only',
        reason: '少送商品', description: '少了一份米饭。', refundAmount: 1200,
        messageCount: 1, customerName: '王同学', createdAt: at(70),
        overdue: true, refundError: FAIL_ERROR }),
    row({ id: '703', orderId: '403', orderCode: 'A2400015', state: 'RefundFailed', type: 'refund_only',
        reason: '口味差异', description: '口味和上次不一样。', refundAmount: 2900,
        messageCount: 0, customerName: '赵同学', createdAt: at(96), refundError: null }),
    row({ id: '704', orderId: '404', orderCode: 'A2400012', state: 'Pending', type: 'refund_only',
        reason: '少送商品', description: '少了一份米饭。', refundAmount: 1200,
        evidenceImages: [IMG_BLUE], messageCount: 2, customerName: '周同学', createdAt: at(12), unread: true }),
    row({ id: '705', orderId: '405', orderCode: 'A2400014', state: 'Pending', type: 'refund_only',
        reason: '食品安全', description: '菜里有异物。', refundAmount: 1800,
        messageCount: 1, customerName: '孙同学', createdAt: at(20), dueSoon: true }),
    ...Array.from({ length: 20 }, (_, i) => {
        const n = 20 + i;
        return row({
            id: String(800 + i), orderId: String(500 + i),
            orderCode: 'A24000' + String(n).padStart(2, '0'),
            state: 'Refunded', type: i % 5 === 0 ? 'return_refund' : 'refund_only',
            reason: i % 3 === 0 ? '配送超时' : '商品缺货',
            description: '',
            refundAmount: 300 + i * 100,
            messageCount: i % 4 === 0 ? 1 : 0,
            customerName: '顾客' + String(i + 1).padStart(2, '0'),
            createdAt: at(130 + i * 12),
            refundedAt: at(120 + i * 12),
        });
    }),
];

const totalAll = rows.length;
const stateCounts = [
    { state: 'Pending', count: rows.filter((r) => r.state === 'Pending').length },
    { state: 'Refunded', count: rows.filter((r) => r.state === 'Refunded').length },
    { state: 'RefundFailed', count: rows.filter((r) => r.state === 'RefundFailed').length },
];
const pendingCount = () => rows.filter((r) => r.state === 'Pending').length;

/** 详情：取待处理单 A2400012 造协商记录 + 凭证图 + 一条状态流转 */
function detailOf(id) {
    const r = rows.find((x) => String(x.id) === String(id)) || rows[3];
    return {
        request: { ...r, refundError: r.refundError },
        messages: [
            { id: 'm1', senderType: 'customer', senderName: '周同学', content: '点的是加饭，实际没加，能退一份米饭的钱吗？', images: [], createdAt: at(20) },
            { id: 'm2', senderType: 'customer', senderName: '周同学', content: '这是小票照片。', images: [IMG_BLUE], createdAt: at(18) },
        ],
        messageTotal: 2,
        stateHistory: [{ fromState: null, toState: 'Pending', createdAt: at(12) }],
        refundError: r.refundError ?? null,
        actualRefundAmount: null,
        timeoutHours: 24,
    };
}

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const headers = route.request().headers() || {};
        const ctype = String(headers['content-type'] || '');
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        let vars = {};
        try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }
        // 上传走 multipart（form 里含 operations/createAssets），先于所有 query 匹配
        if (ctype.includes('multipart/form-data') || raw.includes('createAssets')) {
            return fulfill({ createAssets: [{ id: '9001', preview: IMG_ORANGE, source: IMG_ORANGE, mimeType: 'image/png' }] });
        }
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantAfterSalesDetail')) {
            return fulfill({ campusMerchantAfterSalesDetail: detailOf(vars.id) });
        }
        if (raw.includes('campusMerchantAfterSalesReply')) {
            return fulfill({ campusMerchantAfterSalesReply: {
                id: 'm' + Date.now(), senderType: 'admin', senderName: '第一食堂',
                content: vars.content, images: vars.images || [], createdAt: at(0),
            } });
        }
        // 列表：服务端状态筛选 + skip/take 分页，stateCounts 为全店计数
        if (raw.includes('campusMerchantAfterSales')) {
            const state = vars.state || null;
            const skip = Number(vars.skip ?? 0);
            const take = Number(vars.take ?? 20);
            const matched = state ? rows.filter((r) => r.state === state) : rows;
            return fulfill({
                campusMerchantAfterSales: {
                    items: matched.slice(skip, skip + take),
                    pendingCount: pendingCount(),
                    total: matched.length,
                    stateCounts,
                    skip,
                    take,
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p110');
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
    const shot = async (page, name, full = false) => {
        await page.screenshot({ path: path.join(OUT, name), fullPage: full });
        console.log('shot ' + name);
    };
    const { ctx, page } = await newPage(browser);

    const readState = () => page.evaluate(() => {
        const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
        return {
            chips: Array.from(document.querySelectorAll('.flt__i')).map((n) => ({
                text: n.textContent.replace(/\s+/g, '').trim(),
                on: n.classList.contains('on'),
            })),
            cardCount: document.querySelectorAll('.as').length,
            cards: Array.from(document.querySelectorAll('.as')).slice(0, 3).map((n) => ({
                code: txt(n.querySelector('.a-code')),
                state: txt(n.querySelector('.a-state')),
                fail: txt(n.querySelector('.a-fail')),
                retry: txt(n.querySelector('.op-retry')),
            })),
            more: txt(document.querySelector('.more__btn')),
            end: txt(document.querySelector('.more__end')),
            panel: (() => {
                const p = document.querySelector('.panel');
                if (!p) return null;
                return {
                    code: txt(p.querySelector('.panel__code')),
                    msgs: Array.from(p.querySelectorAll('.msg')).map((m) => ({
                        who: txt(m.querySelector('.msg__who')),
                        text: txt(m.querySelector('.msg__text')),
                        imgs: m.querySelectorAll('.msg__img').length,
                    })),
                    rImgs: p.querySelectorAll('.r-img').length,
                    rAdd: txt(p.querySelector('.r-add')),
                    iptPh: p.querySelector('.panel__ipt input')?.getAttribute('placeholder')
                        || txt(p.querySelector('.panel__ipt .uni-input-placeholder')),
                    send: txt(p.querySelector('.panel__send')),
                };
            })(),
        };
    });

    // ── 01 首屏：筛选 chip 计数 + 退款失败单置顶带原因条 + 加载更多 ──────────────
    await page.goto(BASE + '#/pages/campus/merchant-after-sales', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.as, .hint', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-list-paged-failed-reason.png', true);

    // ── 02 加载更多：25 条全部加载，底部「已显示全部」 ──────────────────────────
    await page.locator('.more__btn').click();
    await page.waitForSelector('.more__end', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    await page.locator('.more__end').scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(400);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-load-more-all.png');

    // ── 03 筛选「退款失败」：服务端筛选只剩 3 条 + chip 高亮 ─────────────────────
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.flt__i', { hasText: '退款失败' }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.as').length === 3, null, { timeout: 15000 }).catch(() => undefined);
    // chip 行可横向滚动：横向滚一点，让高亮的「退款失败 3」chip 完整露出（计数不被裁掉）
    const fltBox = await page.locator('.flt').boundingBox();
    if (fltBox) {
        await page.mouse.move(fltBox.x + fltBox.width / 2, fltBox.y + fltBox.height / 2);
        await page.mouse.wheel(140, 0);
    }
    await page.waitForTimeout(700);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-filter-refund-failed.png');

    // ── 04 待处理单详情：回复区选图 → 上传成功展示缩略图 ─────────────────────────
    await page.locator('.flt__i').first().click();
    await page.waitForTimeout(900);
    await page.locator('.as', { hasText: 'A2400012' }).first().click();
    await page.waitForSelector('.panel__ipt', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);

    const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null);
    await page.locator('.r-add').click();
    const chooser = await chooserPromise;
    if (chooser) {
        await chooser.setFiles(PICK_FILE);
        console.log('filechooser ok ->', path.basename(PICK_FILE));
        await page.waitForSelector('.r-img', { timeout: 15000 }).catch(() => undefined);
    } else {
        console.log('filechooser TIMEOUT：退化为仅截详情面板');
    }
    await page.waitForTimeout(800);
    console.log('04 state', JSON.stringify(await readState()));
    await shot(page, '04-reply-images.png');

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
