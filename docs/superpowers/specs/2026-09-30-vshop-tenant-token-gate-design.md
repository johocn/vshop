# vshop 租户商品跨渠道泄漏修复设计（2026-09-30）

## 现象

`e.joho.cn`（vshop，uni-app H5）上，**任何租户都能看到默认渠道的全部商品**。

预期：默认渠道（`__default_channel__`）能看到全部商品；其他租户只能看到本租户渠道的商品。

## 根因（三重取证，已锁定）

### 1. 后端无问题 —— 直连 shop-api 实测

用临时探针脚本 `tenant-product-probe.mjs` 以四种 `vendure-token` 直连 `https://e.joho.cn/shop-api`：

| 渠道 | `products.totalItems` | `search.totalItems` |
|---|---|---|
| 默认渠道 `cnx87ezvmjx8nn3bth6c` | 15 | 14 |
| t1 `a6fn474hhiqasmyiyrfl` | **0** | 0 |
| t3 `jmjobmq5lak9o50kevf` | 1 | 1 |
| 伪造 token `deadbeef-not-a-real-token` | `No Channel with the token "..." could be found` | 同左 |

结论：Vendure 侧 `products` / `search`（DefaultSearchPlugin）**都严格按 `ctx.channelId` 过滤**，且确实在识别 `vendure-token` 头。后端与数据没问题。

### 2. 泄漏在客户端 —— Playwright 实测时序

打开 `https://e.joho.cn/?tenant=t1`，按 request/response 成对记录每个 shop-api 请求的 `vendure-token`：

| 相对时刻 | 操作 | `vendure-token` | 结果 |
|---|---|---|---|
| ~406ms | `search`（首页推荐商品） | **（无该头）** | **14 件默认渠道商品** |
| ≥437ms | `activeChannel` / `collections` / `shopTemplate` / `shopChannels` | `a6fn474h…`(t1) 正确 | 正确 |

9s 后 DOM 仍是那 14 件商品 —— **不会重取**。

### 3. 机制

`src/App.vue` 的 `onLaunch` 是 `async`，但 **uni-app 不会等 `onLaunch` 结束才挂载页面**。入口页 `onMounted` 取数时 `tenantStore.token` 仍为 `''`，而**空 `vendure-token` 在 Vendure 侧静默等于默认渠道**（不是报错）。

```
App.onLaunch ──await initTenant()──▶ token = 'a6fn474h…'
      │                                      ▲
      └──（不阻塞）──▶ 页面 onMounted 取数 ──┘ 此时 token 还是 ''
```

### 4. 爆炸半径

- 已实证泄漏：首页 `search`、分类页 `collections`。
- 同源同风险（`onMounted` 直接取数、无门控）：秒杀、拼团、我的评价、`FlashSection`、fresh 模板首页等。
- 全仓只有 `src/pages/cart/index.vue` 做了门控（其注释已写明该 bug），其余页面皆漏。
- 商品详情按 id/slug 查询后端返回 `null`，**不漏**（只会空白）。

## 目标

在客户端**单点收口**：任何业务请求在租户 token 就绪前**一律不发**，从根上堵住跨渠道泄漏，并覆盖将来新增的页面。

## 边界（用户确认）

- 本轮**只修闸门**。渠道商品配置（为什么 t1 是 0 商品）**下轮单独处理**。
- 修好后 **t1 首页将是空的**（t1 渠道本身 0 商品、t3 1 件）—— 这正是「只能看到本租户商品」的正确表现。
- 不动 Vendure 后端（已验证过滤正确）。
- 不加「本店暂无商品」空态 UI。
- 不改任何页面组件、不改任何业务 query 模块（`api/queries/*`、`api/mutations/*`）。

## 设计：客户端单点闸门

### 闸门语义

**闸门 = 「渠道 token 已就绪」**，与 `tenantReady`（整体初始化完成）**解耦**。这样 `restoreSession()` 走闸门时不会与「`tenantReady` 在 `restoreSession` 之后才置位」互相等待而死锁。

### 免闸门旁路

`initTenant()` 内部的**引导查询**必须绕开闸门，否则与闸门互等死锁：

- `resolveChannelByCode` / `resolveChannelByDomain`
- `activeChannel`（`getActiveChannelConfig`）
- `shopChannels`（`listShopChannels`）
- `shopTemplate` / `shopGlobalConfig`

实现为**作用域旁路**：`withoutTenantGate(fn)` 在 `fn` 执行期间把旁路计数 +1，`finally` 归零。

### 关键点：闸门必须卡在「取 headers 之前」

`getGraphQLClient()` 是**同步**的，页面在 `onMounted` 里同步调用它、同步调用 `client.request(...)`。而 `graphql-request` 的 headers 是在 `setHeaders()` 那一刻被快照的 —— 所以**不能**把闸门放在 `customFetch` 里（那时 headers 已经是空 token 了）。

因此：`getGraphQLClient()` 返回一个**薄包装客户端**，其 `request()` 内先 `await waitTenantGate()`，**再** `setHeaders(getShopApiHeaders())` 取最新 token。

### 代码形状

`src/api/client.ts`（新增约 40 行）：

