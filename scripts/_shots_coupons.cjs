/**
 * 优惠券卡片改版验收截图脚本（uni-app H5 构建产物 mock 数据渲染）
 * 用法：node scripts/_shots_coupons.cjs
 * 说明：仅读取 dist/build/h5，不重新构建、不改业务源码。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

let playwright;
try {
    playwright = require('C:/nvm4w/nodejs/node_modules/playwright');
} catch (e) {
    const { execSync } = require('child_process');
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    playwright = require(path.join(globalRoot, 'playwright'));
}
const { chromium } = playwright;

const ROOT = 'D:/zhao/vshop/dist/build/h5';
const OUT_DIR = 'D:/zhao/vshop/docs/screenshots/promotion/coupon-cards';
const PORT = 4501;
const ORIGIN = `http://localhost:${PORT}`;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8',
};

const imgCache = new Map();

function svgFallback(seed) {
    const palette = [
        ['#ff7a45', '#ffb347'],
        ['#4facfe', '#00f2fe'],
        ['#43e97b', '#38f9d7'],
        ['#f78ca0', '#f9748f'],
    ];
    const [a, b] = palette[seed.length % palette.length];
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="720" height="480" fill="url(#g)"/>
<circle cx="600" cy="90" r="120" fill="rgba(255,255,255,0.18)"/>
<text x="60" y="270" font-family="sans-serif" font-size="64" fill="#fff" font-weight="bold">COUPON</text>
<text x="60" y="330" font-family="sans-serif" font-size="30" fill="rgba(255,255,255,0.85)">${seed}</text>
</svg>`);
}

async function ensureImage(seed) {
    let buf = imgCache.get(seed);
    if (buf) return buf;
    try {
        const r = await fetch(`https://picsum.photos/seed/${encodeURIComponent(seed)}/720/480`);
        if (r.ok) {
            buf = Buffer.from(await r.arrayBuffer());
            imgCache.set(seed, buf);
        }
    } catch (e) {
        console.warn('[img] picsum fetch failed:', seed, e.message);
    }
    return buf || null;
}

async function serveMockImage(res, seed) {
    const buf = await ensureImage(seed);
    if (buf) {
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
        res.end(buf);
        return;
    }
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
    res.end(svgFallback(seed));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, ORIGIN);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/__mock-img/')) {
        const seed = path.basename(pathname, path.extname(pathname));
        await serveMockImage(res, seed);
        return;
    }

    let file = path.join(ROOT, pathname);
    let stat = null;
    try { stat = fs.statSync(file); } catch (e) {}
    if (!stat || !stat.isFile()) {
        file = path.join(ROOT, 'index.html');
    }
    try {
        const data = fs.readFileSync(file);
        const ext = path.extname(file).toLowerCase();
        res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(data);
    } catch (e) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
    }
});

// ───────────────────────────── Mock 数据 ─────────────────────────────

const IMG = (seed) => `${ORIGIN}/__mock-img/${seed}.jpg`;

function tpl(overrides) {
    return Object.assign({
        id: 'tpl-x',
        name: '优惠券',
        description: '',
        type: 'FIXED',
        discountValue: 0,
        minSpend: 0,
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2026-11-30T00:00:00.000Z',
        totalCount: 0,
        claimedCount: 0,
        pointsPrice: 0,
        perUserLimit: 1,
        scope: 'ALL',
        categoryId: null,
        variantId: null,
        enabled: true,
        shopId: 'shop-1',
        usageScene: 'ONLINE',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        claimable: true,
        claimCode: null,
        validDays: 30,
        newCustomerOnly: false,
        memberLevel: null,
        distributionChannels: [],
        salePrice: 0,
        activityImage: null,
    }, overrides);
}

let centreWithImages = false;

function centreTemplates(withImages) {
    return [
        tpl({
            id: 'tpl-newcomer',
            name: '新客立减券',
            description: '新客专享，满 50 元立减 15 元',
            type: 'FIXED',
            discountValue: 1500,
            minSpend: 5000,
            totalCount: 500,
            claimedCount: 320,
            activityImage: withImages ? IMG('coupon1') : null,
        }),
        tpl({
            id: 'tpl-percent',
            name: '全场8.5折券',
            description: '全场通用，最高优惠 100 元',
            type: 'PERCENT',
            discountValue: 85,
            totalCount: 200,
            claimedCount: 88,
            activityImage: withImages ? IMG('coupon2') : null,
        }),
        tpl({
            id: 'tpl-ship',
            name: '免配送费券',
            description: '外卖订单免配送费',
            type: 'FREE_SHIPPING',
            totalCount: 0,
            claimedCount: 0,
            activityImage: withImages ? IMG('coupon3') : null,
        }),
    ];
}

function myCouponList() {
    const mk = (over) => Object.assign({
        id: 'mc-x',
        customerId: 'mock-user-1',
        templateId: 'tpl-x',
        code: 'CPN000000',
        status: 'UNUSED',
        issuedBy: 'system',
        reservedOrderId: null,
        usedOrderId: null,
        issuedAt: '2026-10-20T00:00:00.000Z',
        usedAt: null,
        expiredAt: '2026-11-29T00:00:00.000Z',
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
        template: null,
    }, over);
    return [
        mk({
            id: 'mc-unused-image',
            templateId: 'tpl-newcomer',
            code: 'CPN2026103A01',
            expiredAt: '2026-11-29T00:00:00.000Z',
            template: tpl({
                id: 'tpl-newcomer',
                name: '新客立减券',
                type: 'FIXED',
                discountValue: 1500,
                minSpend: 5000,
                activityImage: IMG('wallet1'),
            }),
        }),
        mk({
            id: 'mc-unused-fallback',
            templateId: 'tpl-store',
            code: 'CPN2026103B02',
            expiredAt: '2026-11-03T00:00:00.000Z',
            template: tpl({
                id: 'tpl-store',
                name: '门店满减券',
                type: 'FIXED',
                discountValue: 1000,
                minSpend: 3000,
                usageScene: 'ALL',
                activityImage: null,
            }),
        }),
        mk({
            id: 'mc-used',
            templateId: 'tpl-tea',
            code: 'CPN2026093C03',
            status: 'USED',
            usedAt: '2026-10-10T00:00:00.000Z',
            expiredAt: '2026-10-31T00:00:00.000Z',
            template: tpl({
                id: 'tpl-tea',
                name: '下午茶套餐券',
                type: 'FULL',
                discountValue: 3000,
                activityImage: IMG('wallet2'),
            }),
        }),
    ];
}

function saleTemplates() {
    return [
        tpl({
            id: 'sale-coffee',
            name: '手冲咖啡单人券',
            description: '选用当季咖啡豆，手冲现萃。\n到店出示券码即可核销。',
            type: 'FIXED',
            discountValue: 2000,
            minSpend: 0,
            salePrice: 990,
            totalCount: 300,
            claimedCount: 186,
            usageScene: 'ONLINE',
            activityImage: IMG('sale1'),
        }),
        tpl({
            id: 'sale-tea',
            name: '双人下午茶套餐',
            description: '双人下午茶含甜点两份，需提前一天预约。',
            type: 'FULL',
            discountValue: 5000,
            minSpend: 0,
            salePrice: 3990,
            totalCount: 120,
            claimedCount: 74,
            usageScene: 'ALL',
            activityImage: IMG('sale2'),
        }),
        tpl({
            id: 'sale-store',
            name: '门店自提饮品券',
            description: '门店自提任意饮品一杯。',
            type: 'PERCENT',
            discountValue: 80,
            salePrice: 500,
            usageScene: 'IN_STORE',
            activityImage: null,
        }),
    ];
}

function saleBundles() {
    return [{
        id: 'bundle-coffee',
        name: '咖啡尝鲜券包',
        description: '两张手冲咖啡券 + 一张下午茶券',
        salePrice: 2590,
        enabled: true,
        channelId: null,
        items: [
            { id: 'bi-1', bundleId: 'bundle-coffee', templateId: 'sale-coffee', quantity: 2 },
            { id: 'bi-2', bundleId: 'bundle-coffee', templateId: 'sale-tea', quantity: 1 },
        ],
    }];
}

const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
};

function gqlPayload(name, query, variables) {
    switch (name) {
        case 'ResolveChannelByCode':
            return {
                resolveChannelByCode: {
                    token: 'mock-channel-token',
                    code: variables?.code || 'default',
                    customFields: {
                        shopName: '演示店铺',
                        shopLogo: '',
                        shopIntro: '验收演示店铺',
                        servicePhone: '400-000-0000',
                        shopContent: null,
                        displayTemplate: 'default',
                        themeId: null,
                        shareImageUrl: '',
                    },
                },
            };
        case 'GetShopTemplate':
            return { shopTemplate: { id: 'tpl-1', name: 'vshop', app: 'vshop', theme: {}, pages: {}, version: 1, enabled: true, updatedAt: '2026-10-01T00:00:00.000Z' } };
        case 'GetShopGlobalConfig':
            return { shopGlobalConfig: { id: 'cfg-1', app: 'vshop', themeTokens: {}, defaults: {} } };
        case 'CouponCentre':
            return { couponCentre: centreTemplates(centreWithImages) };
        case 'MyCoupons':
            return { myCoupons: myCouponList() };
        case 'CouponSaleCatalogue':
            return { couponSaleCatalogue: { templates: saleTemplates(), bundles: saleBundles() } };
        case 'PointsMallTemplates':
            return { pointsMallTemplates: [] };
        case 'ActiveOrder':
            return { activeOrder: null };
        default:
            break;
    }
    if (query.includes('activeChannel')) {
        return { activeChannel: { id: '1', code: 'default', token: 'mock-channel-token', customFields: { employeePickupMode: 'disabled', defaultLocation: null, themeTokensOverride: null } } };
    }
    if (query.includes('shopChannels')) {
        return { shopChannels: [{ code: 'default', token: 'mock-channel-token', name: '演示店铺', isOfficial: true, isDefault: true }] };
    }
    if (query.includes('authMethods')) {
        return { authMethods: { methods: ['native'], wechatAppId: '' } };
    }
    if (query.includes('ssoProviders')) {
        return { ssoProviders: [] };
    }
    return {};
}

async function handleShopApi(route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
    }
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const query = String(body.query || '');
    const m = /(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(query);
    const name = m ? m[1] : '';
    const data = gqlPayload(name, query, body.variables || {});
    if (Object.keys(data).length === 0) {
        console.log('[gql] unmocked operation:', name || '(anonymous)', query.replace(/\s+/g, ' ').slice(0, 90));
    }
    return route.fulfill({
        status: 200,
        headers: Object.assign({}, CORS, { 'content-type': 'application/json; charset=utf-8', 'vendure-auth-token': 'mock-session-token' }),
        body: JSON.stringify({ data }),
    });
}

// ───────────────────────────── 截图流程 ─────────────────────────────

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

async function stats(page) {
    return page.evaluate(() => ({
        cards: document.querySelectorAll('.coupon-card').length,
        posterCards: document.querySelectorAll('.coupon-card--poster').length,
        fallbackThumbs: document.querySelectorAll('.coupon-card__thumb-fb').length,
        imageThumbs: document.querySelectorAll('.coupon-card__thumb-img').length,
        heroVisible: !!document.querySelector('.cds-hero'),
        sheetVisible: !!document.querySelector('.cds-mask'),
        loadedImgs: Array.from(document.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth > 0).length,
        hash: location.hash,
    }));
}

async function waitCards(page, min, timeout = 12000) {
    await page.waitForFunction((n) => document.querySelectorAll('.coupon-card').length >= n, min, { timeout });
}

async function settleImages(page, timeout = 6000) {
    await page.waitForFunction(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.length === 0 || imgs.every(i => i.complete);
    }, null, { timeout }).catch(() => {});
    await page.waitForTimeout(250);
}

/** uni-image H5 用 div 的 background-image 渲染，图片解码完成后才写入，需等实际背景图就绪 */
async function waitUniImages(page, timeout = 10000) {
    await page.waitForFunction(() => {
        const nodes = Array.from(document.querySelectorAll('.coupon-card__thumb-img, .cds-hero'));
        if (!nodes.length) return true;
        return nodes.every((n) => {
            const div = n.querySelector('div');
            const bg = div && div.style.backgroundImage;
            return !!bg && bg !== 'none';
        });
    }, null, { timeout }).catch(() => {});
    await page.waitForTimeout(200);
}

