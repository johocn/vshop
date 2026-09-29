# vshop 对齐 usemall 第二轮（SKU 弹层收口 + 评价体系）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按「仅版式对齐闭环」标准，把 vshop 详情页 SKU 弹层的规格分组计数/单规格降级/缩略图缺陷收口，并建成完整评价体系（详情页评价区、商品评价页、订单评价提交页、我的评价页），配套 vendure review-plugin 的 shop SDL 星级分档筛选。

**Architecture:** 两个互不共享代码的纵切。**V1（S1）** 纯前端 + fragment 改动，零后端；**V2（S2–S6）** 先改 vendure `review-plugin`（`src` + 重建 `lib`）再上前端，前端新增 1 个公共条目组件 `ReviewItem.vue` + 3 个分包页面 + 1 个 GraphQL 封装模块，全部落在既有分包，不动主包。

**Tech Stack:** uni-app 3（Vue 3 + TS + SCSS）+ Pinia + graphql-request（手写 GraphQL 字符串，**本仓库无 codegen**）+ vue-i18n（`useI18n()` 组合式，**未开 globalInjection，模板里不能用 `$t`**）+ Vendure 3.6.4（后端消费编译产物 `lib/`）+ vitest（仅 vendure 侧有 e2e）。

设计依据：[2026-09-29-vshop-usemall-alignment-round2-design.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-09-29-vshop-usemall-alignment-round2-design.md)
第一轮计划（体例参照）：[2026-09-24-vshop-usemall-alignment-plan.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/plans/2026-09-24-vshop-usemall-alignment-plan.md)

---

## 0. 前置事实与验证口径（每个 Task 都适用）

**必须知道的现状（已一手核实，不要再猜）**

1. **C 端没有单元测试框架**：`vshop/package.json` 无 vitest/jest。前端**不写单测**，验证靠「编译门禁 + 只读探针 + 手机截图」三件套（见下）。
2. **vendure 侧有 e2e**：`d:\zhao\vendure\packages\review-plugin\e2e\review.e2e-spec.ts` 是完整可跑的评价插件 e2e（vitest + sqljs）。**Task 5/6 用真 TDD**。
3. **i18n 已装载 5 个语言包**：`src/i18n/index.ts` 的 `messages` 含 `zh-CN` / `zh-TW` / `en` / `ja` / `ko`；**未开 `globalInjection`** → 新代码一律 `const { t } = useI18n()`，**不要**在模板用 `$t`。
4. **5 个语言包结构完全一致**：`sku` 命名空间在 225-231 行，是**文件最后一个 key**，文件在 232 行以 `}` 结束。新增 `review` 命名空间 = 在 `sku` 块后加逗号再追加。
5. **vshop 没有 codegen**：前端全是手写 query 字符串 → 后端加字段**不需要**改前端 schema。
6. **后端改 `src` 必须重建 `lib`**：`dev-config.ts:59` 用 `import { ReviewPlugin } from '@vendure/review-plugin'`，`package.json` 的 `main` 指向 `lib/index.js`。承 group-buy 的教训：**不要 rimraf**，用 `npx tsc -p packages/review-plugin/tsconfig.build.json` 做外科式重编译（`lib/` 与 `src/` 有既有漂移，全量重建会引入缺失模块导致启动崩溃）。
7. **shop resolver 直通**：`review-shop.resolver.ts:18` 是 `return this.reviewService.getProductReviews(ctx, productId, options)` → S6 **不需要**改 resolver，只需改 `types.ts` + `plugin.ts` 的 SDL + `review.service.ts`。
8. **`goodRate` 已是百分比**：`review.service.ts:328` 为 `Math.round(goodCount / totalCount * 1000) / 10`，取值 0–100（如 `92.3`）→ 前端直接拼 `%`，**不要再乘 100**。`averageRating` 已保留 1 位小数（`:330`）。
9. **`ratingDistribution` 恒为 5 条**（rating 1→5 全量返回，缺的计 0）：`review.service.ts:336-339`。
10. **无 `featuredAsset` 是数据层问题**：`src/api/fragments.ts` 的 `PRODUCT_DETAIL_FRAGMENT`（18-32 行）商品级与 `variants` 级都没请求 `featuredAsset` → `SkuSheet.vue:77` 的两级回退链在数据层恒为 `undefined`。**Task 1 修的就是这个**。顺带修好 `detail.vue:224` 分享图 `product.featuredAsset?.preview` 恒空的问题。
11. **`ORDER_FRAGMENT` 的 `productVariant` 无 `productId`**（`fragments.ts:43`），而 `createReview` 必传 `productId` → S4 必须补字段。
12. **anchor 行号**（改动前）：
    - `src/components/SkuSheet.vue`：规格组 `v-for` 在 15-26 行；`pickedText` 在 87-95 行；`variantAsset` 在 77 行
    - `src/pkg-product/pages/detail.vue`：`product-detail__info` 结束于 44 行；`product-detail__rich` 起于 45 行；`pickedSummary` 在 151-156 行
    - `src/pkg-order/pages/orders.vue`：卡片 `order-card` 在 7-21 行；`goDetail` 在 73 行
    - `src/pkg-order/pages/order-detail.vue`：`order-detail__actions` 在 49-55 行
    - `src/pkg-user/pages/profile.vue`：菜单项在 8-20 行；`navTo` 在 37 行
    - `src/pages.json`：`pkg-product` 72-90、`pkg-order` 92-139、`pkg-user` 200-265
13. **截图脚本打的是生产站**：`web-admin/scripts/_vshop_usemall_shots.mjs:51` 为 `const URL = process.env.SITE_URL || 'https://e.joho.cn'`，图片落盘到 `:52` 的 `.../manual/vshop-usemall-alignment/assets/`（**注意有 `assets/` 子目录，git add 别漏**）。因此**任何截图验收都必须在代码上线之后做**（Task 4 / Task 13 各部署一次前端）。
14. **前端部署无现成脚本**：`web-admin/scripts/deploy.mjs` 只部署后台（站点 `.../e.joho.cn/guanli`）；C 端 vshop H5 走手动 `npm run build:h5` → `tar` → `scp` → 服务器 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index` 解压（见 Task 4 Step 3 / Task 13 Step 7）。

**验证三件套**

| 手段 | 命令 / 方式 | 说明 |
|---|---|---|
| 编译门禁 | `npm run build:h5`（在 `d:\zhao\vshop`） | 必须 0 error；warn 可接受 |
| 后端 e2e | `npm run e2e`（在 `d:\zhao\vendure\packages\review-plugin`） | 会跑 `e2e/review.e2e-spec.ts`；Task 5/6 唯一判据 |
| 手机截图 | `node web-admin/scripts/_vshop_usemall_shots.mjs`（可加 `--user <email> --pwd <pwd>`） | 脚本内 `MOBILE` 视口 = 390×844、dpr=2；`shot(name)` 落盘到 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/` |
| 只读探针 | `python web-admin/scripts/_smoke_usemall_align.py`（在 `d:\zhao\vshop`） | 打生产 shop-api 做 API 回归 |

**提交规范**：每个 Task 结束提交一次，中文 commit message，**只 `git add` 本 Task 涉及的文件**（禁止 `git add -A` / `git add .` / `git commit -a` / `git add dist`）。PowerShell 不支持 heredoc 且 `&&` 不可用 → 长中文 commit message 写临时文件用 `git commit -F`，命令串联用 `;`。

**禁止**：不在服务器构建（服务器内存不足）；不改分包结构；不动分箱/支付合并/COD 核销/台账等既有业务逻辑；不改 admin 版 `ReviewListOptions` / `getReviews`。

**本计划相对 spec 的一处显式偏离**：spec §4.9 的「已知偏差」写「本轮新增页面沿用中文硬编码，i18n 键先建后接」。本计划**改为新增代码一律走 `t('review.*')`**，并同步补齐 5 个语言包（Task 7）。理由：用户硬性规范要求「前端固定文案必须走 i18n 字典」「禁止只在单一语言写死文字」，且 5 个语言包本就已装载（事实 3）。键名与 spec §4.9 完全一致，不新增范围。

---

# 纵切 V1 —— S1 详情页 SKU 弹层收口（零后端）

## Task 1: `PRODUCT_DETAIL_FRAGMENT` 补 `featuredAsset`

**为什么先做**：Thumb 回退链的根因在数据层。不改 fragment，Task 2 的渲染改动无法被验证。

**Files:**
- Modify: `d:\zhao\vshop\src\api\fragments.ts`（`PRODUCT_DETAIL_FRAGMENT`，18-32 行）

- [x] **Step 1: 商品级与 variants 级各补 `featuredAsset { preview }`**

把 `src\api\fragments.ts` 的 `PRODUCT_DETAIL_FRAGMENT` 整体替换为：

```ts
export const PRODUCT_DETAIL_FRAGMENT = `
    fragment ProductDetail on Product {
        id name slug description
        featuredAsset { preview }
        customFields { videoAssetId sellingPoint }
        translations { languageCode description }
        assets { id preview source }
        variants {
            id name priceWithTax currencyCode stockLevel
            featuredAsset { preview }
            options { id name code }
        }
        optionGroups { id name code options { id name code } }
        facetValues { id name facet { id name } }
        collections { id name slug }
    }
`;
```

改动只有两行新增：`featuredAsset { preview }`（商品级，紧跟 `description`）与 `featuredAsset { preview }`（`variants` 内，紧跟 `stockLevel`）。

- [x] **Step 2: 确认没有别处重复定义同名字段导致 GraphQL 冲突**

Run（在 `d:\zhao\vshop`）：

```powershell
Select-String -Path src\**\*.ts,src\**\*.vue -Pattern "featuredAsset" | Select-Object -First 40
```

Expected：命中的是 `fragments.ts`、`product.ts`（`getProductsByIds` 里 `featuredAsset { preview }`）、各页面模板里的读取处。**不应**出现第二个 `ProductDetail` fragment 定义。若出现，说明有重复 fragment，需先合并。

- [x] **Step 3: 编译门禁**

Run（在 `d:\zhao\vshop`）：

```powershell
npm run build:h5
```

Expected：编译成功，0 error。`npm run build` 会在 `dist/build/h5` 生成产物；**本 Task 不提交 dist**。

- [x] **Step 4: 提交**

```powershell
git add src/api/fragments.ts
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt` 内容：

```
fix(fragment): PRODUCT_DETAIL_FRAGMENT 补 featuredAsset，修 SKU 弹层缩略图恒为灰底

商品级与 variants 级都未请求 featuredAsset，导致 SkuSheet 的两级回退链在数据层恒为
undefined。顺带修好详情页分享图 product.featuredAsset?.preview 恒空的问题。

涉及：src/api/fragments.ts
```

提交后 `Remove-Item .git/COMMIT_MSG_TMP.txt`。

---

## Task 2: `SkuSheet.vue` 规格组计数 + 单规格降级

**Files:**
- Modify: `d:\zhao\vshop\src\components\SkuSheet.vue`（模板 15-26 行；`pickedText` 87-95 行）

- [x] **Step 1: 规格组标题加计数**

把 15-16 行：

```html
        <view v-for="group in optionGroups" :key="group.id" class="sku-group">
          <text class="sku-group__label">{{ group.name }}</text>
```

改为：

```html
        <view v-for="group in optionGroups" :key="group.id" class="sku-group">
          <text class="sku-group__label">{{ group.name }} ({{ group.options.length }})</text>
```

- [x] **Step 2: 修正 `pickedText`，消除单规格商品的「请选择规格」**

把 87-95 行的 `pickedText` 整体替换为：

```ts
const pickedText = computed(() => {
    const names: string[] = [];
    for (const g of optionGroups.value) {
        const id = selected.value[g.id];
        const opt = (g.options || []).find((o: any) => o.id === id);
        if (opt) names.push(opt.name);
    }
    if (names.length) return names.join(' / ');
    // 单规格商品（无规格组）没有「未选」状态：直接显示当前变体名，不出现「请选择规格」
    if (!optionGroups.value.length) return currentVariant.value?.name || t('sku.pleasePick');
    return t('sku.pleasePick');
});
```

- [x] **Step 3: 确认规格区在单规格下不渲染（只读核对，不改代码）**

`optionGroups` 为空时，15 行的 `v-for` 天然不产生任何 DOM 节点，不存在「空容器」问题。**不要**为此新增 `v-if` 包裹层（多余的嵌套会改动既有 scss 的相邻选择器语义）。

Run（在 `d:\zhao\vshop`）：

```powershell
Select-String -Path src\components\SkuSheet.vue -Pattern "v-for=\"group in optionGroups\""
```

Expected：命中 1 行，即 15 行，确认仍是 `v-for` 直接挂在 `.sku-group` 上。

- [x] **Step 4: 编译门禁**

Run（在 `d:\zhao\vshop`）：`npm run build:h5`
Expected：0 error。

