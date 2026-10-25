// P8-4 截图：骑手分成台账 + 骑手轨迹（390×844 dpr=2）
//   node scripts/shots-p8-ledger.cjs
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const BASE = process.env.WA_ADMIN_BASE || 'https://e.joho.cn/guanli/';
const ADMIN_API = 'https://e.joho.cn/admin-api';
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p8-ledger');
// 默认店铺（台账与轨迹测试数据所在渠道）
const CHANNEL = { code: '__default_channel__', token: 'cnx87ezvmjx8nn3bth6c' };

const SHOTS = [
    { file: '01-rider-earnings.png', route: 'pages/campus/rider-earnings' },
    { file: '02-rider-track-order.png', route: 'pages/campus/rider-track?tab=order&code=ZW56SE6YGZ2YTXNK' },
];

async function adminToken() {
    const res = await fetch(ADMIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'mutation { login(username: "superadmin", password: "z123123") { ... on CurrentUser { id } } }' }),
    });
    const body = await res.json();
    if (!body.data?.login?.id) throw new Error('admin login failed: ' + JSON.stringify(body));
    return res.headers.get('vendure-auth-token');
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const token = await adminToken();
    const browser = await chromium.launch();
    for (const s of SHOTS) {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai',
        });
        await context.addInitScript(({ tk, ch }) => {
            localStorage.setItem('wa_auth_token', tk);
            localStorage.setItem('wa_channel_token', ch.token);
            localStorage.setItem('wa_channel_code', ch.code);
        }, { tk: token, ch: CHANNEL });
        const page = await context.newPage();
        const errors = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`${BASE}#/${s.route}`, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(
            () => !(document.body.innerText || '').includes('加载中'),
            null, { timeout: 30000 },
        ).catch(() => undefined);
        await page.waitForTimeout(4000);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        const info = await page.evaluate(() => ({
            cards: document.querySelectorAll('.card').length,
            segs: document.querySelectorAll('.seg').length,
            bodyText: (document.body.innerText || '').slice(0, 160).replace(/\s+/g, ' '),
        })).catch(() => ({ cards: -1, segs: -1, bodyText: 'evaluate failed' }));
        await page.screenshot({ path: path.join(OUT, s.file), animations: 'disabled', caret: 'hide', timeout: 120000 });
        console.log(`[shot] ${s.file} ${JSON.stringify(info)} errs=${errors.slice(0, 2).join(' | ')}`);
        await context.close();
    }
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
