# vshop 租户商品跨渠道泄漏修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 vshop（`e.joho.cn`）客户端装一道「租户就绪闸门」，让所有业务请求在渠道 token 就绪前一律不发，彻底堵住「每个租户都能看到默认渠道全部商品」的泄漏。

**Architecture:** 闸门住在 `src/api/client.ts`：`getGraphQLClient()` 返回一个薄包装客户端，其 `request()` 先 `await waitTenantGate()`、**再**刷新 headers（必须卡在取 headers 之前，否则 token 仍是空快照）。`App.vue` 在 `initTenant()` 完成后 `openTenantGate()` 开闸；`initTenant()` / `switchTenant()` 内部用 `withoutTenantGate()` 作用域旁路，避免引导查询与闸门互等死锁。

**Tech Stack:** uni-app H5（Vue 3 + Pinia + TypeScript）、graphql-request 7、Vendure shop-api、Playwright（取证）、Node 脚本（探针）。

**设计文档:** `docs/superpowers/specs/2026-09-30-vshop-tenant-token-gate-design.md`

**总改动面（4 个文件，3 改 1 增）：**

| 文件 | 动作 |
|---|---|
| `src/api/client.ts` | 修改：新增闸门 + 包装客户端 |
| `src/stores/tenant.ts` | 修改：`initTenant` / `switchTenant` 包旁路 |
| `src/App.vue` | 修改：`initTenant()` 后开闸 |
| `web-admin/scripts/_tenant_token_gate_probe.mjs` | 新增：取证/回归探针（脚本，非产品代码） |

---

### Task 1: 写取证探针并复现基线（失败测试）

**Files:**
- Create: `d:\zhao\vshop\web-admin\scripts\_tenant_token_gate_probe.mjs`

**背景（务必先读）**：泄漏的判定标准是「**业务请求**是否都带非空 `vendure-token`」。**引导查询**（`ResolveChannelByCode` / `ResolveChannelByDomain` / `shopChannels` / `shopTemplate` / `shopGlobalConfig` / `activeChannel` / `authMethods` / `ssoProviders`）本身就是用来解析渠道的，**允许空 token**，不能算失败。
`opOf()` 必须优先匹配命名操作（`query SearchProducts(...)`），否则 `searchProducts` 的 query 以 `fragment ProductCard ...` 开头，会误报成 `productId`。

- [ ] **Step 1: 写探针脚本**

创建 `d:\zhao\vshop\web-admin\scripts\_tenant_token_gate_probe.mjs`：

```js
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
  'shopTemplate', 'shopGlobalConfig', 'activeChannel', 'authMethods', 'ssoProviders',
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

  if (c.shot) {
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
  console.log(`  search.totalItems = ${searchTotal}${c.shot ? `   截图: ${c.shot}` : ''}`);

  if (business.length === 0) {
    console.log('  ✗ 失败：没捕捉到任何业务请求（页面可能未渲染 / 地址不对）');
    failures++;
  }
  if (bad.length) {
    console.log(`  ✗ 失败：${bad.length} 条业务请求未带 vendure-token → [${bad.map((r) => r.op).join(', ')}]`);
    failures++;
  }
  if (tokens.length && !tokens.includes(c.token)) {
    console.log(`  ✗ 失败：业务请求 token 与期望不符`);
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
```

- [ ] **Step 2: 跑基线，确认失败（这就是「失败的测试」）**

```powershell
node d:\zhao\vshop\web-admin\scripts\_tenant_token_gate_probe.mjs
```

Expected（修复前，**必须失败**）：
```
=== t1 首页  https://e.joho.cn/?tenant=t1
  ✗ 失败：1 条业务请求未带 vendure-token → [SearchProducts]
  ✗ 失败：期望首屏搜索 0 件，实际 14 件（跨渠道泄漏）
...
结果：N 项断言失败
```

若 `t1 首页` 反而通过，说明基线已变（例如前端已重新部署过），把该输出原样贴进 Task 8 的手册章节，并在 Task 10 复验时对比。

- [ ] **Step 3: 提交探针**

```powershell
cd d:\zhao\vshop
git add web-admin/scripts/_tenant_token_gate_probe.mjs
git commit -m "test(vshop): 新增租户 token 闸门取证探针，复现首屏 search 跨渠道泄漏"
```

---

### Task 2: `src/api/client.ts` 加闸门

**Files:**
- Modify: `d:\zhao\vshop\src\api\client.ts`