- [x] **Step 5: 提交**

```powershell
git add src/components/SkuSheet.vue
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
style(sku): 弹层规格组补计数 (N)、单规格商品不再显示「请选择规格」

- 规格组标题对齐 usemall（{{item.name}} ({{item.arrs.length}})）
- optionGroups 为空时 pickedText 取当前变体名，消除单规格商品的错误提示

涉及：src/components/SkuSheet.vue
```

---

## Task 3: `detail.vue` 已选规格入口行单规格降级

**Files:**
- Modify: `d:\zhao\vshop\src\pkg-product\pages\detail.vue`（`pickedSummary`，151-156 行）

- [x] **Step 1: 替换 `pickedSummary`**

把 151-156 行整体替换为：

```ts
const pickedSummary = computed(() => {
    const names = (product.value?.optionGroups || [])
        .map((g: any) => (g.options || []).find((o: any) => o.id === selectedOptions.value[g.id])?.name)
        .filter(Boolean);
    if (names.length) return names.join(' / ');
    // 单规格商品（无规格组）没有「未选」状态：与 SkuSheet.pickedText 同口径，取当前变体名
    if (!(product.value?.optionGroups || []).length) return selectedVariant.value?.name || '请选择规格';
    return '请选择规格';
});
```

依赖说明：`selectedVariant`（113-119 行）已在上方定义，且无选中时回退 `variants[0]`，因此单规格商品必能取到 `name`。

- [x] **Step 2: 编译门禁**

Run（在 `d:\zhao\vshop`）：`npm run build:h5`
Expected：0 error。

- [x] **Step 3: 提交**

```powershell
git add src/pkg-product/pages/detail.vue
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
style(detail): 单规格商品已选规格行显示变体名，不再显示「请选择规格」

pickedSummary 原以「是否选中 optionGroups 中的选项」判定，单规格商品 optionGroups 为空
导致判定恒为未选。改为回退到 selectedVariant.name，与 SkuSheet 同口径。

涉及：src/pkg-product/pages/detail.vue
```

---

## Task 4: V1 验收（部署 → 手机截图 ×3 + 手册行）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\scripts\_vshop_usemall_shots.mjs`（详情页块 229-233 行）
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\README.md`
- Create: `d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\assets\detail-single-spec.png`（截图脚本落盘）
- 部署：`dist/build/h5` → 线上 `https://e.joho.cn`（Step 3；截图打生产站，必须先上线）

- [x] **Step 1: 截图脚本补两个钉死 slug 的探针（多规格 + 单规格）**

现有详情块（219-255 行）用 `search` 自动挑「第一个带 slug 的商品」，采到的 `detail-sku-sheet.png` **未必带规格组**，断言不可复现。因此在详情块结束（255 行的 `}`）之后、`// ---------- 4 购物车` 之前，追加两个**钉死 slug** 的探针，让三条断言确定可复现。

**注意脚本现状**：**没有 `BASE` 变量**，站点根是 `URL`（`_vshop_usemall_shots.mjs:51`）；且已有 `go(path, waitMs)` 帮助函数（用法见 227 行）。按文件现状用 `go()`，**不要**写 `` `${BASE}/#/...` ``。

追加内容（`MULTI_SLUG` / `SINGLE_SLUG` 用 Step 2 查到的真实 slug 替换，不要留占位）：

```js
  // S1 验收：多规格商品——规格组标题带 (N) 计数
  // 【必须 reload】同 hash 路由二次 page.goto 不会重载：SPA 复用同一详情组件，onMounted 不再执行，
  // 页面仍是上一个商品（手册 §5.7 已记录此坑）。先 goto 再 page.reload 才会真正取新 slug 的数据。
  await go(`/pkg-product/pages/detail?slug=${encodeURIComponent(MULTI_SLUG)}`, 1500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  console.log('  多规格页文本 =', await text());
  await shot('detail-page.png');
  const hitMulti = await clickAny(['加入购物车', '立即购买', '选规格', '选择规格', '购买']);
  if (hitMulti) {
    await page.waitForTimeout(2500);
    await shot('detail-sku-sheet.png');
    console.log('  多规格弹层文本 =', await text());
  } else {
    console.log('  多规格商品未找到触发 SKU 弹层的按钮');
  }

  // S1 验收：单规格商品——详情页已选行显示变体名（Task 3）
  await go(`/pkg-product/pages/detail?slug=${encodeURIComponent(SINGLE_SLUG)}`, 1500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  console.log('  单规格页文本 =', await text());
  await shot('detail-single-spec.png');
  // S1 验收：单规格弹层——规格区整段不渲染 + `pickedText` 取变体名 + 头部缩略图非灰底（Task 1/2 取证）
  // 单规格商品点加购同样会打开弹层；弹层里的「已选：…」就是 pickedText
  const hitSingle = await clickAny(['加入购物车', '立即购买', '选规格', '选择规格', '购买']);
  if (hitSingle) {
    await page.waitForTimeout(2500);
    await shot('detail-sku-sheet-single.png');
    console.log('  单规格弹层文本 =', await text());
  } else {
    console.log('  单规格商品未找到触发 SKU 弹层的按钮');
  }
```

- [x] **Step 2: 查一个多规格 slug 与一个单规格 slug**

**不要改仓库里已跟踪的 `web-admin/scripts/_smoke_usemall_align.py`**（Step 6 的 `git add` 不含它，改了会把工作树弄脏）。改为在**仓库外**建一个临时探针文件跑完即删：

`$env:TEMP\probe_vshop_slugs.mjs`：

```js
const URL = process.env.SITE_URL || 'https://e.joho.cn';
const q = `query { products(options: { take: 100 }) {
  items { name slug optionGroups { id name } featuredAsset { preview }
          variants { featuredAsset { preview } } }
} }`;
const r = await fetch(`${URL}/shop-api`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'vendure-token': process.env.VENDURE_TOKEN || '' },
  body: JSON.stringify({ query: q }),
});
const j = await r.json();
if (j.errors) { console.error(JSON.stringify(j.errors)); process.exit(1); }
for (const p of j.data.products.items) {
  const n = (p.optionGroups || []).length;
  const imgs = [p.featuredAsset?.preview, ...(p.variants || []).map((v) => v.featuredAsset?.preview)]
    .filter(Boolean).length;
  console.log(n === 0 ? 'SINGLE' : 'MULTI ', `groups=${n}`, `imgs=${imgs}`,
    'slug=' + JSON.stringify(p.slug), p.name);
}
```

Run（在 `d:\zhao\vshop`）：

```powershell
node "$env:TEMP\probe_vshop_slugs.mjs"
```

Expected：输出里既有 `MULTI` 行也有 `SINGLE` 行，且每行带 `imgs=` 计数。

- `MULTI_SLUG` = 一行 **`MULTI` 且 `groups>=1` 且 `imgs>=1`** 的商品（**必须 `imgs>=1`**：断言 3 要求弹层缩略图非灰底，无图商品的灰底是**数据缺失**、不是本 Task 要修的东西，选它没法验收）
- `SINGLE_SLUG` = 一行 **`SINGLE` 且 `groups=0` 且 `imgs>=1`** 的商品

两个都必须是 `slug` 非空且非 `""`（历史数据里有空 slug）。跑完 `Remove-Item "$env:TEMP\probe_vshop_slugs.mjs"`。

若没有满足 `MULTI 且 imgs>=1` 的候选，**停下报告并把清单贴出来**（往生产后台建/改商品属于需人工确认的动作，不要自作主张）；若没有 `SINGLE` 行，同样停下报告。

- [x] **Step 3: 先把 V1 上线（截图打的是生产站，不上线采不到新行为）**

截图脚本默认 `SITE_URL=https://e.joho.cn`（`_vshop_usemall_shots.mjs:51`），所以**必须先部署 V1 前端**，否则 Step 4 的三条断言全部会看到旧行为。V1 零后端，只部署前端。

Run（在 `d:\zhao\vshop`，本地构建，服务器只解压）：

```powershell
npm run build:h5
tar -czf dist-h5.tar.gz -C dist/build/h5 .
scp dist-h5.tar.gz joho:/tmp/
ssh joho "cd /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index && sudo tar -xzf /tmp/dist-h5.tar.gz && rm -f /tmp/dist-h5.tar.gz"
```

Expected：解压无报错。**不在服务器执行任何构建命令**（服务器内存不足）。

**两个已知的良性现象，不要误判为失败**：
1. 站点目录里有 root 属主的既有子目录 → 若不加 `sudo`，`tar` 会对 `./assets`、`./static`、`.` 报 `Cannot utime: Operation not permitted` 并以 exit 2 结束，**但内容已正确落盘**。所以这里用 `sudo tar`。
2. 站点目录会残留历史版本的旧 asset 文件（机器人一次次部署累积），与本次无关。

产物正确性以「本地与线上同一文件的 sha256 一致」为准，例如：

```powershell
git hash-object dist/build/h5/index.html
ssh joho "sudo sha256sum /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index/index.html"
```

（`git hash-object` 输出 `sha1`，若要严格比对改用 `Get-FileHash dist/build/h5/index.html -Algorithm SHA256` 与线上 `sudo sha256sum` 对照。）

完成后 `Remove-Item dist-h5.tar.gz`。

- [x] **Step 4: 跑脚本取图**

Run（在 `d:\zhao\vshop`）：

```powershell
node web-admin/scripts/_vshop_usemall_shots.mjs --only detail
```

**`--only detail` 只跳过首页/分类页**（`want('home')`/`want('category')` 有门控），**不拦** 后续 `[4] 购物车`、`[5] 秒杀`、`[6] 拼团` 三个块（它们没有 `want()` 门控）。所以跑完必须检查工作树，把「因本次重跑而被改动、但与本 Task 无关」的既有截图**逐个显式还原**：

```powershell
git status --short web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/
git checkout -- web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/flash-sale-page.png web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/group-buy-page.png
```

（按 `git status` 的**实际输出**逐个列出被改动的无关图；**只还原与本 Task 无关的那些**，`detail-page.png` / `detail-sku-sheet.png` 要保留新采的。**不要**用 `git checkout -- .` 或任何通配整目录的写法。）

Expected：`web-admin\docs\superpowers\manual\vshop-usemall-alignment\assets\` 下新增/更新：

| 文件 | 断言 |
|---|---|
| `assets/detail-sku-sheet.png` | **多规格**商品弹层：规格组标题形如「颜色 (3)」（断言 1） |
| `assets/detail-sku-sheet-single.png` | **单规格**商品弹层：**没有**规格组标题（规格区整段不渲染，断言 2）；`已选：` 行为变体名、不出现「请选择规格」；弹层头部缩略图为**真实图片、非灰底**（断言 3 取证图） |
| `assets/detail-single-spec.png` | 单规格**详情页**（弹层未打开）：「已选规格」入口行显示变体名，不出现「请选择规格」（断言 2 的页面侧） |
| `assets/detail-page.png` | 多规格商品详情页（弹层未打开），主图区正常 |

**断言 3 的取证对象说明**（2026-09-29 用户裁定，**不改生产数据**）：全站仅 2 个多规格商品（`fresh-crayfish` / `xianju-bayberry`），两者商品级与变体级 `featuredAsset` **均为 null、`assets` 为 0** —— 它们的弹层灰底是**数据缺失**，不是 Task 1 要修的查询缺字段问题，故**不作为断言**。改用**有图**的单规格商品（如 `温泉门票`，`imgs=2`）取证：它走的是 `currentVariant.featuredAsset?.preview || product.featuredAsset?.preview` 的**第二级**回退，正是 Task 1 修好的那一级（修前该级在数据层恒为 `undefined` → 必然灰底）。

三张图在 390×844、dpr=2 下采集。逐张目视核对断言；任一不满足则回到 Task 1/2/3 修，**不要**先改断言。

- [x] **Step 5: 手册补 V1 截图行**

在 `web-admin\docs\superpowers\manual\vshop-usemall-alignment\README.md` 里，找到既有「详情页 / SKU 弹层」相关小节，在其截图表格末尾追加一行（表格列名与上文一致）：

```markdown
| 单规格商品详情 | `detail-single-spec.png` | 规格区整段不渲染，已选行显示变体名 |
| 单规格商品 SKU 弹层 | `detail-sku-sheet-single.png` | 无规格组标题；已选行为变体名；头部缩略图为真实图片（非灰底） |
```

**同时补一条「常见问题」**，避免后人把数据问题误判为代码回归：

```markdown
### 多规格商品的 SKU 弹层缩略图仍是灰底？

