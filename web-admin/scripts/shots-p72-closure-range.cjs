// §72 营业日历批量连选日期区间 后台截图（390×844 dpr=2）
//   01 区间选择：开始日期 ~ 结束日期（国庆 7 天）
//   02 批量添加后：列表一次出现 7 条同备注休业日期 + Toast
//   node scripts/shots-p72-closure-range.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p72-closure-range');
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

const PROFILE_OPEN = {
    storeName: '第一食堂',
    businessHours: '10:00-14:00,17:00-21:00',
    storeNotice: '今日推出新菜：香菇滑鸡饭，欢迎品尝～',
    storePhone: '13800001111',
    paused: false,
    openNow: true,
    closedToday: false,
    closureNote: null,
    closureDates: [],
    nextTransition: null,
    unfinishedOrders: 0,
};

function makeRoute(profile) {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: {} });
        if (body.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: profile });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

async function newPage(browser, profile) {
    // uni-app H5 的 date picker 只有「桌面尺寸」（窗口 ≥500×500）才用原生 input[type=date]，
    // 因此先在 1200×900 下点选日期（脚本可控），再缩回 390×844 手机视口出图；状态不变。
    const ctx = await browser.newContext({
        viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p72');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute(profile));
    return { ctx, page };
}

const readState = () => {
    const cl = Array.from(document.querySelectorAll('.card')).find((c) => {
        const t = c.querySelector('.title');
        return t && t.textContent.includes('营业日历');
    });
    const tips = cl ? Array.from(cl.querySelectorAll('.tip')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()) : [];
    return {
        pill: cl?.querySelector('.pill')?.textContent?.trim() || '',
        range: Array.from(cl?.querySelectorAll('.range-row .picker') || []).map((e) => e.textContent.trim()),
        note: cl?.querySelector('.note-ipt input')?.value || '',
        tips: tips.slice(0, 2),
        items: Array.from(cl?.querySelectorAll('.closure-item') || []).map((i) => i.textContent.replace(/\s+/g, ' ').trim()),
        toast: document.querySelector('.uni-toast')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
};

async function scrollToClosure(page) {
    const ok = await page.evaluate(() => {
        const card = Array.from(document.querySelectorAll('.card')).find((c) => {
            const t = c.querySelector('.title');
            return t && t.textContent.includes('营业日历');
        });
        if (!card) return false;
        // 卡片顶端对齐到固定导航栏下方（导航高约 44px）
        const top = card.getBoundingClientRect().top + window.scrollY - 60;
        window.scrollTo(0, Math.max(0, top));
        return true;
    });
    await page.waitForTimeout(700);
    return ok;
}

/** 直接给 uni-app 日期 picker 的原生 input 赋值并派发 change（等价于用户点选日期） */
const pickRange = ({ offsetStart, offsetEnd, note }) => {
    const cl = Array.from(document.querySelectorAll('.card')).find((c) => {
        const t = c.querySelector('.title');
        return t && t.textContent.includes('营业日历');
    });
    if (!cl) return false;
    const dayKey = (off) => new Date(Date.now() + 8 * 3600_000 + off * 86_400_000).toISOString().slice(0, 10);
    const setVal = (el, v) => {
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
        desc.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const ipts = cl.querySelectorAll('.range-row input');
    if (ipts.length < 2) return false;
    setVal(ipts[0], dayKey(offsetStart));
    setVal(ipts[1], dayKey(offsetEnd));
    const noteIpt = cl.querySelector('.note-ipt input');
    if (noteIpt && note) setVal(noteIpt, note);
    return true;
};

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name, full = false) => { await page.screenshot({ path: path.join(OUT, name), fullPage: full }); console.log('shot ' + name); };

    const { ctx, page } = await newPage(browser, PROFILE_OPEN);
    await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    console.log('scroll', await scrollToClosure(page));

    // ── 01 选中连续区间（开始 ~ 结束）───────────────
    console.log('01 pick', await page.evaluate(pickRange, { offsetStart: 1, offsetEnd: 7, note: '国庆假期' }));
    await page.waitForTimeout(400);
    // 缩回手机视口再出图（picker 组件会切回自绘形态，已选值不变）
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await scrollToClosure(page);
    console.log('01 state', JSON.stringify(await page.evaluate(readState)));
    await shot(page, '01-admin-closure-range-picked.png');

    // ── 02 批量添加：一次写入区间内 7 天 ────────────────
    await page.click('.add-btn');
    await page.waitForTimeout(300);
    await scrollToClosure(page);
    console.log('02 state', JSON.stringify(await page.evaluate(readState)));
    await shot(page, '02-admin-closure-range-added.png');

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
