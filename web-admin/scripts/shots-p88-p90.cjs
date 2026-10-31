// §88 / §89 / §90 后台截图（390×844 dpr=2）
//   §88 评价申诉「撤销通过」：已通过卡片撤销入口 → 自绘弹窗（撤销原因必填）→ 撤销后回退「已驳回」并留痕
//   §89 经营数据导出自定义起止日期：区间选择条 → 日期选择器 → 导出 CSV（日期列 YYYY-MM-DD，文件名含区间）
//   §90 广告素材后台上传：从媒体库选图 → 媒体库弹层 → 回填图片 URL + 缩略预览
//   node scripts/shots-p88-p90.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const DOCS = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai');
const OUT88 = path.join(DOCS, 'p88-appeal-revoke');
const OUT89 = path.join(DOCS, 'p89-export-range');
const OUT90 = path.join(DOCS, 'p90-ad-media');
const ROOT = path.resolve(__dirname, '..', 'dist', 'build', 'h5');

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

/** 演示广告图（媒体库缩略图/回填预览用，SVG 由静态服务直出） */
const svg = (bg1, bg2, title, sub) => `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="300">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
<rect width="750" height="300" fill="url(#g)"/>
<text x="375" y="150" font-size="56" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${title}</text>
<text x="375" y="212" font-size="30" font-family="sans-serif" fill="#ffe9d9" text-anchor="middle">${sub}</text></svg>`;
const DEMO = {
    'demo/banner-orange.svg': svg('#ff8a3d', '#ff5a1f', '秋季新品上市', '全场满 30 减 8 · 限时 7 天'),
    'demo/banner-green.svg': svg('#3fbf7f', '#0f9d6b', '轻食季 · 第二份半价', '低卡套餐 12 元起'),
    'demo/banner-blue.svg': svg('#4f9cf9', '#2f6fe0', '夜宵档 21:00 开卖', '炒饭 / 烤串 / 冰饮'),
};

/** §89 导出结果预览页（由真实下载的 CSV 渲染，用于截图展示日期列格式） */
let previewHtml = '';

const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/guanli' || p === '/guanli/') p = '/guanli/index.html';
    const rel = p.replace(/^\/guanli\//, '');
    if (rel === 'demo/csv-preview.html' && previewHtml) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(previewHtml);
        return;
    }
    if (DEMO[rel]) {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
        res.end(DEMO[rel]);
        return;
    }
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
const fulfillJson = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });

async function newPage(browser, routeFn) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p88p90');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', routeFn);
    return { ctx, page };
}

async function shot(page, dir, name, full = false) {
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, name), fullPage: full });
    console.log('shot ' + name);
}

// ===========================================================================
// §88 评价申诉撤销通过
// ===========================================================================
const REVIEW_BASE = {
    customerId: '11', productId: '31', variantId: null, orderLineId: null, parentId: null,
    videos: [], tags: [], isAnonymous: false, reply: null, repliedAt: null, helpfulCount: 2,
    images: [], updatedAt: at(30),
};

let appealRows = [];

function resetAppeals() {
    appealRows = [
        { ...REVIEW_BASE, id: '501', customerName: '李同学', rating: 2, status: 'hidden',
            content: '菜里有异物，太失望了，希望商家重视出品卫生。', tags: ['异物'],
            createdAt: at(1500),
            appealStatus: 'approved', appealReason: '异物为打包时混入的包装纸，非出品问题，申请复核。',
            appealImages: [], appealAt: at(900), appealResult: '已通过：现场核查为包装纸，评价隐藏。',
            appealReviewedAt: at(800) },
        { ...REVIEW_BASE, id: '502', customerName: '王同学', rating: 1, status: 'hidden',
            content: '饭是夹生的，等了很久才送到。', tags: ['夹生', '超时'],
            createdAt: at(2600),
            appealStatus: 'approved', appealReason: '当天高峰期运力紧张，米饭出品正常，申请复核。',
            appealImages: [], appealAt: at(2000), appealResult: '已通过：顾客未提供实物照片，评价隐藏。',
            appealReviewedAt: at(1900) },
        { ...REVIEW_BASE, id: '503', customerName: '赵同学', rating: 2, status: 'approved',
            content: '口味偏咸。', tags: ['口味'],
            createdAt: at(5000),
            appealStatus: 'rejected', appealReason: '当天顾客自行要求重口味。',
            appealImages: [], appealAt: at(4600), appealResult: '已驳回：口味差异不构成申诉理由。',
            appealReviewedAt: at(4500) },
    ];
}

