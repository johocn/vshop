# web-admin 内容功能补齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 web-admin 内容功能：手册重构（拆册重编号补骨架）+ F1 店铺 Logo 接 MediaPicker + F2 台账筛选导出 CSV + F3 券使用明细弹层 + F4 订单备注/改价（批1）；数据看板接 dashboard 插件完整版（批2）。

**Architecture:** 手册为单文件 `web-admin/src/static/manual/index.html`，重编号用确定性 Node 脚本重建 CHAPTERS 数组（按 spec §3.2 顺序），避免 30+ 次手改易错。四个功能均为前端改动 + 一处后端小改（coupon-plugin 增加 customer resolve field）。批2 看板接 vendure operations-plugin 的 `dashboardOverview/salesTrend/categoryTop`（已核实 SDL），自绘 canvas 折线不引第三方图表库。

**Tech Stack:** uni-app H5 (Vue3) + graphql-request；Node 脚本（无第三方依赖）；Vendure NestJS coupon-plugin。

**Spec:** `docs/superpowers/specs/2026-09-20-web-admin-gap-design.md`（已 commit e183993，用户全量批准）

**执行方式：** 用户已批准全部设计并指示「继续实施计划」→ 本计划在会话内 inline 执行（executing-plans 风格，按任务分批，每任务完成即 commit）。

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `web-admin/src/static/manual/index.html` | 手册重构：BOOKS 加 cx、op 重编号 op-1..30、mp 不动、3 章转 cx、新增 op-27/28/29/30 骨架 |
| `web-admin/scripts/manual-restructure.mjs`（新增） | 手册重构确定性脚本 |
| `web-admin/src/pages/decorate/shop-info/index.vue` | F1：Logo input → MediaPicker（存 URL，兼容历史） |
| `web-admin/src/utils/csv.ts`（新增） | F2：CSV 导出工具（BOM） |
| `web-admin/src/pages/settle/ledger/index.vue` | F2：状态筛选 + 导出按钮 |
| `d:\zhao\vendure\packages\coupon-plugin\src\coupon-customer-coupon.resolver.ts` | F3 后端：+customer resolve field |
| `d:\zhao\vendure\packages\coupon-plugin\src\plugin.ts` | F3 后端 SDL：customerCouponType + `customer: Customer` |
| `web-admin/src/apis/coupon.ts` | F3：+fetchCustomerCoupons |
| `web-admin/src/pages/coupon/CouponDetailModal.vue`（新增） | F3：两页签明细弹层 |
| `web-admin/src/pages/coupon/index.vue` | F3：卡片 ops +「明细」入口 |
| `web-admin/src/apis/order.ts` | F4：+addOrderNote / modifyOrderPrice |
| `web-admin/src/pages/order/detail/index.vue` | F4：备注 / 改价按钮 + 弹层 |
| `web-admin/src/apis/stats.ts` | 批2：fetchTodayOverview 改接 dashboardOverview |
| `web-admin/src/apis/operations.ts`（新增） | 批2：fetchSalesTrend / fetchCategoryTop |
| `web-admin/src/components/TrendChart.vue`（新增） | 批2：canvas 双线折线（H5 DOM canvas） |
| `web-admin/src/pages/data/dashboard/index.vue` | 批2：版式 A 三区块 |
| `web-admin/src/static/manual/shots/*.png` | 各功能 390×844(dpr=2) 截图 |

---

## Task 1: 手册重构（拆册重编号补骨架）

**Files:**
- Modify: `web-admin/src/static/manual/index.html`
- Create: `web-admin/scripts/manual-restructure.mjs`

背景：CHAPTERS 数组内 op 与 mp 章节**交错排列**，op-28（风格模板库）是数组最后一项且结尾无逗号。渲染按 `chaptersOf(book)` 过滤（保留数组序），prev/next 按数组索引 → **仅册内顺序有意义**，跨册顺序无关。故采用「重建 CHAPTERS 数组」策略：解析全部章节块 → 按 spec 映射重编号/改册/排序 → 输出 op(op-1..30) → mp(不动) → cx(cx-1..3)。

- [ ] **Step 1: 写重构脚本**

```js
// web-admin/scripts/manual-restructure.mjs
// 手册重构：op 重编号 op-1..30（spec §3.2）、op-13/14/15 → cx-1..3、mp 一字不动、
// 新增 op-27/28/29/30 骨架章节、BOOKS 注册 cx。
// 用法：node scripts/manual-restructure.mjs（cwd = web-admin/）
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/static/manual/index.html';
const src = readFileSync(FILE, 'utf8');
const lines = src.split('\n');

// 目标顺序（spec §3.2，权威）：title → { id, book }；未列出的旧章节视为不存在
const RENUMBER = [
  ['这是一本什么手册', 'op-1', 'op'],
  ['认识多租户商城', 'op-2', 'op'],
  ['开通并绑定你的店铺', 'op-3', 'op'],
  ['登录管理后台', 'op-4', 'op'],
  ['店铺装修与主题', 'op-5', 'op'],
  ['商品管理', 'op-6', 'op'],
  ['价格与库存', 'op-7', 'op'],
  ['商品价格 · 库存 · 图片（含税率开关）', 'op-8', 'op'],
  ['订单与售后', 'op-9', 'op'],
  ['常见问题（FAQ）· 运营', 'op-10', 'op'],
  ['到店自提核销与收款', 'op-11', 'op'],
  ['收款台账（核销人即收款人）', 'op-12', 'op'],
  ['商户订单可见性（本店商品单）', 'op-13', 'op'],
  ['优惠券（多租户发行与使用）', 'op-14', 'op'],
  ['商品专属优惠券（绑定商品 + 凭码兑换）', 'op-15', 'op'], // 物理前移，与 op-14 相邻
  ['成员密码管理与角色授权', 'op-16', 'op'],
  ['房型模板库与酒店版式', 'op-17', 'op'],
  ['四流对账：批次 / 差异 / 重跑闭环', 'op-18', 'op'],
  ['详情页库存展示（虚拟库存 + 附近库存）', 'op-19', 'op'],
  ['微信分享兜底：标题 / 描述 / 主图', 'op-20', 'op'],
  ['首页「城市 · 配送」过滤与风格配置', 'op-21', 'op'],
  ['详情页配送口径切换 + 租户网点管理', 'op-22', 'op'],
  ['库存单据操作手册（库存管理方式 / 采购 / 移库 / 盘库 / 出库 / 流水）', 'op-23', 'op'],
  ['多仓拆分发货（预留单）', 'op-24', 'op'],
  ['订单列表多版式', 'op-25', 'op'],
  ['风格模板库管理', 'op-26', 'op'],
  ['nshop 结账页中国本地化（cn 版式）', 'cx-1', 'cx'],
  ['结算页逐箱结算：商户分账与地址字段', 'cx-2', 'cx'],
  ['订单确认页与售后：游客查询与联系客服增强', 'cx-3', 'cx'],
];

// 解析章节块：起点行匹配 startRe，终点 = 其后首个以 `}` 或 `},` 结尾的行
const startRe = /^\{book:'[^']+', id:'[^']+', title:'.*?', html:`$/;
const endRe = /`\},?\s*$/;
const blocks = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\{book:'([^']+)', id:'([^']+)', title:'(.*?)', html:`$/);
  if (!m) continue;
  let j = i + 1;
  while (j < lines.length && !endRe.test(lines[j])) j++;
  blocks.push({ start: i, end: j, book: m[1], oldId: m[2], title: m[3] });
  i = j;
}
console.log(`解析到 ${blocks.length} 个章节块（op/mp/cx 混排）`);

