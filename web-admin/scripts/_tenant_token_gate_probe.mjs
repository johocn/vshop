// vshop 租户 token 闸门取证/回归探针（Playwright）
//
// 用途：验证「业务请求是否都带本租户 vendure-token」——即跨渠道商品泄漏是否被堵住。
//
// 用法：
//   node web-admin/scripts/_tenant_token_gate_probe.mjs                              # 默认打生产 https://e.joho.cn
//   node web-admin/scripts/_tenant_token_gate_probe.mjs --site http://localhost:5210 # 打本地
//   node web-admin/scripts/_tenant_token_gate_probe.mjs --shots                      # 同时输出 4 张手机视口截图
//
// 判定规则：
//   - 引导查询（见 BOOTSTRAP_OPS）允许空 vendure-token —— 它们正是用来解析渠道本身的。
//   - 其余全部视为业务请求，必须带非空 vendure-token，且与用例期望的渠道 token 一致。
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const HERE = path.dirname(fileURLToPath(import.meta.url)); // web-admin/scripts

// Playwright 解析顺序：PW_ROOT → 本机 vendure 依赖（已有可用浏览器）→ 就近 node_modules
function loadPlaywright() {
  const candidates = [
    process.env.PW_ROOT ? path.join(process.env.PW_ROOT, 'node_modules', 'playwright') : '',
    'd:/zhao/vendure/node_modules/playwright',
    path.resolve(HERE, '..', 'node_modules', 'playwright'),
    path.resolve(HERE, '..', '..', 'node_modules', 'playwright'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (e) {}
  }
  throw new Error('未找到 playwright，请先安装依赖或设置 PW_ROOT');
}

// 不执行 `npx playwright install` 也能跑：直接挑一个已存在的 chromium 可执行文件
function findChromium() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const preferred = path.join(root, 'chromium-1234', 'chrome-win64', 'chrome.exe');
  if (fs.existsSync(preferred)) return preferred;
  try {
    const dirs = fs.readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      const exe = path.join(root, d, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) {}
  return '';
}

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : ''; };
const SITE = arg('site') || process.env.SITE_URL || 'https://e.joho.cn';
const WANT_SHOTS = argv.includes('--shots');

