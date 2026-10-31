// §105 售后自动化 后台截图（390×844 dpr=2，mock admin-api）
//   01 自动分流规则列表
//   02 新增规则弹层（空表单）
//   03 新增规则弹层（已填写金额区间）
//   04 保存后列表（新增规则已生效）
//   05 规则启停（停用一条规则）
//   06 自动分配到处理人（含近 7 日处理量/完结率建议参考）
//   07 售后异常预警
//   08 售后月度摘要推送
//   09 售后申请页入口（售后分析 / 售后自动化）
//   node scripts/shots-p105-after-sales-automation.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/nvm4w/nodejs/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'screenshots', 'waimai', 'p105-after-sales-automation');
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
  permissions: [], mustChangePassword: false,
};

const at = (minAgo) => new Date(Date.now() - minAgo * 60 * 1000).toISOString();

let RULES = [
  { id: 'u1', name: '小额仅退款自动同意', priority: 10, enabled: true, matchType: 'refund_only', matchReason: null, minAmount: null, maxAmount: 1500, action: 'approve', rejectReason: null, createdAt: at(43200) },
  { id: 'u2', name: '少送漏送自动同意', priority: 20, enabled: true, matchType: '*', matchReason: '少送', minAmount: null, maxAmount: 3000, action: 'approve', rejectReason: null, createdAt: at(28800) },
  { id: 'u3', name: '大额争议升级仲裁', priority: 30, enabled: false, matchType: '*', matchReason: null, minAmount: 8000, maxAmount: null, action: 'escalate', rejectReason: null, createdAt: at(14400) },
];

const PROFILE = {
  autoAssignEnabled: false, autoAssignMax: 0,
  alertEnabled: false, alertRefundRate: 0, alertOverdueCount: 0,
  monthlyPushEnabled: false, monthlyPushDay: 1, monthlyPushTime: '21:30',
};

// §89 员工绩效：近 7 日处理量 / 完结率，用于自动分配建议参考
const STAFF = [
  { operatorUserId: '160', operatorName: '张伟', handled: 34, resolved: 31, firstActionAvgMinutes: 4, resolveAvgMinutes: 27, overdueCount: 1, escalatedCount: 0, resolveRate: 91, reviewCount: 12, reviewAvgScore: 4.6 },
  { operatorUserId: '161', operatorName: '李静', handled: 28, resolved: 26, firstActionAvgMinutes: 3, resolveAvgMinutes: 22, overdueCount: 0, escalatedCount: 1, resolveRate: 93, reviewCount: 9, reviewAvgScore: 4.8 },
  { operatorUserId: '162', operatorName: '王强', handled: 21, resolved: 15, firstActionAvgMinutes: 9, resolveAvgMinutes: 41, overdueCount: 3, escalatedCount: 1, resolveRate: 71, reviewCount: 5, reviewAvgScore: 4.2 },
  { operatorUserId: '163', operatorName: '赵敏', handled: 12, resolved: 11, firstActionAvgMinutes: 6, resolveAvgMinutes: 19, overdueCount: 0, escalatedCount: 0, resolveRate: 92, reviewCount: 4, reviewAvgScore: 4.7 },
];