const byTitle = new Map(RENUMBER.map(([t]) => [t, t]));
const meta = new Map(RENUMBER.map(([t, id, book]) => [t, { id, book }]));
const opBlocks = [], mpBlocks = [], cxBlocks = [];
for (const b of blocks) {
  if (byTitle.has(b.title)) {
    const { id, book } = meta.get(b.title);
    if (book === 'cx') cxBlocks.push({ ...b, id });
    else opBlocks.push({ ...b, id }); // 保持 RENUMBER 数组序
  } else {
    mpBlocks.push(b); // mp 章节原样（含相对顺序）
  }
}
if (opBlocks.length !== 26) throw new Error(`op 章节数异常: ${opBlocks.length}（期望 26）`);
if (mpBlocks.length !== 10) throw new Error(`mp 章节数异常: ${mpBlocks.length}（期望 10）`);
if (cxBlocks.length !== 3) throw new Error(`cx 章节数异常: ${cxBlocks.length}（期望 3）`);

// 4 个新骨架章节（追加到 op 组末尾）
const NEW_OP = [
`{book:'op', id:'op-27', title:'分销：关系与结算', html:\`
<p class="lead">分销功能把买家变成推广员：买家通过邀请码推广成交后，按关系链累计收益并可提现。你可以在「分销」菜单查看关系与佣金结算。</p>
<h3>1. 分销关系</h3>
<p>在「分销 → 分销关系」页签查看推广员列表：等级、上级、邀请码、累计收益 / 可提现 / 冻结金额，数据按当前租户隔离。</p>
<div class="note"><b>口径：</b>「可提现」为已结算可提余额，「冻结」为在途 / 未结算金额。</div>
<h3>2. 佣金结算</h3>
<p>在「分销 → 佣金结算」页签按周期查看佣金明细与结算状态，确认后发起提现 / 打款。</p>
<div class="shot-box"><img class="img" src="shots/op27_distribution.png" alt="分销-关系与结算"><div class="imgcap">图 D1 · 分销关系与结算</div></div>\`}`,
`{book:'op', id:'op-28', title:'图片库（媒体资源）', html:\`
<p class="lead">图片库是店铺的媒体资源中心：集中上传、管理与复用店铺图片，一次上传多处引用（Logo、分享图、自提点照片、商品图等）。</p>
<h3>1. 上传与管理</h3>
<p>打开「图片库」，点击上传选择本地图片；列表中可预览与删除，资源按当前租户隔离。</p>
<h3>2. 随处引用</h3>
<p>在店铺信息（Logo / 分享图）、自提点照片、商品图片等配置处，「从图片库选择」即可复用，无需重复上传。</p>
<div class="shot-box"><img class="img" src="shots/op28_media.png" alt="图片库-媒体资源"><div class="imgcap">图 M1 · 图片库</div></div>\`}`,
`{book:'op', id:'op-29', title:'数据看板（今日概览 / 7 日趋势 / 销量榜）', html:\`
<p class="lead">数据看板汇总店铺经营数据：今日订单 / 销售额（已支付口径）与库存预警，并提供近 7 日销售趋势与品类销量排行。</p>
<h3>1. 今日概览</h3>
<p>顶部三张卡片：今日订单数、今日销售额（gmv，已支付口径，不含未完成 / 取消单）、库存预警数（库存 ≤ 5）。</p>
<h3>2. 近 7 日趋势</h3>
<p>双线折线图展示近 7 日销售额（元，左轴）与订单数（单，右轴）。</p>
<h3>3. 销量 Top 榜</h3>
<p>近 7 日品类销量排行（GMV + 单数），辅助选品与备货。</p>
<div class="note"><b>权限：</b>数据看板需要 ViewDashboard 权限；若提示权限不足，请在「成员管理 → 角色」为当前角色勾选该权限。</div>
<div class="shot-box"><img class="img" src="shots/op29_dashboard.png" alt="数据看板-完整版"><div class="imgcap">图 K1 · 数据看板（批2 填充）</div></div>\`}`,
`{book:'op', id:'op-30', title:'POS 门店收银', html:\`
<p class="lead">门店收银面向线下当面收款场景：店员输入核销码 / 订单号查询订单，确认金额后选择收款方式完成收款，收款记录自动进入台账。</p>
<h3>1. 查询订单</h3>
<p>在「门店收银」输入核销码或订单号查询，展示订单号、顾客、应付金额与待交付商品。</p>
<h3>2. 确认收款</h3>
<p>选择收款方式（固定聚合码收款等）并确认收款；收款后订单状态与台账同步更新。</p>
<div class="note"><b>收款即台账：</b>POS 确认收款后，「收款台账」中出现对应记录，核销人即收款人，可直接导出对账。</div>
<div class="shot-box"><img class="img" src="shots/op30_pos.png" alt="POS-门店收银"><div class="imgcap">图 P1 · 门店收银</div></div>\`}`,
];

// 重建 CHAPTERS 数组：op → mp → cx（册内保持目标顺序）
const newBlocks = [
  ...opBlocks,
  ...NEW_OP.map((s) => ({ text: s, start: -1, end: -1 })),
  ...mpBlocks,
  ...cxBlocks,
];
// 把原块行替换为带新 id/book 的起止行；新块原样插入
function renderBlock(b) {
  if (b.text) return b.text;
  const raw = lines.slice(b.start, b.end + 1).join('\n');
  // 只改起点行的 book 与 id（title 不变）
  return raw.replace(/^\{book:'[^']+', id:'[^']+', /, `{book:'${meta.get(b.title).book}', id:'${b.id}', `);
}

const startIdx = lines.findIndex((l) => l.includes('var CHAPTERS = ['));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '];');
if (startIdx < 0 || endIdx < 0) throw new Error('未找到 CHAPTERS 数组边界');
const rebuilt = [
  ...lines.slice(0, startIdx + 1),
  ...newBlocks.map(renderBlock),
  ...lines.slice(endIdx),
];

// BOOKS 增加 cx 分册（mp 条目后插入）
const booksIdx = rebuilt.findIndex((l) => l.includes("id:'mp'"));
const bookLines = rebuilt.slice(0, booksIdx + 2);
const restLines = rebuilt.slice(booksIdx + 2);
if (!bookLines.some((l) => l.includes("'cx'"))) {
  const cxEntry = `  cx: { id:'cx', title:'nshop 商城 C 端手册', short:'C端手册', icon:'📱',\n        desc:'nshop 商城买家视角：结账本地化、逐箱结算、订单确认与售后。' }`;
  // mp 条目以 `}` 结尾（无逗号），补逗号后插入 cx
  const last = bookLines.length - 1;
  if (/}\s*$/.test(bookLines[last]) && !/,/.test(bookLines[last])) bookLines[last] = bookLines[last].replace(/}\s*$/, '},');
  bookLines.push(cxEntry);
}
const out = [...bookLines, ...restLines].join('\n');