- [ ] **Step 1: 在 `AUTH_TOKEN_HEADER` 常量后加闸门常量**

把

```ts
const SESSION_TOKEN_KEY = 'vendure_session_token';
const AUTH_TOKEN_HEADER = 'vendure-auth-token';
```

改为

```ts
const SESSION_TOKEN_KEY = 'vendure_session_token';
const AUTH_TOKEN_HEADER = 'vendure-auth-token';

/** 闸门兜底时长：initTenant 异常/网络卡死时，最多挂起这么久就放行，避免页面永久骨架屏 */
const TENANT_GATE_TIMEOUT_MS = 8000;
```

- [ ] **Step 2: 在 `getShopApiHeaders()` 之后插入闸门与包装客户端**

在 `export function getShopApiHeaders()` 的 `}` 与 `let clientInstance` 之间**不动**，改为把闸门代码插在 `getShopApiHeaders()` 函数之后、`export function getGraphQLClient()` 之前，并**删掉原来的 `getGraphQLClient()` 实现**，替换为下面这一整块：

```ts
// ─────────────────────────────────────────────────────────────
// 租户就绪闸门
//
// 背景：App.vue 的 onLaunch 是 async，而 uni-app 不会等 onLaunch 结束才挂载页面。
// 入口页 onMounted 取数时 tenantStore.token 仍为 ''，而 Vendure 收到空 vendure-token
// 会静默落到默认渠道 —— 于是每个租户都看到了默认渠道的全部商品。
//
// 约定：闸门 = 「渠道 token 已就绪」，与 tenantReady（整体初始化完成）解耦，
// 这样 restoreSession() 走闸门时不会与「tenantReady 在 restoreSession 之后才置位」互等。
// ─────────────────────────────────────────────────────────────

let gateOpen = false;
const gateWaiters: Array<() => void> = [];

/** 由 App.onLaunch 在 initTenant() 完成后调用；只开一次，可重复调用 */
export function openTenantGate() {
    if (gateOpen) return;
    gateOpen = true;
    gateWaiters.splice(0).forEach((fire) => fire());
}

/** 业务请求闸门：token 未就绪时挂起，≤8s 兜底放行（避免骨架屏永久卡死） */
export function waitTenantGate(): Promise<void> {
    if (gateOpen) return Promise.resolve();
    return new Promise<void>((resolve) => {
        let done = false;
        const fire = () => {
            if (done) return;
            done = true;
            const i = gateWaiters.indexOf(fire);
            if (i >= 0) gateWaiters.splice(i, 1);
            resolve();
        };
        gateWaiters.push(fire);
        setTimeout(fire, TENANT_GATE_TIMEOUT_MS);
    });
}

// 引导查询旁路深度：initTenant 内部解析渠道必须免闸门，否则与闸门互等死锁
let bypassDepth = 0;

/** 在宿主的整个 await 链内关闭闸门（引导查询专用） */
export async function withoutTenantGate<T>(fn: () => Promise<T>): Promise<T> {
    bypassDepth += 1;
    try {
        return await fn();
    } finally {
        bypassDepth -= 1;
    }
}

export interface ShopGraphQLClient {
    request<T = any>(query: any, variables?: any, ...rest: any[]): Promise<T>;
    setHeaders(headers: Record<string, string>): void;
}

/**
 * 带闸门的 client 包装。
 *
 * 闸门必须卡在「取 headers 之前」：getGraphQLClient() 是同步的，页面在 onMounted 里
 * 同步取 client、同步发起 request；graphql-request 的 headers 是 setHeaders() 那一刻
 * 被快照的 —— 若把闸门放到 customFetch 里，headers 早已是空 token，闸门形同虚设。
 */
class GatedClient implements ShopGraphQLClient {
    constructor(private inner: GraphQLClient) {}

    async request<T = any>(query: any, variables?: any, ...rest: any[]): Promise<T> {
        if (bypassDepth === 0) await waitTenantGate();
        this.inner.setHeaders(getShopApiHeaders());
        return (this.inner.request as any)(query, variables, ...rest);
    }

    setHeaders(headers: Record<string, string>) {
        this.inner.setHeaders(headers);
    }
}

export function getGraphQLClient(): ShopGraphQLClient {
    if (!clientInstance) {
        clientInstance = new GraphQLClient(API_URL, {
            fetch: customFetch as any,
            headers: {},
        });
    }
    return new GatedClient(clientInstance);
}
```

