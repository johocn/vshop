// §118 日报推送三项收尾（后台）
//   01 经营设置：日报开 + 推送渠道未配置 → 红色降级提示
//   02 经营设置：推送渠道已配置 → 提示消失
//   03 工作台：日报到点未推成功 → 今日待办出现「日报未推送」（不计数）
//   04 点击该 chip → 跳到经营设置页
//   node scripts/shots-p118-daily-push-status.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p118-daily-push-status');
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

/** 工作台看板：日报未推送 + 其余待办为 0（验证 chip 不带数字尾巴） */
const BOARD = {
    paused: false, openNow: true, businessHours: '10:00-14:00,17:00-21:00', nextTransition: null,
    merchantConfirmEnabled: true, printMode: 'off', printProvider: 'local', cloudPrintConfigured: false,
    storeName: '第一食堂', storePhone: '13800001111',
    pending: [], cooking: [], awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
    ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 23, completedTodayAmount: 68400,
    closedToday: false, closureNote: null, unfinishedOrders: 0,
    urgedCount: 0, afterSalesPending: 0, refundFailed: 0, overdueOrders: 0,
    dailyPushPending: true,
};

function profile(channelReady) {
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
    };
}

async function newPage(browser, profileData) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p118');
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
        if (raw.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: BOARD });
        if (raw.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: profileData });
        if (raw.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    });
    return { ctx, page };
}

/** 日报推送卡：开关态 / 降级提示文案 + 颜色 + 字号 */
const readDailyPush = () => {
    const card = Array.from(document.querySelectorAll('.card'))
        .find((c) => c.querySelector('.title')?.textContent?.trim() === '每日日报推送');
    if (!card) return { found: false };
    const warnEl = card.querySelector('.tip-warn');
    const input = card.querySelector('.ipt input');
    return {
        found: true,
        on: !!card.querySelector('.uni-switch-input-checked'),
        time: input ? input.value : '',
        warn: warnEl ? warnEl.textContent.trim() : '',
        warnColor: warnEl ? getComputedStyle(warnEl).color : null,
        warnFont: warnEl ? getComputedStyle(warnEl).fontSize : null,
        desc: card.querySelectorAll('.tip')[0]?.textContent?.trim() || '',
        save: card.querySelector('.save')?.textContent?.trim() || '',
    };
};

const scrollToDailyPush = () => {
    const card = Array.from(document.querySelectorAll('.card'))
        .find((c) => c.querySelector('.title')?.textContent?.trim() === '每日日报推送');
    card?.scrollIntoView({ block: 'center' });
    return !!card;
};

/** 今日待办条：标题 + 每个 chip 文案与字号 */
const readTodo = () => {
    const bar = document.querySelector('.todobar');
    if (!bar) return { found: false };
    return {
        found: true,
        title: bar.querySelector('.t-lbl')?.textContent?.trim() || '',
        chips: Array.from(bar.querySelectorAll('.t-chip')).map((c) => ({
            text: c.textContent.trim(),
            font: getComputedStyle(c).fontSize,
        })),
    };
};

const clickChip = (text) => {
    const chip = Array.from(document.querySelectorAll('.todobar .t-chip'))
        .find((c) => c.textContent.trim().includes(text));
    if (!chip) return false;
    chip.click();
    return true;
};

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };
    const openSettings = async (channelReady) => {
        const { ctx, page } = await newPage(browser, profile(channelReady));
        await page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        await page.evaluate(scrollToDailyPush);
        await page.waitForTimeout(400);
        return { ctx, page };
    };

    // ── 01 日报开 + 渠道未配置 → 降级提示 ───────────────────
    {
        const { ctx, page } = await openSettings(false);
        console.log('01 state', JSON.stringify(await page.evaluate(readDailyPush)));
        await shot(page, '01-settings-daily-push-no-channel.png');
        await ctx.close();
    }

    // ── 02 渠道已配置 → 提示消失 ────────────────────────────
    {
        const { ctx, page } = await openSettings(true);
        console.log('02 state', JSON.stringify(await page.evaluate(readDailyPush)));
        await shot(page, '02-settings-daily-push-ready.png');
        await ctx.close();
    }

    // ── 03 工作台：今日待办含「日报未推送」 ─────────────────
    {
        const { ctx, page } = await newPage(browser, profile(true));
        await page.goto(BASE + '#/pages/campus/merchant', { waitUntil: 'load', timeout: 60000 });
        await page.waitForSelector('.todobar', { timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        console.log('03 state', JSON.stringify(await page.evaluate(readTodo)));
        await shot(page, '03-workbench-todo-daily-push.png');

        // ── 04 点击 chip → 经营设置 ─────────────────────────
        console.log('04 click', await page.evaluate(clickChip, '日报未推送'));
        await page.waitForTimeout(900);
        console.log('04 state', JSON.stringify({
            hash: await page.evaluate(() => location.hash),
            settingsLoaded: await page.evaluate(() => !!document.querySelector('.pill')),
        }));
        await shot(page, '04-workbench-todo-jump-settings.png');
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
