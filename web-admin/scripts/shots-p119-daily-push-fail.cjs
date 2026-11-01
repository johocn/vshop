// §119 日报推送失败原因可见（后台经营设置）
//   01 有失败 + 渠道可用 → 橙色「上次推送失败 MM-DD HH:MM：原因」
//   02 无失败 → 该行不出现
//   03 有失败 + 渠道未配置 → 红字降级提示与橙色失败行同时出现（叠加场景）
//   node scripts/shots-p119-daily-push-fail.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p119-daily-push-fail');
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

/** 失败时间用固定 epoch：2026-11-01 22:10 +08:00 */
const FAIL_AT = Date.UTC(2026, 10, 1, 14, 10, 0);

function profile({ channelReady, failAt, reason }) {
    return {
        storeName: '第一食堂',
        businessHours: '10:00-14:00,17:00-21:00',
        storeNotice: '今日推出新菜：香菇滑鸡饭，欢迎品尝～',
        storePhone: '13800001111',
        paused: false,
        openNow: true,
        closureDates: [],
        nextTransition: null,
        unfinishedOrders: 0,
        dailyPushEnabled: true,
        dailyPushTime: '21:30',
        dailyPushChannelReady: channelReady,
        dailyPushLastFailAt: failAt,
        dailyPushLastFailReason: reason,
    };
}

async function newPage(browser, profileData) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p119');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: profileData });
        return fulfill({});
    });
    return { ctx, page };
}

/** 日报卡：降级提示 / 失败行 / 汇总提示的文案与样式 */
const readDailyPush = () => {
    const card = Array.from(document.querySelectorAll('.card'))
        .find((c) => c.querySelector('.title')?.textContent?.trim() === '每日日报推送');
    if (!card) return { found: false };
    const warnEl = card.querySelector('.tip-warn');
    const failEl = card.querySelector('.tip-fail');
    const style = (el) => (el ? { text: el.textContent.trim(), color: getComputedStyle(el).color, font: getComputedStyle(el).fontSize } : null);
    return {
        found: true,
        on: !!card.querySelector('.uni-switch-input-checked'),
        warn: style(warnEl),
        fail: style(failEl),
        desc: card.querySelectorAll('.tip')[0]?.textContent?.trim() || '',
    };
};

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const open = async (data, name) => {
        const { ctx, page } = await newPage(browser, data);
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.card'))
                .find((c) => c.querySelector('.title')?.textContent?.trim() === '每日日报推送');
            card?.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(400);
        console.log(name, JSON.stringify(await page.evaluate(readDailyPush)));
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        console.log('shot ' + name + '.png');
        await ctx.close();
    };

    await open(
        profile({ channelReady: true, failAt: FAIL_AT, reason: 'code=9499 msg=Webhook 校验失败' }),
        '01-settings-daily-push-fail',
    );
    await open(
        profile({ channelReady: true, failAt: 0, reason: '' }),
        '02-settings-daily-push-no-fail',
    );
    await open(
        profile({ channelReady: false, failAt: FAIL_AT, reason: '未配置 webhook' }),
        '03-settings-daily-push-fail-and-no-channel',
    );

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