> 注意：`customFetch`、`deduped()`、`resetClient()`、`getShopApiUrl()` **保持不变**；`let clientInstance: GraphQLClient | null = null;` 与 `const inFlight` 也保持原位（在 `getShopApiHeaders()` 之前）。

- [ ] **Step 3: 类型检查**

```powershell
cd d:\zhao\vshop
npx tsc --noEmit
```

Expected: 无输出（0 error）。若报 `clientInstance` 相关的 `never`/类型错误，检查是否漏了 `GatedClient` 里的 `private inner: GraphQLClient`。

- [ ] **Step 4: 提交**

```powershell
git add src/api/client.ts
git commit -m "fix(vshop): api client 新增租户就绪闸门，业务请求在 token 就绪前不发"
```

---

### Task 3: `src/stores/tenant.ts` 加引导查询旁路

**Files:**
- Modify: `d:\zhao\vshop\src\stores\tenant.ts:1-3`（import）、`:82-99`（`initTenant`）、`:197-201`（`switchTenant`）

- [ ] **Step 1: 补 import**

把第 3 行

```ts
import { getActiveChannelConfig, getAuthMethods, getSsoProviders, resolveChannelByDomain, resolveChannelByCode, listShopChannels, getShopTemplate, getShopGlobalConfig } from '../api/queries/channel';
```

改为（追加一行）：

```ts
import { getActiveChannelConfig, getAuthMethods, getSsoProviders, resolveChannelByDomain, resolveChannelByCode, listShopChannels, getShopTemplate, getShopGlobalConfig } from '../api/queries/channel';
import { withoutTenantGate } from '../api/client';
```

> 说明：`../api/client` 已反向引用本 store，这个环在改动前就存在（`store → queries/channel → client → store`），`client.ts` 的模块体只在函数内调用 `useTenantStore()`，`withoutTenantGate` 是函数声明（有提升），因此不会触发 TDZ。

- [ ] **Step 2: `initTenant` 整体包进旁路**

把

```ts
    async function initTenant() {
        // 租户来源优先级（用户确认）：?tenant= > localStorage > 域名 > 默认。
        // ⚠️ 域名解析必须排在后两位。e.joho.cn 绑定在默认渠道上，若域名优先且命中即 return，
        // `?tenant=` 会变成死代码 —— 分店永远退回默认店（原实现的缺陷）。
        const fromUrl = resolveTenantFromUrl();
        const stored = fromUrl ? null : (uni.getStorageSync('tenant_code') as string) || null;
        let code = fromUrl || stored || (await resolveTenantByDomain()) || 'default';

        tenantCode.value = code;
        // 传入了不存在的 code（如 ?tenant=nope）时回退平台默认店，
        // 避免停在占位态（店名显示 code、内容与默认店不一致）。
        if (!(await loadTenantDetails(code))) {
            code = 'default';
            tenantCode.value = code;
            await loadTenantDetails(code);
        }
        await loadShopChannels();
    }
```

改为

```ts
    async function initTenant() {
        // 引导查询（解析渠道本身）必须绕过租户就绪闸门，否则与闸门互等死锁。
        await withoutTenantGate(async () => {
            // 租户来源优先级（用户确认）：?tenant= > localStorage > 域名 > 默认。
            // ⚠️ 域名解析必须排在后两位。e.joho.cn 绑定在默认渠道上，若域名优先且命中即 return，
            // `?tenant=` 会变成死代码 —— 分店永远退回默认店（原实现的缺陷）。
            const fromUrl = resolveTenantFromUrl();
            const stored = fromUrl ? null : (uni.getStorageSync('tenant_code') as string) || null;
            let code = fromUrl || stored || (await resolveTenantByDomain()) || 'default';

            tenantCode.value = code;
            // 传入了不存在的 code（如 ?tenant=nope）时回退平台默认店，
            // 避免停在占位态（店名显示 code、内容与默认店不一致）。
            if (!(await loadTenantDetails(code))) {
                code = 'default';
                tenantCode.value = code;
                await loadTenantDetails(code);
            }
            await loadShopChannels();
        });
    }
```

- [ ] **Step 3: `switchTenant` 整体包进旁路**

把

```ts
    async function switchTenant(code: string) {
        tenantCode.value = code;
        await loadTenantDetails(code);
        return true;
    }
```

改为

