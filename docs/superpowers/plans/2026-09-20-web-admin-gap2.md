# web-admin 查遗补漏（P0 核销价 + F2~F5）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复核销页金额恒 0 的确定性 bug（P0），并补齐优惠券启停确认 / 商品审批强制归类 / 图片库选图落地 / POS 收款二次校验（F2~F5）。

**Architecture:** P0 为 vendure `cjk-plugin` 后端**一个字段名**修复（`lineTotalWithTax`→`linePriceWithTax`）+ 前端金额正常显示；F2~F5 均为 web-admin 前端小改。所有改动彼此独立、互不依赖，可逐一 commit。

**Tech Stack:** vendure NestJS `cjk-plugin`；web-admin = uni-app H5 (Vue3) + graphql-request + TS。

**Spec:** `docs/superpowers/specs/2026-09-20-web-admin-gap2-design.md`（已 commit 5054017，用户批准）

**执行方式：** 用户已批准设计并指示推进 → 本计划在会话内 inline 执行（executing-plans 风格，每任务完成即 commit）。

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption-code.service.ts:455` | P0 后端：`lineTotalWithTax`→`linePriceWithTax` |
| `web-admin/src/pages/pickup/redeem/index.vue:38` | P0 前端：金额正常显示 |
| `web-admin/src/pages/coupon/index.vue` | F2：`onToggle` 二次确认 |
| `web-admin/src/apis/marketplace.ts` | F3：`fetchPendingProducts` 补 `platformCategoryId` |
| `web-admin/src/pages/platform/product-approval/index.vue` | F3：待审显示分类 + 设置分类 + 通过拦截 |
| `web-admin/src/pages/media/library/index.vue` | F4：多选 + 复制 URL |
| `web-admin/src/pages/pos/index.vue` | F5：行小计 + 收款二次确认 |
| `web-admin/src/static/manual/shots/*.png` | 各功能 390×844(dpr=2) 截图 |

---

## Task 1: P0 核销价修复

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\redemption\redemption-code.service.ts:455`
- Modify: `web-admin/src/pages/pickup/redeem/index.vue:38`

- [ ] **Step 1: 后端字段修复**

`redemption-code.service.ts` L455 将 `l.lineTotalWithTax` 改为 `l.linePriceWithTax`（Vendure OrderLine 正确字段，与 shop-plugin 一致）：

```ts
return {
    name: spec ? `${base} ${spec}` : base,
    quantity: Number(l.quantity ?? 0),
    lineTotalWithTax: Math.round(Number(l.linePriceWithTax ?? 0)),
};
```

- [ ] **Step 2: 构建 cjk-plugin**

Run: `cd d:\zhao\vendure && pnpm --filter cjk-plugin run build`
Expected: 编译通过无错。

- [ ] **Step 3: 前端金额显示（现状已正确消费 lineTotalWithTax，无需改）**

`pages/pickup/redeem/index.vue` L38 已用 `fenToYuan(ln.lineTotalWithTax)` 渲染，后端修好后即正常显示 ¥xx.xx。确认无其它消费处需改。

- [ ] **Step 4: 部署后端（git push + ssh pull + pm2 restart）**

部署命令按本项目 vendure 仓库铁律（git push → 服务器 pull → pm2 restart cjk/vendure 相关进程）。

- [ ] **Step 5: Commit 后端**

```bash
git add packages/cjk-plugin/src/redemption/redemption-code.service.ts
git commit -m "fix(cjk): 核销清单行金额读 linePriceWithTax（原 lineTotalWithTax 不存在恒为0）"
```

---

## Task 2: 优惠券启停二次确认

**Files:**
- Modify: `web-admin/src/pages/coupon/index.vue`

- [ ] **Step 1: 定位 `onToggle`**

找到 `onToggle(c)` 实现，当前直接执行状态切换逻辑。

- [ ] **Step 2: 加二次确认**

将 `onToggle` 改为先 `uni.showModal`：

```ts
function onToggle(c: any) {
  const enable = /* 目标状态：当前停用则启用 */;
  uni.showModal({
    title: enable ? '确认启用' : '确认停用',
    content: `${enable ? '启用' : '停用'}后立即对所有顾客生效，是否继续？`,
    confirmText: '确认',
    cancelText: '取消',
    success: (r) => { if (r.confirm) doToggle(c); },
  });
}
```
（`doToggle` 为原切换逻辑抽出的函数；`busy` 防重逻辑保留。）

- [ ] **Step 3: 校验**

本地 H5：coupon 列表点启用/停用 → 弹确认；取消不切换；确认后状态变化、接口调用成功。

- [ ] **Step 4: Commit**

```bash
git add src/pages/coupon/index.vue
git commit -m "feat(admin): 优惠券启停增加二次确认"
```

---

## Task 3: 商品审批「通过前必须归类」

**Files:**
- Modify: `web-admin/src/apis/marketplace.ts`
- Modify: `web-admin/src/pages/platform/product-approval/index.vue`

- [ ] **Step 1: `fetchPendingProducts` 补 platformCategoryId**

`apis/marketplace.ts` 查询加 `platformCategoryId`，返回类型与映射同步：

```ts
// 接口
export interface MarketplaceApprovalItem {
  id: string;
  name: string;
  marketplaceStatus: string | null;
  rejectReason: string | null;
  platformCategoryId?: string | null;   // ← 新增
}

// query 片段
marketplacePendingProducts { id translations { languageCode name } customFields { marketplaceStatus rejectReason platformCategoryId } }

