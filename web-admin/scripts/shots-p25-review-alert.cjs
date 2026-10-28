// P4-2 评价品质闭环 · 后台预警线上取证（Playwright + 真实 admin-api）
//   01 品质预警列表（统计 KPI + 规则摘要 + 待处理卡片）
//   02 预警规则弹窗
//   03 一键回评弹窗（3 条场景模板）
//   04 回评后（已回评页签，卡片状态与处置说明）
//   node scripts/shots-p25-review-alert.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium, request } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p25-review-alert');
const BASE = 'https://e.joho.cn/guanli/';
const API = 'https://e.joho.cn/admin-api';
const CHANNEL = 'canteen-a-token';
const ADMIN_USER = 'superadmin';
const ADMIN_PWD = 'z123123';

(async () => {
    fs.mkdirSync(OUT, { recursive: true });

    const rc = await request.newContext({
        extraHTTPHeaders: { 'Content-Type': 'application/json', 'vendure-token': CHANNEL },
    });
    const loginRes = await rc.post(API, {
        data: {
            query: 'mutation($u:String!,$p:String!){ login(username:$u,password:$p){ ... on CurrentUser { id identifier } } }',
            variables: { u: ADMIN_USER, p: ADMIN_PWD },
        },
    });
    const token = loginRes.headers()['vendure-auth-token'];
    if (!token) throw new Error('admin 登录失败：未拿到 vendure-auth-token');
    console.log('admin token ok');
    await rc.dispose();

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(([t, ch]) => {
        localStorage.setItem('wa_auth_token', t);
        localStorage.setItem('wa_channel_token', ch);
        localStorage.setItem('wa_channel_code', 'canteen-a');
    }, [token, CHANNEL]);

    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
    page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });

    const shot = async (name) => {
        await page.screenshot({ path: path.join(OUT, name) });
        console.log('shot ' + name);
    };

    await page.goto(BASE + '#/pages/review/list/index', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.tabs', { timeout: 30000 });
    await page.waitForTimeout(1500);

    // 切到「品质预警」页签
    const switched = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('.tabs uni-text, .tabs text'))
            .find((e) => e.innerText.trim().includes('品质预警'));
        if (!t) return false;
        t.click();
        return true;
    });
    console.log('01 switch alert tab', switched);
    await page.waitForSelector('.a-stats', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(2500);

    const readState = () => ({
        stats: Array.from(document.querySelectorAll('.a-stat')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
        rule: document.querySelector('.a-rule__text')?.textContent?.trim() || '',
        cards: Array.from(document.querySelectorAll('.card')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)),
        status: Array.from(document.querySelectorAll('.card .st')).map((e) => e.innerText.trim()),
    });
    console.log('01 state', JSON.stringify(await page.evaluate(readState)));
    await shot('01-admin-review-alert-list.png');

    // ── 规则弹窗 ──
    await page.evaluate(() => { document.querySelector('.a-rule__btn')?.click(); });
    await page.waitForSelector('.am-sheet', { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    console.log('02 rule sheet', JSON.stringify(await page.evaluate(() => ({
        open: !!document.querySelector('.am-mask .am-sheet'),
        title: document.querySelector('.am-sheet__title')?.textContent?.trim() || '',
        label: Array.from(document.querySelectorAll('.am-row__label')).map((e) => e.innerText.trim()),
        segs: Array.from(document.querySelectorAll('.am-segs uni-text, .am-segs text')).map((e) => e.innerText.trim()),
        coupon: document.querySelector('.am-input')?.value || '',
    }))));
    await shot('02-admin-review-alert-rule.png');
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.am-sheet__ops uni-button, .am-sheet__ops button'));
        btns[0]?.click();
    });
    await page.waitForTimeout(700);

    // ── 一键回评弹窗 ──
    const opened = await page.evaluate(() => {
        const c = document.querySelector('.card .ops .op.main');
        if (!c) return false;
        c.click();
        return true;
    });
    console.log('03 open reply sheet', opened);
    await page.waitForSelector('.am-tpls', { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const pick = await page.evaluate(() => {
        const t = document.querySelector('.am-tpl');
        if (!t) return false;
        t.click();
        return true;
    });
    await page.waitForTimeout(600);
    console.log('03 reply sheet', JSON.stringify(await page.evaluate(() => ({
        open: !!document.querySelector('.am-mask .am-sheet'),
        title: document.querySelector('.am-sheet__title')?.textContent?.trim() || '',
        tpls: Array.from(document.querySelectorAll('.am-tpl')).map((e) => e.innerText.trim()),
        text: document.querySelector('.am-sheet__area')?.value || '',
    }))), 'pick', pick);
    await shot('03-admin-review-alert-reply-sheet.png');

    // 提交回评（真实写库）
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.am-sheet__ops uni-button, .am-sheet__ops button'));
        btns[1]?.click();
    });
    await page.waitForTimeout(3500);

    // 切到「已回评」页签
    const toReplied = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('.filters uni-text, .filters text'))
            .find((e) => e.innerText.trim() === '已回评');
        if (!t) return false;
        t.click();
        return true;
    });
    console.log('04 switch replied', toReplied);
    await page.waitForTimeout(2500);
    console.log('04 state', JSON.stringify(await page.evaluate(() => ({
        cards: Array.from(document.querySelectorAll('.card')).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 220)),
        status: Array.from(document.querySelectorAll('.card .st')).map((e) => e.innerText.trim()),
    }))));
    await shot('04-admin-review-alert-replied.png');

    await ctx.close();
    await browser.close();
    console.log('SHOTS DONE ->', OUT);
})().catch((e) => {
    console.error('SHOTS ERROR:', e.message);
    process.exit(1);
});