```ts
    async function switchTenant(code: string) {
        return await withoutTenantGate(async () => {
            tenantCode.value = code;
            await loadTenantDetails(code);
            return true;
        });
    }
```

- [ ] **Step 4: 类型检查**

```powershell
cd d:\zhao\vshop
npx tsc --noEmit
```

Expected: 无输出（0 error）。

- [ ] **Step 5: 提交**

```powershell
git add src/stores/tenant.ts
git commit -m "fix(vshop): initTenant/switchTenant 走免闸门旁路，避免与租户闸门互等"
```

---

### Task 4: `src/App.vue` 开闸

**Files:**
- Modify: `d:\zhao\vshop\src\App.vue:9`（import）、`:42-46`（onLaunch 顺序）

- [ ] **Step 1: 补 import**

把第 9 行

```ts
import { setSessionToken } from './api/client';
```

改为

```ts
import { openTenantGate, setSessionToken } from './api/client';
```

- [ ] **Step 2: 在 `initTenant()` 之后开闸**

把

```ts
    // Initialize tenant from domain or URL (async)
    await tenantStore.initTenant();

    // Restore auth token from storage (must be after initTenant sets token)
    await authStore.restoreSession();
    tenantStore.tenantReady = true;
```

改为

```ts
    // Initialize tenant from domain or URL (async)
    await tenantStore.initTenant();
    // 渠道 token 已就绪，开闸放行所有被挂起的业务请求。
    // 必须早于 restoreSession：闸门语义是「渠道 token 就绪」而非「整体初始化完成」，
    // 否则 restoreSession 里的请求会等 tenantReady，而 tenantReady 又在其之后置位 → 死锁。
    openTenantGate();

    // Restore auth token from storage (must be after initTenant sets token)
    await authStore.restoreSession();
    tenantStore.tenantReady = true;
```

- [ ] **Step 3: 类型检查**

```powershell
cd d:\zhao\vshop
npx tsc --noEmit
```

Expected: 无输出（0 error）。

- [ ] **Step 4: 提交**

```powershell
git add src/App.vue
git commit -m "fix(vshop): App.onLaunch 在 initTenant 完成后打开租户闸门"
```

---

### Task 5: 本地构建

**Files:** 无（验证步骤）

- [ ] **Step 1: 本地构建 H5**

```powershell
cd d:\zhao\vshop
npm run build:h5
```

Expected: 构建成功，0 error，产物在 `d:\zhao\vshop\dist\build\h5`。

- [ ] **Step 2: 记录入口哈希（供手册 §5.4/§5.12.5 核对）**

```powershell
Get-Content d:\zhao\vshop\dist\build\h5\index.html | Select-String "assets/index-.*\.js"
```

Expected: 打印出新的入口 `assets/index-XXXXXXXX.js` 文件名。**把这个哈希记下来**，Task 8 要写进手册。

- [ ] **Step 3: 清理本地未跟踪产物，不用提交**

```powershell
cd d:\zhao\vshop
git status --short
```

Expected: 不含 `dist/`（已被 .gitignore 忽略）。若出现 `dist/`，**不要** `git add` 它。

---

### Task 6: 本地跑探针，验证闸门生效

**Files:** 无（验证步骤）

- [ ] **Step 1: 起本地 H5 dev server（API 指向生产 shop-api）**

```powershell
cd d:\zhao\vshop
$env:VITE_API_URL='https://e.joho.cn'
npm run dev:h5 -- --port 5210
```

Expected: 终端打印本地地址，应为 `http://localhost:5210`。若 `--port` 未生效，**以终端实际打印的端口为准**，把 Task 1 探针的 `--site` 改成该端口。命令保持后台运行。

- [ ] **Step 2: 跑探针（不开截图）**

```powershell
node d:\zhao\vshop\web-admin\scripts\_tenant_token_gate_probe.mjs --site http://localhost:5210
```

Expected（修复后，**必须全绿**）：
```
=== default 首页  http://localhost:5210/?tenant=default
  实际 token: cnx87ezvmjx8nn3bth6c   期望: cnx87ezvmjx8nn3bth6c
  search.totalItems = 14
=== t1 首页  http://localhost:5210/?tenant=t1
  实际 token: a6fn474hhiqasmyiyrfl   期望: a6fn474hhiqasmyiyrfl
  search.totalItems = 0
...
结果：全部断言通过
```

