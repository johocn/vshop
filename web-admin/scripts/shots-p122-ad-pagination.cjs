// §122 平台广告投放列表分页截图（390×844 dpr=2）
//   01 平台审核：共 45 条，首屏 20 条 + 「加载更多」
//   02 点「加载更多」：40 条，按钮仍在
//   03 再点一次：45 条，按钮消失并显示「已加载全部」
//   04 切「已结束」筛选：回到第 1 页（7 条）且请求带 status=finished
//   node scripts/shots-p122-ad-pagination.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p122-ad-pagination');
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

/** 45 条投放单：前 40 条 running（其中 3 条已过期→finished），后 5 条 pendingReview */
function row(i, status) {
    const start = new Date(Date.now() - (i % 7) * 86400_000);
    const end = new Date(start.getTime() + 3 * 86400_000);
    const p = (n) => String(n).padStart(2, '0');
    const d = (t) => `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
    return {
        id: String(3000 + i), channelId: '201',
        slot: i % 2 === 0 ? 'homeBanner' : 'shopTop',
        title: `投放单 #${3000 + i}`,
        imageUrl: null, linkUrl: null,
        startDate: d(start), endDate: d(end), days: 4,
        unitPriceFen: 1500, totalFen: 6000,
        status, live: status === 'running',
        payRef: `ADPAY-${3000 + i}`, paidAt: start.toISOString(),
        reviewNote: null, reviewedBy: null, reviewedAt: null,
        createdAt: start.toISOString(),
    };
}

const ALL = [];
for (let i = 0; i < 45; i += 1) ALL.push(row(i, i >= 40 ? 'pendingReview' : i < 3 ? 'finished' : 'running'));
// 后端视图态：已结束的 running 已按 endDate 反推，这里直接给 finished 便于读回
const FINISHED = ALL.filter(r => r.status === 'finished');

function pageOf(status, skip, take) {
    const rows = status === 'finished' ? FINISHED : ALL;
    return { total: rows.length, items: rows.slice(skip, skip + take) };
}

function makeRoute() {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('campusAdSlots')) return fulfill({ campusAdSlots: SLOTS });
        if (raw.includes('campusMerchantAds')) return fulfill({ campusMerchantAds: [] });
        if (raw.includes('campusAdCampaigns')) {
            let vars = {};
            try { vars = JSON.parse(raw).variables || {}; } catch (e) { vars = {}; }
            console.log('  [campaigns]', JSON.stringify({ status: vars.status, skip: vars.skip, take: vars.take }));
            return fulfill({ campusAdCampaigns: pageOf(vars.status || '', Number(vars.skip) || 0, Number(vars.take) || 20) });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p122');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
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
        tab: document.querySelector('.tabs .tab.on')?.textContent?.trim() || '',
        filter: document.querySelector('.filters .chip.on')?.textContent?.trim() || '',
        cards: Array.from(document.querySelectorAll('.card .head .name')).map((n) => n.textContent.trim()),
        more: document.querySelector('.more')?.textContent?.trim() || '',
        tail: document.querySelector('.tail')?.textContent?.trim() || '',
    }));

    await page.goto(BASE + '#/pages/campus/ads', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.tabs .tab', { timeout: 30000 });
    await page.waitForTimeout(300);
    await page.locator('.tabs .tab', { hasText: '平台审核' }).first().click();
    await page.waitForTimeout(600);
    const s1 = await readState();
    console.log('01 state', JSON.stringify({ filter: s1.filter, n: s1.cards.length, more: s1.more, tail: s1.tail }));
    await shot(page, '01-ad-review-page1-20.png');

    await page.locator('.more').first().click();
    await page.waitForTimeout(700);
    const s2 = await readState();
    console.log('02 state', JSON.stringify({ n: s2.cards.length, more: s2.more, tail: s2.tail }));
    await shot(page, '02-ad-review-page2-40.png');

    await page.locator('.more').first().click();
    await page.waitForTimeout(700);
    const s3 = await readState();
    console.log('03 state', JSON.stringify({ n: s3.cards.length, more: s3.more, tail: s3.tail, last: s3.cards.slice(-1) }));
    await shot(page, '03-ad-review-all-45.png');

    await page.locator('.filters .chip', { hasText: '已结束' }).first().click();
    await page.waitForTimeout(700);
    const s4 = await readState();
    console.log('04 state', JSON.stringify({ filter: s4.filter, n: s4.cards.length, more: s4.more, tail: s4.tail, first: s4.cards[0] }));
    await shot(page, '04-ad-review-finished-filter.png');

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