```ts
const TENANT_GATE_TIMEOUT_MS = 8000;

let gateResolve: (() => void) | null = null;
const gatePromise = new Promise<void>((resolve) => { gateResolve = resolve; });
let gateTimeout: Promise<void> | null = null;

/** 由 App.onLaunch 在 initTenant() 完成后调用；只开一次 */
export function openTenantGate() {
    gateResolve?.();
    gateResolve = null;
}

/** 业务请求闸门：token 未就绪时挂起，≤8s 兜底放行（避免骨架屏永久卡死） */
export function waitTenantGate(): Promise<void> {
    if (!gateResolve) return Promise.resolve();
    if (!gateTimeout) gateTimeout = new Promise<void>((r) => setTimeout(r, TENANT_GATE_TIMEOUT_MS));
    return Promise.race([gatePromise, gateTimeout]);
}

let bypassDepth = 0;

/** 引导查询旁路：宿主任一 await 链内所有请求都不走闸门 */
export async function withoutTenantGate<T>(fn: () => Promise<T>): Promise<T> {
    bypassDepth++;
    try { return await fn(); } finally { bypassDepth--; }
}

export interface ShopGraphQLClient {
    request<T = any>(query: any, variables?: any, ...rest: any[]): Promise<T>;
    setHeaders(headers: Record<string, string>): void;
}

class GatedClient implements ShopGraphQLClient {
    constructor(private inner: GraphQLClient) {}
    async request<T = any>(query: any, variables?: any, ...rest: any[]): Promise<T> {
        if (bypassDepth === 0) await waitTenantGate();
        this.inner.setHeaders(getShopApiHeaders());   // 就绪后再取 token
        return (this.inner.request as any)(query, variables, ...rest);
    }
    setHeaders(headers: Record<string, string>) { this.inner.setHeaders(headers); }
}

export function getGraphQLClient(): ShopGraphQLClient {
    if (!clientInstance) clientInstance = new GraphQLClient(API_URL, { fetch: customFetch as any, headers: {} });
    return new GatedClient(clientInstance);
}
```

`getShopApiHeaders()` / `customFetch` / `deduped()` / `resetClient()` 均不变。

`src/stores/tenant.ts`（±5 行）：

```ts
async function initTenant() {
    await withoutTenantGate(async () => {
        /* 原实现，原样搬入 */
    });
}

async function switchTenant(code: string) {
    await withoutTenantGate(async () => { /* 原实现 */ });
}
```

`src/App.vue`（±1 行）：

```ts
await tenantStore.initTenant();
openTenantGate();                  // ← 新增：渠道 token 就绪，开闸
await authStore.restoreSession();
tenantStore.tenantReady = true;
```

### 对既有代码的影响

- 所有业务调用点写法不变（仍是 `getGraphQLClient().request(...)`），零改动。
- `src/pages/cart/index.vue` 里既有的 `waitTenantReady()`（watch `tenantReady`）保留，与新闸门并存、互不干扰。
- `getShopApiHeaders()` 的直接使用者只有 `api/mutations/upload.ts`（`uni.uploadFile`）。上传必经用户交互，此时 token 必已就绪，**不纳入本轮**。

### 请求路径（修复后）

```
App.onLaunch ─▶ initTenant() ─┬─▶ 引导查询（免闸门）─▶ Vendure
                              └─▶ openTenantGate()

页面 onMounted ─▶ getGraphQLClient().request() ─▶ 闸门 await waitTenantGate() ─▶ 带 token ─▶ Vendure
```

### 失败模式

| 场景 | 行为 |
|---|---|
| `initTenant()` 正常完成 | 立即开闸，业务请求带正确 token |
| 渠道解析失败（未知 code） | `loadTenantDetails` 回退默认店并把 token 写为 `''`（等价默认渠道），随后开闸 → 与现状一致，不白屏 |
| `initTenant()` 抛异常/网络卡死 | ≤8s 兜底开闸，页面恢复正常（退化为现状的默认渠道，可接受） |

## 验证

1. `npx tsc --noEmit` 通过。
2. 本地 H5 构建 + 跑通「开闸前后」两条路径。
3. **Playwright 取证（本地 + 生产各一遍）**：
   - `?tenant=t1`：首屏所有 shop-api 请求均带 `vendure-token=a6fn474h…`；首屏商品数 **0**（不再是 14）；无任何无 token 请求。
   - `?tenant=default`：仍 15 件（不回归）。
   - `?tenant=nope`：回退默认店，且不出现 `ChannelNotFound`。
   - 分类页 `collections` 与后续 `search` 的 token 一致。
4. **手机浏览视图截图**（标准视口 390×844、dpr=2、Playwright 移动视口）：default 首页 / t1 首页 / t3 首页 / t1 分类页，共 4 张。
5. 截图与说明补入手册 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md` 新章节。
6. 本地构建 → 部署（服务器仅解压/`pm2 restart`）→ 生产复验第 3 条。

## 明确不做

- 不改渠道商品配置（t1 空店铺）—— **待处理事项，下轮单独处理**。
- 不改 Vendure / nshop 侧任何代码。
- 不加「本店暂无商品」空态 UI。
- 不动页面组件与业务 query/mutation 模块。
- 不纳入 `uni.uploadFile` 的上传通道门控。