关键点：`t1 首页` 的 `search.totalItems` 由修复前的 **14** 变为 **0**；且 `业务请求 N 条` 里**不再出现「未带 vendure-token」**。

- [ ] **Step 3: 若失败，按此排查**

1. `t1 首页` 仍 14 件 → 闸门没生效。检查 `getGraphQLClient()` 是不是还在返回裸 `clientInstance`（必须是 `new GatedClient(...)`）。
2. 业务请求 token 是空 → 检查 `GatedClient.request()` 里 `setHeaders` 是否在 `await waitTenantGate()` **之后**。
3. 页面白屏/请求全挂 → 检查 `App.vue` 是否漏了 `openTenantGate()`；或 `initTenant` 的旁路包裹是否漏了（会死锁，8s 后才放行）。
4. 探针报「没捕捉到任何业务请求」→ `--site` 端口不对，或本地 dev server 没起来。

- [ ] **Step 4: 停掉 dev server**

用 StopCommand 结束后台命令。

---

### Task 7: 手机浏览视图截图（4 张）

**Files:**
- Create: `web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/tenant-gate-{default-home,t1-home,t3-home,t1-category}.png`

- [ ] **Step 1: 对已部署站点跑探针并输出截图**

> 截图必须打在**已部署的生产**上（本地 dev server 的 DOM 与线上一致，但截图要用于手册交付）。若 Task 9 尚未部署，就先做 Task 8 的文档骨架、Task 9 部署后再回来补这一步。

```powershell
node d:\zhao\vshop\web-admin\scripts\_tenant_token_gate_probe.mjs --shots
```

Expected: 探针全绿，且在 `assets/` 下生成 4 个 PNG。

- [ ] **Step 2: 核对截图规格**

```powershell
Get-ChildItem d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\assets\tenant-gate-*.png | ForEach-Object { "$($_.Name)  $($_.Length) bytes" }
```

Expected: 4 个文件，均为手机竖屏比例（视口 390×844、dpr=2 → 图片 780×1688）。

- [ ] **Step 3: 人工看图并确认结论**

逐张确认：
- `tenant-gate-default-home.png`：有商品（全部商品）。
- `tenant-gate-t1-home.png`：**无默认渠道商品**（空态/无商品卡片）。
- `tenant-gate-t3-home.png`：1 件商品。
- `tenant-gate-t1-category.png`：无默认渠道商品。

- [ ] **Step 4: 提交截图**

```powershell
cd d:\zhao\vshop
git add web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/tenant-gate-*.png
git commit -m "docs(vshop): 补租户闸门修复的手机视口截图 4 张"
```

---

### Task 8: 手册新增章节 + 补正 §5.12.7

**Files:**
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\README.md`

- [ ] **Step 1: 读现状，定位插入点**

读 `README.md` 的 §5.12（多租户渠道可达性）与 §5.12.7 末尾（约 L642-L690），以及版本头注释区（L18-L24）与 §5.4 产物核对表（约 L207-L220）。

- [ ] **Step 2: 版本头注释追加一条**

在版本头注释区（L18-L24 那组 `**vX.Y 相对 ...**` 之后）追加：

```markdown
> **v1.8 相对 v1.7 的增量**：修复 **C 端租户商品跨渠道泄漏** —— `e.joho.cn` 上任何租户都能看到默认渠道全部商品。真因在客户端：`App.onLaunch` 是 async 而 uni-app 不等其结束才挂载页面，入口页 `onMounted` 取数时 `tenantStore.token` 仍为 `''`，而**空 `vendure-token` 在 Vendure 侧静默等于默认渠道**。本轮在 `src/api/client.ts` 装「租户就绪闸门」单点收口，页面零改动。见 §5.13。**本轮仅前端改动，未重启后端。**
```

- [ ] **Step 3: 追加 §5.13 章节**

在 §5.12 章节之后追加：

```markdown
---

## 5.13 C 端租户商品跨渠道泄漏修复（2026-09-30）

### 5.13.1 现象与真因

**现象**：`https://e.joho.cn` 上任何租户（如 `?tenant=t1`）都能看到**默认渠道的全部商品**；预期是只有默认渠道看全部，其他租户只看本租户商品。

**三重取证**：