function makeRoute() {
  return async (route) => {
    const raw = route.request().postData() || '';
    const fulfill = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    let vars = {};
    try { vars = JSON.parse(raw).variables || {}; } catch { /* ignore */ }

    if (raw.includes('myTenantAccess')) return fulfill({ myTenantAccess: ACCESS });
    if (raw.includes('newOrderSignal')) return fulfill({ newOrderSignal: { count: 0, latestCreatedAt: null } });
    if (raw.includes('campusMerchantSaveAfterSalesAutoRule')) {
      const saved = {
        id: String(vars.id || 'u9'),
        name: String(vars.name || ''),
        priority: Number(vars.priority ?? 10),
        enabled: vars.enabled !== false,
        matchType: String(vars.matchType || '*'),
        matchReason: vars.matchReason || null,
        minAmount: vars.minAmount ?? null,
        maxAmount: vars.maxAmount ?? null,
        action: String(vars.action || 'approve'),
        rejectReason: vars.rejectReason || null,
        createdAt: at(0),
      };
      const exists = RULES.some((r) => r.id === saved.id);
      RULES = exists ? RULES.map((r) => (r.id === saved.id ? saved : r)) : [...RULES, saved];
      return fulfill({ campusMerchantSaveAfterSalesAutoRule: saved });
    }
    if (raw.includes('campusMerchantDeleteAfterSalesAutoRule')) {
      RULES = RULES.filter((r) => r.id !== String(vars.id || ''));
      return fulfill({ campusMerchantDeleteAfterSalesAutoRule: true });
    }
    if (raw.includes('campusMerchantAfterSalesAutoRules')) {
      return fulfill({ campusMerchantAfterSalesAutoRules: RULES });
    }
    if (raw.includes('campusMerchantUpdateAfterSalesAutomation')) {
      const next = { ...PROFILE };
      if (vars.autoAssignEnabled !== null && vars.autoAssignEnabled !== undefined) next.autoAssignEnabled = !!vars.autoAssignEnabled;
      if (vars.autoAssignMax !== null && vars.autoAssignMax !== undefined) next.autoAssignMax = Number(vars.autoAssignMax);
      if (vars.alertEnabled !== null && vars.alertEnabled !== undefined) next.alertEnabled = !!vars.alertEnabled;
      if (vars.alertRefundRate !== null && vars.alertRefundRate !== undefined) next.alertRefundRate = Number(vars.alertRefundRate);
      if (vars.alertOverdueCount !== null && vars.alertOverdueCount !== undefined) next.alertOverdueCount = Number(vars.alertOverdueCount);
      Object.assign(PROFILE, next);
      return fulfill({ campusMerchantUpdateAfterSalesAutomation: { ...next } });
    }
    if (raw.includes('campusMerchantUpdateAfterSalesMonthlyPush')) {
      PROFILE.monthlyPushEnabled = !!vars.enabled;
      if (vars.day != null) PROFILE.monthlyPushDay = Number(vars.day);
      if (vars.time) PROFILE.monthlyPushTime = String(vars.time);
      return fulfill({ campusMerchantUpdateAfterSalesMonthlyPush: { ...PROFILE } });
    }
    if (raw.includes('campusMerchantStoreProfile')) return fulfill({ campusMerchantStoreProfile: { ...PROFILE } });
    if (raw.includes('campusMerchantAfterSalesStaffStats')) return fulfill({ campusMerchantAfterSalesStaffStats: STAFF });
    if (raw.includes('campusMerchantAfterSalesWorkbench')) return fulfill({ campusMerchantAfterSalesWorkbench: {} });
    if (raw.includes('campusMerchantAfterSales')) return fulfill({ campusMerchantAfterSales: { items: [], total: 0, pendingCount: 0, stateCounts: [] } });
    if (raw.includes('me {')) return fulfill({ me: { id: '9' } });
    return fulfill({});
  };
}

