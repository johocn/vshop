// P18 菜品每日限量/每人限购（§68）截图（390×844 dpr=2）
//   01 后台商品列表：限量行（每日 20 份（已售 17，剩 3）· 每人限购 2 份）
//   02 后台限量弹层：每日限量 / 每人限购输入 + 今日已售提示
//   03 C 端菜单：商品卡「仅剩 3 份」标签
//   04 C 端菜单：点加购触发每人限购 toast
//   node scripts/shots-p18-daily-limit.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p18-daily-limit');
const ADMIN_ROOT = path.resolve(__dirname, '..', 'dist', 'build', 'h5');
const SHOP_ROOT = path.resolve('D:/zhao/waimai-v39/dist/build/h5');

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

function serve(root, prefix) {
    return http.createServer((req, res) => {
        let p = decodeURIComponent((req.url || '/').split('?')[0]);
        if (p === '/' + prefix || p === '/' + prefix + '/') p = '/' + prefix + '/index.html';
        const rel = p.replace(new RegExp('^/' + prefix + '/'), '');
        const file = path.join(root, rel);
        if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404); res.end('not found'); return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(fs.readFileSync(file));
    });
}

// —— 后台 mock：商品列表（宫保鸡丁 已售 17/20；米饭 已售 46/50；凉拌黄瓜不限） ——
const ACCESS = {
    isSuperAdmin: true,
    channels: [{ id: '201', code: 'canteen-a', token: 'canteen-a-token', name: '第一食堂', enabled: true, tenantNo: 1, isOfficial: true, memberEnabled: true, mustChangePassword: false }],
    permissions: [], mustChangePassword: false,
};
const PRODUCTS = {
    total: 3,
    items: [
        { productId: '41', name: '宫保鸡丁', monthlySales: 1280, variantCount: 2, soldOut: false, packingFee: 100, addonGroups: null, combo: null, dailyLimit: 20, perUserLimit: 2, soldToday: 17, remaining: 3 },
        { productId: '42', name: '凉拌黄瓜', monthlySales: 640, variantCount: 1, soldOut: false, packingFee: null, addonGroups: null, combo: null, dailyLimit: null, perUserLimit: null, soldToday: 0, remaining: null },
        { productId: '43', name: '米饭', monthlySales: 2100, variantCount: 1, soldOut: false, packingFee: 0, addonGroups: null, combo: null, dailyLimit: 50, perUserLimit: 5, soldToday: 46, remaining: 4 },
    ],
};
const adminRoute = async (route) => {
    const body = route.request().postData() || '';
    const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
    if (body.includes('campusMerchantProducts')) return fulfill({ campusMerchantProducts: PRODUCTS });
    if (body.includes('campusMerchantSoldOutAutoRestore')) return fulfill({ campusMerchantSoldOutAutoRestore: { enabled: true, pending: 0 } });
    if (body.includes('campusMerchantSetProductLimit')) return fulfill({ campusMerchantSetProductLimit: { ok: true, dailyLimit: 20, perUserLimit: 2, soldToday: 17, remaining: 3 } });
    if (body.includes('me {')) return fulfill({ me: { id: '9' } });
    return fulfill({});
};

// —— C 端 mock：菜单 + 当日额度 ——
const IMG = (bg, fg) => 'data:image/svg+xml;base64,' + Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${bg}"/><circle cx="60" cy="48" r="22" fill="${fg}"/><rect x="30" y="80" width="60" height="10" rx="5" fill="#ffb27a"/></svg>`,
).toString('base64');
const IMG_A = IMG('#ffd9c2', '#ff6600');
const IMG_B = IMG('#d9e8ff', '#2d5bd1');