// map 内
platformCategoryId: cf.platformCategoryId ?? null,
```

- [ ] **Step 2: 待审卡片显示分类 + 设置分类 + 通过拦截**

`pages/platform/product-approval/index.vue`：
- `marketplacePendingProducts` 返回的 Product 类型若直接带 `platformCategoryId`，需在 `fetchPendingProducts` 返回 `MarketplaceApprovalItem` 后，于页面待审卡片读取 `p.platformCategoryId`。
- 待审卡片 `meta-row` 增加分类行（复用 `collTree` + `catName`）：
  `平台分类：{{ p.platformCategoryId ? catName(p.platformCategoryId) : '待归类' }}`（待归类加 `.todo` 样式）。
- 待审卡片「设置分类」按钮：复用已过审的 `onPickCategory(p)`（需确认该函数仅依赖 `p.platformCategoryId`，与 tab 无关）。
- `onApprove(p)` 前置校验：

```ts
if (!p.platformCategoryId) {
  uni.showToast({ title: '请先设置平台分类', icon: 'none' });
  return;
}
await approveProduct(p.id);
load();
```
请先点「设置分类」完成后更新 `p.platformCategoryId`（本地或重新 load）。

- [ ] **Step 3: 校验**

本地 H5（superadmin 切平台）：待审商品无分类点「通过」→ 提示；设分类后再通过 → 成功并移入已过审。

- [ ] **Step 4: Commit**

```bash
git add src/apis/marketplace.ts src/pages/platform/product-approval/index.vue
git commit -m "feat(admin): 商品审批通过前须绑定平台分类"
```

---

## Task 4: 独立图片库页落地（多选 + 复制 URL）

**Files:**
- Modify: `web-admin/src/pages/media/library/index.vue`

- [ ] **Step 1: 改造页面**

将只读浏览改为「多选 + 复制 URL + 清空」。`ImagePicker` 需能拿到资源对象（含 source）。若 `ImagePicker` 只回传 id、无 source，改用它内部资源或加读 `fetchAssets` 按 id 取 source。实现：

```ts
const selected = ref<AssetItem[]>([]);
const barVisible = computed(() => selected.value.length > 0);
function onSelect(items: AssetItem[]) { selected.value = items; }
function copyUrls() {
  const urls = selected.value.map((a) => a.source || a.preview).join('\n');
  uni.setClipboardData({ data: urls });
  uni.showToast({ title: '已复制 URL', icon: 'success' });
}
function clearSel() { selected.value = []; }
```
模板：缩略图点击切换选中（角标），底部浮现操作条「已选 N 张 · 复制URL · 清空」。

- [ ] **Step 2: 校验**

本地 H5：选多张 → 操作条显示；复制 URL 剪贴板内容正确；清空恢复。

- [ ] **Step 3: Commit**

```bash
git add src/pages/media/library/index.vue
git commit -m "feat(admin): 图片库多选复制 URL 落地"
```

---

## Task 5: POS 确认收款二次校验 + 行小计

**Files:**
- Modify: `web-admin/src/pages/pos/index.vue`

- [ ] **Step 1: 行明细补小计**

`PosLine` 加 `amount`，lines 映射加 `amount: l.linePriceWithTax`；模板行右侧补 `¥{{ money(lines.amount) }}`（`fetchOrderDetail` 已返回 `linePriceWithTax`，order.ts L194）。

- [ ] **Step 2: 收款二次确认**

`onConfirmCollect()` 改为先弹确认：

```ts
function onConfirmCollect() {
  const r = result.value;
  if (!r) return;
  if (r.claimStatus === 'redeemed') { uni.showToast({ title: '该单已核销完成', icon: 'none' }); return; }
  const summary = (r.lines || []).slice(0, 2).map((l) => `${l.name}×${l.quantity}`).join('、')
    + ((r.lines || []).length > 2 ? ` 等${r.lines.length}项` : '');
  uni.showModal({
    title: '确认收款',
    content: `单号 ${r.code}\n应付 ¥${money(r.totalWithTax)}\n${summary}`,
    confirmText: '确认收款',
    cancelText: '取消',
    success: (res) => { if (res.confirm) doCollect(r); },
  });
}
async function doCollect(r: PosResult) { /* 原 claimPickup 逻辑，collecting busy 保留 */ }
```

- [ ] **Step 3: 校验**

本地 H5：查单 → 点确认收款 → 弹核对框（单号/金额/商品）；取消不核销；确认正常完成并复位。

- [ ] **Step 4: Commit**

```bash
git add src/pages/pos/index.vue
git commit -m "feat(admin): POS 收款二次确认 + 行小计"
```

---

## Task 6: 截图 + 部署 + 手册挂图（可选）

- [ ] **Step 1: 手机截图**

Playwright 390×844（dpr=2）截图：核销清单价格、coupon 启停确认、审批待审分类栏、图片库操作条、POS 收款确认。存 `web-admin/src/static/manual/shots/`。

- [ ] **Step 2: 部署 web-admin**

web-admin 本地构建 + `node scripts/deploy.mjs`（openresty 站点 e.joho.cn/guanli → reload）。P0 后端已在 Task 1 Step 4 部署。

- [ ] **Step 3: Commit 截图与手册**

```bash
git add src/static/manual/shots
git add <manual 章节 or 处理>
git commit -m "docs(manual): 核销价修复与 F2~F5 手机截图"
```

---

## Self-Review
- **Spec 覆盖**：P0→Task1；F2→Task2；F3→Task3；F4→Task4；F5→Task5；截图/部署→Task6。齐全。
- **占位扫描**：无 TBD；POS 行小计字段已核实（`linePriceWithTax` 存在于 order.ts L194）。
- **类型一致**：`MarketplaceApprovalItem.platformCategoryId` 在 Task3 各步一致；`doToggle`/`doCollect` 由原逻辑抽取，命名统一。