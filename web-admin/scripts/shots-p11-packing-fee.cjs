// P1-1 打包费/餐盒费后台手机视口截图（390×844 dpr=2）
//   05 校园配置「打包费/餐盒费」区块展开态（开关 / 计费方式 / 单价 / 封顶 / 展示名）
//   06 商品管理卡片打包费口径 + 底部「改打包费」sheet
//   node scripts/shots-p11-packing-fee.cjs
// 本轮未部署 → 本地静态服务（dist/build/h5，前缀 /guanli/）+ admin-api 全 mock。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p11-packing-fee');
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

const IMG = 'data:image/svg+xml;base64,' + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#ffd9c2"/><circle cx="60" cy="48" r="22" fill="#ff6600"/><rect x="30" y="80" width="60" height="10" rx="5" fill="#ffb27a"/></svg>',
).toString('base64');

const STORE_CFG = {
    channelId: '201', channelName: '第一食堂 · 川味小馆', channelToken: 'canteen-a-token',
    routesEnabled: ['R1', 'R3'], routeFirstLeg: [{ route: 'R1', carrier: 'self' }],
    handoverPoints: [{ route: 'R1', name: '东区交接点', address: '东区一食堂西门', phone: '0755-12345678', lat: 22.6, lng: 113.9, isDefault: true }],
    providerShopNo: [], storeLat: 22.6, storeLng: 113.9, deliveryMinutes: 25,
    minOrderAmount: 0, deliveryFee: 200, storeAddress: '东区一食堂 2 楼', storePhone: '0755-12345678',
    storeNotice: '', errandBaseFee: 300, thirdPartyBaseFee: 500, freeShippingThreshold: 0,
    printMode: 'cloud', dynamicPricing: true,
    timeoutCompensationEnabled: true, timeoutGraceMinutes: 10, timeoutCompensationWindowHours: 24,
    privacyNumberEnabled: true, privacyNumberProvider: 'mask', privacyNumberTtlMinutes: 60, privacyNumberPrefix: '',
    foodLicenseNo: 'JY24403000012345', foodLicenseImage: IMG, foodLicenseExpiry: '2027-12-31',
    foodSafetyGrade: 'A', foodSafetyCommitmentImage: IMG,
    kitchenLiveUrl: 'https://live.example.com/canteen-a', kitchenLiveEnabled: true,
    packingFeeEnabled: true, packingFeeMode: 'perItem', packingFeeAmount: 50, packingFeeCap: 100, packingFeeLabel: '餐盒费',
};

const PRODUCTS = [
    { productId: 'p1', name: '宫保鸡丁', monthlySales: 1280, variantCount: 2, soldOut: false, packingFee: 100 },
    { productId: 'p2', name: '凉拌黄瓜', monthlySales: 640, variantCount: 1, soldOut: false, packingFee: null },
    { productId: 'p3', name: '米饭', monthlySales: 2100, variantCount: 1, soldOut: false, packingFee: 0 },
];

const ACCESS = {
    isSuperAdmin: true,
    channels: [{ id: '201', code: 'canteen-a', token: 'canteen-a-token', name: '第一食堂', enabled: true, tenantNo: 1, isOfficial: true, memberEnabled: true, mustChangePassword: false }],
    permissions: [],
    mustChangePassword: false,
};

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusStoreConfigs')) return fulfill({ campusStoreConfigs: [STORE_CFG] });
        if (body.includes('campusMerchantProducts')) return fulfill({ campusMerchantProducts: { items: PRODUCTS, total: PRODUCTS.length } });
        if (body.includes('campusMerchantSetProductPackingFee')) return fulfill({ campusMerchantSetProductPackingFee: { ok: true, packingFee: 100 } });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

const readCfg = () => {
    const secs = Array.from(document.querySelectorAll('.sec-t')).map((e) => e.innerText.trim());
    const rows = Array.from(document.querySelectorAll('.cell')).map((e) => e.innerText.replace(/\s+/g, ' ').trim());
    const modes = Array.from(document.querySelectorAll('.pmode')).map((e) => e.innerText.trim());
    return { sections: secs, cells: rows, modes, inputs: Array.from(document.querySelectorAll('input')).length };
};

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };

    // ── 05 校园配置 · 打包费区块 ───────────────────────────
    {
        const ctx = await browser.newContext({
            viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
            locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        });
        await ctx.addInitScript(() => {
            localStorage.setItem('wa_auth_token', 'mock-admin-token-p11');
            localStorage.setItem('wa_channel_token', 'canteen-a-token');
            localStorage.setItem('wa_channel_code', 'canteen-a');
        });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
        page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
        await page.route('**/admin-api', makeRoute());
        await page.goto(BASE + '#/pages/campus/config', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.card .head', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1800);
        // 卡片默认折叠：先点开「第一食堂」展开全部配置区块
        const expanded = await page.evaluate(() => {
            const head = document.querySelector('.card .head');
            if (!head) return false;
            head.click();
            return true;
        });
        console.log('05 expand card', expanded);
        await page.waitForSelector('.sec-t', { timeout: 15000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        // 滚到「打包费/餐盒费」区块，让截图聚焦该段
        const ok = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('.sec-t')).find((e) => e.innerText.includes('打包费'));
            if (!t) return false;
            t.scrollIntoView({ block: 'center' });
            return true;
        });
        console.log('05 scroll to packing', ok);
        await page.waitForTimeout(600);
        const state = await page.evaluate(readCfg);
        console.log('05 state', JSON.stringify(state));
        await shot(page, '05-admin-config-packing-section.png');
        await ctx.close();
    }

    // ── 06 商品管理 · 打包费 sheet ─────────────────────────
    {
        const ctx = await browser.newContext({
            viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
            locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        });
        await ctx.addInitScript(() => {
            localStorage.setItem('wa_auth_token', 'mock-admin-token-p11');
            localStorage.setItem('wa_channel_token', 'canteen-a-token');
            localStorage.setItem('wa_channel_code', 'canteen-a');
        });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
        page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
        await page.route('**/admin-api', makeRoute());
        await page.goto(BASE + '#/pages/campus/products', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.card', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(2000);
        const state1 = await page.evaluate(() => ({
            cards: Array.from(document.querySelectorAll('.card')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 90)),
            edits: document.querySelectorAll('.meta .edit').length,
        }));
        console.log('06 state', JSON.stringify(state1));

        const opened = await page.evaluate(() => {
            const el = document.querySelector('.meta .edit');
            if (!el) return false;
            el.click();
            return true;
        });
        console.log('06 open sheet', opened);
        await page.waitForSelector('.sheet', { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(700);
        const state2 = await page.evaluate(() => ({
            open: !!document.querySelector('.mask .sheet'),
            title: document.querySelector('.sheet__t')?.textContent?.trim() || '',
            sub: document.querySelector('.sheet__sub')?.textContent?.trim() || '',
            hint: document.querySelector('.sheet__hint')?.textContent?.trim() || '',
            value: document.querySelector('.sheet__input')?.value || '',
            ops: Array.from(document.querySelectorAll('.sheet__ops uni-text, .sheet__ops text, .sheet__save')).map((e) => e.innerText.trim()),
        }));
        console.log('06 sheet state', JSON.stringify(state2));
        await shot(page, '06-admin-product-packing-sheet.png');
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
