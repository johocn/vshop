// §113 信任文案店铺级配置（后台经营设置）
//   01 默认：三项开关全开、文案留空（C 端回落默认文案）
//   02 关闭「质量」行：该行输入框禁用
//   03 自定义文案：质量/服务/时间三行均填写
//   04 保存成功：toast 提示 + 回填
//   node scripts/shots-p113-trust-copy.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p113-trust-copy');
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

const BOARD = {
    paused: false, merchantConfirmEnabled: true, printMode: 'off',
    storeName: '第一食堂', storePhone: '13800001111',
    pending: [], cooking: [], awaitingRider: [], delivering: [], pendingDispatch: [], thirdParty: [],
    ownedPool: [], ownedDispatched: [], merchantDelivering: [], scheduled: [],
    completedToday: 23, completedTodayAmount: 68400,
};

/** 门店资料：仅取页面用到的字段，其余走前端 ?? 兜底 */
function baseProfile(trust) {
    return {
        storeName: '第一食堂',
        businessHours: '10:00-14:00,17:00-21:00',
        storeNotice: '今日推出新菜：香菇滑鸡饭，欢迎品尝～',
        storePhone: '13800001111',
        paused: false,
        openNow: true,
        trustQualityEnabled: true, trustQualityText: null,
        trustServiceEnabled: true, trustServiceText: null,
        trustTimeEnabled: true, trustTimeText: null,
        ...trust,
    };
}

const TRUST_DEFAULT = {};
const TRUST_CUSTOM = {
    trustQualityText: '食材当日采购，出品稳定不踩雷',
    trustServiceText: '口味不合心意，店内随时可换',
    trustTimeText: '高峰期 20 分钟内出餐',
};

function makeRoute(profileRef) {
    return async (route) => {
        const raw = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
        if (raw.includes('campusMerchantBoard')) return fulfill({ campusMerchantBoard: BOARD });
        if (raw.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: profileRef.value });
        if (raw.includes('campusMerchantUpdateTrustCopy')) {
            let vars = {};
            try { vars = JSON.parse(raw).variables || {}; } catch (e) {}
            const next = {};
            ['quality', 'service', 'time'].forEach((k) => {
                const en = vars[k + 'Enabled'];
                const tx = vars[k + 'Text'];
                if (en != null) next['trust' + k[0].toUpperCase() + k.slice(1) + 'Enabled'] = en;
                if (tx != null) next['trust' + k[0].toUpperCase() + k.slice(1) + 'Text'] = String(tx).trim() || null;
            });
            profileRef.value = { ...profileRef.value, ...next };
            return fulfill({ campusMerchantUpdateTrustCopy: profileRef.value });
        }
        if (raw.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

async function newPage(browser, initialProfile) {
    const profileRef = { value: initialProfile };
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p113');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute(profileRef));
    return { ctx, page, profileRef };
}

/** 只读信任文案卡：行标签 / 开关态 / 输入值 / 输入禁用 */
const readTrust = () => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const card = cards.find((c) => c.querySelector('.title')?.textContent?.trim() === '信任文案');
    if (!card) return { found: false };
    const rows = Array.from(card.querySelectorAll('.field')).map((f) => {
        const sw = f.querySelector('.sw');
        const checked = !!sw?.querySelector('.uni-switch-input-checked');
        const input = f.querySelector('.ipt input');
        return {
            label: f.querySelector('.row-lbl')?.textContent?.trim() || '',
            on: checked,
            value: input ? input.value : '',
            disabled: !!input?.disabled,
        };
    });
    return {
        found: true,
        hint: card.querySelector('.tip')?.textContent?.trim() || '',
        rows,
        save: card.querySelector('.save')?.textContent?.trim() || '',
        toast: document.querySelector('.uni-toast')?.innerText?.trim() || '',
    };
};

const clickTrustSwitch = (index) => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const card = cards.find((c) => c.querySelector('.title')?.textContent?.trim() === '信任文案');
    const row = card?.querySelectorAll('.field')[index];
    const sw = row?.querySelector('.uni-switch-input') || row?.querySelector('.sw');
    if (!sw) return false;
    sw.click();
    return true;
};

const typeTrustText = (index, text) => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const card = cards.find((c) => c.querySelector('.title')?.textContent?.trim() === '信任文案');
    const input = card?.querySelectorAll('.field')[index]?.querySelector('.ipt input');
    if (!input) return false;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
};

const scrollToTrust = () => {
    const cards = Array.from(document.querySelectorAll('.card'));
    const card = cards.find((c) => c.querySelector('.title')?.textContent?.trim() === '信任文案');
    card?.scrollIntoView({ block: 'center' });
    return !!card;
};

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name, full = false) => { await page.screenshot({ path: path.join(OUT, name), fullPage: full }); console.log('shot ' + name); };
    const open = async (profile) => {
        const h = await newPage(browser, profile);
        await h.page.goto(BASE + '#/pages/campus/store-settings', { waitUntil: 'load', timeout: 60000 });
        await h.page.waitForSelector('.pill', { timeout: 30000 }).catch(() => undefined);
        await h.page.waitForTimeout(1200);
        const scrolled = await h.page.evaluate(scrollToTrust);
        await h.page.waitForTimeout(400);
        return { ...h, scrolled };
    };

    // ── 01 默认：三项全开、文案留空 ────────────────────────
    {
        const { ctx, page } = await open(baseProfile(TRUST_DEFAULT));
        console.log('01 state', JSON.stringify(await page.evaluate(readTrust)));
        await shot(page, '01-admin-trust-copy-default.png');
        await ctx.close();
    }

    // ── 02 关闭「质量」行：输入框禁用 ──────────────────────
    {
        const { ctx, page } = await open(baseProfile(TRUST_DEFAULT));
        console.log('02 toggle', await page.evaluate(clickTrustSwitch, 0));
        await page.waitForTimeout(500);
        console.log('02 state', JSON.stringify(await page.evaluate(readTrust)));
        await shot(page, '02-admin-trust-copy-quality-off.png');
        await ctx.close();
    }

    // ── 03 自定义文案：三行均填写 ──────────────────────────
    {
        const { ctx, page } = await open(baseProfile(TRUST_DEFAULT));
        const set = await page.evaluate((texts) => {
            texts.forEach((t, i) => {
                const input = Array.from(document.querySelectorAll('.card'))
                    .find((c) => c.querySelector('.title')?.textContent?.trim() === '信任文案')
                    ?.querySelectorAll('.field')[i]?.querySelector('.ipt input');
                if (input) { input.value = t; input.dispatchEvent(new Event('input', { bubbles: true })); }
            });
            return true;
        }, [TRUST_CUSTOM.trustQualityText, TRUST_CUSTOM.trustServiceText, TRUST_CUSTOM.trustTimeText]);
        console.log('03 fill', set);
        await page.waitForTimeout(500);
        console.log('03 state', JSON.stringify(await page.evaluate(readTrust)));
        await shot(page, '03-admin-trust-copy-custom.png');
        await ctx.close();
    }

    // ── 04 保存：toast + 回填 ──────────────────────────────
    {
        const { ctx, page } = await open(baseProfile(TRUST_CUSTOM));
        await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.card'))
                .find((c) => c.querySelector('.title')?.textContent?.trim() === '信任文案');
            card?.querySelector('.save')?.click();
        });
        await page.waitForTimeout(900);
        console.log('04 state', JSON.stringify(await page.evaluate(readTrust)));
        await shot(page, '04-admin-trust-copy-saved.png');
        await ctx.close();
    }

    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
