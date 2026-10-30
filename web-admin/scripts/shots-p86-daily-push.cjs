// §86 每日日报推送设置（营业结束后推昨日日报到商家群）后台截图（390×844 dpr=2）
//   01 关闭态：开关关 + 说明 + 保存按钮
//   02 开启态：展开「推送时间」（21:30）
//   03 非法时间：填 2130 点保存 → toast 提示格式错误
//   node scripts/shots-p86-daily-push.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p86-daily-push');
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

const PROFILE_OFF = {
    storeName: '第一食堂',
    businessHours: '10:00-14:00,17:00-21:00',
    storeNotice: '今日推出新菜：香菇滑鸡饭，欢迎品尝～',
    storePhone: '13800001111',
    paused: false, openNow: true, closedToday: false, closureNote: null,
    closureDates: [], nextTransition: null, unfinishedOrders: 0,
    dailyPushEnabled: false, dailyPushTime: '21:30',
};

const REVENUE = {
    today: { orders: 23, gross: 68400, avgTicket: 2974, cancelled: 1, cancelledAmount: 2600 },
    last7: { orders: 156, gross: 458600, avgTicket: 2940, cancelled: 5, cancelledAmount: 13200 },
    days: [
        { date: '10-21', orders: 18, gross: 52800 },
        { date: '10-22', orders: 25, gross: 74500 },
        { date: '10-23', orders: 21, gross: 61200 },
        { date: '10-24', orders: 30, gross: 89200 },
        { date: '10-25', orders: 24, gross: 68900 },
        { date: '10-26', orders: 15, gross: 43600 },
        { date: '10-27', orders: 23, gross: 68400 },
    ],
    days30: [],
};

const AUTO = { enabled: false, delaySeconds: 30, dailyLimit: 0, routes: [], acceptedToday: 0, blockReason: null };

function makeRoute(profileRef) {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (body.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: profileRef.value });
        if (body.includes('campusMerchantUpdateDailyPush')) {
            // 保存成功：把 mock 资料改成请求里的开关/时间，回填面板
            const enabled = /"enabled":\s*true/.test(body) || body.includes('enabled: true');
            const m = body.match(/"time":\s*"([^"]*)"/);
            profileRef.value = { ...profileRef.value, dailyPushEnabled: enabled, dailyPushTime: (m && m[1]) || '21:30' };
            return fulfill({ campusMerchantUpdateDailyPush: profileRef.value });
        }
        if (body.includes('campusMerchantRevenue')) return fulfill({ campusMerchantRevenue: REVENUE });
        if (body.includes('campusMerchantAutoAccept')) return fulfill({ campusMerchantAutoAccept: AUTO });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const profileRef = { value: { ...PROFILE_OFF } };
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p86');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute(profileRef));

    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };
    const card = () => page.locator('.card', { hasText: '每日日报推送' }).first();
    const readState = () => page.evaluate(() => {
        const c = Array.from(document.querySelectorAll('.card')).find((n) => n.textContent.includes('每日日报推送'));
        return {
            found: !!c,
            title: c?.querySelector('.title')?.textContent?.trim() || '',
            toggled: !!c?.querySelector('.sw input')?.checked,
            timeVisible: !!c?.querySelector('.ipt input'),
            time: c?.querySelector('.ipt input')?.value || '',
            tips: Array.from(c?.querySelectorAll('.tip') || []).map((t) => t.textContent.trim()),
            save: c?.querySelector('.save')?.textContent?.trim() || '',
            toast: document.querySelector('.uni-toast')?.textContent?.trim() || '',
        };
    });

    await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.card', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    await card().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // ── 01 关闭态 ─────────────────────────────────────────────────────────
    console.log('01 state', JSON.stringify(await readState()));
    await shot('01-daily-push-off.png');

    // ── 02 开启：点开关，展开推送时间 ─────────────────────────────────────
    await card().locator('.sw').first().click();
    await page.waitForTimeout(500);
    console.log('02 state', JSON.stringify(await readState()));
    await shot('02-daily-push-on.png');

    // ── 03 非法时间：2130 → 保存 → toast 提示 ─────────────────────────────
    await card().locator('.ipt input').first().fill('2130');
    await card().locator('.save').first().click();
    await page.waitForTimeout(700);
    console.log('03 state', JSON.stringify(await readState()));
    await shot('03-daily-push-bad-time.png');

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