1. **后端无问题** —— 直连 `https://e.joho.cn/shop-api`，按渠道 token 分别查 `products` / `search`：

   | 渠道 | `products.totalItems` | `search.totalItems` |
   |---|---|---|
   | 默认渠道 `cnx87ezvmjx8nn3bth6c` | 15 | 14 |
   | t1 `a6fn474hhiqasmyiyrfl` | 0 | 0 |
   | t3 `jmjobmq5lak9o50kevf` | 1 | 1 |
   | 伪造 token `deadbeef-not-a-real-token` | `No Channel with the token "..." could be found` | 同左 |

   Vendure 严格按 `ctx.channelId` 过滤，且确实识别 `vendure-token` 头。

2. **泄漏在客户端** —— Playwright 打开 `https://e.joho.cn/?tenant=t1`，按 request/response 成对记录：首页 `search`（推荐商品）在 ~406ms 发出且**不带 `vendure-token`**，返回 **14 件默认渠道商品**；而 `activeChannel` / `collections` / `shopTemplate` / `shopChannels` 在 437ms 之后都带 `a6fn474h…`(t1) 正确。9s 后 DOM 仍是那 14 件，**不会重取**。

3. **机制** —— `src/App.vue` 的 `onLaunch` 是 `async`，但 **uni-app 不会等 `onLaunch` 结束才挂载页面**；入口页 `onMounted` 取数时 `tenantStore.token` 仍是 `''`，而**空 `vendure-token` 在 Vendure 侧静默等于默认渠道**（不是报错）。

**爆炸半径**：首页 `search`、分类页 `collections` 已实证；秒杀 / 拼团 / 我的评价 / `FlashSection` / fresh 模板首页同源同风险。全仓原先只有 `pages/cart/index.vue` 做了门控。商品详情按 id/slug 查询返回 `null`，不漏。

> **对 §5.12.7 的补正**：该节「`e.joho.cn/?tenant=t1` 全部 `shop-api` 请求头 `vendure-token` = t1 渠道 token」这句**过于乐观** —— 它只覆盖了渠道列表 / 店铺名等**引导查询**；实测首屏 `search` 在 token 就绪前发出（§5.13.1 第 2 条）。本轮修复后，该表述才真正成立。

### 5.13.2 修复设计（客户端单点闸门）

- 闸门语义 = **「渠道 token 已就绪」**，与 `tenantReady`（整体初始化完成）**解耦**，避免 `restoreSession()` 与 `tenantReady` 置位顺序互等死锁。
- `src/api/client.ts`：新增 `openTenantGate()` / `waitTenantGate()` / `withoutTenantGate()`；`getGraphQLClient()` 改为返回薄包装 `GatedClient`，其 `request()` 先 `await waitTenantGate()`、**再** `setHeaders(getShopApiHeaders())`。
  - **为什么不能把闸门放进 `customFetch`**：`getGraphQLClient()` 是同步的，headers 在 `setHeaders()` 那一刻就被 `graphql-request` 快照；若闸门后置到 fetch，headers 早已是空 token，闸门形同虚设。
- `src/stores/tenant.ts`：`initTenant()` / `switchTenant()` 整体包进 `withoutTenantGate()`（引导查询免闸门，防止与闸门互等死锁）。
- `src/App.vue`：`await tenantStore.initTenant()` 之后立刻 `openTenantGate()`。
- 兜底：`waitTenantGate()` 最多挂起 8s 即放行，避免 `initTenant` 异常时页面永久骨架屏。
- **页面零改动** —— 所有业务调用点仍是 `getGraphQLClient().request(...)`，一次覆盖首页 / 分类 / 秒杀 / 拼团 / 我的评价及将来新增页面。

### 5.13.3 取证与回归脚本

```bash
# 对生产取证 + 手机视口截图（390×844、dpr=2）
node web-admin/scripts/_tenant_token_gate_probe.mjs --shots

# 打本地（需先 `$env:VITE_API_URL='https://e.joho.cn'` 起 dev:h5）
node web-admin/scripts/_tenant_token_gate_probe.mjs --site http://localhost:5210
```

判定规则：**引导查询**（`ResolveChannelByCode` / `ResolveChannelByDomain` / `shopChannels` / `shopTemplate` / `shopGlobalConfig` / `activeChannel` / `authMethods` / `ssoProviders`）允许空 `vendure-token`；**其余全部业务请求**必须带非空 `vendure-token` 且等于该租户渠道 token。

### 5.13.4 验收结果