function route88(route) {
    const body = route.request().postData() || '';
    if (body.includes('myTenantAccess')) return fulfillJson(route, { myTenantAccess: ACCESS });
    if (body.includes('reviewAppeals')) {
        const vars = JSON.parse(body).variables || {};
        const st = vars.options?.status || '';
        const items = st ? appealRows.filter((r) => r.appealStatus === st) : appealRows;
        return fulfillJson(route, { reviewAppeals: { totalItems: items.length, items } });
    }
    if (body.includes('revokeReviewAppeal')) {
        const vars = JSON.parse(body).variables || {};
        const row = appealRows.find((r) => r.id === String(vars.id));
        if (row) {
            row.appealStatus = 'rejected';
            row.status = 'approved';
            row.appealResult = `${row.appealResult.replace(/[；;。，,]+$/u, '')}；撤销通过：${vars.note || ''}`;
            row.appealReviewedAt = new Date().toISOString();
        }
        return fulfillJson(route, { revokeReviewAppeal: row || null });
    }
    if (body.includes('reviews(') || body.includes('query Reviews')) {
        return fulfillJson(route, { reviews: { totalItems: 0, items: [] } });
    }
    if (body.includes('me {')) return fulfillJson(route, { me: { id: '9' } });
    return fulfillJson(route, {});
}

const read88 = () => ({
    tabs: Array.from(document.querySelectorAll('.tabs uni-text')).map((e) => (e.className.includes('on') ? '*' : '') + e.textContent.trim()),
    filters: Array.from(document.querySelectorAll('.filters uni-text')).map((e) => (e.className.includes('on') ? '*' : '') + e.textContent.trim()),
    cards: Array.from(document.querySelectorAll('.card')).map((c) => ({
        stars: c.querySelector('.stars')?.textContent?.trim() || '',
        status: c.querySelector('.st')?.textContent?.trim() || '',
        appeal: c.querySelector('.appeal')?.innerText.replace(/\s+/g, ' ').trim() || '',
        ops: Array.from(c.querySelectorAll('.ops .op')).map((b) => b.textContent.trim()),
    })),
    dialog: document.querySelector('.am-mask .am-sheet') ? {
        title: document.querySelector('.am-sheet__title')?.textContent?.trim() || '',
        desc: document.querySelector('.am-sheet__desc')?.textContent?.trim() || '',
        placeholder: (document.querySelector('.am-sheet')?.querySelector('textarea') || {}).placeholder || '',
        ops: Array.from(document.querySelectorAll('.am-sheet__ops .am-btn')).map((b) => b.textContent.trim()),
    } : null,
    toast: document.querySelector('.uni-toast')?.textContent?.trim() || '',
});

// ===========================================================================
// §89 经营数据导出（起止日期）
// ===========================================================================
const PROFILE = {
    storeName: '第一食堂', businessHours: '10:00-14:00,17:00-21:00',
    storeNotice: '今日推出新菜：香菇滑鸡饭，欢迎品尝～', storePhone: '13800001111',
    paused: false, openNow: true, closedToday: false, closureNote: null, closureDates: [],
    nextTransition: null, unfinishedOrders: 2, dailyPushEnabled: true, dailyPushTime: '21:30',
};
const AUTO = { enabled: false, delaySeconds: 30, dailyLimit: 0, routes: ['R1', 'R2', 'R3'], acceptedToday: 0, openNow: true, merchantConfirmEnabled: true };
const REVENUE = {
    today: { orders: 23, gross: 68400, avgTicket: 2974, cancelled: 1, cancelledAmount: 2600 },
    last7: { orders: 156, gross: 458600, avgTicket: 2940, cancelled: 5, cancelledAmount: 13200 },
    days: [
        { date: '10-21', dateFull: '2026-10-21', orders: 18, gross: 52800, cancelled: 0, cancelledAmount: 0 },
        { date: '10-22', dateFull: '2026-10-22', orders: 25, gross: 74500, cancelled: 1, cancelledAmount: 2600 },
        { date: '10-23', dateFull: '2026-10-23', orders: 21, gross: 61200, cancelled: 0, cancelledAmount: 0 },
        { date: '10-24', dateFull: '2026-10-24', orders: 30, gross: 89200, cancelled: 2, cancelledAmount: 5200 },
        { date: '10-25', dateFull: '2026-10-25', orders: 24, gross: 68900, cancelled: 0, cancelledAmount: 0 },
        { date: '10-26', dateFull: '2026-10-26', orders: 15, gross: 43600, cancelled: 1, cancelledAmount: 1800 },
        { date: '10-27', dateFull: '2026-10-27', orders: 23, gross: 68400, cancelled: 1, cancelledAmount: 2600 },
    ],
    days30: [],
};