async function newPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('wa_auth_token', 'mock-admin-token-p105');
    localStorage.setItem('wa_channel_token', 'canteen-a-token');
    localStorage.setItem('wa_channel_code', 'canteen-a');
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e && (e.message || e))));
  page.on('console', (m) => { const t = m.text(); if (t.toLowerCase().includes('error')) console.log('[console]', t.slice(0, 300)); });
  await page.route('**/admin-api', makeRoute());
  return { ctx, page };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const BASE = `http://127.0.0.1:${port}/guanli/`;
  console.log('static server', BASE);

  const browser = await chromium.launch();
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot ' + name); };
  const { ctx, page } = await newPage(browser);

  const readState = () => page.evaluate(() => ({
    rules: Array.from(document.querySelectorAll('.rule')).map((n) => ({
      name: n.querySelector('.rl-name')?.textContent?.trim(),
      state: n.querySelector('.rl-state')?.textContent?.trim(),
      cond: Array.from(n.querySelectorAll('.rc-chip')).map((c) => c.textContent.trim()),
      act: n.querySelector('.ra-txt')?.textContent?.trim(),
    })),
    cards: Array.from(document.querySelectorAll('.card .title')).map((n) => n.textContent.trim()),
    sw: Array.from(document.querySelectorAll('.sw')).map((n) => n.className),
    sheet: document.querySelector('.sheet__t')?.textContent?.trim() || '',
    fields: Array.from(document.querySelectorAll('.sheet .ipt')).map((n) => (n.value || n.textContent || '').trim()),
    toast: document.querySelector('.uni-toast')?.textContent?.trim() || '',
    staff: Array.from(document.querySelectorAll('.staff__row')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    entries: Array.from(document.querySelectorAll('.oe-i')).map((n) => n.textContent.trim()),
  }));

  const scrollToCard = async (title) => {
    await page.evaluate((t) => {
      const cards = Array.from(document.querySelectorAll('.card'));
      const card = cards.find((c) => (c.querySelector('.title')?.textContent || '').includes(t));
      if (card) card.scrollIntoView({ block: 'center' });
    }, title);
    await page.waitForTimeout(600);
  };

  // ── 01 规则列表 ───────────────────────────────────────────────────────────
  await page.goto(BASE + '#/pages/campus/after-sales-automation', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.rule, .inline-empty', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  console.log('01 state', JSON.stringify(await readState()));
  await shot(page, '01-automation-rules.png');

  // ── 02 新增规则弹层（空） ─────────────────────────────────────────────────
  await page.locator('.card .act').first().click();
  await page.waitForSelector('.sheet', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  console.log('02 state', JSON.stringify(await readState()));
  await shot(page, '02-automation-rule-sheet-empty.png');

  // ── 03 新增规则弹层（填写） ───────────────────────────────────────────────
  await page.locator('.sheet input').nth(0).fill('小额仅退款自动同意（试用）');
  await page.locator('.sheet input').nth(2).fill('0.01');
  await page.locator('.sheet input').nth(3).fill('20');
  await page.locator('.sheet input').nth(4).fill('15');
  await page.waitForTimeout(300);
  console.log('03 state', JSON.stringify(await readState()));
  await shot(page, '03-automation-rule-sheet-filled.png');

  // ── 04 保存后列表 ─────────────────────────────────────────────────────────
  await page.locator('.sheet__save').click();
  await page.waitForTimeout(1200);
  console.log('04 state', JSON.stringify(await readState()));
  await shot(page, '04-automation-rules-saved.png');

  // ── 05 启用阈值内规则（停用一条） ─────────────────────────────────────────
  await page.locator('.rule .rl-o', { hasText: '停用' }).first().click();
  await page.waitForTimeout(1000);
  console.log('05 state', JSON.stringify(await readState()));
  await shot(page, '05-automation-rule-toggled.png');

  // ── 06 自动分配 ───────────────────────────────────────────────────────────
  await scrollToCard('自动分配到处理人');
  await page.locator('.card', { hasText: '自动分配到处理人' }).locator('.sw-row').click();
  await page.locator('.card', { hasText: '自动分配到处理人' }).locator('input').fill('6');
  await page.waitForTimeout(300);
  console.log('06 state', JSON.stringify(await readState()));
  await shot(page, '06-automation-assign.png');
  await page.locator('.card', { hasText: '自动分配到处理人' }).locator('.save').click();
  await page.waitForTimeout(900);

  // ── 07 异常预警 ───────────────────────────────────────────────────────────
  await scrollToCard('售后异常预警');
  await page.locator('.card', { hasText: '售后异常预警' }).locator('.sw-row').click();
  await page.locator('.card', { hasText: '售后异常预警' }).locator('input').nth(0).fill('8');
  await page.locator('.card', { hasText: '售后异常预警' }).locator('input').nth(1).fill('5');
  await page.waitForTimeout(300);
  console.log('07 state', JSON.stringify(await readState()));
  await shot(page, '07-automation-alert.png');
  await page.locator('.card', { hasText: '售后异常预警' }).locator('.save').click();
  await page.waitForTimeout(900);

  // ── 08 月度推送 ───────────────────────────────────────────────────────────
  await scrollToCard('售后月度摘要推送');
  await page.locator('.card', { hasText: '售后月度摘要推送' }).locator('.sw-row').click();
  await page.waitForTimeout(300);
  console.log('08 state', JSON.stringify(await readState()));
  await shot(page, '08-automation-monthly-push.png');
  await page.locator('.card', { hasText: '售后月度摘要推送' }).locator('.save').click();
  await page.waitForTimeout(900);
  console.log('08b state', JSON.stringify(await readState()));

  // ── 09 售后申请页入口 ─────────────────────────────────────────────────────
  await page.goto(BASE + '?r=105#/pages/campus/merchant-after-sales', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.ops-entry', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  console.log('09 state', JSON.stringify(await readState()));
  await shot(page, '09-merchant-after-sales-entries.png');

  await ctx.close();
  await browser.close();
  server.close();
  console.log('SHOTS DONE ->', OUT);
})();