| 用例 | 修复前 | 修复后 |
|---|---|---|
| `?tenant=t1` 首屏 `search.totalItems` | 14（泄漏） | **0** |
| `?tenant=t1` 业务请求是否全部带 t1 token | 否（`SearchProducts` 无 token） | **是** |
| `?tenant=default` | 14 | 14（不回归） |
| `?tenant=t3` | 14（泄漏） | 1 |
| `?tenant=nope` | 回退默认店 | 回退默认店，无 `ChannelNotFound` |
| 本地构建 | — | 0 error，入口 `assets/index-<哈希>.js` |

手机视口截图（390×844、dpr=2）：

| 截图 | 地址 | 结论 |
|---|---|---|
| `tenant-gate-default-home.png` | `?tenant=default` | 全部商品 |
| `tenant-gate-t1-home.png` | `?tenant=t1` | 无默认渠道商品 |
| `tenant-gate-t3-home.png` | `?tenant=t3` | 1 件商品 |
| `tenant-gate-t1-category.png` | `?tenant=t1#/pages/category/index` | 无默认渠道商品 |

### 5.13.5 部署与产物核对

按 §6.1：本地 `npm run build:h5` → `tar -czf vshop-h5.tgz -C dist/build/h5 .` → `scp joho:/tmp/` → 服务器备份并解压到 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`。**本轮未改后端，`pm2` 无操作。**

- 线上入口：`assets/index-<哈希>.js`（与 Task 5 Step 2 记录一致）

### 5.13.6 待处理事项（本轮明确不做）

**渠道商品配置**：修好闸门后 `t1` 首页为空、`t3` 仅 1 件 —— 这是「只看本租户商品」的**正确表现**（t1 渠道本身 0 商品）。**为什么 t1 没有商品、这些商品该分配给哪些渠道**属另一件事，留待下一轮单独排查。
```

- [ ] **Step 4: 核对 markdown 结构与截图引用**

确认：新章节编号不与既有 §5.13 冲突（若已存在 §5.13，则顺延为 §5.14 并同步正文引用）；4 个截图文件名与 Task 7 生成的一致。

- [ ] **Step 5: 提交**

```powershell
cd d:\zhao\vshop
git add web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md
git commit -m "docs(vshop): 手册新增 §5.13 租户商品跨渠道泄漏修复，并补正 §5.12.7"
```

---

### Task 9: 本地构建 → 部署

**Files:** 无（部署）

> **铁律**：一律本地构建，服务器只解压 / 重启，绝不在服务器构建。

- [ ] **Step 1: 重新构建（确保含全部改动）**

```powershell
cd d:\zhao\vshop
npm run build:h5
```

Expected: 0 error。

- [ ] **Step 2: 打包**

```powershell
cd d:\zhao\vshop
tar -czf vshop-h5.tgz -C dist/build/h5 .
```

Expected: 生成 `d:\zhao\vshop\vshop-h5.tgz`。

- [ ] **Step 3: 上传**

```powershell
scp d:\zhao\vshop\vshop-h5.tgz joho:/tmp/vshop-h5.tgz
```

- [ ] **Step 4: 服务器备份 + 清空 + 解压**

```bash
S=/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index
cp -r $S $S.bak_$(date +%s)
rm -rf $S && mkdir -p $S
tar -xzf /tmp/vshop-h5.tgz -C $S
```

> 站点目录为 `drwxrwxrwx`，通常**无需 sudo**。若权限不足再加 `sudo`。
> 解压时 `assets/`、`static/` 若报 `Cannot utime` / `Cannot change mode`，那只是目录元数据操作失败，文件本体已落盘 —— 用 Step 5 核对文件数即可。

- [ ] **Step 5: 核对产物**

```bash
S=/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index
sha256sum $S/index.html /tmp/vshop-h5.tgz   # 或只比对 index.html 内容
ls $S/assets | grep -c '^index-'            # 应恰好 1 个入口 js
```

Expected: 线上入口哈希与 Task 5 Step 2 记录的一致。

- [ ] **Step 6: 提交暂无（构建产物不入库）；确认工作区干净**

```powershell
cd d:\zhao\vshop
git status --short
```

Expected: 干净（`vshop-h5.tgz` 若未被忽略，删掉本地文件即可，**不要**提交）。

---

### Task 10: 生产复验

**Files:** 无（验证）

- [ ] **Step 1: 对生产跑探针 + 出截图**

```powershell
node d:\zhao\vshop\web-admin\scripts\_tenant_token_gate_probe.mjs --shots
```