/** 按起止日期逐日造数（与服务端口径一致：日期升序、缺日补 0） */
function daysBetween(from, to) {
    const out = [];
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    for (let t = start; t <= end; t += 86_400_000) {
        const d = new Date(t);
        const p = (n) => String(n).padStart(2, '0');
        const full = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
        const seed = d.getUTCDate();
        const orders = 12 + ((seed * 7) % 19);
        const gross = orders * 2900 + ((seed * 130) % 900);
        const cancelled = seed % 4;
        out.push({
            date: full.slice(5), dateFull: full, orders, gross,
            cancelled, cancelledAmount: cancelled * 2600,
        });
    }
    return out;
}

function route89(route) {
    const body = route.request().postData() || '';
    if (body.includes('campusMerchantRevenueRange')) {
        const vars = JSON.parse(body).variables || {};
        return fulfillJson(route, { campusMerchantRevenueRange: daysBetween(vars.from, vars.to) });
    }
    if (body.includes('myTenantAccess')) return fulfillJson(route, { myTenantAccess: ACCESS });
    if (body.includes('campusMerchantStoreProfile')) return fulfillJson(route, { campusMerchantStoreProfile: PROFILE });
    if (body.includes('campusMerchantRevenue')) return fulfillJson(route, { campusMerchantRevenue: REVENUE });
    if (body.includes('campusMerchantAutoAccept')) return fulfillJson(route, { campusMerchantAutoAccept: AUTO });
    if (body.includes('newOrderSignal')) return fulfillJson(route, { newOrderSignal: { count: 0, latestCreatedAt: null } });
    if (body.includes('me {')) return fulfillJson(route, { me: { id: '9' } });
    return fulfillJson(route, {});
}

