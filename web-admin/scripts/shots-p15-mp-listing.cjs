// P2-1 小程序上架配置 后台截图（390×844 dpr=2）
//   01 上架前检查齐全：资料完整 + 已上架
//   02 缺项拦截态：AppID / 食品许可证缺失，上架前检查标红
//   03 审核驳回态：状态=审核驳回 + 审核备注
//   node scripts/shots-p15-mp-listing.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p15-mp-listing');
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

const configRef = { value: null };
const STORE_CONFIG_BASE = {
    channelId: '201', channelCode: 'canteen-a', channelName: '第一食堂', channelToken: 'canteen-a-token',
    routesEnabled: ['R2'], routeFirstLeg: [], handoverPoints: [], providerShopNo: [],
    merchantAcceptMinutes: 5, externalPushTimeoutMinutes: 3, externalFallbackMinutes: 5,
    storeLat: 30.5, storeLng: 114.3, deliveryMinutes: 30, minOrderAmount: 0, deliveryFee: 200,
    storeAddress: '第一食堂 1 号档口', storePhone: '13800001111', storeNotice: '今日推出新菜：香菇滑鸡饭',
    errandBaseFee: 500, thirdPartyBaseFee: 600, freeShippingThreshold: 2000,
    notifyTemplateAccepted: '', notifyTemplateRiderAssigned: '', notifyTemplateCookingDone: '',
    notifyTemplateDelivered: '', notifyTemplateExceptionHandled: '', notifyTemplateOrderPlaced: '',
    notifyTemplatePaymentPending: '', notifyTemplateCancelled: '', notifyTemplateAfterSales: '',
    notifyTemplateAddressChanged: '', h5BaseUrl: 'https://www.yourbao.cn',
    printMode: 'off', printProvider: 'local', printAccount: null, printDeviceSn: null, printDeviceKey: null, printCopies: 1,
    timeoutCompensationEnabled: false, timeoutGraceMinutes: 10, timeoutCompensationWindowHours: 24,
    timeoutCompensationCouponTemplateId: null, dynamicPricing: null,
    privacyNumberEnabled: false, privacyNumberProvider: 'mask', privacyNumberTtlMinutes: 60, privacyNumberPrefix: null,
    foodLicenseNo: 'JY24403000012345', foodLicenseImage: '', foodLicenseExpiry: '2027-12-31',
    foodSafetyGrade: 'A', foodSafetyCommitmentImage: '', kitchenLiveUrl: '', kitchenLiveEnabled: false,
    packingFeeEnabled: true, packingFeeMode: 'perItem', packingFeeAmount: 100, packingFeeCap: 500, packingFeeLabel: '打包费',
    mpAppId: 'wx9f2c1a7b3d5e8f01', mpCategory: '餐饮/外卖', mpVersion: '2.4.0',
    mpListingStatus: 'online', mpPrivacyUrl: 'https://www.yourbao.cn/waimai/privacy', mpReviewNote: '',
    mpReady: true, mpMissing: [],
};

function makeRoute() {
    return async (route) => {
        const body = route.request().postData() || '';
        const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        if (body.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
        if (body.includes('campusStoreConfigs')) return fulfill({ campusStoreConfigs: [configRef.value] });
        if (body.includes('campusUpdateStoreConfig')) return fulfill({ campusUpdateStoreConfig: configRef.value });
        if (body.includes('me {')) return fulfill({ me: { id: '9' } });
        return fulfill({});
    };
}

async function openConfig(browser, cfg) {
    configRef.value = JSON.parse(JSON.stringify(cfg));
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
        localStorage.setItem('wa_auth_token', 'mock-admin-token-p15');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
        localStorage.setItem('wa_channel_code', 'canteen-a');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
    await page.route('**/admin-api', makeRoute());
    await page.goto(`${BASE}#/pages/campus/config`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.card .head', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1600);
    await page.evaluate(() => { document.querySelector('.card .head')?.click(); });
    await page.waitForSelector('.sec-t', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
    return { ctx, page };
}

/** 小程序上架区块：状态段 + 输入值 + 检查清单 + 提示语 */
const readMpSection = () => {
    const sec = Array.from(document.querySelectorAll('.sec-t')).find((e) => e.innerText.includes('小程序上架'));
    if (!sec) return { found: false };
    const card = sec.closest('.card') || document;
    const rows = Array.from(card.querySelectorAll('.mp-check-row'));
    return {
        found: true,
        section: sec.innerText.trim(),
        statuses: Array.from(card.querySelectorAll('.mp-status-item')).map((e) => (e.className.includes('on') ? '*' : '') + e.innerText.trim()),
        values: Array.from(card.querySelectorAll('.cell input')).map((i) => i.value).filter((v) => v !== ''),
        checklist: rows.map((r) => r.innerText.replace(/\s+/g, ' ').trim()),
        tip: Array.from(card.querySelectorAll('.mp-check .timeout-tip')).map((e) => e.innerText.trim())[0] || '',
    };
};

let BASE = '';

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    BASE = `http://127.0.0.1:${port}/guanli/`;
    console.log('static server', BASE);

    const browser = await chromium.launch();
    const shot = async (page, name, full = false) => { await page.screenshot({ path: path.join(OUT, name), fullPage: full }); console.log('shot ' + name); };

    // ── 01 资料齐全 + 已上架 ───────────────────────────────
    {
        const { ctx, page } = await openConfig(browser, STORE_CONFIG_BASE);
        const scrolled = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('.sec-t')).find((e) => e.innerText.includes('小程序上架'));
            if (!t) return false;
            t.scrollIntoView({ block: 'start' });
            return true;
        });
        console.log('01 scroll', scrolled);
        await page.waitForTimeout(700);
        console.log('01 state', JSON.stringify(await page.evaluate(readMpSection)));
        await shot(page, '01-admin-mp-listing-ready.png');
        await ctx.close();
    }

    // ── 02 缺项拦截（AppID / 食品许可证缺失） ──────────────
    {
        const { ctx, page } = await openConfig(browser, {
            ...STORE_CONFIG_BASE,
            mpAppId: null, mpListingStatus: 'draft', mpVersion: '2.5.0',
            foodLicenseNo: null, mpReady: false,
            mpMissing: ['appId', 'licenseNo'],
        });
        await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('.sec-t')).find((e) => e.innerText.includes('小程序上架'));
            if (t) t.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(700);
        console.log('02 state', JSON.stringify(await page.evaluate(readMpSection)));
        await shot(page, '02-admin-mp-listing-missing.png');
        await ctx.close();
    }

    // ── 03 审核驳回 + 备注 ─────────────────────────────────
    {
        const { ctx, page } = await openConfig(browser, {
            ...STORE_CONFIG_BASE,
            mpListingStatus: 'rejected',
            mpReviewNote: '类目资质不足：请补充食品经营许可证有效期证明后重新提交',
        });
        await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('.sec-t')).find((e) => e.innerText.includes('小程序上架'));
            if (t) t.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(700);
        console.log('03 state', JSON.stringify(await page.evaluate(readMpSection)));
        await shot(page, '03-admin-mp-listing-rejected.png');
        await ctx.close();
    }

    await browser.close();
    server.close();
    console.log('SHOTS DONE ->', OUT);
    process.exit(0);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
