/**
 * 批次 B 验收截图：评价页三条规则（信任签名卡顺序 / 好评送礼三项 / 只评好时不显示改进项）
 * 用法：node scripts/_shots_review_rules.cjs
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
const OUT_DIR = 'D:/zhao/vshop/docs/screenshots/waimai/p111-review-rules';
const PORT = 4601;
const ORIGIN = `http://localhost:${PORT}`;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

function svgFallback(seed) {
    const palette = [['#ff7a45', '#ffb347'], ['#4facfe', '#00f2fe'], ['#43e97b', '#38f9d7']];
    const [a, b] = palette[seed.length % palette.length];
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="300" height="300" fill="url(#g)"/>
<text x="40" y="165" font-family="sans-serif" font-size="34" fill="#fff" font-weight="bold">${seed}</text>
</svg>`);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, ORIGIN);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/__mock-img/')) {
        const seed = path.basename(pathname, path.extname(pathname));
        res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
        res.end(svgFallback(seed));
        return;
    }
    let file = path.join(ROOT, pathname);
    let stat = null;
    try { stat = fs.statSync(file); } catch (e) {}
    if (!stat || !stat.isFile()) file = path.join(ROOT, 'index.html');
    try {
        const data = fs.readFileSync(file);
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(data);
    } catch (e) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
    }
});

// ───────────────────────────── Mock 数据 ─────────────────────────────
const IMG = (seed) => `${ORIGIN}/__mock-img/${seed}.svg`;

const PRODUCT = {
    id: 'p-1',
    name: '宫保鸡丁（微辣）',
    slug: 'gongbao',
    featuredAsset: { preview: IMG('product1') },
    variants: [
        { id: 'v-1', priceWithTax: 2600, options: [{ name: '微辣' }, { name: '大份' }] },
    ],
};

const ORDER = {
    id: 'o-1',
    code: 'A2400001',
    state: 'Delivered',
    lines: [
        {
            id: 'l-1',
            quantity: 1,
            unitPriceWithTax: 2600,
            productVariant: { id: 'v-1', name: '宫保鸡丁（微辣）', productId: 'p-1', options: [{ name: '微辣' }, { name: '大份' }] },
            featuredAsset: { preview: IMG('product1') },
        },
    ],
};

const STATS = {
    totalCount: 128,
    goodRate: 96,
    averageRating: 4.8,
    ratingDistribution: [
        { rating: 5, count: 96 }, { rating: 4, count: 20 }, { rating: 3, count: 8 }, { rating: 2, count: 3 }, { rating: 1, count: 1 },
    ],
    topTags: [],
};

const REVIEWS = [
    {
        id: 'r-1', customerName: '李同学', productId: 'p-1', variantId: 'v-1', rating: 5,
        content: '味道很稳，分量足，出餐也快。', images: [], tags: ['口味赞', '分量足'], isAnonymous: false,
        reply: null, createdAt: '2026-10-28T12:00:00.000Z', status: 'approved',
    },
    {
        id: 'r-2', customerName: '王同学', productId: 'p-1', variantId: 'v-1', rating: 4,
        content: '整体不错，高峰期稍微等了一会。', images: [], tags: ['性价比高'], isAnonymous: true,
        reply: '感谢反馈，我们会继续优化出餐节奏～', createdAt: '2026-10-27T18:10:00.000Z', status: 'approved',
    },
];

const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
};

function gqlPayload(name, query) {
    switch (name) {
        case 'ResolveChannelByCode':
            return {
                resolveChannelByCode: {
                    token: 'mock-channel-token', code: 'default',
                    customFields: {
                        shopName: '演示店铺', shopLogo: '', shopIntro: '验收演示店铺', servicePhone: '400-000-0000',
                        shopContent: null, displayTemplate: 'default', themeId: null, shareImageUrl: '',
                    },
                },
            };
        case 'GetShopTemplate':
            return { shopTemplate: { id: 'tpl-1', name: 'vshop', app: 'vshop', theme: {}, pages: {}, version: 1, enabled: true, updatedAt: '2026-10-01T00:00:00.000Z' } };
        case 'GetShopGlobalConfig':
            return { shopGlobalConfig: { id: 'cfg-1', app: 'vshop', themeTokens: {}, defaults: {} } };
        case 'ActiveOrder':
            return { activeOrder: null };
        case 'OrderByCode':
            return { orderByCode: ORDER };
        case 'GetMyReviews':
            // 单条订单行未评价：返回空列表，写评价页才会出现待评商品
            return { myReviews: [] };
        case 'GetProduct':
            return { product: PRODUCT };
        case 'GetReviewStats':
            return { reviewStats: STATS };
        case 'GetProductReviews':
            return { productReviews: { totalItems: REVIEWS.length, items: REVIEWS } };
        case 'GetProductsByIds':
            return { products: { items: [PRODUCT] } };
        default:
            break;
    }
    if (query.includes('activeChannel')) {
        return { activeChannel: { id: '1', code: 'default', token: 'mock-channel-token', customFields: { employeePickupMode: 'disabled', defaultLocation: null, themeTokensOverride: null } } };
    }
    if (query.includes('shopChannels')) {
        return { shopChannels: [{ code: 'default', token: 'mock-channel-token', name: '演示店铺', isOfficial: true, isDefault: true }] };
    }
    if (query.includes('authMethods')) return { authMethods: { methods: ['native'], wechatAppId: '' } };
    if (query.includes('ssoProviders')) return { ssoProviders: [] };
    return {};
}

async function handleShopApi(route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const query = String(body.query || '');
    const m = /(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(query);
    const name = m ? m[1] : '';
    const data = gqlPayload(name, query);
    return route.fulfill({
        status: 200,
        headers: Object.assign({}, CORS, { 'content-type': 'application/json; charset=utf-8', 'vendure-auth-token': 'mock-session-token' }),
        body: JSON.stringify({ data }),
    });
}

// ───────────────────────────── 截图流程 ─────────────────────────────
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

async function stats(page) {
    return page.evaluate(() => {
        const txt = (sel) => Array.from(document.querySelectorAll(sel)).map((n) => n.textContent.trim());
        return {
            trustRows: txt('.trust-card__row'),
            trustBadges: txt('.trust-card__badge'),
            giftOpts: txt('.oe-gift__opt'),
            giftVisible: !!document.querySelector('.oe-gift'),
            improveTags: txt('.oe-improve__tag'),
            improveVisible: !!document.querySelector('.oe-improve'),
            hash: location.hash,
        };
    });
}

async function shot(page, name) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, name), type: 'png', animations: 'disabled' });
    console.log(`[shot] ${name}`);
}

(async () => {
    ensureDir(OUT_DIR);
    await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
    console.log(`[server] ${ORIGIN} -> ${ROOT}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
        const t = msg.type();
        if (t === 'error' || t === 'warning') console.log(`[console:${t}]`, msg.text().slice(0, 200));
    });
    page.on('pageerror', (err) => console.log('[pageerror]', err && (err.stack || err.message) ? (err.stack || err.message).slice(0, 1200) : JSON.stringify(err).slice(0, 1200)));

    await page.addInitScript(() => {
        localStorage.setItem('auth_token', 'mock-jwt-token');
        localStorage.setItem('auth_userId', 'mock-user-1');
        localStorage.setItem('tenant_code', 'default');
        localStorage.setItem('vendure_session_token', 'mock-session-token');
    });

    await page.route('**/*shop-api*', handleShopApi);

    try {
        // 0) 预热：先落到首页让 App.onLaunch 的 restoreSession 完成，再切到需要登录的页面
        //    （直接深链到需登录页时，页面 onLoad 早于 restoreSession，会被判未登录踢去登录页）
        await page.goto(`${ORIGIN}/#/pages/home/index`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);

        // 1) 写评价页 · 5 星（好评）：签名卡三项 + 好评送礼三项 + 无改进项
        await page.evaluate(() => { location.hash = '#/pkg-order/pages/order-evaluate?code=A2400001'; });
        await page.waitForFunction(() => !!document.querySelector('.trust-card') && !!document.querySelector('.oe-rate'), null, { timeout: 15000 });
        console.log('[state 01]', JSON.stringify(await stats(page)));
        await shot(page, '01-review-create-good.png');

        // 2) 写评价页 · 点第 2 颗星（中评）：好评送礼消失，改进项出现
        await page.locator('.oe-rate__star').nth(1).click();
        await page.waitForFunction(() => !!document.querySelector('.oe-improve') && !document.querySelector('.oe-gift'), null, { timeout: 8000 });
        console.log('[state 02]', JSON.stringify(await stats(page)));
        await shot(page, '02-review-create-middle.png');

        // 3) 商品评价列表页：签名卡顺序 + 好评率/均分徽章
        await page.goto(`${ORIGIN}/#/pkg-product/pages/evaluate?slug=gongbao`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!document.querySelector('.trust-card') && document.querySelectorAll('.review-item').length >= 2, null, { timeout: 15000 });
        console.log('[state 03]', JSON.stringify(await stats(page)));
        await shot(page, '03-review-list-trust.png');

        // 4) 我的评价页：签名卡只读展示
        await page.goto(`${ORIGIN}/#/pkg-user/pages/my-reviews`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!document.querySelector('.trust-card'), null, { timeout: 15000 });
        console.log('[state 04]', JSON.stringify(await stats(page)));
        await shot(page, '04-my-reviews-trust.png');

        const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png')).sort();
        console.log('FILES:', JSON.stringify(files));
        console.log(`SHOTS DONE -> ${OUT_DIR}`);
    } catch (e) {
        console.error('FAILED:', e && e.message);
        try {
            console.log('[state error]', JSON.stringify(await stats(page)));
        } catch (e2) {}
        process.exitCode = 1;
    } finally {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        await new Promise((resolve) => server.close(resolve));
    }
})();
