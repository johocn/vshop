// P2-4 取餐柜与无人配送后台截图（390×844 dpr=2）
//   01 取餐柜站点：新增表单 + 站点卡（启用/停用/编辑/删除）
//   02 无人配送通道：服务商胶囊 + 接口地址/密钥 + 开关
//   03 编辑站点弹框
//   node scripts/shots-p18-locker.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p18-locker');
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

const STATIONS = [
    {
        id: '301', channelId: '201', name: '东区 3 号楼智能柜', location: '东区 3 号楼一层大厅（宿管室旁）',
        provider: 'self', providerName: '自建', totalCells: 48, availableCells: 31,
        openHours: '07:00-23:00', pickupGuide: '取餐码 6 位，柜机屏幕输入即可开柜；超 24 小时未取将转交宿管。',
        enabled: true, sort: 1, createdBy: '9', createdAt: '2026-10-27T02:10:00.000Z',
    },
    {
        id: '302', channelId: '201', name: '西区 7 号教学楼智能柜', location: '西区 7 号教学楼北门',
        provider: 'meituan', providerName: '美团无人车', totalCells: 36, availableCells: 8,
        openHours: null, pickupGuide: '扫码后柜门自动弹开，取餐后请关门。',
        enabled: true, sort: 2, createdBy: '9', createdAt: '2026-10-27T02:22:00.000Z',
    },
    {
        id: '303', channelId: '201', name: '北区 2 号楼智能柜', location: '北区 2 号楼架空层',
        provider: 'self', providerName: '自建', totalCells: 24, availableCells: 0,
        openHours: '08:00-20:00', pickupGuide: null,
        enabled: false, sort: 3, createdBy: '9', createdAt: '2026-10-26T09:40:00.000Z',
    },
];

const CHANNEL = {
    enabled: true,
    provider: 'mock',
    providerName: '模拟通道（占位）',
    providers: [
        { code: 'none', name: '未开通', needsEndpoint: false, needsKey: false },
        { code: 'mock', name: '模拟通道（占位）', needsEndpoint: false, needsKey: false },
        { code: 'meituan', name: '美团无人车', needsEndpoint: true, needsKey: true },
        { code: 'xinshiji', name: '新石器无人车', needsEndpoint: true, needsKey: true },
    ],
    endpoint: 'https://api.example.com/unmanned',
    keyConfigured: true,
    needsEndpoint: false,
    needsKey: false,
};

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('campusLockerStations')) return fulfill({ campusLockerStations: STATIONS });
        if (body.includes('campusUnmannedChannel')) return fulfill({ campusUnmannedChannel: CHANNEL });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

const readPage = () => ({
    tabs: Array.from(document.querySelectorAll('.tab')).map((e) => (e.className.includes('on') ? '*' : '') + e.innerText.trim()),
    cards: Array.from(document.querySelectorAll('.card')).filter((c) => c.querySelector('.pill'))
        .map((c) => [
            (c.querySelector('.name')?.innerText || '').trim(),
            (c.querySelector('.pill')?.innerText || '').trim(),
            (c.querySelector('.meta')?.innerText || '').replace(/\s+/g, ' ').trim(),
            Array.from(c.querySelectorAll('.foot .act')).map((b) => b.innerText.trim()).join('/'),
        ].join(' | ')),
    providers: Array.from(document.querySelectorAll('.chip')).map((e) => (e.className.includes('on') ? '*' : '') + e.innerText.trim()),
    inputs: Array.from(document.querySelectorAll('.cell input')).map((i) => i.value || i.placeholder),
    modal: (() => {
        const m = document.querySelector('.mask .modal');
        if (!m) return null;
        return {
            title: (m.querySelector('.modal-title')?.innerText || '').trim(),
            sub: (m.querySelector('.modal-sub')?.innerText || '').trim(),
            buttons: Array.from(m.querySelectorAll('.act')).map((b) => b.innerText.trim()),
        };
    })(),
});

let BASE = '';

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p18');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute());
    await page.goto(`${BASE}#/pages/campus/locker`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.card .head', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1800);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };

    // ── 01 站点列表 + 新增表单 ─────────────────────────────
    console.log('01 state', JSON.stringify(await page.evaluate(readPage)));
    await shot('01-admin-locker-stations.png');

    // ── 02 无人配送通道 ───────────────────────────────────
    await page.evaluate(() => { document.querySelectorAll('.tab')[1]?.click(); });
    await page.waitForTimeout(1200);
    console.log('02 state', JSON.stringify(await page.evaluate(readPage)));
    await shot('02-admin-unmanned-channel.png');

    // ── 03 编辑站点弹框 ───────────────────────────────────
    await page.evaluate(() => { document.querySelectorAll('.tab')[0]?.click(); });
    await page.waitForTimeout(600);
    const opened = await page.evaluate(() => {
        const c = Array.from(document.querySelectorAll('.card')).find((x) => (x.querySelector('.pill')?.innerText || '').includes('启用'));
        const btn = c && Array.from(c.querySelectorAll('.foot .act')).find((b) => b.innerText.includes('编辑'));
        if (!btn) return false;
        btn.click();
        return true;
    });
    await page.waitForTimeout(800);
    console.log('03 open edit', opened, JSON.stringify(await page.evaluate(readPage)));
    await shot('03-admin-locker-edit-modal.png');

    await browser.close();
    server.close();
    console.log('SHOTS DONE ->', OUT);
    process.exit(0);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
