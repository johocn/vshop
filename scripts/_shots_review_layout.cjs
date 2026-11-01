/**
 * §116 验收截图（vshop C 端）：评价展示面版式基线读回
 *   01 商品评价页：单条评价成卡（白底 / 圆角 16rpx / 内边距 24rpx / 卡间距 24rpx）
 *   02 商品详情页评价区：ReviewItem 走 flat（不叠卡中卡，保留分隔行）
 * 用法：node scripts/_shots_review_layout.cjs
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
const OUT_DIR = 'D:/zhao/vshop/docs/screenshots/waimai/p116-review-layout';
const PORT = 4603;
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
    const palette = [['#ff7a45', '#ffb347'], ['#4facfe', '#00f2fe'], ['#43e97b', '#38f9d7'], ['#c471ed', '#f64f59']];
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
    description: '<p>花生脆、鸡丁嫩，微辣下饭。</p>',
    featuredAsset: { preview: IMG('product1') },
    variants: [{ id: 'v-1', priceWithTax: 2600, options: [{ name: '微辣' }, { name: '大份' }] }],
    optionGroups: [],
};

const STATS = {
    totalCount: 6,
    goodRate: 96,
    averageRating: 4.8,
    ratingDistribution: [
        { rating: 5, count: 4 }, { rating: 4, count: 1 }, { rating: 3, count: 1 }, { rating: 2, count: 0 }, { rating: 1, count: 0 },
    ],
    topTags: [],
};

const REVIEWS = [
    {
        id: 'r-1', customerName: '李同学', productId: 'p-1', variantId: 'v-1', rating: 5,
        content: '味道很稳，分量足，出餐也快。花生是现炸的，鸡肉不柴，微辣刚好下饭。',
        images: [IMG('r1a'), IMG('r1b'), IMG('r1c')], tags: ['口味赞', '分量足'], isAnonymous: false,
        reply: '感谢认可！花生每天现炸，欢迎下次再来～', createdAt: '2026-10-28T12:00:00.000Z', status: 'approved',
    },
    {
        id: 'r-2', customerName: '王同学', productId: 'p-1', variantId: 'v-1', rating: 4,
        content: '整体不错，高峰期稍微等了一会，包装有点压。',
        images: [], tags: ['性价比高'], isAnonymous: true,
        reply: '感谢反馈，我们会继续优化出餐节奏～', createdAt: '2026-10-27T18:10:00.000Z', status: 'approved',
    },
    {
        id: 'r-3', customerName: '赵同学', productId: 'p-1', variantId: 'v-1', rating: 5,
        content: '加饭很实在，配菜新鲜，汤汁不齁。',
        images: [], tags: [], isAnonymous: false,
        reply: null, createdAt: '2026-10-26T12:30:00.000Z', status: 'approved',
    },
];

const TRUST = {
    qualityEnabled: true, qualityText: '食材当日采购，出品稳定不踩雷',
    serviceEnabled: true, serviceText: '口味不合心意，店内随时可换',
    timeEnabled: true, timeText: '高峰期 20 分钟内出餐',
};

const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
};

function gqlPayload(name, query) {
    switch (name) {
        case 'StoreTrustCopy':
            return { campusStoreTrust: TRUST };
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
        case 'GetMyReviews':
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

async function shopApi(route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const query = String(body.query || '');
    const m = /(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(query);
    const data = gqlPayload(m ? m[1] : '', query);
    return route.fulfill({
        status: 200,
        headers: Object.assign({}, CORS, { 'content-type': 'application/json; charset=utf-8', 'vendure-auth-token': 'mock-session-token' }),
        body: JSON.stringify({ data }),
    });
}

// ───────────────────────────── 截图流程 ─────────────────────────────
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

/** 读回版式基线：卡片内边距/圆角/间距、星级字号、正文行高 */
async function layoutState(page) {
    return page.evaluate(() => {
        const px = (v) => Math.round(parseFloat(v) * 10) / 10;
        const first = document.querySelector('.review-item');
        const card = first ? getComputedStyle(first) : null;
        const stars = document.querySelector('.review-item__stars');
        const content = document.querySelector('.review-item__content');
        const reply = document.querySelector('.review-item__reply');
        // 配图行不得溢出卡片内容盒（3×200rpx + 2×12rpx 应容纳在卡内）
        const imgs = Array.from(document.querySelectorAll('.review-item__img'));
        let imgOverflow = false;
        let imgW = null;
        if (first && imgs.length) {
            const box = first.getBoundingClientRect();
            const padRight = parseFloat(card.paddingRight);
            const lastRect = imgs[imgs.length - 1].getBoundingClientRect();
            imgW = px(lastRect.width);
            imgOverflow = lastRect.right > box.right - padRight + 0.5;
        }
        return {
            items: document.querySelectorAll('.review-item').length,
            flat: Array.from(document.querySelectorAll('.review-item')).filter((n) => n.className.includes('review-item--flat')).length,
            imgCount: imgs.length,
            imgW,
            imgOverflow,
            cardPadding: card ? px(card.paddingTop) : null,
            cardRadius: card ? px(card.borderTopLeftRadius) : null,
            cardGap: card ? px(card.marginBottom) : null,
            cardBorderBottom: card ? card.borderBottomWidth : null,
            starsFont: stars ? px(getComputedStyle(stars).fontSize) : null,
            contentFont: content ? px(getComputedStyle(content).fontSize) : null,
            contentLine: content ? px(getComputedStyle(content).lineHeight) / px(getComputedStyle(content).fontSize) : null,
            replyRadius: reply ? px(getComputedStyle(reply).borderTopLeftRadius) : null,
            tabFont: (() => { const t = document.querySelector('.review-tab'); return t ? px(getComputedStyle(t).fontSize) : null; })(),
            hash: location.hash,
        };
    });
}