const read89 = () => {
    const pc = document.querySelector('.uni-picker-container');
    const vis = !!pc && getComputedStyle(pc).display !== 'none' && pc.getBoundingClientRect().height > 0;
    return {
        range: Array.from(document.querySelectorAll('.export-range .range-chip')).map((e) => e.textContent.trim()),
        join: document.querySelector('.range-join')?.textContent?.trim() || '',
        btn: document.querySelector('.export-btn')?.textContent?.trim() || '',
        btnDisabled: !!document.querySelector('.export-btn')?.disabled,
        tip: document.querySelector('.export .tip')?.textContent?.trim() || '',
        picker: vis,
        pickerText: vis ? (pc.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '',
        toast: document.querySelector('.uni-toast')?.textContent?.trim() || '',
    };
};

// ===========================================================================
// §90 广告素材：媒体库选图
// ===========================================================================
let assetOrigin = '';
const AD_SLOTS = [
    { code: 'homeBanner', name: '首页 Banner', unitPriceFen: 1500 },
    { code: 'shopTop', name: '店铺页顶部', unitPriceFen: 1200 },
    { code: 'cartBottom', name: '购物车底部', unitPriceFen: 900 },
];

function route90(route) {
    const body = route.request().postData() || '';
    if (body.includes('myTenantAccess')) return fulfillJson(route, { myTenantAccess: ACCESS });
    if (body.includes('campusAdSlots')) return fulfillJson(route, { campusAdSlots: AD_SLOTS });
    if (body.includes('campusMerchantAds')) return fulfillJson(route, { campusMerchantAds: [] });
    if (body.includes('assetLibrary')) {
        const vars = JSON.parse(body).variables || {};
        const items = Object.keys(DEMO).map((k, i) => ({
            id: String(701 + i),
            name: `广告素材-${i + 1}.svg`,
            preview: `${assetOrigin}/guanli/${k}`,
            source: `${assetOrigin}/guanli/${k}`,
            mimeType: 'image/svg+xml',
            width: 750, height: 300,
            assetTags: ['广告图'],
        }));
        return fulfillJson(route, { assetLibrary: { totalItems: items.length, items } });
    }
    if (body.includes('assetTags')) {
        return fulfillJson(route, { assetTags: [{ name: '广告图', count: 3 }, { name: '首页Banner', count: 2 }] });
    }
    if (body.includes('me {')) return fulfillJson(route, { me: { id: '9' } });
    return fulfillJson(route, {});
}

const read90 = () => {
    const cell = document.querySelector('.img-box')?.closest('.cell');
    return {
        pickBtn: document.querySelector('.pick-btn')?.textContent?.trim() || '',
        pickHint: document.querySelector('.pick-hint')?.textContent?.trim() || '',
        imageUrlInCell: cell ? (Array.from(cell.querySelectorAll('input')).map((i) => i.value).find((v) => v) || '') : '',
        preview: !!document.querySelector('.cell .preview'),
        previewSrc: document.querySelector('.cell .preview img')?.getAttribute('src') || '',
        libraryOpen: !!document.querySelector('.mlm__panel') && document.querySelector('.mlm__overlay')?.style.display !== 'none',
        cells: Array.from(document.querySelectorAll('.mlm__cell')).map((c) => c.querySelector('.mlm__cell-name')?.textContent?.trim() || ''),
        picked: document.querySelector('.mlm__picked')?.textContent?.trim() || '',
    };
};

(async () => {
    fs.mkdirSync(OUT88, { recursive: true });
    fs.mkdirSync(OUT89, { recursive: true });
    fs.mkdirSync(OUT90, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    assetOrigin = `http://127.0.0.1:${port}`;
    console.log('static server', BASE);

    const browser = await chromium.launch();

    // ── §88 评价申诉撤销通过 ─────────────────────────────────────────────
    {
        resetAppeals();
        const { ctx, page } = await newPage(browser, route88);
        await page.goto(BASE + '#/pages/review/list/index', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.tabs', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);

        // 01 差评申诉 → 已通过：撤销入口
        await page.locator('.tabs uni-text', { hasText: '差评申诉' }).first().click();
        await page.waitForTimeout(700);
        await page.locator('.filters uni-text', { hasText: '已通过' }).first().click();
        await page.waitForTimeout(800);
        console.log('01 state', JSON.stringify(await page.evaluate(read88)));
        await shot(page, OUT88, '01-appeal-approved-revoke-entry.png');

        // 02 自绘弹窗：撤销原因必填
        await page.locator('.card .ops .op', { hasText: '撤销通过' }).first().click();
        await page.waitForTimeout(700);
        console.log('02 state', JSON.stringify(await page.evaluate(read88)));
        await shot(page, OUT88, '02-appeal-revoke-dialog.png');

        // 03 填原因 → 确定：toast 已撤销通过
        await page.evaluate(() => {
            const ta = document.querySelector('.am-sheet')?.querySelector('textarea');
            if (ta) {
                ta.value = '经复核该申诉证据不足，恢复评价展示';
                ta.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await page.waitForTimeout(400);
        await page.locator('.am-sheet__ops .am-btn.main').click();
        await page.waitForTimeout(900);
        console.log('03 state', JSON.stringify(await page.evaluate(read88)));
        await shot(page, OUT88, '03-appeal-revoked-toast.png');

        // 04 已驳回筛选：同一评价回退「已驳回」+ 撤销留痕
        await page.locator('.filters uni-text', { hasText: '已驳回' }).first().click();
        await page.waitForTimeout(800);
        console.log('04 state', JSON.stringify(await page.evaluate(read88)));
        await shot(page, OUT88, '04-appeal-rejected-after-revoke.png');
        await ctx.close();
    }

    // ── §89 经营数据导出（起止日期 + CSV）───────────────────────────────
    {
        const { ctx, page } = await newPage(browser, route89);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);

        // 01 导出卡：起止日期选择条 + 导出按钮
        await page.locator('.export').scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(400);
        console.log('01 state', JSON.stringify(await page.evaluate(read89)));
        await shot(page, OUT89, '01-export-range.png');

        // 02 导出：CSV 下载落盘 + toast「已导出 N 天」（uni H5 日期选择器为原生组件，无独立截图）
        await page.locator('.export').scrollIntoViewIfNeeded().catch(() => undefined);
        let download = null;
        try {
            [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 15000 }),
                page.locator('.export-btn').click(),
            ]);
            await page.waitForTimeout(250);
        } catch (e) {
            console.log('download event missed:', String(e.message || e).slice(0, 160));
        }
        console.log('02 state', JSON.stringify(await page.evaluate(read89)));
        await shot(page, OUT89, '02-export-toast.png');
        if (!download) throw new Error('export download not captured');

        const fileName = download.suggestedFilename();
        const saved = path.join(OUT89, fileName);
        await download.saveAs(saved);
        const csv = fs.readFileSync(saved, 'utf8').replace(/^\uFEFF/, '');
        console.log('csv name', fileName);
        console.log('csv head', JSON.stringify(csv.split(/\r\n/).slice(0, 3)));
        console.log('csv rows', csv.split(/\r\n/).filter(Boolean).length - 1);

        // 03 导出结果预览：完整日期列（YYYY-MM-DD）+ 区间文件名
        const [head, ...bodyRows] = csv.split(/\r\n/).filter(Boolean).map((line) => line.split(','));
        previewHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<style>
body{margin:0;padding:28px;background:#f5f6f8;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1f2937}
.card{background:#fff;border-radius:14px;padding:22px 22px 8px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.t{font-size:19px;font-weight:700}
.s{margin-top:6px;font-size:13px;color:#8a919c}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th{text-align:left;background:#fff7f2;color:#ff6b35;font-weight:600;padding:10px 8px}
td{padding:9px 8px;border-top:1px solid #eef0f3;color:#374151}
.more{margin-top:10px;font-size:12px;color:#8a919c}
</style></head><body><div class="card">
<div class="t">${fileName}</div>
<div class="s">导出区间 ${bodyRows[0]?.[0] || ''} 至 ${bodyRows[bodyRows.length - 1]?.[0] || ''} · 共 ${bodyRows.length} 行 · 日期列含年份（跨年可区分）</div>
<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${bodyRows.slice(0, 8).map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>
<div class="more">… 其余 ${Math.max(0, bodyRows.length - 8)} 行省略</div>
</div></body></html>`;
        await page.goto(`${assetOrigin}/guanli/demo/csv-preview.html`, { waitUntil: 'load' });
        await page.waitForTimeout(400);
        await shot(page, OUT89, '03-export-csv-preview.png');
        await ctx.close();
    }

    // ── §90 广告素材：媒体库选图回填 ─────────────────────────────────────
    {
        const { ctx, page } = await newPage(browser, route90);
        await page.goto(BASE + '#/pages/campus/ads', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.form', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1500);

        // 01 图片地址 cell：「从媒体库选图」
        console.log('01 state', JSON.stringify(await page.evaluate(read90)));
        await shot(page, OUT90, '01-ad-image-pick-entry.png');

        // 02 媒体库弹层（可上传 + 选已有素材）
        await page.locator('.pick-btn').first().click();
        await page.waitForTimeout(900);
        console.log('02 state', JSON.stringify(await page.evaluate(read90)));
        await shot(page, OUT90, '02-ad-media-library.png');

        // 03 选第一张 → 确定：回填 URL + 缩略预览
        await page.locator('.mlm__cell').first().click();
        await page.waitForTimeout(400);
        await page.locator('.mlm__confirm').click();
        await page.waitForTimeout(800);
        console.log('03 state', JSON.stringify(await page.evaluate(read90)));
        await shot(page, OUT90, '03-ad-image-filled.png');
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', DOCS);
    server.close();
    process.exit(0);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    server.close();
    process.exit(1);
});