属**数据缺失**，非代码问题。库内仅有的 2 个多规格商品（`鲜活小龙虾` / `仙居杨梅`）商品级与变体级都没有图片（`featuredAsset` 为 null）。缩略图回退链 `currentVariant.featuredAsset?.preview || product.featuredAsset?.preview` 在这两个商品上都取不到值。给商品补图后即正常。
```

同时把手册顶部版本号升到 **v1.6**（与第二轮一起记，见 Task 13）。

- [x] **Step 6: 提交**

截图产物落在 `assets/` 子目录（`_vshop_usemall_shots.mjs:52`），路径不要漏 `assets/`：

```powershell
git add web-admin/scripts/_vshop_usemall_shots.mjs web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/detail-single-spec.png web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/detail-sku-sheet-single.png web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/detail-sku-sheet.png web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/detail-page.png
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
test(sku): V1 验收——SKU 弹层规格计数/单规格降级/缩略图手机截图

- 新增 detail-sku-sheet-single.png（单规格弹层：无规格组、已选取变体名、缩略图非灰底）
- 新增 detail-single-spec.png（单规格详情页：已选行显示变体名）
- 重采 detail-sku-sheet.png（多规格：规格组标题带计数）与 detail-page.png
- 断言 3 改用有图的单规格商品取证：多规格商品无图属数据缺失，手册补常见问题说明
- 截图脚本探针钉死 slug 并补 page.reload（同 hash 路由不重载）

涉及：web-admin/scripts/_vshop_usemall_shots.mjs、web-admin/docs/superpowers/manual/vshop-usemall-alignment/
```

- [x] **Step 7: 推送**

```powershell
git push origin master
```

**V1 到此结束，可独立验收（代码已上线、截图已归档、文档已提交推送）。**

---

# 纵切 V2 —— S2–S6 评价体系

## Task 5: S6 后端——先写失败用例（红）

**Files:**
- Modify: `d:\zhao\vendure\packages\review-plugin\e2e\review.e2e-spec.ts`（在最后一个 `it`（346-359 行）之后、`});`（360 行）之前插入）

- [x] **Step 1: 追加分档筛选用例**

在 `e2e\review.e2e-spec.ts` 第 359 行 `});` 与第 360 行 `});` 之间插入（注意缩进与既有 `it` 同级，均为 4 空格）：

```ts
    it('分档筛选：ratingMin/ratingMax 单边与区间生效；越界与倒挂忽略', async () => {
        // 造 3 条已审核评价：5 星 / 3 星 / 1 星
        const created: string[] = [];
        for (const rating of [5, 3, 1]) {
            const { lineId } = await deliverOrder(shopClient);
            const r = await createReview(shopClient, lineId, { rating, content: `分档用例 ${rating} 星` });
            await approve(r.id);
            created.push(r.id);
        }

        const q = async (extra: string) => {
            const res = await shopClient.query(gql`
                query {
                    productReviews(productId: "${productId}", options: { take: 20${extra} }) {
                        totalItems
                        items { id rating }
                    }
                }
            `) as any;
            return res.productReviews;
        };

        // 基线：当前全部已审核主评
        const all = await q('');
        expect(all.totalItems).toBeGreaterThanOrEqual(3);

        // 好评 4-5
        const good = await q(', ratingMin: 4, ratingMax: 5');
        expect(good.items.every((i: any) => i.rating >= 4 && i.rating <= 5)).toBe(true);
        expect(good.totalItems).toBe(all.items.filter((i: any) => i.rating >= 4 && i.rating <= 5).length);
        expect(good.items.some((i: any) => i.id === created[0])).toBe(true);   // 5 星在内
        expect(good.items.some((i: any) => i.id === created[1])).toBe(false);  // 3 星不在内

        // 中评 = 3
        const middle = await q(', ratingMin: 3, ratingMax: 3');
        expect(middle.items.every((i: any) => i.rating === 3)).toBe(true);
        expect(middle.items.some((i: any) => i.id === created[1])).toBe(true);

        // 差评 1-2
        const bad = await q(', ratingMin: 1, ratingMax: 2');
        expect(bad.items.every((i: any) => i.rating >= 1 && i.rating <= 2)).toBe(true);
        expect(bad.items.some((i: any) => i.id === created[2])).toBe(true);

        // 单边
        const minOnly = await q(', ratingMin: 3');
        expect(minOnly.totalItems).toBe(all.items.filter((i: any) => i.rating >= 3).length);
        const maxOnly = await q(', ratingMax: 3');
        expect(maxOnly.totalItems).toBe(all.items.filter((i: any) => i.rating <= 3).length);

        // 越界 / 倒挂 → 忽略参数，退化为不筛选
        expect((await q(', ratingMin: 9')).totalItems).toBe(all.totalItems);
        expect((await q(', ratingMax: 0')).totalItems).toBe(all.totalItems);
        expect((await q(', ratingMin: 5, ratingMax: 1')).totalItems).toBe(all.totalItems);
    });
```

用例设计说明（照此实现，不要改判据）：用 `all`（不筛选）当基线，逐档断言「条数 = 基线的同区间条数」，这样**不依赖前面 `it` 的执行顺序与残留数据**；同时对刚造的 5/3/1 三条做 id 级别的 in/out 断言，保证筛选真的生效而不是恒空。

- [x] **Step 2: 跑用例，确认失败**

Run（在 `d:\zhao\vendure\packages\review-plugin`）：

```powershell
npm run e2e
```

Expected：**FAIL**。失败信息形如 `GraphQL Error: Cannot query field "ratingMin" on input "ReviewListOptions"`（SDL 还没有这两个字段）。若用例反而通过，说明上一轮已实现，请停下来核对 §0 事实 7 后再决定是否跳过 Task 6。

- [x] **Step 3: 提交（红）**

```powershell
git add packages/review-plugin/e2e/review.e2e-spec.ts
git commit -F .git/COMMIT_MSG_TMP.txt
```

在 `d:\zhao\vendure` 下执行；`.git/COMMIT_MSG_TMP.txt`：

```
test(review): 先写分档筛选失败用例（ratingMin/ratingMax）

用不筛选结果为基线做同区间条数比对，避免依赖前序用例残留数据；
另对新建的 5/3/1 三条做 id 级 in/out 断言。当前 SDL 无 ratingMin/ratingMax，预期 FAIL。

涉及：packages/review-plugin/e2e/review.e2e-spec.ts
```

---

## Task 6: S6 后端——实现分档筛选（绿）+ 重建 `lib`

**Files:**
- Modify: `d:\zhao\vendure\packages\review-plugin\src\types.ts`（`ReviewListOptions`，43-46 行）
- Modify: `d:\zhao\vendure\packages\review-plugin\src\plugin.ts`（shop SDL `ReviewListOptions`，125-128 行）
- Modify: `d:\zhao\vendure\packages\review-plugin\src\review.service.ts`（import 21 行；新增模块级 helper；`getProductReviews` 269-291 行）
- 产物（改完必须重建）：`d:\zhao\vendure\packages\review-plugin\lib\**`

- [x] **Step 1: `types.ts` 加两个可选字段**

把 43-46 行：

```ts
export interface ReviewListOptions extends ListQueryOptions<Review> {
    productId?: ID;
    status?: string;
}
```

改为：

```ts
export interface ReviewListOptions extends ListQueryOptions<Review> {
    productId?: ID;
    status?: string;
    /** C 端星级档筛选下界（含）。与 ratingMax 可单用/组合；越界（<1 或 >5）与 min>max 由服务层忽略。 */
    ratingMin?: number;
    /** C 端星级档筛选上界（含）。 */
    ratingMax?: number;
}
```

- [x] **Step 2: shop SDL 加两个 input 字段（admin 版不动）**

把 `plugin.ts` 的 **`shopSchema`** 里（**不是** `adminSchema`）125-128 行：

```graphql
    input ReviewListOptions {
        skip: Int
        take: Int
    }
```

改为：

```graphql
    input ReviewListOptions {
        skip: Int
        take: Int
        ratingMin: Int
        ratingMax: Int
    }