const SHOTS = path.resolve(HERE, '..', 'docs', 'superpowers', 'manual', 'vshop-usemall-alignment', 'assets');
if (WANT_SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// 引导查询：允许空 vendure-token
const BOOTSTRAP_OPS = new Set([
  'ResolveChannelByCode', 'ResolveChannelByDomain', 'shopChannels',
  'GetShopTemplate', 'GetShopGlobalConfig', 'activeChannel', 'authMethods', 'ssoProviders',
]);

/** 从 GraphQL 请求体里取操作名；优先命名操作，跳过 fragment 前缀 */
function opOf(postData) {
  const m = (postData || '').match(/"query"\s*:\s*"([\s\S]*?)"\s*[,}]/);
  if (!m) return '';
  const q = m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
  const named = q.match(/\b(?:query|mutation)\s+([A-Za-z_]\w*)/);
  if (named) return named[1];
  const at = Math.max(q.lastIndexOf('query'), q.lastIndexOf('mutation'));
  const tail = at >= 0 ? q.slice(at) : q;
  const first = tail.match(/\{\s*([A-Za-z_][A-Za-z0-9_]*)/);
  return first ? first[1] : '';
}

const DEFAULT_TOKEN = 'cnx87ezvmjx8nn3bth6c'; // __default_channel__
const T1_TOKEN = 'a6fn474hhiqasmyiyrfl';
const T3_TOKEN = 'jmjobmq5lak9o50kevf';

// searchCheck: 'zero' 首屏搜索必须 0 件 | 'positive' 必须 > 0 件 | 'skip' 不检查
const CASES = [
  { name: 'default 首页', url: `${SITE}/?tenant=default`, token: DEFAULT_TOKEN, searchCheck: 'positive', shot: 'tenant-gate-default-home.png' },
  { name: 't1 首页', url: `${SITE}/?tenant=t1`, token: T1_TOKEN, searchCheck: 'zero', shot: 'tenant-gate-t1-home.png' },
  { name: 't3 首页', url: `${SITE}/?tenant=t3`, token: T3_TOKEN, searchCheck: 'positive', shot: 'tenant-gate-t3-home.png' },
  { name: '未知租户回退', url: `${SITE}/?tenant=nope`, token: DEFAULT_TOKEN, searchCheck: 'positive', shot: '' },
  { name: 't1 分类页', url: `${SITE}/?tenant=t1#/pages/category/index`, token: T1_TOKEN, searchCheck: 'skip', shot: 'tenant-gate-t1-category.png' },
];

const { chromium } = loadPlaywright();
const CHROMIUM = findChromium();

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
let failures = 0;

for (const c of CASES) {
  // 手机浏览视图：390×844、dpr=2（截图 780×1688）
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const rows = [];
  page.on('request', (r) => {
    if (!r.url().includes('/shop-api')) return;
    rows.push({ op: opOf(r.postData()), token: r.headers()['vendure-token'] ?? '', body: '' });
  });
  page.on('response', async (r) => {
    if (!r.url().includes('/shop-api')) return;
    const op = opOf(r.request().postData());
    const token = r.request().headers()['vendure-token'] ?? '';
    let body = '';
    try { body = await r.text(); } catch (e) {}
    const pending = rows.find((x) => x.op === op && x.token === token && !x.body);
    if (pending) pending.body = body;
    else rows.push({ op, token, body });
  });

  await page.goto(c.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000); // 等首屏全部请求发完（含被闸门挂起后放行的）

  if (WANT_SHOTS && c.shot) {
    await page.screenshot({ path: path.join(SHOTS, c.shot) });
  }

  const business = rows.filter((r) => !BOOTSTRAP_OPS.has(r.op));
  const bad = business.filter((r) => !r.token);
  const tokens = [...new Set(business.map((r) => r.token).filter(Boolean))];
  const searchRow = rows.find((r) => r.op === 'SearchProducts' && r.body);
  let searchTotal = null;
  if (searchRow) {
    try { searchTotal = JSON.parse(searchRow.body).data?.search?.totalItems ?? null; } catch (e) {}
  }

  console.log(`\n=== ${c.name}  ${c.url}`);
  console.log(`  业务请求 ${business.length} 条：${[...new Set(business.map((r) => r.op))].join(', ') || '(无)'}`);
  console.log(`  实际 token: ${tokens.join(', ') || '(无)'}   期望: ${c.token}`);
  console.log(`  search.totalItems = ${searchTotal}${WANT_SHOTS && c.shot ? `   截图: ${c.shot}` : ''}`);

  if (business.length === 0) {
    console.log('  ✗ 失败：没捕捉到任何业务请求（页面可能未渲染 / 地址不对）');
    failures++;
  }
  if (bad.length) {
    console.log(`  ✗ 失败：${bad.length} 条业务请求未带 vendure-token → [${bad.map((r) => r.op).join(', ')}]`);
    failures++;
  }
  if (tokens.length && !tokens.includes(c.token)) {
    console.log('  ✗ 失败：业务请求 token 与期望不符');
    failures++;
  }
  if (c.searchCheck === 'zero' && searchTotal !== 0) {
    console.log(`  ✗ 失败：期望首屏搜索 0 件，实际 ${searchTotal} 件（跨渠道泄漏）`);
    failures++;
  }
  if (c.searchCheck === 'positive' && !(searchTotal > 0)) {
    console.log(`  ✗ 失败：期望首屏搜索 > 0 件，实际 ${searchTotal}`);
    failures++;
  }
  if (searchTotal === null && c.searchCheck !== 'skip') {
    console.log('  ✗ 失败：没抓到 SearchProducts 响应，无法判定商品数');
    failures++;
  }

  await ctx.close();
}

await browser.close();
console.log(failures ? `\n结果：${failures} 项断言失败` : '\n结果：全部断言通过');
process.exitCode = failures ? 1 : 0;