Expected: 全绿
```
=== t1 首页  https://e.joho.cn/?tenant=t1
  业务请求 N 条：...
  实际 token: a6fn474hhiqasmyiyrfl   期望: a6fn474hhiqasmyiyrfl
  search.totalItems = 0
...
结果：全部断言通过
```

- [ ] **Step 2: 手工点验 3 条**

1. `https://e.joho.cn/?tenant=t1` → 店名「新生」，**看不到默认渠道商品**。
2. `https://e.joho.cn/?tenant=default` → 仍能看到全部商品（不回归）。
3. `https://e.joho.cn/?tenant=nope` → 回退优商铺，页面不白屏、无 `ChannelNotFound` 报错。

- [ ] **Step 3: 截图入库并复核手册 §5.13.4 表格**

把 Task 7/本 Task 生成的 4 张截图与探针实际输出对齐，回填手册 §5.13.4 表格中的「业务请求 N 条」等实测值。

```powershell
cd d:\zhao\vshop
git add web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/tenant-gate-*.png
git add web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md
git commit -m "docs(vshop): 回填 §5.13 生产复验实测值"
```

- [ ] **Step 4: 推送**

```powershell
cd d:\zhao\vshop
git push
```

Expected: 推送成功。

- [ ] **Step 5: 收口确认**

- 生产探针全绿 + 3 条手工点验通过。
- 手册 §5.13 已入册、§5.12.7 已补正。
- 4 张手机视口截图已入册。
- **待处理事项已明确记录**：渠道商品配置（t1 为何 0 商品）留待下一轮。

---

## Self-Review

**1. Spec coverage**

| Spec 章节 | 对应 Task |
|---|---|
| 根因（三重取证） | Task 1（探针复现基线）+ Task 8 Step 3（写入手册 §5.13.1） |
| 设计：闸门语义 / 解耦 tenantReady | Task 2 Step 2（`openTenantGate` / `waitTenantGate` 注释与实现）+ Task 4 Step 2 |
| 免闸门旁路 | Task 2 Step 2（`withoutTenantGate`）+ Task 3 Step 2/3 |
| 关键点：闸门卡在取 headers 之前 | Task 2 Step 2（`GatedClient.request`）+ Task 6 Step 3 排查项 2 |
| 请求路径 | Task 4（开闸位置） |
| 失败模式 ≤8s 兜底 | Task 2 Step 1（`TENANT_GATE_TIMEOUT_MS`）+ Step 2（`setTimeout`） |
| 验证 1 `tsc --noEmit` | Task 2 Step 3 / Task 3 Step 4 / Task 4 Step 3 |
| 验证 2 本地构建 | Task 5 |
| 验证 3 Playwright 取证（本地 + 生产） | Task 6 Step 2（本地）+ Task 10 Step 1（生产） |
| 验证 4 手机视口截图 4 张 | Task 7 |
| 验证 5 手册新章节 | Task 8 |
| 验证 6 本地构建 → 部署 → 生产复验 | Task 9 / Task 10 |
| 明确不做（渠道商品配置 = 待处理事项） | Task 8 Step 3（§5.13.6） |

无缺口。

**2. Placeholder scan**

已逐条检查：无 TBD / TODO / "类似 Task N" / "加上适当的错误处理"。所有代码步骤都给了完整可粘贴的代码；所有命令步骤都给了可执行命令与期望输出。Task 8 Step 3 里出现的 `<哈希>` 是**运行期填入的实测值**（Task 5 Step 2 已要求记录），非未定义内容。

**3. Type consistency**

- `openTenantGate` / `waitTenantGate` / `withoutTenantGate` / `ShopGraphQLClient` / `GatedClient` 五个符号在 Task 2 定义、Task 3/4 引用，命名一致。
- `getGraphQLClient()` 返回类型由 `GraphQLClient` 变为 `ShopGraphQLClient`；签名集合为 `request<T>(query, variables?, ...rest)` + `setHeaders(headers)`。已核对全部既有调用点只使用 `client.request(...)`（`grep getGraphQLClient` 结果中无 `.setHeaders(` 调用点），故不产生类型破坏。
- 探针脚本里 `BOOTSTRAP_OPS` / `opOf` / `CASES` / `searchCheck` 在 Task 1 定义、Task 6/7/10 复用，名称一致。
- 渠道 code → token 映射（`default`=默认渠道 token、`t1`、`t3`）在 Task 1 `CASES` 与 Task 8 表格中一致。