```

- [x] **Step 3: `review.service.ts` 改 import**

把 21 行：

```ts
import { IsNull } from 'typeorm';
```

改为：

```ts
import { Between, FindOperator, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
```

- [x] **Step 4: 加模块级 helper**

在 `review.service.ts`（`DELETED_STATUS` 那组常量之后、`@Injectable()` 类定义之前）插入：

```ts
/**
 * 星级档筛选条件：TypeORM 的同一列不能挂两个 FindOperator，故按入参合并为单个。
 * 入参越界（非 1-5 整数）或 min > max 时返回 undefined，即忽略该筛选（不抛错，避免拖垮 C 端列表）。
 */
function buildRatingFilter(min?: number, max?: number): FindOperator<number> | undefined {
    const inRange = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
    const hasMin = inRange(min);
    const hasMax = inRange(max);
    if (hasMin && hasMax) return min! > max! ? undefined : Between(min!, max!);
    if (hasMin) return MoreThanOrEqual(min!);
    if (hasMax) return LessThanOrEqual(max!);
    return undefined;
}
```

- [x] **Step 5: `getProductReviews` 叠加 rating 条件**

把 269-291 行的 `getProductReviews` 整体替换为：

```ts
    /** C 端商品列表：仅对外可见（approved）的主评 + 追评（followUps 由 ResolveField 加载）。 */
    async getProductReviews(
        ctx: RequestContext,
        productId: ID,
        options?: ReviewListOptions,
    ): Promise<PaginatedList<Review>> {
        const ratingFilter = buildRatingFilter(options?.ratingMin, options?.ratingMax);
        return this.listQueryBuilder
            .build(
                Review,
                { ...options },
                {
                    ctx,
                    relations: ['channels'],
                    channelId: ctx.channelId,
                    where: {
                        productId: Number(productId),
                        status: VISIBLE_STATUS,
                        parentId: IsNull(),
                        ...(ratingFilter ? { rating: ratingFilter } : {}),
                    } as any,
                },
            )
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }
```

**不要**改 `getReviews`（admin 版，249-266 行）。

- [x] **Step 6: 跑 e2e，确认转绿**

Run（在 `d:\zhao\vendure\packages\review-plugin`）：

```powershell
npm run e2e
```

Expected：**PASS**，含新用例与其余 7 个既有用例全绿。

- [x] **Step 7: 外科式重建 `lib`（不 rimraf）**

Run（在 `d:\zhao\vendure`）：

```powershell
npx tsc -p packages/review-plugin/tsconfig.build.json
```

Expected：无 error。然后核对改动的编译产物**只有预期文件**：

```powershell
git status --short packages/review-plugin/lib
```

Expected：仅 `lib/src/plugin.js`、`lib/src/plugin.d.ts`、`lib/src/review.service.js`、`lib/src/review.service.d.ts`、`lib/src/types.js`、`lib/src/types.d.ts`（以及对应 `.js.map`）为 modified。**若出现大量无关文件的删除/新增**，说明触碰了既有漂移，立即 `git checkout -- packages/review-plugin/lib` 回滚并改为手工只补对应 `.js` 产物。

- [x] **Step 8: 提交**

```powershell
git add packages/review-plugin/src/types.ts packages/review-plugin/src/plugin.ts packages/review-plugin/src/review.service.ts packages/review-plugin/lib
git commit -F .git/COMMIT_MSG_TMP.txt
```

在 `d:\zhao\vendure` 下执行；`.git/COMMIT_MSG_TMP.txt`：

```
feat(review): shop SDL 支持按星级档筛选商品评价（ratingMin/ratingMax）

- types.ts：ReviewListOptions 加 ratingMin/ratingMax
- plugin.ts：仅 shop 版 SDL 暴露两个 Int 入参，admin 版不动
- review.service.ts：同一列不能挂两个 FindOperator，按 仅min/仅max/区间 合并为单个；
  越界与 min>max 忽略该筛选，避免拖垮 C 端列表
- 无数据库迁移（review 表已有 rating 列）；重建 lib 产物

涉及：packages/review-plugin/{src,e2e,lib}
```

**部署提示**：后端必须**先于**前端上线，否则前端传 `ratingMin` 会被 GraphQL 校验拒绝。部署动作集中在 Task 13。

---

## Task 7: `src/api/queries/review.ts` + 5 个语言包 `review.*`

**Files:**
- Create: `d:\zhao\vshop\src\api\queries\review.ts`
- Modify: `d:\zhao\vshop\src\i18n\locales\{zh-CN,zh-TW,en,ja,ko}.json`（在 `sku` 块（225-231 行）之后追加）

- [x] **Step 1: 新建 `review.ts`**

创建 `src\api\queries\review.ts`：

```ts
import { getGraphQLClient } from '../client';

/** 评价条目公共字段（productReviews / myReviews / createReview 三个操作共用） */
const REVIEW_FIELDS = `
    id customerId customerName productId variantId orderLineId parentId
    rating content images tags isAnonymous status reply repliedAt helpfulCount
    createdAt
`;

/** 商品评价列表：public；ratingMin/ratingMax 为服务端分档筛选（见 vendure review-plugin S6） */
export async function getProductReviews(productId: string, options?: {
    take?: number;
    skip?: number;
    ratingMin?: number;
    ratingMax?: number;
}) {
    const client = getGraphQLClient();
    const query = `
        query GetProductReviews($productId: ID!, $options: ReviewListOptions) {
            productReviews(productId: $productId, options: $options) {
                totalItems
                items { ${REVIEW_FIELDS} }
            }
        }
    `;
    return client.request(query, { productId, options: { take: 10, ...(options || {}) } });
}

/** 商品评分聚合：totalCount / goodRate(0-100) / averageRating(1 位小数) / ratingDistribution(1-5 恒 5 条) / topTags */
export async function getReviewStats(productId: string) {
    const client = getGraphQLClient();
    const query = `
        query GetReviewStats($productId: ID!) {
            reviewStats(productId: $productId) {
                totalCount goodRate averageRating
                ratingDistribution { rating count }
                topTags { tag count }
            }
        }
    `;
    return client.request(query, { productId });
}

/** 我的评价：authenticated；后端为全量返回（无分页、无 status 过滤），调用方自行剔除 deleted */
export async function getMyReviews() {
    const client = getGraphQLClient();
    const query = `
        query GetMyReviews {
            myReviews { ${REVIEW_FIELDS} }
        }
    `;
    return client.request(query);
}

/** 发表评价：authenticated；orderLineId 必传，同一 orderLine 同一客户只能评一次 */
export async function createReview(input: {
    productId: string;
    orderLineId?: string;
    variantId?: string;
    rating: number;
    content: string;
    images?: string[];
    tags?: string[];
    isAnonymous?: boolean;
}) {
    const client = getGraphQLClient();
    const query = `
        mutation CreateReview($input: CreateReviewInput!) {
            createReview(input: $input) { ${REVIEW_FIELDS} }
        }
    `;
    return client.request(query, { input });
}
```

注意：`options` 里显式给 `take: 10` 默认值，且**不要**把 `undefined` 键传下去（`{...options}` 中值为 `undefined` 的键会被 graphql-request 序列化成 `null`，服务端 `inRange(null)` 返回 false → 退化为不筛选，行为可接受，但为稳妥起见 Task 9/10 调用时只在需要时展开）。

- [x] **Step 2: `zh-CN.json` 追加 `review` 命名空间**

把 `src\i18n\locales\zh-CN.json` 的 231-232 行：

```json
    }
}
```

改为：

```json
    },
    "review": {
        "title": "用户评价",
        "viewAll": "查看全部",
        "scoreUnit": "分",
        "goodRate": "好评率",
        "all": "全部",
        "good": "好评",
        "middle": "中评",
        "bad": "差评",
        "empty": "暂无评价",
        "noMore": "没有更多了",
        "reply": "商家回复",
        "expand": "展开",
        "collapse": "收起",
        "anonymousUser": "匿名用户",
        "scoreLabel": "宝贝评分",
        "contentPlaceholder": "请输入评价内容",
        "contentRequired": "请填写评价内容",
        "uploadHint": "上传图片（最多 6 张）",
        "publicProfile": "公开显示您的头像、昵称",
        "submit": "提交评价",
        "submitted": "评价已提交，审核通过后展示",
        "partialFailed": "{n} 件商品评价提交失败，请重试",
        "myReviews": "我的评价",
        "myOrderReviewBtn": "我要评价",
        "reviewed": "已评价",
        "statusPending": "待审核",
        "statusApproved": "已通过",
        "statusRejected": "已驳回",
        "goodsIndex": "商品 {n}"
    }
}
```

- [x] **Step 3: `zh-TW.json` 追加同名命名空间**

把 `src\i18n\locales\zh-TW.json` 的 231-232 行改为：

```json
    },
    "review": {
        "title": "用戶評價",
        "viewAll": "查看全部",
        "scoreUnit": "分",
        "goodRate": "好評率",
        "all": "全部",
        "good": "好評",
        "middle": "中評",
        "bad": "差評",
        "empty": "暫無評價",
        "noMore": "沒有更多了",
        "reply": "商家回覆",
        "expand": "展開",
        "collapse": "收起",
        "anonymousUser": "匿名用戶",
        "scoreLabel": "寶貝評分",
        "contentPlaceholder": "請輸入評價內容",
        "contentRequired": "請填寫評價內容",
        "uploadHint": "上傳圖片（最多 6 張）",
        "publicProfile": "公開顯示您的頭像、暱稱",
        "submit": "提交評價",
        "submitted": "評價已提交，審核通過後展示",
        "partialFailed": "{n} 件商品評價提交失敗，請重試",
        "myReviews": "我的評價",
        "myOrderReviewBtn": "我要評價",
        "reviewed": "已評價",
        "statusPending": "待審核",
        "statusApproved": "已通過",
        "statusRejected": "已駁回",
        "goodsIndex": "商品 {n}"
    }
}
```

- [x] **Step 4: `en.json` 追加同名命名空间**

把 `src\i18n\locales\en.json` 的 231-232 行改为：

```json
    },
    "review": {
        "title": "Customer Reviews",
        "viewAll": "View all",
        "scoreUnit": "pts",
        "goodRate": "Positive rate",
        "all": "All",
        "good": "Positive",
        "middle": "Neutral",
        "bad": "Negative",
        "empty": "No reviews yet",
        "noMore": "No more",
        "reply": "Seller reply",
        "expand": "Expand",
        "collapse": "Collapse",
        "anonymousUser": "Anonymous",
        "scoreLabel": "Product rating",
        "contentPlaceholder": "Please enter your review",
        "contentRequired": "Please enter your review",
        "uploadHint": "Upload images (max 6)",
        "publicProfile": "Show my avatar and nickname",
        "submit": "Submit review",
        "submitted": "Review submitted. It will show after approval",
        "partialFailed": "Failed to submit {n} review(s). Please retry",
        "myReviews": "My reviews",
        "myOrderReviewBtn": "Review now",
        "reviewed": "Reviewed",
        "statusPending": "Pending",
        "statusApproved": "Approved",
        "statusRejected": "Rejected",
        "goodsIndex": "Item {n}"
    }
}
```

- [x] **Step 5: `ja.json` 追加同名命名空间**

把 `src\i18n\locales\ja.json` 的 231-232 行改为：

```json
    },
    "review": {
        "title": "ユーザー評価",
        "viewAll": "すべて見る",
        "scoreUnit": "点",
        "goodRate": "高評価率",
        "all": "すべて",
        "good": "高評価",
        "middle": "普通",
        "bad": "低評価",
        "empty": "評価はまだありません",
        "noMore": "これ以上ありません",
        "reply": "ショップからの返信",
        "expand": "展開",
        "collapse": "折りたたむ",
        "anonymousUser": "匿名ユーザー",
        "scoreLabel": "商品の評価",
        "contentPlaceholder": "評価内容を入力してください",
        "contentRequired": "評価内容を入力してください",
        "uploadHint": "画像をアップロード（最大6枚）",
        "publicProfile": "アバターとニックネームを公開",
        "submit": "評価を送信",
        "submitted": "評価を送信しました。承認後に表示されます",
        "partialFailed": "{n} 件の評価の送信に失敗しました。再試行してください",
        "myReviews": "マイ評価",
        "myOrderReviewBtn": "評価する",
        "reviewed": "評価済み",
        "statusPending": "審査待ち",
        "statusApproved": "承認済み",
        "statusRejected": "却下",
        "goodsIndex": "商品 {n}"
    }
}
```

- [x] **Step 6: `ko.json` 追加同名命名空间**

把 `src\i18n\locales\ko.json` 的 231-232 行改为：

```json
    },
    "review": {
        "title": "사용자 평가",
        "viewAll": "전체 보기",
        "scoreUnit": "점",
        "goodRate": "긍정률",
        "all": "전체",
        "good": "긍정",
        "middle": "보통",
        "bad": "부정",
        "empty": "아직 평가가 없습니다",
        "noMore": "더 이상 없습니다",
        "reply": "판매자 답변",
        "expand": "펼치기",
        "collapse": "접기",
        "anonymousUser": "익명 사용자",
        "scoreLabel": "상품 평가",
        "contentPlaceholder": "평가 내용을 입력하세요",
        "contentRequired": "평가 내용을 입력하세요",
        "uploadHint": "이미지 업로드 (최대 6장)",
        "publicProfile": "아바타와 닉네임 공개",
        "submit": "평가 제출",
        "submitted": "평가가 제출되었습니다. 승인 후 표시됩니다",
        "partialFailed": "{n}개 상품 평가 제출 실패, 다시 시도하세요",
        "myReviews": "내 평가",
        "myOrderReviewBtn": "평가하기",
        "reviewed": "평가 완료",
        "statusPending": "심사 중",
        "statusApproved": "승인됨",
        "statusRejected": "반려됨",
        "goodsIndex": "상품 {n}"
    }
}
```

- [x] **Step 7: 5 个文件都必须是合法 JSON 且键集完全一致**

Run（在 `d:\zhao\vshop`）：

```powershell
node -e "for (const l of ['zh-CN','zh-TW','en','ja','ko']) { const m = require('./src/i18n/locales/' + l + '.json'); const k = Object.keys(m.review); console.log(l, k.length, k.join(',')); }"
```

Expected：5 行，每行都是 `29`，且键名序列完全一致（29 = spec §4.9 的词条数）。若某行不是 29，逐字比对上面的 JSON 块补齐。

- [x] **Step 8: 编译门禁 + 提交**

Run（在 `d:\zhao\vshop`）：`npm run build:h5` → Expected：0 error。

```powershell
git add src/api/queries/review.ts src/i18n/locales/zh-CN.json src/i18n/locales/zh-TW.json src/i18n/locales/en.json src/i18n/locales/ja.json src/i18n/locales/ko.json
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
feat(review): 评价 GraphQL 封装 + review.* i18n 词条（5 语言包同步）

- 新增 src/api/queries/review.ts：productReviews（含分档入参）/reviewStats/myReviews/createReview
- 5 个语言包各补 29 条 review.* 词条，键集完全一致

涉及：src/api/queries/review.ts、src/i18n/locales/*.json
```

---

## Task 8: 公共条目组件 `ReviewItem.vue`

**为什么抽组件**：S2 详情页评价区与 S3 商品评价页的条目**结构完全相同**（头像首字符/昵称/星级/日期/规格/内容 clamp-2/图片可预览/商家回复可展开），仅图片上限不同（3 vs 9）。抽一个组件避免两份分叉实现。

**Files:**
- Create: `d:\zhao\vshop\src\components\ReviewItem.vue`

- [x] **Step 1: 新建组件**

创建 `src\components\ReviewItem.vue`：

```vue
<template>
  <view class="review-item">
    <view class="review-item__head">
      <text class="review-item__avatar">{{ avatarText }}</text>
      <text class="review-item__name">{{ review.customerName || t('review.anonymousUser') }}</text>
      <text class="review-item__date">{{ dateText }}</text>
    </view>
    <text class="review-item__stars">{{ starText }}</text>
    <text v-if="specText" class="review-item__spec">{{ specText }}</text>
    <text class="review-item__content">{{ review.content }}</text>
    <view v-if="images.length" class="review-item__images">
      <view v-for="(img, i) in images" :key="i" class="review-item__img" @click="preview(i)">
        <VImage :src="img" width="200rpx" height="200rpx" />
      </view>
    </view>
    <view v-if="review.reply" class="review-item__reply" @click="replyExpanded = !replyExpanded">
      <text class="review-item__reply-label">{{ t('review.reply') }}</text>
      <text class="review-item__reply-text" :class="{ 'review-item__reply-text--clamp': !replyExpanded }">{{ review.reply }}</text>
      <text class="review-item__reply-toggle">{{ replyExpanded ? t('review.collapse') : t('review.expand') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import VImage from './VImage.vue';

const props = withDefaults(defineProps<{
    review: any;
    /** variantId → 规格文案（如「红色 / L」），由调用方按商品 variants 构建 */
    variantMap?: Record<string, string>;
    /** 最多展示几张图：详情页 3，评价页 9 */
    maxImages?: number;
}>(), {
    variantMap: () => ({}),
    maxImages: 9,
});

const { t } = useI18n();
const replyExpanded = ref(false);

const avatarText = computed(() => {
    const name = String(props.review?.customerName || '');
    return name ? name.slice(0, 1) : t('review.anonymousUser').slice(0, 1);
});

const dateText = computed(() => {
    const raw = props.review?.createdAt;
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
});

const starText = computed(() => {
    const rating = Math.min(5, Math.max(0, Number(props.review?.rating) || 0));
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
});

const specText = computed(() => {
    const vid = props.review?.variantId;
    if (!vid) return '';
    return props.variantMap?.[String(vid)] || '';
});

const images = computed<string[]>(() => (props.review?.images || []).slice(0, props.maxImages));

function preview(index: number) {
    const urls = props.review?.images || [];
    if (!urls.length) return;
    uni.previewImage({ urls, current: urls[index] });
}
</script>

