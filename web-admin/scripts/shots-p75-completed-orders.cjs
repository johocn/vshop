// §75 今日已完成订单对账 后台截图（390×844 dpr=2）
//   01 今日列表 + 对账汇总（单量/总额/退款/实收/客单价）
//   02 关键词检索命中（楼栋关键词，结果计数 共 N / M 条）
//   03 检索无结果空态
//   04 一键复制对账清单 toast
//   node scripts/shots-p75-completed-orders.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p75-completed-orders');
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

/** 已完成订单（送达时间 = 当前时刻往前 n 分钟）：手机号为脱敏号（后端号码保护同口径） */
const mkDone = (id, code, minutesAgo, extra = {}) => ({
    id, code,
    deliveredAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - (minutesAgo + 25) * 60 * 1000).toISOString(),
    total: 3250, refundAmount: 0, netAmount: 3250,
    building: '3 号宿舍楼', zone: '东区', route: 'R1', riderName: null,
    customerPhone: '138****1111', lineText: '宫保鸡丁×1、米饭×2', note: null,
    ...extra,
});

const ITEMS = [
    mkDone('201', 'A2400001', 8),
    mkDone('202', 'A2400002', 24, {
        total: 2800, refundAmount: 2600, netAmount: 200,
        building: '1 号教学楼', zone: '西区', customerPhone: '139****2222',
        lineText: '香菇滑鸡饭×1', note: '少饭',
    }),
    mkDone('203', 'A2400003', 41, {
        total: 4500, netAmount: 4500, building: '5 号宿舍楼', customerPhone: '137****3333',
        lineText: '套餐·双人餐×1、可乐×2', route: 'R3',
    }),
    mkDone('204', 'A2400004', 63, {
        total: 6100, netAmount: 6100, building: '3 号宿舍楼', customerPhone: '136****4444',
        lineText: '红烧肉×2、米饭×3', note: '不要香菜',
    }),
    mkDone('205', 'A2400005', 87, {
        total: 2900, netAmount: 2900, building: '7 号教学楼', zone: '西区', customerPhone: '135****5555',
        lineText: '凉拌黄瓜×1、米饭×1', route: 'R2',
    }),
    mkDone('206', 'A2400006', 112, {
        total: 3800, netAmount: 3800, building: '2 号宿舍楼', zone: '北区', customerPhone: '134****6666',
        lineText: '酸菜鱼×1、米饭×2', riderName: '张三',
    }),
    mkDone('207', 'A2400007', 138, {
        total: 2600, netAmount: 2600, building: '1 号宿舍楼', customerPhone: '133****7777',
        lineText: '鸡蛋炒饭×1',
    }),
    mkDone('208', 'A2400008', 160, {
        total: 5200, netAmount: 5200, building: '3 号宿舍楼', customerPhone: '132****8888',
        lineText: '宫保鸡丁×2、米饭×4',
    }),
];

const NOW = new Date().toISOString();
const START = new Date(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00+08:00').toISOString();
const COMPLETED = {
    items: ITEMS,
    total: 8,
    totalAmount: 31150,
    refundAmount: 2600,
    netAmount: 28550,
    avgTicket: 3569,
    start: START,
    end: NOW,
};

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantCompletedOrders')) return fulfill({ campusMerchantCompletedOrders: COMPLETED });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p75');
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
        pill: document.querySelector('.card .pill')?.textContent?.trim() || '',
        segs: Array.from(document.querySelectorAll('.card .seg-i')).map((s) => s.textContent.trim()),
        kpis: Array.from(document.querySelectorAll('.card .kpi')).map((k) => k.textContent.trim().replace(/\s+/g, ' ')),
        count: document.querySelector('.countbar .count')?.textContent?.trim() || '',
        copyText: document.querySelector('.countbar .copy-btn')?.textContent?.trim() || '',
        cards: Array.from(document.querySelectorAll('.list .order')).map((o) => ({
            code: o.querySelector('.o-code')?.textContent?.trim() || '',
            time: o.querySelector('.o-time')?.textContent?.trim() || '',
            net: o.querySelector('.o-net')?.textContent?.trim() || '',
            place: o.querySelector('.o-place')?.textContent?.trim() || '',
            refund: o.querySelector('.o-refund')?.textContent?.trim().replace(/\s+/g, ' ') || '',
            phone: o.querySelector('.o-phone')?.textContent?.trim() || '',
        })),
        empty: document.querySelector('.hint.empty')?.textContent?.trim() || '',
    }));

    await page.goto(BASE + '#/pages/campus/completed-orders', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.card .kpis', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1200);

    // ── 01 今日列表 + 对账汇总 ────────────────────────────────────────────
    console.log('01 state', JSON.stringify(await readState()));
    await shot(page, '01-completed-orders-today.png');

    // ── 02 关键词检索命中（楼栋关键词「宿舍」）────────────────────────────
    await page.locator('.searchbar .s-input input').fill('宿舍');
    await page.waitForTimeout(600);
    console.log('02 state', JSON.stringify(await readState()));
    await shot(page, '02-completed-orders-search-hit.png');

    // ── 03 检索无结果空态 ────────────────────────────────────────────────
    await page.locator('.searchbar .s-input input').fill('zzz');
    await page.waitForTimeout(600);
    console.log('03 state', JSON.stringify(await readState()));
    await shot(page, '03-completed-orders-search-empty.png');

    // ── 04 一键复制对账清单：toast 反馈 ───────────────────────────────────
    await page.locator('.searchbar .s-clear').click();
    await page.waitForTimeout(500);
    await page.locator('.countbar .copy-btn').click();
    await page.waitForTimeout(600);
    console.log('04 state', JSON.stringify({
        toast: await page.evaluate(() => (document.querySelector('uni-toast') || document.querySelector('.uni-toast'))?.textContent?.trim() || ''),
    }));
    await shot(page, '04-completed-orders-copy-toast.png');

    await ctx.close();
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
