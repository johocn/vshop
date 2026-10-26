// P1-2 加料/套餐后台手机视口截图（390×844 dpr=2）
//   07 商品管理卡片：加料组数 / 套餐项数入口
//   08 底部「商品加料组」sheet（组名 / 必选最少 / 最多 / 选项名 / 加价）
//   09 底部「商品套餐内容」sheet（内含单品 / 份数 / 参考价）
//   node scripts/shots-p12-addon-combo.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p12-addon-combo');
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

const ADDON_GROUPS = JSON.stringify([
    { name: '加料', min: 0, max: 3, options: [{ name: '加蛋', price: 200 }, { name: '加辣', price: 0 }, { name: '加芝士', price: 300 }] },
    { name: '主食（必选 1）', min: 1, max: 1, options: [{ name: '米饭', price: 0 }, { name: '馒头', price: 0 }] },
]);
const COMBO = JSON.stringify({
    title: '单人套餐',
    items: [{ name: '宫保鸡丁', qty: 1, price: 2800 }, { name: '米饭', qty: 1, price: 200 }, { name: '冰粉', qty: 1, price: 600 }],
    note: '套餐含主食与甜品，比单点更划算',
});

const PRODUCTS = [
    { productId: 'p1', name: '宫保鸡丁', monthlySales: 1280, variantCount: 2, soldOut: false, packingFee: 100, addonGroups: ADDON_GROUPS, combo: COMBO },
    { productId: 'p2', name: '凉拌黄瓜', monthlySales: 640, variantCount: 1, soldOut: false, packingFee: null, addonGroups: null, combo: null },
    { productId: 'p3', name: '米饭', monthlySales: 2100, variantCount: 1, soldOut: false, packingFee: 0, addonGroups: null, combo: null },
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
        if (body.includes('campusMerchantProducts')) return fulfill({ campusMerchantProducts: { items: PRODUCTS, total: PRODUCTS.length } });
        if (body.includes('campusMerchantSetProductAddonGroups')) return fulfill({ campusMerchantSetProductAddonGroups: { ok: true, addonGroups: ADDON_GROUPS } });
        if (body.includes('campusMerchantSetProductCombo')) return fulfill({ campusMerchantSetProductCombo: { ok: true, combo: COMBO } });
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p12');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute());
    return { ctx, page };
}

const readSheet = () => ({
    open: !!document.querySelector('.mask .sheet'),
    title: document.querySelector('.sheet__t')?.textContent?.trim() || '',
    sub: document.querySelector('.sheet__sub')?.textContent?.trim() || '',
    hint: document.querySelector('.sheet__hint')?.textContent?.trim() || '',
    groups: Array.from(document.querySelectorAll('.ag')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)),
    options: Array.from(document.querySelectorAll('.op')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 60)),
    values: Array.from(document.querySelectorAll('.ag input, .op input')).map((e) => e.value),
    ops: Array.from(document.querySelectorAll('.sheet__ops text, .sheet__save')).map((e) => e.innerText.trim()),
});

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };

    // ── 07 商品管理卡片：加料/套餐入口 ─────────────────────
    {
        const { ctx, page } = await newPage(browser);
        await page.goto(BASE + '#/pages/campus/products', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.card', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(2000);
        const state = await page.evaluate(() => ({
            cards: Array.from(document.querySelectorAll('.card')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 110)),
            edits: document.querySelectorAll('.meta .edit').length,
        }));
        console.log('07 state', JSON.stringify(state));
        await shot(page, '07-admin-products-addon-combo-entry.png');
        await ctx.close();
    }

    // ── 08 加料组 sheet ────────────────────────────────────
    {
        const { ctx, page } = await newPage(browser);
        await page.goto(BASE + '#/pages/campus/products', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.card', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(2000);
        const opened = await page.evaluate(() => {
            const edits = Array.from(document.querySelectorAll('.meta .edit'));
            const el = edits[1];
            if (!el) return false;
            el.click();
            return true;
        });
        console.log('08 open addon sheet', opened);
        await page.waitForSelector('.sheet', { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        console.log('08 sheet', JSON.stringify(await page.evaluate(readSheet)));
        await shot(page, '08-admin-product-addon-sheet.png');
        await ctx.close();
    }

    // ── 09 套餐内容 sheet ──────────────────────────────────
    {
        const { ctx, page } = await newPage(browser);
        await page.goto(BASE + '#/pages/campus/products', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.card', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(2000);
        const opened = await page.evaluate(() => {
            const edits = Array.from(document.querySelectorAll('.meta .edit'));
            const el = edits[2];
            if (!el) return false;
            el.click();
            return true;
        });
        console.log('09 open combo sheet', opened);
        await page.waitForSelector('.sheet', { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        console.log('09 sheet', JSON.stringify(await page.evaluate(readSheet)));
        await shot(page, '09-admin-product-combo-sheet.png');
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