<style lang="scss" scoped>
.review-item { background: #fff; padding: 24rpx 0; border-bottom: 1rpx solid $border-color;
    &__head { display: flex; align-items: center; gap: 12rpx; }
    &__avatar { width: 56rpx; height: 56rpx; border-radius: 50%; background: $brand-color-light; color: $brand-color; font-size: 26rpx; text-align: center; line-height: 56rpx; }
    &__name { flex: 1; font-size: 26rpx; color: $text-color; }
    &__date { font-size: 22rpx; color: #999; }
    &__stars { display: block; margin-top: 10rpx; font-size: 24rpx; color: $price-color; letter-spacing: 2rpx; }
    &__spec { display: block; margin-top: 6rpx; font-size: 22rpx; color: #999; }
    &__content { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 10rpx; font-size: 26rpx; color: $text-color; line-height: 1.5; }
    &__images { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }
    &__img { width: 200rpx; height: 200rpx; border-radius: $radius-sm; overflow: hidden; }
    &__reply { margin-top: 14rpx; padding: 16rpx; background: #f7f7f7; border-radius: $radius-sm; }
    &__reply-label { font-size: 22rpx; color: $brand-color; display: block; }
    &__reply-text { font-size: 24rpx; color: $text-color-secondary; line-height: 1.5; display: block; margin-top: 6rpx;
        &--clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    }
    &__reply-toggle { font-size: 22rpx; color: $brand-color; display: block; margin-top: 6rpx; }
}
</style>
```

- [x] **Step 2: 编译门禁**

Run（在 `d:\zhao\vshop`）：`npm run build:h5`
Expected：0 error。组件此时尚未被引用，编译通过即说明 SFC 语法与 scss 变量（`$brand-color` / `$brand-color-light` / `$price-color` / `$radius-sm` / `$border-color` / `$text-color` / `$text-color-secondary`）均可用——这些变量在 `detail.vue`、`orders.vue` 中已被同样引用。

- [x] **Step 3: 提交**

```powershell
git add src/components/ReviewItem.vue
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
feat(review): 抽公共评价条目组件 ReviewItem（详情页与评价页共用）

头像取昵称首字符、星级 ★/☆、日期 yyyy/MM/dd、规格按 variantMap 映射、
内容 clamp-2、图片可预览（上限可配）、商家回复默认 clamp-2 点击展开。

涉及：src/components/ReviewItem.vue
```

---

## Task 9: S2 详情页评价区

**Files:**
- Modify: `d:\zhao\vshop\src\pkg-product\pages\detail.vue`（模板：44-45 行之间插入；script：import 与状态）

- [x] **Step 1: 在 `product-detail__info` 之后、`product-detail__rich` 之前插入评价区**

第 44 行 `</view>`（`product-detail__info` 闭合）与第 45 行 `<view class="product-detail__rich" ...>` 之间插入：

```html
    <!-- 用户评价区：必须在详情富文本之前（对齐 usemall 05 → 06 顺序） -->
    <view v-if="reviewTotal > 0" class="review-block" @click="goReviewList">
      <view class="review-block__head">
        <text class="review-block__title">{{ t('review.title') }}（{{ reviewTotal }}）</text>
        <text class="review-block__more">{{ t('review.viewAll') }} ›</text>
      </view>
      <view class="review-block__summary">
        <text class="review-block__score">{{ reviewStats?.averageRating ?? 0 }} {{ t('review.scoreUnit') }}</text>
        <text class="review-block__sep">|</text>
        <text class="review-block__rate">{{ t('review.goodRate') }} {{ reviewStats?.goodRate ?? 0 }}%</text>
      </view>
      <ReviewItem
        v-for="r in previewReviews"
        :key="r.id"
        :review="r"
        :variant-map="variantTextMap"
        :max-images="3"
      />
    </view>
```

- [x] **Step 2: script 补 import 与状态**

在 `detail.vue` 的 import 区（90-96 行）追加两行：

```ts
import ReviewItem from '../../components/ReviewItem.vue';
import { useI18n } from 'vue-i18n';
```

在 `const product = ref<any>(null);`（98 行）之后追加：

```ts
const { t } = useI18n();
const previewReviews = ref<any[]>([]);
const reviewTotal = ref(0);
const reviewStats = ref<any>(null);
```

在 `const pickedSummary = computed(...)` 之后追加：

```ts
/** variantId → 规格文案（如「红色 / L」），供 ReviewItem 展示规格行 */
const variantTextMap = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const v of product.value?.variants || []) {
        map[String(v.id)] = (v.options || []).map((o: any) => o.name).join(' / ');
    }
    return map;
});
```

在文件末尾的 `onUnmounted(...)` 之前追加：

```ts
/** 评价区：两个查询并行；任一失败或 totalItems === 0 → 整块不渲染，不阻塞商品主内容 */
async function loadReviews() {
    const pid = product.value?.id;
    if (!pid) return;
    const [listRes, statsRes] = await Promise.allSettled([
        getProductReviews(String(pid), { take: 2 }),
        getReviewStats(String(pid)),
    ]);
    if (listRes.status !== 'fulfilled') return;
    const list: any = listRes.value;
    reviewTotal.value = list.productReviews?.totalItems || 0;
    previewReviews.value = list.productReviews?.items || [];
    if (reviewTotal.value === 0) return;
    if (statsRes.status === 'fulfilled') reviewStats.value = (statsRes.value as any).reviewStats;
}

function goReviewList() {
    if (!product.value?.slug) return;
    uni.navigateTo({ url: '/pkg-product/pages/evaluate?slug=' + product.value.slug });
}
```

import 区追加 `getProductReviews, getReviewStats`：

```ts
import { getProductReviews, getReviewStats } from '../../api/queries/review';
```

- [x] **Step 3: 在商品加载成功后调用 `loadReviews()`**

把 219 行的 `} catch (e) { console.error(e); }`（第一个 `onMounted` 内商品请求的 catch）保持不动，在其**之后的下一行**插入：

```ts
    await loadReviews();
```

即该 `onMounted` 变成：

```ts
    try {
        const res: any = await getProduct(slug);
        product.value = res.product;
        // Auto-select first options
        if (product.value?.optionGroups) {
            product.value.optionGroups.forEach((g: any) => {
                if (g.options?.length > 0) selectedOptions.value[g.id] = g.options[0].id;
            });
        }
    } catch (e) { console.error(e); }
    await loadReviews();
```

注意 `await loadReviews()` 必须在 `try/catch` **之外**，且要在微信分享的 `buildShareMeta(...)` 之前——分享图现在真的能取到 `product.featuredAsset.preview` 了（Task 1）。

- [x] **Step 4: scss 追加评价区样式**

在 `detail.vue` 的 `<style>` 末尾（294 行 `</style>` 之前）插入：

```scss
.review-block { margin-top: 16rpx; background: #fff; padding: 20rpx;
    &__head { display: flex; align-items: center; justify-content: space-between; }
    &__title { font-size: 28rpx; font-weight: bold; color: $text-color; }
    &__more { font-size: 24rpx; color: $text-color-secondary; }
    &__summary { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx; padding-bottom: 8rpx; }
    &__score { font-size: 26rpx; color: $price-color; font-weight: bold; }
    &__sep { font-size: 22rpx; color: #ddd; }
    &__rate { font-size: 24rpx; color: $text-color-secondary; }
}
```

- [x] **Step 5: 编译门禁**

Run（在 `d:\zhao\vshop`）：`npm run build:h5`
Expected：0 error。

- [x] **Step 6: 提交**

```powershell
git add src/pkg-product/pages/detail.vue
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
feat(review): 详情页新增用户评价区（标题计数 + 平均分 + 好评率 + 前 2 条）

- 位置对齐 usemall 05 → 06：在 product-detail__info 之后、product-detail__rich 之前
- productReviews 与 reviewStats 并行；任一失败或 totalItems 为 0 则整块不渲染，不阻塞主内容
- 条目复用 ReviewItem；规格行按 product.variants 建 variantId → 文案映射
- goodRate 后端已是 0-100 百分比，前端只拼 %（勿再乘 100）

涉及：src/pkg-product/pages/detail.vue
```

---

## Task 10: S3 商品评价页 + `pages.json`

**Files:**
- Create: `d:\zhao\vshop\src\pkg-product\pages\evaluate.vue`
- Modify: `d:\zhao\vshop\src\pages.json`（`pkg-product` 的 `pages`，84-88 行之后）

- [x] **Step 1: 新建商品评价页**

创建 `src\pkg-product\pages\evaluate.vue`：

```vue
<template>
  <view class="review-page">
    <view class="review-tabs">
      <text
        v-for="tab in tabs"
        :key="tab.key"
        class="review-tab"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >{{ t(tab.labelKey) }}（{{ tabCount(tab.key) }}）</text>
    </view>
    <view class="review-summary" v-if="stats">
      <text class="review-summary__score">{{ stats.averageRating }} {{ t('review.scoreUnit') }}</text>
      <text class="review-summary__rate">{{ t('review.goodRate') }} {{ stats.goodRate }}%</text>
    </view>

    <scroll-view class="review-page__scroll" scroll-y @scrolltolower="loadMore">
      <ReviewItem
        v-for="r in reviews"
        :key="r.id"
        :review="r"
        :variant-map="variantTextMap"
        :max-images="9"
      />
      <view class="review-page__footer">
        <LoadingSkeleton v-if="loading && reviews.length === 0" type="list" :count="2" />
        <text v-else-if="!hasMore && reviews.length > 0" class="footer-text">{{ t('review.noMore') }}</text>
        <EmptyState v-if="!loading && reviews.length === 0" :text="t('review.empty')" />
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onReachBottom } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { getProduct } from '../../api/queries/product';
import { getProductReviews, getReviewStats } from '../../api/queries/review';
import ReviewItem from '../../components/ReviewItem.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import EmptyState from '../../components/EmptyState.vue';

type TabKey = 'all' | 'good' | 'middle' | 'bad';
/** 与 vendure 只有 rating(Int) 对齐：好评 4-5、中评 3、差评 1-2（spec §4.7） */
const RATING_RANGE: Record<TabKey, { ratingMin?: number; ratingMax?: number }> = {
    all: {},
    good: { ratingMin: 4, ratingMax: 5 },
    middle: { ratingMin: 3, ratingMax: 3 },
    bad: { ratingMin: 1, ratingMax: 2 },
};

const { t } = useI18n();
const product = ref<any>(null);
const stats = ref<any>(null);
const reviews = ref<any[]>([]);
const activeTab = ref<TabKey>('all');
const loading = ref(false);
const hasMore = ref(true);
const tabs: Array<{ key: TabKey; labelKey: string }> = [
    { key: 'all', labelKey: 'review.all' },
    { key: 'good', labelKey: 'review.good' },
    { key: 'middle', labelKey: 'review.middle' },
    { key: 'bad', labelKey: 'review.bad' },
];
let skip = 0;
const take = 10;

const variantTextMap = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const v of product.value?.variants || []) {
        map[String(v.id)] = (v.options || []).map((o: any) => o.name).join(' / ');
    }
    return map;
});

/** 分档计数由 reviewStats.ratingDistribution 前端求和，不新增接口（spec §4.3） */
function tabCount(key: TabKey): number {
    const s = stats.value;
    if (!s) return 0;
    if (key === 'all') return s.totalCount || 0;
    const dist: any[] = s.ratingDistribution || [];
    const sum = (from: number, to: number) =>
        dist.filter((d) => d.rating >= from && d.rating <= to).reduce((acc, d) => acc + (d.count || 0), 0);
    if (key === 'good') return sum(4, 5);
    if (key === 'middle') return sum(3, 3);
    return sum(1, 2);
}

onMounted(async () => {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    const slug = page?.options?.slug;
    if (!slug) return;
    try {
        const res: any = await getProduct(slug);
        product.value = res.product;
    } catch (e) {
        console.error(e);
    }
    const pid = product.value?.id;
    if (!pid) return;
    try {
        const s: any = await getReviewStats(String(pid));
        stats.value = s.reviewStats;
    } catch (e) {
        console.error(e);
    }
    await loadData();
});

onReachBottom(() => loadMore());

