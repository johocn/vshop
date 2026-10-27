// P2-3 广告投放后台截图（390×844 dpr=2）
//   01 商家自助：报价表单 + 我的投放（待支付/待审核/投放中/驳回）
//   02 平台审核：驳回弹框
//   node scripts/shots-p17-ads.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p17-ads');
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

const SLOTS = [
    { code: 'homeBanner', name: '首页横幅', unitPriceFen: 1500 },
    { code: 'shopTop', name: '店铺页顶部', unitPriceFen: 800 },
];

function row(id, slot, title, startDate, endDate, days, unitPriceFen, status, extra = {}) {
    return {
        id, channelId: '201', slot, title,
        imageUrl: 'https://cdn.yourbao.cn/ads/banner.jpg', linkUrl: '/pages/menu/index',
        startDate, endDate, days, unitPriceFen, totalFen: unitPriceFen * days,
        status, live: status === 'running',
        payRef: status === 'pendingPay' ? null : `ADPAY-17610000${id}-6182`,
        paidAt: status === 'pendingPay' ? null : '2026-10-27T04:12:00.000Z',
        reviewNote: null, reviewedBy: null, reviewedAt: null,
        createdAt: '2026-10-27T03:58:00.000Z',
        ...extra,
    };
}

const MINE = [
    row('101', 'homeBanner', '新品上市 · 香菇滑鸡饭', '2026-10-28', '2026-11-03', 7, 1500, 'pendingPay'),
    row('102', 'shopTop', '开业满减 · 满 20 减 3', '2026-10-29', '2026-11-04', 7, 800, 'pendingReview'),
    row('103', 'homeBanner', '双人套餐 · 限时 29.9', '2026-10-25', '2026-10-31', 7, 1500, 'running'),
    row('104', 'shopTop', '夜宵档 · 22 点后 8 折', '2026-11-05', '2026-11-08', 4, 800, 'rejected', {
        reviewNote: '素材含夸大宣传用语，请修改文案后重新投放。',
        reviewedBy: '9', reviewedAt: '2026-10-26T06:20:00.000Z',
    }),
];

const REVIEW = [
    row('102', 'shopTop', '开业满减 · 满 20 减 3', '2026-10-29', '2026-11-04', 7, 800, 'pendingReview'),
    row('105', 'homeBanner', '食堂新档口 · 麻辣香锅', '2026-10-30', '2026-11-01', 3, 1500, 'pendingReview'),
    row('103', 'homeBanner', '双人套餐 · 限时 29.9', '2026-10-25', '2026-10-31', 7, 1500, 'running'),
    row('106', 'shopTop', '早餐时段 · 6:30-9:30', '2026-10-01', '2026-10-20', 20, 800, 'finished'),
    row('104', 'shopTop', '夜宵档 · 22 点后 8 折', '2026-11-05', '2026-11-08', 4, 800, 'rejected', {
        reviewNote: '素材含夸大宣传用语，请修改文案后重新投放。',
    }),
];

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('campusAdSlots')) return fulfill({ campusAdSlots: SLOTS });
        if (body.includes('campusMerchantAds')) return fulfill({ campusMerchantAds: MINE });
        if (body.includes('campusAdCampaigns')) return fulfill({ campusAdCampaigns: REVIEW });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

const readPage = () => ({
    tabs: Array.from(document.querySelectorAll('.tab')).map((e) => (e.className.includes('on') ? '*' : '') + e.innerText.trim()),
    quote: (document.querySelector('.quote .q-val')?.innerText || '').trim(),
    cards: Array.from(document.querySelectorAll('.card')).filter((c) => c.querySelector('.pill'))
        .map((c) => [
            (c.querySelector('.name')?.innerText || '').trim(),
            (c.querySelector('.pill')?.innerText || '').trim(),
            (c.querySelector('.meta')?.innerText || '').replace(/\s+/g, ' ').trim(),
            Array.from(c.querySelectorAll('.foot .act')).map((b) => b.innerText.trim()).join('/'),
        ].join(' | ')),
    filters: Array.from(document.querySelectorAll('.chip')).map((e) => (e.className.includes('on') ? '*' : '') + e.innerText.trim()),
    modal: (() => {
        const m = document.querySelector('.mask .modal');
        if (!m) return null;
        return {
            title: (m.querySelector('.modal-title')?.innerText || '').trim(),
            sub: (m.querySelector('.modal-sub')?.innerText || '').trim(),
            buttons: Array.from(m.querySelectorAll('.act')).map((b) => b.innerText.trim()),
        };
    })(),
});

let BASE = '';

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p17');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute());
    await page.goto(`${BASE}#/pages/campus/ads`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.card .head', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1800);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };

    // ── 01 商家自助 ────────────────────────────────────────
    console.log('01 state', JSON.stringify(await page.evaluate(readPage)));
    await shot('01-admin-ads-merchant.png');

    // ── 02 平台审核 + 驳回弹框 ─────────────────────────────
    await page.evaluate(() => { document.querySelectorAll('.tab')[1]?.click(); });
    await page.waitForSelector('.chip', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    console.log('02 state', JSON.stringify(await page.evaluate(readPage)));
    const opened = await page.evaluate(() => {
        const c = Array.from(document.querySelectorAll('.card')).find((x) => (x.querySelector('.pill')?.innerText || '').includes('待审核'));
        const btn = c && Array.from(c.querySelectorAll('.foot .act')).find((b) => b.innerText.includes('驳回'));
        if (!btn) return false;
        btn.click();
        return true;
    });
    await page.waitForTimeout(800);
    console.log('02 open reject', opened, JSON.stringify(await page.evaluate(readPage)));
    await shot('02-admin-ads-review-reject.png');

    await browser.close();
    server.close();
    console.log('SHOTS DONE ->', OUT);
    process.exit(0);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