// 修正正文交叉引用：网点管理 旧 op-23 → 新 op-22
const fixed = out.replace('「网点管理」（op-23）', '「网点管理」（op-22）');

writeFileSync(FILE, fixed, 'utf8');
console.log('完成。校验：');
console.log('  op 章节 =', opBlocks.length + NEW_OP.length, '（26 + 4 新）');
console.log('  mp 章节 =', mpBlocks.length, '（不动）');
console.log('  cx 章节 =', cxBlocks.length);
```

- [ ] **Step 2: 运行脚本并校验输出**

```bash
node scripts/manual-restructure.mjs
```

期望输出：
```
解析到 39 个章节块（op/mp/cx 混排）
  op 章节 = 30 （26 + 4 新）
  mp 章节 = 10 （不动）
  cx 章节 = 3
```

- [ ] **Step 3: 校验 id 唯一性与引用清理**

```bash
node -e "
const s = require('fs').readFileSync('src/static/manual/index.html','utf8');
const ids = [...s.matchAll(/\{book:'([^']+)', id:'([^']+)'/g)].map(m=>m[2]);
const dup = ids.filter((v,i)=>ids.indexOf(v)!==i);
console.log('章节总数:', ids.length, '重复 id:', dup.length ? dup : '无');
const opIds = [...s.matchAll(/id:'op-(\d+)'/g)].map(m=>+m[1]).sort((a,b)=>a-b);
console.log('op 连续:', opIds.join(','));
const bad = [...s.matchAll(/「[^」]*」（op-\d+）|（op-\d+）/g)];
console.log('正文 op 引用:', bad.map(m=>m[0]).join(' | ') || '无');
console.log('cx 册:', /'cx': \{ id:'cx'/.test(s) ? '已注册' : '缺失');
"
```

期望：章节总数 43（39+4 新）、重复 id 无、op 连续 `1..30`、正文 op 引用仅剩（如无则「无」，因为 L911 已改 op-22 且新章节用文字引用）、cx 已注册。

- [ ] **Step 4: 浏览器冒烟（手册可打开、分组正确、prev/next 正常）**

本地起静态服务预览（任选其一，**不要重复起已有服务**；若已有 dev server 在跑则直接访问其 manual 路径）：

```bash
node scripts/serve-h5.mjs   # 若不存在运行中的服务；否则跳过
```

打开手册页（开发服务下的 `src/static/manual/index.html` 或已构建 dist 对应路径），确认：首页出现 3 本书卡（运营手册 30 章 / 入驻审批 10 章 / C端手册 3 章）；运营手册第一章到最后一章 prev/next 顺序 = op-1..op-30（op-15 商品专属优惠券紧跟 op-14 优惠券）；mp 章节一字未动（抽查 mp-1 与 mp-10 标题）；cx-1..3 内容与标题一致。

- [ ] **Step 5: Commit**

```bash
git add web-admin/scripts/manual-restructure.mjs web-admin/src/static/manual/index.html
git commit -m "docs(manual): 手册重构 op-1..30 重编号 + cx 分册 + 分销/图片库/看板/POS 章节骨架"
```

---

## Task 2: F1 店铺 Logo 接 MediaPicker

**Files:**
- Modify: `web-admin/src/pages/decorate/shop-info/index.vue`

背景（已核验）：`shopLogo` 为 Channel customFields 纯字符串，C 端 `stores/tenant.ts` 原样消费（`cf.shopLogo || ''`），历史值为 URL。→ **继续存 URL**：MediaPicker 选图 → `fetchAssets` 取 preview URL → 写入 `f.shopLogo`（与默认分享图同模式）。加载时若已有 URL 用 `<image>` 预览兼容显示。

- [ ] **Step 1: 模板替换 input 为 MediaPicker + 预览**

将 [index.vue](file:///d:/zhao/vshop/web-admin/src/pages/decorate/shop-info/index.vue#L16-L19) 的 Logo cell 替换为：

```html
      <view class="cell col">
        <text class="lbl">店铺 Logo</text>
        <image v-if="logoPreview" class="logo-pv" :src="logoPreview" mode="aspectFill" @tap="previewLogo" />
        <MediaPicker :max="1" :value="logoIds" @change="onLogoChange" />
        <text class="hint-inline">店铺 Logo 用于买家端展示。选图后点保存生效；历史 URL 值兼容显示。</text>
      </view>
```

- [ ] **Step 2: script 增加状态与处理函数**

在 `shareImageUrl` 声明附近（L167）增加：

```ts
const logoIds = ref<string[]>([]);
const logoPreview = ref('');

function onLogoChange(ids: string[]) {
  logoIds.value = ids;
  if (ids.length) {
    fetchAssets(1, 0, undefined, ids)
      .then((r) => { logoPreview.value = r.items[0]?.preview || ''; f.value.shopLogo = logoPreview.value; })
      .catch(() => {});
  } else {
    logoPreview.value = '';
    f.value.shopLogo = '';
  }
}

function previewLogo() {
  if (logoPreview.value) uni.previewImage({ urls: [logoPreview.value] });
}
```

在 `onMounted` 的 `f.value = {...}` 之后（L277）增加：

```ts
  logoPreview.value = cf.shopLogo ?? '';
```

- [ ] **Step 3: style 增加预览样式**

在 `.cell` 块内 `&.col` 下追加：

```scss
    .logo-pv { width: 160rpx; height: 160rpx; border-radius: 16rpx; margin-bottom: 16rpx; background: $wa-bg; }
```

- [ ] **Step 4: 构建校验**

```bash
npm run build:h5
```

期望：构建成功无 TS/模板错误。

- [ ] **Step 5: 回归 + 截图（挂 op-5 店铺装修与主题 或店铺信息相关章节）**

Playwright 390×844 dpr=2，登录 `guoxinnanshan@163.com / you123123`（t2），进入 店铺信息：选图 → 保存 → 刷新后预览仍在；截图存 `web-admin/src/static/manual/shots/`，在手册对应章节插入 `<img class="img" src="shots/..." alt="店铺信息-Logo 选图">`。

- [ ] **Step 6: Commit**

```bash
git add web-admin/src/pages/decorate/shop-info/index.vue web-admin/src/static/manual/index.html
git commit -m "feat(admin): 店铺 Logo 接入 MediaPicker（存 URL 兼容历史值）"
```

---

## Task 3: F2 收款台账筛选 + 导出 CSV

**Files:**
- Create: `web-admin/src/utils/csv.ts`
- Modify: `web-admin/src/pages/settle/ledger/index.vue`

- [ ] **Step 1: 写 CSV 工具**

```ts
// utils/csv.ts —— H5 CSV 导出（Blob + BOM，Excel 中文兼容）
export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const esc = (v: string): string => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(esc).join(','));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
```

- [ ] **Step 2: ledger 页增加筛选与导出**

在 `template` 的 KPI 区之后（`<view class="sec-title" v-if="todayRows.length">` 之前）插入工具栏：

```html
    <view class="toolbar">
      <view class="seg">
        <text :class="{ on: filter === 'all' }" @tap="filter = 'all'">全部</text>
        <text :class="{ on: filter === 'paid' }" @tap="filter = 'paid'">已收</text>
        <text :class="{ on: filter === 'pending' }" @tap="filter = 'pending'">待收</text>
      </view>
      <button class="exp" @tap="onExport">导出 CSV</button>
    </view>
```

台账区标题与列表改用筛选结果：

```html
    <view class="sec-title">收款台账（{{ filteredRows.length }}）</view>
    <LedgerCard v-for="r in filteredRows" :key="r.id" :row="r" />
```

`script` 增加：

```ts
import { downloadCsv, fmtDateTime } from '../../../utils/csv';
import { settleMethodLabel } from '../../../apis/settlement';

const filter = ref<'all' | 'paid' | 'pending'>('all');
const filteredRows = computed(() => {
  if (filter.value === 'paid') return paidRows.value;
  if (filter.value === 'pending') return pendingRows.value;
  return rows.value;
});

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function onExport() {
  const list = filteredRows.value;
  if (!list.length) { uni.showToast({ title: '当前筛选无数据', icon: 'none' }); return; }
  const headers = ['时间', '订单号', '收款人', '收款渠道', '收款方式', '金额（元）', '状态'];
  const rowsCsv = list.map((r) => {
    const d = rowTime(r);
    const ch = r.collectorChannelId ? `门店收款(${r.collectorChannelId})` : '在线分账';
    return [
      d ? fmtDateTime(d) : '',
      r.orderCode || '',
      r.collectorName || '',
      ch,
      settleMethodLabel(r.settleMethod),
      (r.amount / 100).toFixed(2),
      isPendingSign(r.status) ? '待收' : '已收',
    ];
  });
  const now = new Date();
  const name = `收款台账_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}.csv`;
  downloadCsv(name, headers, rowsCsv);
  uni.showToast({ title: `已导出 ${list.length} 条`, icon: 'none' });
}
```

`style` 增加：

```scss
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx;
  .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx;
    text { font-size: 24rpx; color: $wa-muted; padding: 8rpx 24rpx; border-radius: 999rpx;
      &.on { background: $wa-accent; color: #fff; } } }
  .exp { margin: 0; background: $wa-card; color: $wa-accent; font-size: 26rpx; border: 1rpx solid $wa-accent; border-radius: $wa-radius; }
}
```

- [ ] **Step 3: 构建 + 手动验证**

```bash
npm run build:h5
```

验证：筛选「待收」只列 PENDING_SIGN；导出 CSV 用 Excel/WPS 打开中文不乱码、行数与当前筛选一致；空结果点导出提示「当前筛选无数据」。

- [ ] **Step 4: 截图（挂 op-12 收款台账章节）+ Commit**

截图存 `shots/`，插入 op-12 章节。然后：

```bash
git add web-admin/src/utils/csv.ts web-admin/src/pages/settle/ledger/index.vue web-admin/src/static/manual/index.html
git commit -m "feat(admin): 收款台账状态筛选 + CSV 导出（BOM 兼容 Excel 中文）"
```

---

## Task 4: F3 优惠券使用明细弹层

**Files:**
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\coupon-customer-coupon.resolver.ts`
- Modify: `d:\zhao\vendure\packages\coupon-plugin\src\plugin.ts`
- Modify: `web-admin/src/apis/coupon.ts`
- Create: `web-admin/src/pages/coupon/CouponDetailModal.vue`
- Modify: `web-admin/src/pages/coupon/index.vue`

### 4.1 后端（vendure）

- [ ] **Step 1: resolver 加 customer resolve field**

```ts
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { CustomerService, Ctx, RequestContext } from '@vendure/core';

import { CouponService } from './coupon.service';

/**
 * CustomerCoupon.template 关系字段解析。
 * claimCoupon / grantCouponIssue 返回的实例未预加载 template 关联，
 * 若无字段解析器则 GraphQL 输出 template:null。此处按 templateId 补查并复用
 * findOneTemplate（顺带应用本地化与属店隔离，shop 会话下 adminShopId 为 undefined 不拦截）。
 */
@Resolver('CustomerCoupon')
export class CustomerCouponResolver {
    constructor(
        private couponService: CouponService,
        private customerService: CustomerService,
    ) {}

    @ResolveField('template')
    async template(@Parent() cc: any, @Ctx() ctx: RequestContext) {
        if (cc.template) return cc.template;
        if (cc.templateId == null) return null;
        return this.couponService.findOneTemplate(ctx, cc.templateId);
    }

    /** 领取/核销明细需要客户名/手机号（管理后台展示用），未命中返回 null */
    @ResolveField('customer')
    async customer(@Parent() cc: any, @Ctx() ctx: RequestContext) {
        if (cc.customerId == null) return null;
        return this.customerService.findOne(ctx, cc.customerId);
    }
}
```

- [ ] **Step 2: SDL 增加 customer 字段**

`plugin.ts` 中 `customerCouponType`（`type CustomerCoupon implements Node { ... }`）在 `template: CouponTemplate` 行后增加一行：

```graphql
    customer: Customer
```

- [ ] **Step 3: 构建 vendure + 冒烟**

```bash
cd d:\zhao\vendure
npm run build   # 或 packages/coupon-plugin 所在项目的构建命令；以仓库 package.json scripts 为准
```

用脚本或 GraphQL 工具验证 admin-api 查询：

```graphql
query { customerCoupons(options: { filter: { templateId: { eq: "1" } }, sort: { issuedAt: DESC }, skip: 0, take: 5 }) {
  items { id customerId code status issuedBy issuedAt usedAt usedOrderId customer { id firstName lastName phoneNumber } }
  totalItems } }
```

期望：返回 items 且 customer 非 null（该券有领取记录时）。

- [ ] **Step 4: Commit（vendure）**

```bash
cd d:\zhao\vendure
git add packages/coupon-plugin/src/coupon-customer-coupon.resolver.ts packages/coupon-plugin/src/plugin.ts
git commit -m "feat(coupon-plugin): CustomerCoupon 增加 customer resolve field（明细客户名/手机号）"
```

> 部署时机：与前端一起联调通过后，`git push` + ssh pull + pm2 restart（见 Task 8）。

### 4.2 前端

- [ ] **Step 5: apis/coupon.ts 增加 fetchCustomerCoupons**

在文件末尾追加：

```ts
/* ------------------------- 券使用明细（customerCoupons） ------------------------- */

export interface CustomerCouponRow {
  id: string;
  customerId: string;
  code: string;
  status: string;
  issuedBy: string;
  reservedOrderId?: string | null;
  usedOrderId?: string | null;
  issuedAt?: string | null;
  usedAt?: string | null;
  expiredAt?: string | null;
  customer?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    phoneNumber?: string | null;
  } | null;
}

export const COUPON_STATUS_LABELS: Record<string, string> = {
  UNUSED: '未使用',
  USED: '已核销',
  RETURNED: '已退回',
  EXPIRED: '已过期',
  INVALID: '已失效',
};
export const COUPON_ISSUED_BY_LABELS: Record<string, string> = {
  CENTRE: '领取',
  ADMIN: '定向发放',
  EXCHANGE: '兑换',
};

/** 某券模板的领取明细（分页；status 为空取全部） */
export async function fetchCustomerCoupons(
  templateId: string,
  skip: number,
  take: number,
  status?: string,
): Promise<{ items: CustomerCouponRow[]; totalItems: number }> {
  try {
    const { customerCoupons } = await getAdminClient().request<{
      customerCoupons: { items: CustomerCouponRow[]; totalItems: number };
    }>(
      `query CustomerCoupons($options: CustomerCouponListOptions) {
        customerCoupons(options: $options) {
          items { id customerId code status issuedBy usedOrderId issuedAt usedAt expiredAt customer { id firstName lastName phoneNumber } }
          totalItems
        }
      }`,
      {
        options: {
          filter: status
            ? { templateId: { eq: templateId }, status: { eq: status } }
            : { templateId: { eq: templateId } },
          sort: { issuedAt: 'DESC' },
          skip,
          take,
        },
      },
    );
    return { items: customerCoupons?.items ?? [], totalItems: customerCoupons?.totalItems ?? 0 };
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询券明细失败'));
  }
}
```

- [ ] **Step 6: 新建 CouponDetailModal.vue**

```vue
<template>
  <view v-if="visible" class="mask" @tap.self="close">
    <view class="modal">
      <view class="head">
        <text class="t">券使用明细</text>
        <text class="x" @tap="close">✕</text>
      </view>
      <view class="tabs">
        <text :class="{ on: tab === 'issued' }" @tap="switchTab('issued')">领取明细</text>
        <text :class="{ on: tab === 'used' }" @tap="switchTab('used')">核销明细</text>
      </view>

      <scroll-view scroll-y class="list">
        <view class="row" v-for="r in items" :key="r.id">
          <view class="left">
            <text class="who">{{ customerText(r) }}</text>
            <text class="sub">
              <template v-if="tab === 'issued'">
                券码 {{ r.code }} · {{ statusLabel(r.status) }} · {{ issuedByLabel(r.issuedBy) }}
              </template>
              <template v-else>
                券码 {{ r.code }} · 订单 {{ r.usedOrderId || '—' }}
              </template>
            </text>
          </view>
          <text class="when">
            <template v-if="tab === 'issued'">{{ fmtDT(r.issuedAt) }}</template>
            <template v-else>{{ fmtDT(r.usedAt) }}</template>
          </text>
        </view>
        <view v-if="!items.length && !loading" class="empty">暂无记录</view>
        <view v-if="loading" class="empty">加载中…</view>
        <view v-if="items.length && hasMore" class="more" @tap="loadMore">加载更多</view>
      </scroll-view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import {
  fetchCustomerCoupons, COUPON_STATUS_LABELS, COUPON_ISSUED_BY_LABELS,
  type CustomerCouponRow, type CouponTemplateItem,
} from '../../apis/coupon';

const props = defineProps<{ visible: boolean; template: CouponTemplateItem | null }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const tab = ref<'issued' | 'used'>('issued');
const items = ref<CustomerCouponRow[]>([]);
const loading = ref(false);
const totalItems = ref(0);
const PAGE = 20;

const hasMore = () => items.value.length < totalItems.value;

function close() { emit('update:visible', false); }

function customerText(r: CustomerCouponRow): string {
  const c = r.customer;
  if (c) {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
    return `${name} ${c.phoneNumber || ''}`.trim();
  }
  return `客户 #${r.customerId}`;
}

function fmtDT(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const statusLabel = (s: string) => COUPON_STATUS_LABELS[s] || s;
const issuedByLabel = (s: string) => COUPON_ISSUED_BY_LABELS[s] || s;

async function load() {
  if (!props.template) return;
  loading.value = true;
  items.value = [];
  try {
    const res = await fetchCustomerCoupons(props.template.id, 0, PAGE, tab.value === 'used' ? 'USED' : undefined);
    items.value = res.items;
    totalItems.value = res.totalItems;
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || !hasMore()) return;
  loading.value = true;
  try {
    const res = await fetchCustomerCoupons(props.template.id, items.value.length, PAGE, tab.value === 'used' ? 'USED' : undefined);
    totalItems.value = res.totalItems;
    items.value = items.value.concat(res.items);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function switchTab(t: 'issued' | 'used') {
  if (tab.value === t) return;
  tab.value = t;
  load();
}

watch(() => props.visible, (v) => { if (v) load(); });
</script>

<style lang="scss" scoped>
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 999; display: flex; align-items: flex-end; }
.modal { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; max-height: 76vh; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 32rpx 16rpx;
  .t { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
  .x { font-size: 32rpx; color: $wa-muted; padding: 0 8rpx; } }
.tabs { display: flex; gap: 12rpx; padding: 0 32rpx 16rpx;
  text { font-size: 26rpx; color: $wa-muted; padding: 8rpx 28rpx; border-radius: 999rpx; background: $wa-rule;
    &.on { background: $wa-accent; color: #fff; } } }
.list { flex: 1; min-height: 320rpx; padding: 0 32rpx 32rpx; box-sizing: border-box;
  .row { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 0; border-bottom: 1rpx solid $wa-rule;
    .left { flex: 1; margin-right: 16rpx;
      .who { display: block; font-size: 26rpx; color: $wa-ink; }
      .sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; word-break: break-all; } }
    .when { font-size: 22rpx; color: $wa-muted; flex-shrink: 0; } }
  .empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 60rpx 0; }
  .more { text-align: center; color: $wa-accent; font-size: 26rpx; padding: 24rpx 0; } }
</style>
```

- [ ] **Step 7: coupon/index.vue 接入明细入口**

template 的 `.ops` 内「编辑」后加：

```html
        <text @tap="openDetail(c)">明细</text>
```

script 增加：

```ts
import CouponDetailModal from './CouponDetailModal.vue';

const detailVisible = ref(false);
const detailTemplate = ref<CouponTemplateItem | null>(null);

function openDetail(c: CouponTemplateItem) {
  detailTemplate.value = c;
  detailVisible.value = true;
}
```

template 根部（`<view class="page">` 内末尾）加：

```html
    <CouponDetailModal v-model:visible="detailVisible" :template="detailTemplate" />
```

- [ ] **Step 8: 构建 + 联调回归（需先部署 vendure 小改）**

```bash
cd d:\zhao\vshop\web-admin
npm run build:h5
```

联调：前端 dev 指向已部署新 vendure 的环境，打开优惠券列表 → 某券「明细」→ 两页签分页正确、客户名/手机号显示、核销明细仅 USED 且含订单号。

- [ ] **Step 9: 截图（挂 op-14 优惠券 章节）+ Commit**

```bash
git add web-admin/src/apis/coupon.ts web-admin/src/pages/coupon/CouponDetailModal.vue web-admin/src/pages/coupon/index.vue web-admin/src/static/manual/index.html
git commit -m "feat(admin): 优惠券使用明细弹层（领取/核销双页签分页）"
```

---

## Task 5: F4 订单详情备注 / 改价

**Files:**
- Modify: `web-admin/src/apis/order.ts`
- Modify: `web-admin/src/pages/order/detail/index.vue`

- [ ] **Step 1: apis/order.ts 增加两个 mutation**

```ts
// 订单备注：Vendure 内置 addNoteToOrder（只写不展示，本版本无 orderHistory 查询）
export async function addOrderNote(orderId: string, note: string): Promise<void> {
  try {
    const res = await getAdminClient().request<{ addNoteToOrder?: { id?: string } | { errorCode?: string; message?: string } }>(
      `mutation AddNote($input: AddNoteToOrderInput!) {
        addNoteToOrder(input: $input) { ... on Order { id } ... on ErrorResult { errorCode message } }
      }`,
      { input: { id: orderId, note, isPublic: false } },
    );
    const r = res.addNoteToOrder as any;
    if (!r || !r.id) throw new Error((r && r.message) || '备注失败');
  } catch (e: any) {
    throw new Error(e?.message || graphQlErrorMsg(e, '备注失败'));
  }
}

// 后台改价：仅可修改状态（AddingItems / ArrangingPayment）下使用；负 priceDelta = 降价
export async function modifyOrderPrice(orderId: string, priceDelta: number, note?: string): Promise<void> {
  try {
    const res = await getAdminClient().request<{ modifyOrder?: { id?: string } | { errorCode?: string; message?: string } }>(
      `mutation ModifyOrder($input: ModifyOrderInput!) {
        modifyOrder(input: $input) { ... on Order { id } ... on ErrorResult { errorCode message } }
      }`,
      {
        input: {
          dryRun: false,
          orderId,
          surcharges: [{ description: '后台改价', priceDelta }],
          note: note || '后台改价',
        },
      },
    );
    const r = res.modifyOrder as any;
    if (!r || !r.id) throw new Error((r && r.message) || '改价失败');
  } catch (e: any) {
    throw new Error(e?.message || graphQlErrorMsg(e, '改价失败'));
  }
}
```

- [ ] **Step 2: order/detail 增加按钮与弹层**

template `.ops`（现有 去发货/取消订单/去核销）后加：

```html
        <button class="op" @tap="noteVisible = true">备注</button>
        <button v-if="canAdjustPrice" class="op" @tap="openAdjust">改价</button>
```

script 增加状态与逻辑：

```ts
import { addOrderNote, modifyOrderPrice } from '../../../apis/order';

const noteVisible = ref(false);
const noteText = ref('');
const adjustVisible = ref(false);
const adjustInput = ref('');
const adjusting = ref(false);

const canAdjustPrice = computed(() => ['AddingItems', 'ArrangingPayment'].includes(order.value?.state || ''));

async function onSubmitNote() {
  const t = noteText.value.trim();
  if (!t) { uni.showToast({ title: '请输入备注内容', icon: 'none' }); return; }
  try {
    await addOrderNote(order.value?.id || '', t);
    noteVisible.value = false;
    noteText.value = '';
    uni.showToast({ title: '备注已写入', icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || '备注失败', icon: 'none' });
  }
}

function openAdjust() {
  adjustInput.value = order.value ? (order.value.totalWithTax / 100).toFixed(2) : '';
  adjustVisible.value = true;
}

async function onSubmitAdjust() {
  if (!order.value || adjusting.value) return;
  const v = Number(adjustInput.value);
  if (Number.isNaN(v) || v < 0) { uni.showToast({ title: '请输入有效金额', icon: 'none' }); return; }
  const delta = Math.round(v * 100) - order.value.totalWithTax;
  if (delta === 0) { uni.showToast({ title: '金额未变化', icon: 'none' }); return; }
  adjusting.value = true;
  try {
    await modifyOrderPrice(order.value.id, delta);
    adjustVisible.value = false;
    uni.showToast({ title: '改价成功', icon: 'success' });
    order.value = await fetchOrderDetail(order.value.id);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '改价失败', icon: 'none' });
  } finally {
    adjusting.value = false;
  }
}
```

template 根部（`<view class="page">` 内末尾、`</view>` 前）加两个弹层：

```html
    <!-- 备注弹层 -->
    <view v-if="noteVisible" class="mask" @tap.self="noteVisible = false">
      <view class="sheet">
        <view class="st">订单备注</view>
        <textarea v-model="noteText" class="ta" placeholder="输入备注（仅后台可见，写入订单内部备注）" />
        <view class="btns">
          <button class="bn" @tap="noteVisible = false">取消</button>
          <button class="bn main" @tap="onSubmitNote">保存</button>
        </view>
      </view>
    </view>

    <!-- 改价弹层 -->
    <view v-if="adjustVisible" class="mask" @tap.self="adjustVisible = false">
      <view class="sheet">
        <view class="st">后台改价 <text class="cur">当前实付 ¥{{ money(order.totalWithTax) }}</text></view>
        <view class="amt-row">
          <text class="pre">¥</text>
          <input v-model="adjustInput" class="amt" type="digit" placeholder="0.00" />
        </view>
        <text class="tip">差额将以「后台改价」费用项计入订单；仅限未支付/待处理状态订单。</text>
        <view class="btns">
          <button class="bn" @tap="adjustVisible = false">取消</button>
          <button class="bn main" :disabled="adjusting" @tap="onSubmitAdjust">{{ adjusting ? '提交中…' : '确认改价' }}</button>
        </view>
      </view>
    </view>
```

style 增加（复用遮罩/弹层样式）：

```scss
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 999; display: flex; align-items: flex-end; }
.sheet { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 32rpx;
  .st { font-size: 30rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx;
    .cur { font-size: 24rpx; color: $wa-muted; font-weight: 400; margin-left: 12rpx; } }
  .ta { width: 100%; height: 160rpx; background: $wa-bg; border-radius: 12rpx; padding: 16rpx; font-size: 28rpx; box-sizing: border-box; }
  .amt-row { display: flex; align-items: center; background: $wa-bg; border-radius: 12rpx; padding: 16rpx 20rpx;
    .pre { font-size: 36rpx; color: $wa-ink; margin-right: 12rpx; }
    .amt { flex: 1; font-size: 40rpx; font-weight: 700; color: $wa-danger; } }
  .tip { display: block; font-size: 22rpx; color: $wa-muted; margin: 16rpx 0; line-height: 1.6; }
  .btns { display: flex; gap: 20rpx; margin-top: 24rpx;
    .bn { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; font-size: 30rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
      &.main { background: $wa-accent; color: #fff; } } } }
```

- [ ] **Step 3: 构建 + 验证**

```bash
npm run build:h5
```

验证：可修改状态（AddingItems/ArrangingPayment）订单显示「改价」，其他状态不显示；备注写入后在 Vendure 官方后台 Order 备注可见（web-admin 不展示）；改价后金额明细刷新。

- [ ] **Step 4: 截图（挂 op-9 订单与售后 章节）+ Commit**

```bash
git add web-admin/src/apis/order.ts web-admin/src/pages/order/detail/index.vue web-admin/src/static/manual/index.html
git commit -m "feat(admin): 订单详情备注 + 后台改价（仅可修改状态）"
```

---

## Task 6: 批1 回归 + 截图挂章节 + 部署

- [ ] **Step 1: 既有功能回归（API/e2e）**

用 Playwright（390×844 dpr=2，登录 t2）逐页回归：订单列表（含状态页签/多版式）、优惠券列表（增删改启停）、收款台账（今日汇总）、店铺信息（保存回读）、工作台 KPI、分销/图片库/POS/看板可打开。记录每页截图。

- [ ] **Step 2: 截图入册**

把新功能截图 + 回归截图存 `web-admin/src/static/manual/shots/`，按 Task 2/3/4/5 与 op-27/28/30 章节插入 `<img class="img" src="shots/...">`。op-29 留批2。

- [ ] **Step 3: 构建并部署 web-admin**

```bash
cd d:\zhao\vshop\web-admin
npm run build:h5
node scripts/deploy.mjs
```

- [ ] **Step 4: 部署 vendure（coupon-plugin 小改）**

```bash
cd d:\zhao\vendure
git push
# ssh 服务器拉取 + pm2 restart（沿用仓库既有部署路径）
```

- [ ] **Step 5: 线上验证**

线上访问管理后台：确认手册可打开（3 册）、优惠券明细弹层可用（后端 customer 已生效）、台账导出正常。截图留档。

- [ ] **Step 6: Commit 手册最终版**

```bash
git add web-admin/src/static/manual/index.html web-admin/src/static/manual/shots/
git commit -m "docs(manual): 批1 截图挂章节（F1-F4/分销/图片库/POS）"
```

---

## Task 7: 批2 - stats 接 dashboardOverview + operations api

**Files:**
- Modify: `web-admin/src/apis/stats.ts`
- Create: `web-admin/src/apis/operations.ts`

- [ ] **Step 1: 验证 ViewDashboard 权限**

登录 t2 角色，用 admin-api 直接查 `dashboardOverview(range:"today") { sales { orderCount gmv } inventory { lowStockCount } }`。若 FORBIDDEN → 在「成员管理 → 角色」为当前角色勾选 ViewDashboard（roles 已支持勾权限）后重试；仍不可用则看板降级显示「权限不足」提示（不硬编码 0）。

- [ ] **Step 2: 新增 apis/operations.ts**

```ts
// operations-plugin admin-api 调用（契约已核实 operations.plugin.ts SDL）
import { getAdminClient, graphQlErrorMsg } from './client';

export interface TrendPoint { date: string; orderCount: number; gmv: number }
export interface CategoryTopRow { categoryId: string; categoryName: string; gmv: number; orderCount: number }

export async function fetchSalesTrend(days: number): Promise<TrendPoint[]> {
  try {
    const { salesTrend } = await getAdminClient().request<{ salesTrend: TrendPoint[] }>(
      `query SalesTrend($days: Int!) { salesTrend(days: $days) { date orderCount gmv } }`,
      { days },
    );
    return salesTrend ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询销售趋势失败'));
  }
}

export async function fetchCategoryTop(days: number): Promise<CategoryTopRow[]> {
  try {
    const { categoryTop } = await getAdminClient().request<{ categoryTop: CategoryTopRow[] }>(
      `query CategoryTop($days: Int!) { categoryTop(days: $days) { categoryId categoryName gmv orderCount } }`,
      { days },
    );
    return categoryTop ?? [];
  } catch (e: any) {
    throw new Error(graphQlErrorMsg(e, '查询品类排行失败'));
  }
}
```

- [ ] **Step 3: 重写 stats.ts 的 fetchTodayOverview（接 dashboardOverview）**

删除旧的 `orders createdAt 过滤` 与 `stockLevels 低库存遍历` 口径（含注释），替换为：

```ts
export async function fetchTodayOverview(): Promise<TodayOverview> {
  // 接 operations-plugin dashboardOverview(range:"today")：已支付口径（排除未完成/取消单），
  // 库存预警 = lowStockCount（库存 ≤ 5，插件内统计）。
  const { dashboardOverview } = await getAdminClient().request<{
    dashboardOverview: {
      sales: { orderCount: number; gmv: number } | null;
      inventory: { lowStockCount: number } | null;
    } | null;
  }>(
    `query DashboardOverview($range: String!) {
      dashboardOverview(range: $range) {
        sales { orderCount gmv }
        inventory { lowStockCount }
      }
    }`,
    { range: 'today' },
  );
  const sales = dashboardOverview?.sales;
  const inv = dashboardOverview?.inventory;
  return {
    revenue: sales?.gmv ?? 0,
    orderCount: sales?.orderCount ?? 0,
    lowStock: inv?.lowStockCount ?? 0,
  };
}
```

同时移除不再使用的 `todayStartIso`、`LOW_STOCK_THRESHOLD`、`STOCK_PAGE_SIZE`、`fetchStockLocations/fetchStock` 导入（`fetchHomeKpis` 保持不变，仍复用 fetchTodayOverview）。

- [ ] **Step 4: 构建 + 冒烟**

```bash
cd d:\zhao\vshop\web-admin
npm run build:h5
```

验证：工作台 KPI 与看板三 KPI 数值来自 dashboardOverview（与插件口径一致，无未完成单污染）。

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/apis/stats.ts web-admin/src/apis/operations.ts
git commit -m "feat(admin): 今日概览接 dashboardOverview（已支付口径）+ operations api"
```

---

## Task 8: 批2 - 看板页版式 A + op-29 章节

**Files:**
- Create: `web-admin/src/components/TrendChart.vue`
- Modify: `web-admin/src/pages/data/dashboard/index.vue`
- Modify: `web-admin/src/static/manual/index.html`

- [ ] **Step 1: 新建 TrendChart.vue（H5 DOM canvas 双线）**

```vue
<template>
  <view class="tc">
    <canvas id="trendChart" class="tc-canvas" :style="{ height: heightRpx + 'rpx' }" />
  </view>
</template>

<script lang="ts" setup>
// 轻量双线折线：左轴销售额（¥）、右轴订单数（单）。H5 专用（DOM canvas），不引第三方库。
import { onMounted, onUnmounted, watch } from 'vue';

const props = defineProps<{ points: Array<{ date: string; gmv: number; orderCount: number }> }>();
const heightRpx = 360;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function fmtW(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(1) + 'w';
  return String(Math.round(v));
}

function draw() {
  if (!canvas || !ctx) return;
  const pts = props.points || [];
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  if (W === 0 || H === 0) return;
  if (canvas.width !== Math.round(W * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const padL = 46, padR = 46, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  // 网格
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (plotH * g) / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }

  if (!pts.length) {
    ctx.fillStyle = '#999'; ctx.font = '12px sans-serif';
    ctx.fillText('暂无数据', W / 2 - 28, H / 2);
    return;
  }

  const maxGmv = Math.max(...pts.map((p) => p.gmv), 1);
  const maxCnt = Math.max(...pts.map((p) => p.orderCount), 1);
  const x = (i: number) => padL + (pts.length === 1 ? plotW / 2 : (plotW * i) / (pts.length - 1));
  const yG = (v: number) => padT + plotH - (plotH * v) / maxGmv;
  const yC = (v: number) => padT + plotH - (plotH * v) / maxCnt;

  const poly = (getY: (i: number, p: any) => number, color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    pts.forEach((p, i) => {
      const px = x(i), py = getY(i, p);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = color;
    pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(x(i), getY(i, p), 2.5, 0, Math.PI * 2); ctx.fill(); });
  };
  poly((i, p) => yG(p.gmv), '#ff6600');
  poly((i, p) => yC(p.orderCount), '#2563eb');

  ctx.fillStyle = '#999'; ctx.font = '10px sans-serif';
  ctx.fillText('¥' + fmtW(maxGmv), 2, padT + 10);
  ctx.fillText('0', 2, H - padB + 4);
  ctx.fillText(String(maxCnt), W - padR + 2, padT + 10);
  pts.forEach((p, i) => {
    if (pts.length > 7 && i % 2 === 1) return;
    ctx.fillText(p.date.slice(5), x(i) - 14, H - 6);
  });
  // 图例
  ctx.fillStyle = '#ff6600'; ctx.fillRect(padL, 2, 12, 8);
  ctx.fillStyle = '#2563eb'; ctx.fillRect(padL + 64, 2, 12, 8);
  ctx.fillStyle = '#666'; ctx.font = '10px sans-serif';
  ctx.fillText('销售额', padL + 15, 10);
  ctx.fillText('订单数', padL + 79, 10);
}

function resize() { draw(); }

onMounted(() => {
  canvas = document.getElementById('trendChart') as HTMLCanvasElement;
  ctx = canvas?.getContext('2d') || null;
  draw();
  window.addEventListener('resize', resize);
});
onUnmounted(() => { window.removeEventListener('resize', resize); });
watch(() => props.points, draw, { deep: true });
</script>

<style lang="scss" scoped>
.tc { width: 100%;
  .tc-canvas { width: 100%; display: block; }
}
</style>
```

- [ ] **Step 2: 看板页版式 A 改造**

```vue
<template>
  <view class="page">
    <view class="stat">
      <view class="stat-card">
        <text class="num">{{ ov ? ov.orderCount : '—' }}</text>
        <text class="lbl">今日订单</text>
      </view>
      <view class="stat-card">
        <text class="num">{{ ov ? '¥' + (ov.revenue / 100).toFixed(2) : '—' }}</text>
        <text class="lbl">今日销售额</text>
      </view>
      <view class="stat-card">
        <text class="num">{{ ov ? ov.lowStock : '—' }}</text>
        <text class="lbl">库存预警</text>
      </view>
    </view>

    <view class="card">
      <text class="sec">近 7 日销售趋势</text>
      <TrendChart :points="trend" />
    </view>

    <view class="card">
      <text class="sec">销量 Top 榜（近 7 日品类）</text>
      <view v-if="topList.length" class="top">
        <view class="top-row" v-for="(t, i) in topList" :key="t.categoryId">
          <text class="rank" :class="{ hot: i < 3 }">{{ i + 1 }}</text>
          <text class="name">{{ t.categoryName || '未分类' }}</text>
          <text class="cnt">{{ t.orderCount }} 单</text>
          <text class="gmv">¥{{ (t.gmv / 100).toFixed(0) }}</text>
        </view>
      </view>
      <text v-else class="muted">暂无数据</text>
    </view>

    <view style="height: 140rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import TrendChart from '../../../components/TrendChart.vue';
import { fetchTodayOverview, type TodayOverview } from '../../../apis/stats';
import { fetchSalesTrend, fetchCategoryTop, type TrendPoint, type CategoryTopRow } from '../../../apis/operations';

const ov = ref<TodayOverview | null>(null);
const trend = ref<TrendPoint[]>([]);
const topList = ref<CategoryTopRow[]>([]);

onMounted(async () => {
  try { ov.value = await fetchTodayOverview(); } catch (e) { console.error('fetchTodayOverview failed', e); ov.value = null; }
  try { trend.value = await fetchSalesTrend(7); } catch (e) { console.error('fetchSalesTrend failed', e); trend.value = []; }
  try { topList.value = await fetchCategoryTop(7); } catch (e) { console.error('fetchCategoryTop failed', e); topList.value = []; }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .stat { display: flex; gap: 20rpx; margin-bottom: 24rpx;
    .stat-card { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 36rpx 16rpx; display: flex; flex-direction: column; align-items: center;
      .num { font-size: 40rpx; font-weight: 600; color: $wa-accent; }
      .lbl { font-size: 24rpx; color: $wa-muted; margin-top: 12rpx; } } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 24rpx; margin-bottom: 20rpx;
    .sec { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx; }
    .top-row { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .rank { width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 8rpx; font-size: 24rpx; color: $wa-muted; background: $wa-rule; margin-right: 16rpx;
        &.hot { background: $wa-accent; color: #fff; font-weight: 700; } }
      .name { flex: 1; font-size: 26rpx; color: $wa-ink; margin-right: 12rpx; }
      .cnt { font-size: 22rpx; color: $wa-muted; margin-right: 20rpx; }
      .gmv { font-size: 26rpx; color: $wa-danger; font-weight: 600; } } }
  .muted { display: block; text-align: center; color: $wa-muted; font-size: 26rpx; padding: 40rpx 0; }
}
</style>
```

- [ ] **Step 3: 填充 op-29 章节**

替换骨架中的「（批2 填充）」标注，补真实截图 `<img class="img" src="shots/op29_dashboard.png" alt="数据看板-完整版">`（截图三区块均可见）。

- [ ] **Step 4: 构建 + 截图 + 回归 + Commit**

```bash
cd d:\zhao\vshop\web-admin
npm run build:h5
```

回归：工作台 KPI 一致（dashboardOverview 口径）、看板三区块有数据、趋势折线与 Top 榜正确。截图 390×844 dpr=2 存 `shots/op29_dashboard.png`。

```bash
git add web-admin/src/components/TrendChart.vue web-admin/src/pages/data/dashboard/index.vue web-admin/src/static/manual/index.html web-admin/src/static/manual/shots/
git commit -m "feat(admin): 数据看板完整版（KPI + 7日趋势 + 品类Top）+ op-29 章节"
```

---

## Task 9: 批2 部署

- [ ] **Step 1: 部署 web-admin（本地构建 + deploy.mjs）**

```bash
cd d:\zhao\vshop\web-admin
node scripts/deploy.mjs
```

- [ ] **Step 2: 线上验证 + 截图留档**

访问线上管理后台看板页，确认三区块与本地一致。

- [ ] **Step 3: 收尾**

`git log` 确认批1/批2 提交齐全；无需更新 spec。

---

## 验收对照（spec §6）

| spec 验收 | 对应 Task |
|---|---|
| 手册 op-1..30 连续唯一、cx 分册 3 章、正文无旧 id 引用、mp 未动；截图挂新章节 | Task 1、6、8 |
| F1 Logo 可选图/回显/保存生效 | Task 2 |
| F2 筛选 + 导出 CSV 与页面一致、Excel 中文不乱码 | Task 3 |
| F3 明细弹层两页签分页正确、客户名显示 | Task 4 |
| F4 备注写入成功；改价仅在可修改状态出现 | Task 5 |
| 批2 看板三区块与插件一致 | Task 7、8 |
| 回归：订单列表/优惠券/台账/店铺信息/工作台 | Task 6、8 |
| 截图每功能 ≥1 张 390×844(dpr=2) 入 `manual/shots/` 挂章节 | Task 6、8 |
| 部署：批1、批2 各一次（web-admin 本地构建 + deploy.mjs；vendure push + pull + restart） | Task 6、9 |

## 风险与降级（spec §8 重申）

- 改价仅限可修改状态；备注只写不展示。
- coupon customer 字段若后端不可部署，降级显示 `customerId`（前端已兜底 `客户 #id`）。
- shopLogo 存 URL（已核验 C 端原样消费字符串），与历史值兼容。
- ViewDashboard 权限：验证 + roles 勾选；不可用则看板显示权限不足提示（`ov=null` 显示「—」）。
- CSV 纯前端生成，不新增后端接口。