async function loadData() {
    if (loading.value || !hasMore.value) return;
    const pid = product.value?.id;
    if (!pid) return;
    loading.value = true;
    try {
        const res: any = await getProductReviews(String(pid), { take, skip, ...RATING_RANGE[activeTab.value] });
        const items = res.productReviews?.items || [];
        reviews.value = [...reviews.value, ...items];
        const total = res.productReviews?.totalItems || 0;
        skip += items.length;
        hasMore.value = items.length > 0 && reviews.value.length < total;
    } catch (e: any) {
        uni.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
    loading.value = false;
}

function loadMore() {
    loadData();
}

function switchTab(key: TabKey) {
    if (activeTab.value === key) return;
    activeTab.value = key;
    skip = 0;
    hasMore.value = true;
    reviews.value = [];
    loadData();
}
</script>

<style lang="scss" scoped>
.review-page { display: flex; flex-direction: column; height: 100vh; background: #f5f5f5;
    &__scroll { flex: 1; padding: 0 20rpx; }
    &__footer { padding: 30rpx; text-align: center; }
}
.review-tabs { display: flex; background: #fff; border-bottom: 1rpx solid $border-color; }
.review-tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 25rpx; color: $text-color-secondary;
    &.active { color: $brand-color; font-weight: bold; }
}
.review-summary { display: flex; align-items: center; gap: 16rpx; background: #fff; padding: 16rpx 24rpx;
    &__score { font-size: 28rpx; color: $price-color; font-weight: bold; }
    &__rate { font-size: 24rpx; color: $text-color-secondary; }
}
.footer-text { font-size: 24rpx; color: #999; }
</style>
```

- [x] **Step 2: `pages.json` 注册新页面**

把 `src\pages.json` 的 `pkg-product` 块（75-89 行）改为：

```json
            "pages": [
                {
                    "path": "pages/list",
                    "style": {
                        "navigationBarTitleText": "商品列表",
                        "enablePullDownRefresh": true
                    }
                },
                {
                    "path": "pages/detail",
                    "style": {
                        "navigationBarTitleText": "商品详情"
                    }
                },
                {
                    "path": "pages/evaluate",
                    "style": {
                        "navigationBarTitleText": "商品评价",
                        "enablePullDownRefresh": false
                    }
                }
            ]
```

- [x] **Step 3: 编译门禁**

Run（在 `d:\zhao\vshop`）：`npm run build:h5`
Expected：0 error。若报「未注册页面」，说明 `pages.json` 改漏。

- [x] **Step 4: 提交**

```powershell
git add src/pkg-product/pages/evaluate.vue src/pages.json
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
feat(review): 新增商品评价页（4 分档 + 分页 + 商家回复展开）

- 路由只传 slug，页面内 getProduct 一次拿 id/name/variants[].options[]，
  既作 productReviews 入参又作规格映射表，避免第二个查询
- 分档：全部/好评(4-5)/中评(3)/差评(1-2)；计数由 reviewStats.ratingDistribution 前端求和
- 上拉分页，切换 chip 时 skip 归零并清空重拉
- 条目复用 ReviewItem（图片上限 9）；pages.json 注册 pkg-product/pages/evaluate

涉及：src/pkg-product/pages/evaluate.vue、src/pages.json
```

（`git commit -F` 的文件名以 Step 4 命令里的 `.git/COMMIT_MSG_TMP.txt` 为准，勿沿用上面笔误。）

---

## Task 11: S4 订单评价提交页 + `ORDER_FRAGMENT` 补 `productId` + 两处入口

**Files:**
- Modify: `d:\zhao\vshop\src\api\fragments.ts`（`ORDER_FRAGMENT` 的 `productVariant`，43 行）
- Create: `d:\zhao\vshop\src\pkg-order\pages\order-evaluate.vue`
- Modify: `d:\zhao\vshop\src\pkg-order\pages\orders.vue`（模板 17-20 行区域；script）
- Modify: `d:\zhao\vshop\src\pkg-order\pages\order-detail.vue`（模板 49-55 行；script）
- Modify: `d:\zhao\vshop\src\pages.json`（`pkg-order` 的 `pages`，131-137 行之后）

- [x] **Step 1: `ORDER_FRAGMENT` 的 `productVariant` 补 `productId`**

把 `src\api\fragments.ts` 第 43 行：

```ts
            productVariant { id name enabled stockLevel options { name } customFields { shippingProfileId paymentProfileId } }
```

改为：

```ts
            productVariant { id productId name enabled stockLevel options { name } customFields { shippingProfileId paymentProfileId } }
```

`productId` 是 `createReview` 的必传项（spec §2.4 第 4 行）。

- [x] **Step 2: 新建订单评价提交页**

创建 `src\pkg-order\pages\order-evaluate.vue`：

```vue
<template>
  <view class="oe-page">
    <view v-if="!blocks.length && loaded" class="oe-empty">
      <EmptyState :text="t('review.reviewed')" />
    </view>

    <view v-for="(b, idx) in blocks" :key="b.lineId" class="oe-block">
      <text v-if="blocks.length > 1" class="oe-block__index">{{ t('review.goodsIndex', { n: idx + 1 }) }}</text>
      <view class="oe-goods">
        <VImage :src="b.image" width="140rpx" height="140rpx" />
        <view class="oe-goods__info">
          <text class="oe-goods__name">{{ b.name }}</text>
          <text v-if="b.spec" class="oe-goods__spec">{{ b.spec }}</text>
          <view class="oe-goods__bottom">
            <text class="oe-goods__price">¥{{ (b.price / 100).toFixed(2) }}</text>
            <text class="oe-goods__qty">x{{ b.quantity }}</text>
          </view>
        </view>
      </view>

      <view class="oe-rate">
        <text class="oe-rate__label">{{ t('review.scoreLabel') }}</text>
        <text class="oe-rate__hint">{{ ratingHint(b.rating) }}</text>
        <view class="oe-rate__stars">
          <text
            v-for="n in 5"
            :key="n"
            class="oe-rate__star"
            :class="{ active: n <= b.rating }"
            @click="b.rating = n"
          >★</text>
        </view>
      </view>

      <textarea
        v-model="b.content"
        class="oe-textarea"
        :maxlength="260"
        :placeholder="t('review.contentPlaceholder')"
      />

      <text class="oe-upload-label">{{ t('review.uploadHint') }}</text>
      <ImageUpload v-model="b.images" :max-count="6" />

      <view class="oe-anon">
        <text class="oe-anon__text">{{ t('review.publicProfile') }}</text>
        <switch :checked="!b.isAnonymous" color="#ff6600" @change="b.isAnonymous = !$event.detail.value" />
      </view>
    </view>

    <view v-if="blocks.length" class="oe-bar">
      <button class="oe-submit" :disabled="submitting" @click="onSubmit">
        {{ submitting ? t('review.submit') + '...' : t('review.submit') }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getOrderByCode } from '../../api/queries/order';
import { getMyReviews, createReview } from '../../api/queries/review';
import { useAuthStore } from '../../stores/auth';
import VImage from '../../components/VImage.vue';
import ImageUpload from '../../components/ImageUpload.vue';
import EmptyState from '../../components/EmptyState.vue';

interface Block {
    lineId: string;
    productId: string;
    variantId: string;
    name: string;
    spec: string;
    image: string;
    price: number;
    quantity: number;
    rating: number;
    content: string;
    images: string[];
    isAnonymous: boolean;
}

const { t } = useI18n();
const auth = useAuthStore();
const blocks = ref<Block[]>([]);
const loaded = ref(false);
const submitting = ref(false);

/** 星级 → 档位文案，与 usemall 一致：1 差评、2/3 中评、4/5 好评 */
function ratingHint(rating: number): string {
    if (rating <= 1) return t('review.bad');
    if (rating <= 3) return t('review.middle');
    return t('review.good');
}

onMounted(async () => {
    // 先解析 code，再判登录：要求登录时能把 code 带进 redirect，登录后回到本单
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    const code = page?.options?.code;
    if (!code) return;
    if (!auth.isLoggedIn) {
        auth.requireLogin('/pkg-order/pages/order-evaluate?code=' + code);
        return;
    }

    const orderRes: any = await getOrderByCode(code);
    const order = orderRes.orderByCode;
    if (!order) return;

    // 已评 orderLine 集合：myReviews 全量返回，用 orderLineId 建 Set
    const reviewed = new Set<string>();
    try {
        const myRes: any = await getMyReviews();
        for (const r of myRes.myReviews || []) {
            if (r.orderLineId && r.status !== 'deleted') reviewed.add(String(r.orderLineId));
        }
    } catch (e) {
        console.error(e);
    }

    blocks.value = (order.lines || [])
        .filter((line: any) => !reviewed.has(String(line.id)))
        .map((line: any) => ({
            lineId: String(line.id),
            productId: String(line.productVariant?.productId || ''),
            variantId: String(line.productVariant?.id || ''),
            name: line.productVariant?.name || '',
            spec: (line.productVariant?.options || []).map((o: any) => o.name).join(' / '),
            image: line.featuredAsset?.preview || '',
            price: line.unitPriceWithTax || 0,
            quantity: line.quantity || 1,
            rating: 5,
            content: '',
            images: [],
            isAnonymous: false,
        }))
        .filter((b: Block) => !!b.productId);
    loaded.value = true;
});

async function onSubmit() {
    if (submitting.value) return;
    // 1) 前端拦截必填（vendure createReview 的 assertContent 要求 content 非空）
    for (const b of blocks.value) {
        if (!b.content.trim()) {
            uni.showToast({ title: t('review.contentRequired'), icon: 'none' });
            return;
        }
    }
    // 2) 二次确认
    const confirmed = await new Promise<boolean>((resolve) => {
        uni.showModal({
            title: t('review.submit'),
            content: t('review.title'),
            success: (r: any) => resolve(!!r.confirm),
            fail: () => resolve(false),
        });
    });
    if (!confirmed) return;

    submitting.value = true;
    const attempted = blocks.value.length;
    const failed: Block[] = [];
    const errors: string[] = [];
    for (const b of blocks.value) {
        try {
            await createReview({
                productId: b.productId,
                orderLineId: b.lineId,
                variantId: b.variantId,
                rating: b.rating,
                content: b.content.trim(),
                images: b.images,
                isAnonymous: b.isAnonymous,
            });
        } catch (e: any) {
            // graphql-request 的 ClientError 把后端 UserInputError 放在 response.errors[0].message
            const msg = String(e?.response?.errors?.[0]?.message || e?.message || e);
            // 后端对「同一 orderLine 已评过」抛 UserInputError('You have already reviewed this order line')：
            // 视为已评，从待提交表单移除，不计入失败
            if (/already reviewed/i.test(msg)) continue;
            errors.push(msg);
            failed.push(b);
        }
    }
    submitting.value = false;

    if (failed.length) {
        blocks.value = failed;
        // 全部失败 → toast 后端错误原文；部分失败 → toast 失败条数（spec §5）
        const title = failed.length === attempted && errors.length
            ? errors[0]
            : t('review.partialFailed', { n: failed.length });
        uni.showToast({ title, icon: 'none' });
        return;
    }
    uni.showToast({ title: t('review.submitted'), icon: 'none' });
    setTimeout(() => uni.navigateBack(), 1200);
}
</script>

<style lang="scss" scoped>
.oe-page { padding: 20rpx 20rpx 140rpx; }
.oe-empty { padding-top: 120rpx; }
.oe-block { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx;
    &__index { font-size: 24rpx; color: $text-color-secondary; display: block; margin-bottom: 12rpx; }
}
.oe-goods { display: flex; gap: 16rpx;
    &__info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
    &__name { font-size: 26rpx; color: $text-color; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    &__spec { font-size: 22rpx; color: #999; margin-top: 4rpx; }
    &__bottom { display: flex; justify-content: space-between; align-items: center; }
    &__price { font-size: 28rpx; color: $price-color; }
    &__qty { font-size: 24rpx; color: #999; }
}
.oe-rate { display: flex; align-items: center; gap: 16rpx; margin-top: 20rpx;
    &__label { font-size: 26rpx; color: $text-color; }
    &__hint { font-size: 24rpx; color: $brand-color; }
    &__stars { display: flex; gap: 8rpx; margin-left: auto; }
    &__star { font-size: 40rpx; color: #ddd; &.active { color: $price-color; } }
}
.oe-textarea { width: 100%; min-height: 180rpx; margin-top: 16rpx; padding: 16rpx; font-size: 26rpx; background: #f7f7f7; border-radius: $radius-sm; box-sizing: border-box; }
.oe-upload-label { display: block; margin: 16rpx 0 8rpx; font-size: 24rpx; color: $text-color-secondary; }
.oe-anon { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx;
    &__text { font-size: 26rpx; color: $text-color; }
}
.oe-bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 16rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fff; }
.oe-submit { width: 100%; height: 84rpx; font-size: 30rpx; border-radius: $radius-md; border: none; background: $brand-color; color: #fff; }
</style>
```

- [x] **Step 3: `pages.json` 注册订单评价页**

在 `src\pages.json` 的 `pkg-order` 块里，`pages/invoices`（131-137 行）之后追加：

```json
                ,
                {
                    "path": "pages/order-evaluate",
                    "style": {
                        "navigationBarTitleText": "发表评价"
                    }
                }
```

（`pkg-order` 的 `pages` 数组末尾原为 `pages/invoices` 项，注意补好逗号。）

- [x] **Step 4: `orders.vue` 加「我要评价」入口**

在 `orders.vue` 模板的 `order-card__footer`（17-20 行）之后、`</view>`（21 行，`order-card` 闭合）之前插入：

```html
        <view class="order-card__actions" v-if="canReview(order) || isFullyReviewed(order)">
          <button v-if="canReview(order)" class="order-card__review-btn" @click.stop="goEvaluate(order.code)">{{ t('review.myOrderReviewBtn') }}</button>
          <text v-else class="order-card__reviewed">{{ t('review.reviewed') }}</text>
        </view>
```

在 `orders.vue` 的 script 里，`orders` 声明之后追加状态：

```ts
const reviewedLineIds = ref<Set<string>>(new Set());
```

import 区追加：

```ts
import { useI18n } from 'vue-i18n';
import { getMyReviews } from '../../api/queries/review';
import { useAuthStore } from '../../stores/auth';
```

`<script setup>` 里追加（与既有 `const orders = ref<any[]>([]);` 同层）：

```ts
const { t } = useI18n();
const auth = useAuthStore();
```

把 `onShow(() => { if (orders.value.length === 0) loadData(); });` 替换为：

```ts
onShow(() => {
    if (orders.value.length === 0) loadData();
    loadReviewedLines();
});

/** 拉一次我的评价，用 orderLineId 建 Set，供入口按钮判定未评/已评 */
async function loadReviewedLines() {
    if (!auth.isLoggedIn) {
        reviewedLineIds.value = new Set();
        return;
    }
    try {
        const res: any = await getMyReviews();
        const set = new Set<string>();
        for (const r of res.myReviews || []) {
            if (r.orderLineId && r.status !== 'deleted') set.add(String(r.orderLineId));
        }
        reviewedLineIds.value = set;
    } catch (e) {
        console.error(e);
    }
}

/** 可评价：订单已送达/已完成，且存在未评 line */
function canReview(order: any): boolean {
    if (!auth.isLoggedIn) return false;
    if (!['Delivered', 'Completed'].includes(order?.state)) return false;
    return (order?.lines || []).some((l: any) => !reviewedLineIds.value.has(String(l.id)));
}

/** 全部已评：状态到位但没有未评 line */
function isFullyReviewed(order: any): boolean {
    if (!auth.isLoggedIn) return false;
    if (!['Delivered', 'Completed'].includes(order?.state)) return false;
    return (order?.lines || []).length > 0 && (order?.lines || []).every((l: any) => reviewedLineIds.value.has(String(l.id)));
}

function goEvaluate(code: string) {
    uni.navigateTo({ url: '/pkg-order/pages/order-evaluate?code=' + code });
}
```

样式追加（`orders.vue` 的 `<style>` 末尾）：

```scss
.order-card__actions { display: flex; justify-content: flex-end; align-items: center; margin-top: 16rpx; }
.order-card__review-btn { height: 64rpx; line-height: 64rpx; padding: 0 32rpx; font-size: 26rpx; border-radius: 32rpx; border: 1rpx solid $brand-color; background: #fff; color: $brand-color; }
.order-card__reviewed { font-size: 24rpx; color: #999; }
```

- [x] **Step 5: `order-detail.vue` 加同一入口**

在 `order-detail.vue` 的操作区（49-55 行）的最后一个按钮之后追加：

```html
      <button v-if="canReview" class="action-btn" @click="goEvaluate">{{ t('review.myOrderReviewBtn') }}</button>
      <text v-else-if="isFullyReviewed" class="action-btn action-btn--ghost">{{ t('review.reviewed') }}</text>
```

script 里追加 import：

```ts
import { useI18n } from 'vue-i18n';
import { getMyReviews } from '../../api/queries/review';
import { useAuthStore } from '../../stores/auth';
```

在既有 `const order = ref<any>(null);` 之后追加：

```ts
const { t } = useI18n();
const auth = useAuthStore();
const reviewedLineIds = ref<Set<string>>(new Set());
```

在既有 computed 组（72-76 行）之后追加：

```ts
const canReview = computed(() => {
    if (!auth.isLoggedIn) return false;
    if (!['Delivered', 'Completed'].includes(order.value?.state)) return false;
    return (order.value?.lines || []).some((l: any) => !reviewedLineIds.value.has(String(l.id)));
});
const isFullyReviewed = computed(() => {
    if (!auth.isLoggedIn) return false;
    if (!['Delivered', 'Completed'].includes(order.value?.state)) return false;
    const lines = order.value?.lines || [];
    return lines.length > 0 && lines.every((l: any) => reviewedLineIds.value.has(String(l.id)));
});
```

在 `onMounted`（77-86 行）的**末尾**追加（放在既有两个 `try` 之后）：

```ts
    await loadReviewedLines();
```

新增函数：

```ts
async function loadReviewedLines() {
    if (!auth.isLoggedIn) return;
    try {
        const res: any = await getMyReviews();
        const set = new Set<string>();
        for (const r of res.myReviews || []) {
            if (r.orderLineId && r.status !== 'deleted') set.add(String(r.orderLineId));
        }
        reviewedLineIds.value = set;
    } catch (e) {
        console.error(e);
    }
}
function goEvaluate() {
    uni.navigateTo({ url: '/pkg-order/pages/order-evaluate?code=' + order.value.code });
}
```

- [x] **Step 6: 编译门禁**

Run（在 `d:\zhao\vshop`）：`npm run build:h5`
Expected：0 error。

- [x] **Step 7: 提交**

```powershell
git add src/api/fragments.ts src/pkg-order/pages/order-evaluate.vue src/pkg-order/pages/orders.vue src/pkg-order/pages/order-detail.vue src/pages.json
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
feat(review): 新增订单评价提交页 + 两处「我要评价」入口

- ORDER_FRAGMENT 的 productVariant 补 productId（createReview 必传）
- 新页一单多商品每商品一块：商品卡 + 宝贝评分(默认5星) + textarea(260) + ImageUpload(6) + 匿名开关(默认公开)
- 内容空白前端拦截（vendure assertContent 要求非空）；showModal 二次确认后串行提交；
  部分失败保留失败块，全部成功 toast「审核通过后展示」并返回
- 入口：orders 卡片底部与 order-detail 操作区，条件为已送达/已完成且存在未评 line；
  全部已评显示「已评价」；未登录不展示

涉及：src/api/fragments.ts、src/pkg-order/pages/{order-evaluate,orders,order-detail}.vue、src/pages.json
```

---

## Task 12: S5 我的评价页 + 个人中心入口

**Files:**
- Create: `d:\zhao\vshop\src\pkg-user\pages\my-reviews.vue`
- Modify: `d:\zhao\vshop\src\pkg-user\pages\profile.vue`（菜单 11 行之后；`navTo` 37 行）
- Modify: `d:\zhao\vshop\src\pages.json`（`pkg-user` 的 `pages`，258-263 行之后）

- [x] **Step 1: 新建我的评价页**

创建 `src\pkg-user\pages\my-reviews.vue`：

```vue
<template>
  <view class="mr-page">
    <view class="mr-tabs">
      <text
        v-for="tab in tabs"
        :key="tab.key"
        class="mr-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >{{ t(tab.labelKey) }}（{{ tabCount(tab.key) }}）</text>
    </view>

    <view v-for="item in visibleItems" :key="item.review.id" class="mr-item">
      <view class="mr-item__head">
        <VImage :src="item.product?.featuredAsset?.preview || ''" width="120rpx" height="120rpx" />
        <view class="mr-item__info">
          <text class="mr-item__name">{{ item.product?.name || '' }}</text>
          <view class="mr-item__meta">
            <text class="mr-item__stars">{{ starText(item.review.rating) }}</text>
            <text class="mr-item__date">{{ dateText(item.review.createdAt) }}</text>
          </view>
        </view>
        <text class="mr-item__status" :class="'mr-item__status--' + item.review.status">{{ statusText(item.review.status) }}</text>
      </view>
      <text class="mr-item__content">{{ item.review.content }}</text>
    </view>

    <EmptyState v-if="!loading && visibleItems.length === 0" :text="t('review.empty')" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getMyReviews } from '../../api/queries/review';
import { getProductsByIds } from '../../api/queries/product';
import { useAuthStore } from '../../stores/auth';
import VImage from '../../components/VImage.vue';
import EmptyState from '../../components/EmptyState.vue';

type TabKey = 'all' | 'pending' | 'approved' | 'rejected';

const { t } = useI18n();
const auth = useAuthStore();
const items = ref<Array<{ review: any; product: any }>>([]);
const loading = ref(false);
const activeTab = ref<TabKey>('all');
const tabs: Array<{ key: TabKey; labelKey: string }> = [
    { key: 'all', labelKey: 'review.all' },
    { key: 'pending', labelKey: 'review.statusPending' },
    { key: 'approved', labelKey: 'review.statusApproved' },
    { key: 'rejected', labelKey: 'review.statusRejected' },
];

const visibleItems = computed(() =>
    activeTab.value === 'all' ? items.value : items.value.filter((i) => i.review.status === activeTab.value),
);

function tabCount(key: TabKey): number {
    return key === 'all' ? items.value.length : items.value.filter((i) => i.review.status === key).length;
}

function statusText(status: string): string {
    if (status === 'pending') return t('review.statusPending');
    if (status === 'approved') return t('review.statusApproved');
    if (status === 'rejected') return t('review.statusRejected');
    return status;
}

function starText(rating: number): string {
    const r = Math.min(5, Math.max(0, Number(rating) || 0));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function dateText(raw: string): string {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

onMounted(async () => {
    if (!auth.isLoggedIn) {
        auth.requireLogin('/pkg-user/pages/my-reviews');
        return;
    }
    loading.value = true;
    try {
        const res: any = await getMyReviews();
        // myReviews 无 status 过滤且未剔除 deleted，前端自行剔除
        const list = (res.myReviews || []).filter((r: any) => r.status !== 'deleted');
        const ids = Array.from(new Set(list.map((r: any) => String(r.productId)).filter(Boolean)));
        // getProductsByIds 查不到的 id 不返回 → 该条商品信息缺失时跳过
        const products = ids.length ? await getProductsByIds(ids) : [];
        const map = new Map<string, any>(products.map((p: any) => [String(p.id), p]));
        items.value = list
            .map((r: any) => ({ review: r, product: map.get(String(r.productId)) }))
            .filter((i: any) => !!i.product);
    } catch (e: any) {
        uni.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
    loading.value = false;
});
</script>

<style lang="scss" scoped>
.mr-page { padding: 0 20rpx 40rpx; }
.mr-tabs { display: flex; background: #fff; border-radius: $radius-md; margin: 20rpx 0; }
.mr-tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 24rpx; color: $text-color-secondary;
    &.active { color: $brand-color; font-weight: bold; }
}
.mr-item { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 20rpx;
    &__head { display: flex; gap: 16rpx; align-items: flex-start; }
    &__info { flex: 1; }
    &__name { font-size: 26rpx; color: $text-color; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    &__meta { display: flex; align-items: center; gap: 12rpx; margin-top: 8rpx; }
    &__stars { font-size: 22rpx; color: $price-color; letter-spacing: 2rpx; }
    &__date { font-size: 22rpx; color: #999; }
    &__status { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 20rpx; flex-shrink: 0;
        &--pending { color: $price-color; background: #fff3e6; }
        &--approved { color: #07c160; background: #eafaf0; }
        &--rejected { color: #e34d59; background: #fdecee; }
    }
    &__content { display: block; margin-top: 12rpx; font-size: 26rpx; color: $text-color-secondary; line-height: 1.5; }
}
</style>
```

- [x] **Step 2: `profile.vue` 菜单插入「我的评价」**

在 `profile.vue` 第 11 行（`<view class="menu-item" @click="navTo('/pkg-order/pages/orders')"><text>我的订单</text><text>></text></view>`）之后插入：

```html
      <view class="menu-item" @click="navTo('/pkg-user/pages/my-reviews')"><text>我的评价</text><text>></text></view>
```

- [x] **Step 3: `pages.json` 注册我的评价页**

在 `src\pages.json` 的 `pkg-user` 块里，`pages/invoice-titles` 项（258-263 行）之后追加：

```json
                ,
                {
                    "path": "pages/my-reviews",
                    "style": {
                        "navigationBarTitleText": "我的评价"
                    }
                }
```

- [x] **Step 4: 编译门禁**

Run（在 `d:\zhao\vshop`）：`npm run build:h5`
Expected：0 error。

- [x] **Step 5: 提交**

```powershell
git add src/pkg-user/pages/my-reviews.vue src/pkg-user/pages/profile.vue src/pages.json
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
feat(review): 新增「我的评价」页 + 个人中心入口

- 4 tab：全部/待审核/已通过/已驳回，计数前端计算
- myReviews 全量返回且未剔 deleted → 前端剔除；去重 productId 后 getProductsByIds
  批量补商品名与主图，查不到的 id 跳过该条
- 状态标签：pending 警示色 / approved 成功色 / rejected 危险色（状态即主要编码变量）
- 只读：不提供修改/删除/追评入口；pages.json 注册 pkg-user/pages/my-reviews

涉及：src/pkg-user/pages/{my-reviews,profile}.vue、src/pages.json
```

---

## Task 13: 端到端验收（7 张截图）+ 手册 v1.6 + 部署

**Files:**
- Modify: `d:\zhao\vshop\web-admin\scripts\_vshop_usemall_shots.mjs`
- Modify: `d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\README.md`

- [x] **Step 1: 截图脚本补评价体系 5 张图**

在任务 4 已加的单规格块之后，追加评价体系探针。用 Step 2 查到的真实 `slug` / `code` / 账号替换 `EVAL_SLUG` 与 `ORDER_CODE`，不要留占位：

```js
  // S2 详情页评价区（在详情页块内追加：进详情页后直接截）
  //   —— 复用上方 detail 详情页导航，无需重复 goto
  await shot('detail-review-block.png');

  // S3 商品评价页 · 全部 / 差评
  await page.goto(`${BASE}/#/pkg-product/pages/evaluate?slug=${EVAL_SLUG}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot('review-list-all.png');
  await page.getByText('差评', { exact: false }).first().click();
  await page.waitForTimeout(1200);
  await shot('review-list-bad.png');

  // S4 订单评价页（需登录）
  await page.goto(`${BASE}/#/pkg-order/pages/order-evaluate?code=${ORDER_CODE}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot('order-evaluate.png');

  // S5 我的评价页（需登录）
  await page.goto(`${BASE}/#/pkg-user/pages/my-reviews`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot('my-reviews.png');
```

`detail-review-block.png` 必须在**未打开 SKU 弹层**的状态下截（弹层打开时评价区被遮挡）。若 `detail-page.png` 的截图时机已打开弹层，把评价区这张放在进入详情页后、点击规格入口之前。

- [x] **Step 2: 备齐验收前置数据（一次性运维动作，不落库脚本）**

1. **评价数据**：至少 6 条已审核评价覆盖 5/4/3/2/1 星。用 QA 账号走 shop-api：下单 → 管理员发货/送达 → `createReview` → `approveReview`。至少 1 条带 `images`，至少 1 条带 `reply`（管理员回复），至少 1 条 `isAnonymous: true`。
2. **可评价订单**：一个 `state = Delivered` 且含 ≥2 个 line 的订单（验证一单多商品分块），取其 `code` 作为 `ORDER_CODE`。
3. **照片可评价账号**：`qa-vshop-manual@local.dev` / `Qa123456`（沿用拼团页验收既有账号）。

Run（在 `d:\zhao\vshop`）验证前置数据齐备：

```powershell
python web-admin/scripts/_smoke_usemall_align.py
```

把探针查询替换为：

```graphql
query {
  search(input: { term: "", groupByProduct: true, take: 1 }) {
    items { productId slug productName }
  }
}
```

再用返回的 `productId` 跑 `reviewStats(productId: "<id>") { totalCount goodRate averageRating ratingDistribution { rating count } }`，Expected：`totalCount >= 6` 且 `ratingDistribution` 中 1–5 星计数均 > 0。

- [x] **Step 3: API 回归（spec §7.2 的 7 个用例）**

在 `d:\zhao\vshop` 用同一个探针脚本，或直接 curl 生产 shop-api，逐条核对：

| 用例 | 期望 |
|---|---|
| `productReviews(productId, {ratingMin:4, ratingMax:5})` | 只返回 4-5 星、`status=approved`、`parentId=null` 的主评 |
| `productReviews(productId, {ratingMin:3, ratingMax:3})` | 只返回 3 星 |
| `productReviews(productId)` | 行为与改动前完全一致（条数 = `reviewStats.totalCount`） |
| `productReviews(productId, {ratingMin:9})` | 忽略越界参数，退化为不筛选 |
| `createReview` 正常路径 | 返回 `status = pending` |
| `createReview` 重复同一 `orderLineId` | `UserInputError`（含 `already reviewed`） |
| `createReview` 订单未 Delivered | `UserInputError('Order must be delivered before reviewing')` |

Expected：7/7 通过。**`productReviews(productId)` 的条数必须与 `reviewStats.totalCount` 相等**——这是「既有行为未被破坏」的关键交叉验证。

- [x] **Step 4: 采图并逐张核对断言**

Run（在 `d:\zhao\vshop`）：

```powershell
node web-admin/scripts/_vshop_usemall_shots.mjs
node web-admin/scripts/_vshop_usemall_shots.mjs --user qa-vshop-manual@local.dev --pwd 'Qa123456'
```

Expected：`web-admin\docs\superpowers\manual\vshop-usemall-alignment\assets\` 下按 spec §7.1 断言表逐张核对：

| 文件 | 断言 |
|---|---|
| `detail-sku-sheet.png` | 规格组标题带 `(N)` 计数（多规格商品无图 → 灰底属数据缺失，不作为断言） |
| `detail-sku-sheet-single.png` | 单规格弹层：无规格组标题、已选行为变体名、头部缩略图非灰底 |
| `detail-single-spec.png` | 单规格详情页：规格区整段消失；已选行显示变体名，无「请选择规格」 |
| `detail-review-block.png` | 评价区在详情富文本**之前**；标题计数、平均分、好评率、2 条评价齐全 |
| `review-list-all.png` | 4 个 chip 计数正确（好评+中评+差评 = 全部） |
| `review-list-bad.png` | 列表随档变化，计数与列表条数自洽 |
| `order-evaluate.png` | 多商品块、星级、图片、匿名开关齐全 |
| `my-reviews.png` | 三种状态标签各自配色正确 |

任一断言不满足 → 回到对应 Task 修，**不要**先改断言或改文档。

- [x] **Step 5: 手册升 v1.6**

在 `web-admin\docs\superpowers\manual\vshop-usemall-alignment\README.md` 里：
1. 顶部版本号升到 **v1.6**，补一行变更摘要「第二轮：SKU 弹层收口 + 评价体系（详情页评价区/商品评价页/订单评价页/我的评价页）」。
2. 新增一节「评价体系」，把 7 张截图按 spec §7.1 的断言表落成表格，并写明：`autoApprove=false` → 新评价为 `pending`，**提交后 C 端商品页看不到属预期**，需管理员在后台审核通过（写进「常见问题」）。

- [x] **Step 6: 提交**

截图产物落在 `assets/` 子目录（`_vshop_usemall_shots.mjs:52`），路径不要漏 `assets/`：

```powershell
git add web-admin/scripts/_vshop_usemall_shots.mjs web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md web-admin/docs/superpowers/manual/vshop-usemall-alignment/assets/
git commit -F .git/COMMIT_MSG_TMP.txt
```

`.git/COMMIT_MSG_TMP.txt`：

```
test(review): 第二轮端到端验收——SKU 收口 + 评价体系 7 张手机视口截图

- 截图脚本补评价体系 5 张（详情评价区/评价页全部与差评/订单评价页/我的评价页）
- 手册升 v1.6，新增「评价体系」节并写明 pending 审核流的预期表现
- API 回归 7 用例全通过；productReviews 不传分档时条数 == reviewStats.totalCount

涉及：web-admin/scripts/_vshop_usemall_shots.mjs、web-admin/docs/superpowers/manual/vshop-usemall-alignment/
```

- [x] **Step 7: 部署（先后端，后前端）**

**后端 vendure（必须先上线，否则前端传 `ratingMin` 会被 GraphQL 校验拒绝）**：

```powershell
ssh joho "cd /opt/vendure && git pull --ff-only && pm2 restart vendure vendure-worker"
```

Expected：`git pull` 拉到 Task 5/6 的两个提交；`pm2 restart` 后 `pm2 list` 中 `vendure` 与 `vendure-worker` 均为 `online`。随后验证：

```powershell
python web-admin/scripts/_smoke_usemall_align.py
```

Expected：`productReviews(productId, {ratingMin: 4, ratingMax: 5})` 生效（即端点上真的新 SDL 已加载）。若仍报 `Cannot query field "ratingMin"`，说明 `lib/` 未同步到服务器或未重启，回查 Task 6 Step 7。

**前端 vshop（本地构建，服务器只解压）**：

```powershell
npm run build:h5
```

再按第一轮既有流程打包上传（本地 `tar` → `scp` → 服务器站点目录解压，沿用记忆中的「1Panel openresty 站点真实目录」路径）：

```powershell
tar -czf dist-h5.tar.gz -C dist/build/h5 .
scp dist-h5.tar.gz joho:/tmp/
ssh joho "cd /opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index && tar -xzf /tmp/dist-h5.tar.gz && rm -f /tmp/dist-h5.tar.gz"
```

Expected：线上 `https://e.joho.cn` 详情页出现评价区；**不在服务器上执行任何构建命令**。

- [x] **Step 8: 收尾推送**

```powershell
git push origin master
```

在 `d:\zhao\vendure` 也执行一次 `git push`（Task 5/6 的提交）。Expected：两个仓库 `master` 与 `origin/master` 一致，工作树干净。

---

## 附：Task 依赖与执行顺序

```
V1: Task 1 → 2 → 3 → 4                      （零后端；Task 4 Step 3 会单独部署一次前端）
V2: Task 5 → 6 →（部署后端）→ 7 → 8 → 9 → 10 → 11 → 12 → 13（再部署一次前端）
```

- **V1 与 V2 各部署一次前端**：截图脚本打的生产站（`SITE_URL` 默认 `https://e.joho.cn`），验收必须在代码上线之后做；Task 4 Step 3 部署 V1，Task 13 Step 7 部署含 V2 的最终版。
- Task 6 完成即可部署后端（Task 13 Step 7 的后半段），前端可随后上线，避免前端先上线取不到分档。
- Task 8（ReviewItem）是 Task 9 / 10 的前置。
- Task 7 的 `review.ts` 是 Task 9 / 11 / 12 的前置。

---

## 执行结论（2026-09-30 收口）

- **轮次**：第二轮 usemall 对齐（S1 SKU 弹层收口 + S2–S6 评价体系），13 个 Task 全部完成。
- **提交（vshop）**：T1 `447b103`、T2 `a69304e`、T3 `84bb90b`、T4 `f2fc0b7`、T7 `9256f77`、T8 `8caa93c`、T9 `f979ff7`、T10 `e1146cf`、T11 `3e547ff`、T12 `b5d79a9`、T13 `b333888`。
- **提交（vendure）**：T5 `a3bcd91a6`（先写失败用例，红）、T6 `37a485a04`（实现 `ratingMin/ratingMax` 分档筛选 + 重建 `lib`，绿）。
- **验证手段**：
  - 编译门禁：vshop `npm run build:h5` 退出码 0（2026-09-30 复跑）。
  - 后端 e2e：`packages/review-plugin` `npm run e2e` → **9 passed**（含新增用例「分档筛选：ratingMin/ratingMax 单边与区间生效；越界与倒挂忽略」）。
  - 只读探针：`python web-admin/scripts/_smoke_usemall_align.py` → 全部断言通过。
  - 手机视口截图（390×844 / dpr=2，打生产站 `https://e.joho.cn`）：Task 4 四张（`detail-page` / `detail-sku-sheet` / `detail-single-spec` / `detail-sku-sheet-single`）+ Task 13 七张（`detail-review-block` / `review-list-all` / `review-list-bad` / `orders-list` / `orders-list-review-entry` / `order-evaluate` / `my-reviews`），断言表见手册 §4。
- **部署**：本轮含后端改动，顺序为「先后端 vendure → 再 H5」。线上站点 assets 已含 `ReviewItem.*.js` / `review.*.js` / `pkg-product-pages-evaluate.*.js` / `pkg-order-pages-order-evaluate.*.js` / `pkg-user-pages-my-reviews.*.js`，即第二轮产物已上线（本结论为文档回填，未再产生源码改动，故无需重新部署）。
- **遗留项**（同步登记于 `docs/superpowers/BACKLOG.md`）：
  - 多规格商品（`fresh-crayfish` / `xianju-bayberry`）SKU 弹层缩略图灰底属**数据缺失**（商品级与变体级 `featuredAsset` 均为 null），补图后即正常，非代码问题；断言 3 改用有图的单规格商品（温泉门票）取证。
  - 评价「有图 / 标签」筛选需扩 shop SDL，延后。
  - 评价追评 / 有用计数 / 修改删除 / 视频，明确不做（参照物 usemall 评价页无这些元素）。
  - 后端 `autoApprove=false` → 新评价为 `pending`，提交后 C 端商品页看不到属**预期**，需管理员后台审核通过。
- **计划复选框**：71 个 `- [ ] **Step` 于 2026-09-30 一次性回勾 —— 实现与验收均已由上述提交交付，此前仅遗漏勾选动作。
