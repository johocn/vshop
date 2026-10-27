// P2-5 骑手合规后台截图（390×844 dpr=2）
//   01 骑手审核列表：合规状态胶囊 + 健康证/保险/背调逐项状态
//   02 合规登记表单展开（健康证编号/到期日、保险单号/到期日、背调状态）
//   03 登记后合规失效态（健康证已过期 → 禁止接单）
//   node scripts/shots-p19-rider-compliance.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p19-rider-compliance');
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

const RIDERS = [
    {
        id: '701', emailAddress: 'rider1@campus.edu', firstName: '李', lastName: null,
        customFields: {
            riderStatus: 'pending', riderRealName: '李同学', riderStudentNo: '2024001', riderCampus: '本部',
            riderIdImg: null, riderCredit: 100, riderOnlineAt: null,
            riderHealthCertNo: null, riderHealthCertImg: null, riderHealthCertExpiry: null,
            riderInsuranceNo: null, riderInsuranceExpiry: null, riderBackgroundCheck: 'none', riderBackgroundCheckAt: null,
        },
    },
    {
        id: '702', emailAddress: 'rider2@campus.edu', firstName: '王', lastName: null,
        customFields: {
            riderStatus: 'approved', riderRealName: '王同学', riderStudentNo: '2023088', riderCampus: '东区',
            riderIdImg: null, riderCredit: 96, riderOnlineAt: '2026-10-27T02:00:00.000Z',
            riderHealthCertNo: 'HZ-2026-0012', riderHealthCertImg: null, riderHealthCertExpiry: '2026-11-15T00:00:00.000Z',
            riderInsuranceNo: 'INS-2026-8891', riderInsuranceExpiry: '2027-06-30T00:00:00.000Z', riderBackgroundCheck: 'passed',
            riderBackgroundCheckAt: '2026-09-01T00:00:00.000Z',
        },
    },
    {
        id: '703', emailAddress: 'rider3@campus.edu', firstName: '赵', lastName: null,
        customFields: {
            riderStatus: 'suspended', riderRealName: '赵同学', riderStudentNo: '2022156', riderCampus: '西区',
            riderIdImg: null, riderCredit: 100, riderOnlineAt: null,
            riderHealthCertNo: 'HZ-2025-0088', riderHealthCertImg: null, riderHealthCertExpiry: '2026-08-01T00:00:00.000Z',
            riderInsuranceNo: 'INS-2025-1122', riderInsuranceExpiry: '2026-07-01T00:00:00.000Z', riderBackgroundCheck: 'failed',
            riderBackgroundCheckAt: '2026-07-10T00:00:00.000Z',
        },
    },
];

// 保存后返回的合规判定（健康证已过期 → blocked）
const SAVED = {
    customerId: '702', ok: false, blocked: true, pending: false,
    items: [
        { key: 'healthCert', label: '健康证', status: 'expired', expiry: '2025-12-01T00:00:00.000Z', detail: 'HZ-2025-0001' },
        { key: 'insurance', label: '保险', status: 'ok', expiry: '2027-06-30T00:00:00.000Z', detail: 'INS-2026-8891' },
        { key: 'backgroundCheck', label: '背景调查', status: 'ok', expiry: null, detail: 'passed' },
    ],
};

let saved = false;
function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('campusUpdateRiderCompliance')) {
            saved = true;
            return fulfill({ campusUpdateRiderCompliance: SAVED });
        }
        if (body.includes('riderApplications')) {
            const rows = saved ? RIDERS.map((r) => (r.id === '702'
                ? { ...r, customFields: { ...r.customFields, riderHealthCertNo: 'HZ-2025-0001', riderHealthCertExpiry: '2025-12-01T00:00:00.000Z' } }
                : r)) : RIDERS;
            return fulfill({ riderApplications: { items: rows, total: rows.length } });
        }
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

const readPage = () => ({
    tabs: Array.from(document.querySelectorAll('.tabs uni-text')).map((e) => (e.className.includes('on') ? '*' : '') + e.innerText.trim()),
    cards: Array.from(document.querySelectorAll('.card')).map((c) => [
        (c.querySelector('.name')?.innerText || '').trim(),
        (c.querySelector('.st')?.innerText || '').trim(),
        (c.querySelector('.comp-pill')?.innerText || '').trim(),
    ].join(' | ')),
    rows: Array.from(document.querySelectorAll('.comp-row')).map((r) => [
        (r.querySelector('.comp-key')?.innerText || '').trim(),
        (r.querySelector('.comp-val')?.innerText || '').trim(),
        (r.querySelector('.comp-exp')?.innerText || '').trim(),
    ].join('=')),
    formOpen: document.querySelectorAll('.comp-form').length,
    inputs: Array.from(document.querySelectorAll('.comp-form input')).map((i) => i.value || i.placeholder),
    segs: Array.from(document.querySelectorAll('.comp-form .seg-item')).map((e) => (e.className.includes('on') ? '*' : '') + e.innerText.trim()),
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
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p19');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute());
    await page.goto(`${BASE}#/pages/rider/audit/index`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.card .comp', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };

    // ── 01 审核列表（待审核 + 已通过 + 已暂停）合规状态 ─────────────
    console.log('01 state', JSON.stringify(await page.evaluate(readPage)));
    await shot('01-admin-rider-compliance-list.png');

    // ── 02 已通过页签 + 展开合规登记表单 ────────────────────────
    await page.evaluate(() => { document.querySelectorAll('.tabs uni-text')[1]?.click(); });
    await page.waitForTimeout(1200);
    const opened = await page.evaluate(() => {
        const c = document.querySelector('.card');
        const btn = c && Array.from(c.querySelectorAll('.op')).find((b) => b.innerText.includes('合规登记'));
        if (!btn) return false;
        btn.click();
        return true;
    });
    await page.waitForTimeout(800);
    console.log('02 open form', opened, JSON.stringify(await page.evaluate(readPage)));
    await shot('02-admin-rider-compliance-form.png');

    // ── 03 保存后失效态（健康证已过期 → 禁止接单） ────────────────
    await page.evaluate(() => {
        const c = document.querySelector('.card');
        const inputs = c.querySelectorAll('.comp-form input');
        if (inputs[0]) { inputs[0].value = 'HZ-2025-0001'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); }
        if (inputs[1]) { inputs[1].value = '2025-12-01'; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); }
        const save = Array.from(c.querySelectorAll('.op')).find((b) => b.innerText.includes('保存合规资料'));
        save && save.click();
    });
    await page.waitForTimeout(1600);
    console.log('03 after save', JSON.stringify(await page.evaluate(readPage)));
    await shot('03-admin-rider-compliance-blocked.png');

    await browser.close();
    server.close();
    console.log('SHOTS DONE ->', OUT);
    process.exit(0);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});