async function shot(page, name) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, name), type: 'png', animations: 'disabled' });
    console.log(`[shot] ${name}`);
}

async function newPage(browser) {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.log('[console:error]', msg.text().slice(0, 200));
    });
    page.on('pageerror', (err) => console.log('[pageerror]', String(err && (err.stack || err.message)).slice(0, 800)));
    await page.addInitScript(() => {
        localStorage.setItem('auth_token', 'mock-jwt-token');
        localStorage.setItem('auth_userId', 'mock-user-1');
        localStorage.setItem('tenant_code', 'default');
        localStorage.setItem('vendure_session_token', 'mock-session-token');
    });
    await page.route('**/*shop-api*', shopApi);
    return { context, page };
}

(async () => {
    ensureDir(OUT_DIR);
    await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
    console.log(`[server] ${ORIGIN} -> ${ROOT}`);

    const browser = await chromium.launch({ headless: true });
    try {
        // 01 商品评价页：卡片态
        {
            const { context, page } = await newPage(browser);
            await page.goto(`${ORIGIN}/#/pages/home/index`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(700);
            await page.goto(`${ORIGIN}/#/pkg-product/pages/evaluate?slug=gongbao`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.querySelectorAll('.review-item').length >= 3, null, { timeout: 20000 });
            await page.waitForTimeout(700);
            console.log('[state 01]', JSON.stringify(await layoutState(page)));
            await shot(page, '01-vshop-evaluate-cards.png');
            await context.close();
        }

        // 02 商品详情页：评价区走 flat（分隔行，不叠卡）
        {
            const { context, page } = await newPage(browser);
            await page.goto(`${ORIGIN}/#/pages/home/index`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(700);
            await page.goto(`${ORIGIN}/#/pkg-product/pages/detail?slug=gongbao`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.querySelectorAll('.review-item').length >= 1, null, { timeout: 20000 });
            await page.waitForTimeout(900);
            console.log('[state 02]', JSON.stringify(await layoutState(page)));
            await shot(page, '02-vshop-detail-flat-rows.png');
            await context.close();
        }

        console.log(`SHOTS DONE -> ${OUT_DIR}`);
    } catch (e) {
        console.error('FAILED:', e && e.message);
        process.exitCode = 1;
    } finally {
        await browser.close().catch(() => {});
        await new Promise((resolve) => server.close(resolve));
    }
})();