const STORE = {
    channelId: '201', channelToken: 'store-a-token', name: '川味小馆', logo: '', tags: ['川菜'],
    monthlySales: 3200, promoText: '', paused: false, routesEnabled: ['R1', 'R3'],
    businessHours: '00:00-23:59', deliveryMinutes: 25, minOrderAmount: 0, deliveryFee: 200,
    storeAddress: '东区一食堂 2 楼', storePhone: '0755-12345678', storeNotice: '', errandBaseFee: 300, freeShippingThreshold: 0,
    packingFeeEnabled: false, packingFeeMode: 'perItem', packingFeeAmount: 0, packingFeeCap: null, packingFeeLabel: null,
};
function prod(id, name, price, img, extra) {
    return {
        id, name, slug: id, createdAt: new Date().toISOString(), description: '招牌现炒，微辣可选',
        featuredAsset: { preview: img },
        variants: [{ id: 'v-' + id, name: '标准', priceWithTax: price, stockLevel: 'IN_STOCK', enabled: true, options: [] }],
        optionGroups: [], collections: [],
        customFields: { reviewRating: 4.6, reviewCount: 66, waimaiMonthlySales: 100, ...(extra || {}) },
    };
}
const CATALOG = [prod('a-gongbao', '宫保鸡丁', 2800, IMG_A, {}), prod('a-huanggua', '凉拌黄瓜', 450, IMG_B, {})];
const DAILY_STOCK = [
    { productId: 'a-gongbao', dailyLimit: 20, perUserLimit: 2, soldToday: 17, remaining: 3, myToday: 0, myRemaining: 2 },
    { productId: 'a-huanggua', dailyLimit: 30, perUserLimit: 1, soldToday: 12, remaining: 8, myToday: 1, myRemaining: 0 },
];
const CART = {
    id: 'C68', code: 'C68', active: true, totalQuantity: 0, subTotalWithTax: 0, shippingWithTax: 0,
    totalWithTax: 0, currencyCode: 'CNY', shippingLines: [], shippingAddress: null, billingAddress: null,
    payments: [], taxSummary: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lines: [], couponCodes: [], discounts: [], surcharges: [],
};
const shopRoute = async (route) => {
    const body = route.request().postData() || '';
    const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (body.includes('waimaiStoreList')) return fulfill({ waimaiStoreList: [STORE] });
    if (body.includes('campusProductDailyStock')) return fulfill({ campusProductDailyStock: DAILY_STOCK });
    if (body.includes('MenuProducts')) return fulfill({ products: { items: CATALOG } });
    if (/ActiveOrder(?:InChannel)?\s*\{/.test(body)) return fulfill({ activeOrder: CART });
    if (body.includes('channelReviewStats')) return fulfill({ channelReviewStats: { totalCount: 0, goodRate: 0, averageRating: 0, ratingDistribution: [], topTags: [] } });
    if (body.includes('channelReviews')) return fulfill({ channelReviews: { totalItems: 0, items: [] } });
    if (body.includes('activeCustomer')) return fulfill({ activeCustomer: { id: '1', addresses: [], customFields: null } });
    if (body.includes('ProductCoupons')) return fulfill({ productCoupons: [] });
    if (body.includes('OrdersInChannel')) return fulfill({ myOrders: { items: [], totalItems: 0 } });
    if (body.includes('eligibleShippingMethods')) return fulfill({ eligibleShippingMethods: [] });
    if (body.includes('eligiblePaymentMethods')) return fulfill({ eligiblePaymentMethods: [] });
    return fulfill({});
};

async function openPage(browser, apiPattern, routeHandler, init) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route(apiPattern, routeHandler);
    return { ctx, page };
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const adminServer = serve(ADMIN_ROOT, 'guanli');
    const shopServer = serve(SHOP_ROOT, 'waimai');
    await new Promise((r) => adminServer.listen(0, '127.0.0.1', r));
    await new Promise((r) => shopServer.listen(0, '127.0.0.1', r));
    const ADMIN = `http://127.0.0.1:${adminServer.address().port}/guanli/`;
    const SHOP = `http://127.0.0.1:${shopServer.address().port}/waimai/`;
    console.log('static server', ADMIN, SHOP);

    const browser = await chromium.launch();
    const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };

    const adminInit = () => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p18');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    };
    const shopInit = () => {
        for (const k of ['auth_token', 'uni-auth_token', 'vendure_session_token', 'uni-vendure_session_token']) {
            localStorage.setItem(k, 'mock-token-68');
        }
        localStorage.setItem('auth_userId', 'c1');
        localStorage.setItem('uni-auth_userId', 'c1');
    };

    // ── 01 商品列表：限量行 ────────────────────────────────
    {
        const { ctx, page } = await openPage(browser, '**/admin-api', adminRoute, adminInit);
        await page.goto(ADMIN + '#/pages/campus/products', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.card', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        const state = await page.evaluate(() => ({
            cards: Array.from(document.querySelectorAll('.card')).map((e) => ({
                name: e.querySelector('.name')?.textContent?.trim() || '',
                metas: Array.from(e.querySelectorAll('.meta .m')).map((m) => m.textContent.trim()),
            })),
        }));
        console.log('01 state', JSON.stringify(state));
        await shot(page, '01-admin-products-limit-row.png');

        // ── 02 限量弹层 ──────────────────────────────────
        const opened = await page.evaluate(() => {
            const hit = Array.from(document.querySelectorAll('.card')).find((e) => (e.querySelector('.name')?.textContent || '').includes('宫保鸡丁'));
            const edit = hit && Array.from(hit.querySelectorAll('.meta .edit')).find((m) => m.textContent.includes('限量'));
            if (!edit) return false;
            edit.click();
            return true;
        });
        console.log('02 open sheet', opened);
        await page.waitForSelector('.sheet', { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(600);
        const sheet = await page.evaluate(() => ({
            open: !!document.querySelector('.mask .sheet'),
            title: document.querySelector('.sheet__t')?.textContent?.trim() || '',
            sub: document.querySelector('.sheet__sub')?.textContent?.trim() || '',
            hint: document.querySelector('.sheet__hint')?.textContent?.trim() || '',
            labels: Array.from(document.querySelectorAll('.limit-row__lbl')).map((e) => e.textContent.trim()),
            values: Array.from(document.querySelectorAll('.limit-row__input')).map((e) => e.querySelector('input')?.value ?? e.value ?? ''),
            ops: Array.from(document.querySelectorAll('.sheet__ops > *')).map((e) => e.textContent.trim()),
        }));
        console.log('02 state', JSON.stringify(sheet));
        await shot(page, '02-admin-products-limit-sheet.png');
        await ctx.close();
    }

    // ── 03 菜单：仅剩 N 份标签 ────────────────────────────
    {
        const { ctx, page } = await openPage(browser, '**/shop-api', shopRoute, shopInit);
        await page.goto(SHOP + '#/pages/shop/menu?token=' + encodeURIComponent('store-a-token') + '&name=' + encodeURIComponent('川味小馆') + '&routes=' + encodeURIComponent('R1,R3'), { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.good', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(2500);
        const state = await page.evaluate(() => ({
            goods: Array.from(document.querySelectorAll('.good')).map((e) => ({
                name: e.querySelector('.good-name')?.textContent?.trim() || '',
                tags: Array.from(e.querySelectorAll('.good-tag')).map((t) => t.textContent.trim()),
            })),
        }));
        console.log('03 state', JSON.stringify(state));
        await shot(page, '03-menu-left-count.png');

        // ── 04 每人限购 toast：点凉拌黄瓜「+」 ─────────────
        const clicked = await page.evaluate(() => {
            const hit = Array.from(document.querySelectorAll('.good')).find((e) => (e.querySelector('.good-name')?.textContent || '').includes('凉拌黄瓜'));
            const btn = hit && hit.querySelector('.add-btn:not(.spec)');
            if (!btn) return false;
            btn.click();
            return true;
        });
        console.log('04 click add', clicked);
        await page.waitForTimeout(600);
        const toast = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll('[class*="toast"],[class*="Toast"]'));
            return nodes.map((n) => ({ cls: String(n.className || ''), text: (n.innerText || '').replace(/\s+/g, ' ').trim() }));
        });
        console.log('04 state', JSON.stringify({ toast }));
        await shot(page, '04-menu-per-limit-toast.png');
        await ctx.close();
    }

    await browser.close();
    adminServer.close();
    shopServer.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