async function settle(page) {
    await settleImages(page);
    await waitUniImages(page);
}

async function shot(page, name) {
    await page.waitForTimeout(300);
    const file = path.join(OUT_DIR, name);
    await page.screenshot({ path: file, type: 'png', animations: 'disabled' });
    console.log(`[shot] ${name}`);
}

async function clickTab(page, scope, text) {
    const el = page.locator(`${scope} .tab`).filter({ hasText: text }).first();
    await el.waitFor({ state: 'visible', timeout: 8000 });
    await el.click();
}

(async () => {
    ensureDir(OUT_DIR);

    await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
    console.log(`[server] ${ORIGIN} -> ${ROOT}`);

    // 预热活动图缓存（避免每次进入 tab 时 uni-image 尚未解码导致缩略图截图空白）
    const WARM_SEEDS = ['coupon1', 'coupon2', 'coupon3', 'wallet1', 'wallet2', 'sale1', 'sale2'];
    await Promise.all(WARM_SEEDS.map((seed) => ensureImage(seed)));
    console.log(`[img] warmed ${imgCache.size}/${WARM_SEEDS.length}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
        localStorage.setItem('auth_token', 'mock-jwt-token');
        localStorage.setItem('auth_userId', 'mock-user-1');
        localStorage.setItem('tenant_code', 'default');
        localStorage.setItem('vendure_session_token', 'mock-session-token');
    });

    await page.route('**/*shop-api*', handleShopApi);

    try {
        // 1) 领券中心 · 首字兜底
        centreWithImages = false;
        await page.goto(`${ORIGIN}/#/pkg-promotion/pages/coupons`, { waitUntil: 'domcontentloaded' });
        await waitCards(page, 1);
        await settle(page);
        console.log('[state 01]', JSON.stringify(await stats(page)));
        await shot(page, '01-coupons-centre-fallback.png');

        // 2) 领券中心 · 活动图
        centreWithImages = true;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitCards(page, 1);
        await settle(page);
        console.log('[state 02]', JSON.stringify(await stats(page)));
        await shot(page, '02-coupons-centre-with-image.png');

        // 3) 领券中心页 · 我的卡包（UNUSED：带图 + 兜底）
        await clickTab(page, '.coupons-tabs', '我的卡包');
        await waitCards(page, 1);
        await settle(page);
        console.log('[state 03]', JSON.stringify(await stats(page)));
        await shot(page, '03-coupons-wallet.png');

        // 4) 券商城 · 领取 tab
        await page.goto(`${ORIGIN}/#/pkg-promotion/pages/coupon-mall`, { waitUntil: 'domcontentloaded' });
        await waitCards(page, 1);
        await settle(page);
        console.log('[state 04]', JSON.stringify(await stats(page)));
        await shot(page, '04-coupon-mall-claim.png');

        // 5) 券商城 · 购券 tab 的通栏海报单券卡
        await clickTab(page, '.mall-tabs', '购券');
        await page.waitForFunction(() => document.querySelectorAll('.coupon-card--poster').length >= 1, null, { timeout: 12000 });
        await settle(page);
        const poster = page.locator('.coupon-card--poster').first();
        await poster.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        const box = await poster.boundingBox();
        if (box && box.y > 70) {
            // uni-app H5 页面滚动容器不一定是 window，向上找真正可滚动的祖先
            await page.evaluate((dy) => {
                let e = document.querySelector('.coupon-card--poster');
                while (e) {
                    const st = getComputedStyle(e);
                    if (e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(st.overflowY)) {
                        e.scrollTop += dy;
                        return;
                    }
                    e = e.parentElement;
                }
                window.scrollBy(0, dy);
            }, box.y - 70);
            await page.waitForTimeout(250);
        }
        console.log('[state 05]', JSON.stringify(await stats(page)));
        await shot(page, '05-coupon-mall-poster.png');

        // 6) 券商城 · 卡包 tab
        await clickTab(page, '.mall-tabs', '卡包');
        await waitCards(page, 1);
        await settle(page);
        console.log('[state 06]', JSON.stringify(await stats(page)));
        await shot(page, '06-coupon-mall-wallet.png');

        // 7) 点击券商城海报卡 → 券详情弹层（顶部活动大图）
        await clickTab(page, '.mall-tabs', '购券');
        await page.waitForFunction(() => document.querySelectorAll('.coupon-card--poster').length >= 1, null, { timeout: 12000 });
        const poster2 = page.locator('.coupon-card--poster').first();
        await poster2.scrollIntoViewIfNeeded();
        const box2 = await poster2.boundingBox();
        await poster2.click({ position: { x: Math.min(40, (box2?.width || 300) / 2), y: 40 } });
        await page.waitForFunction(() => !!document.querySelector('.cds-mask') && !!document.querySelector('.cds-hero'), null, { timeout: 8000 });
        await settle(page);
        console.log('[state 07]', JSON.stringify(await stats(page)));
        await shot(page, '07-coupon-detail-sheet.png');

        const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png')).sort();
        console.log('FILES:', JSON.stringify(files));
        console.log(`SHOTS DONE + ${OUT_DIR}`);
    } catch (e) {
        console.error('FAILED:', e && e.message);
        try {
            console.log('[state error]', JSON.stringify(await stats(page)));
            const html = await page.evaluate(() => document.querySelector('#app')?.innerHTML?.slice(0, 2000) || '');
            console.log('[app html]', html);
        } catch (e2) {}
        process.exitCode = 1;
    } finally {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        await new Promise((resolve) => server.close(resolve));
    }
})();
