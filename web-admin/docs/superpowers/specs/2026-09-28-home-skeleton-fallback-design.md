# 首页装修积木 · 骨架自动补位兜底 — 设计文档

> 日期：2026-09-28
> 范围：`d:\zhao\nshop`（Nuxt 前台 C 端，含 `layers/base`）、`d:\zhao\vshop\web-admin`（装修后台）
> 前置：`d:\zhao\nshop\docs\superpowers\specs\2026-08-27-nshop-home-builder-design.md`（首页装修积木）、`d:\zhao\nshop\docs\superpowers\specs\2026-09-27-t2-storefront-visibility-and-blocks-design.md`（热门/推荐积木）、模板开发规范「多语言 / 四级回退 / 积木式 UI」
> 验收环境：线上 `https://www.youshop.cn/t2/`（渠道 `66ruvnhh34svhckaa2i`，「二月兰会员」）
> 观察环境：线上生产站点（用户确认）

## 0. 决策基线（用户已确认）

| 决策 | 结论 |
| --- | --- |
| 兜底语义 | **自动补位**（未配置的兜底楼层自动填充，不是模板预填、也不是纯显式） |
| 补位位置 | **骨架锚定**（按固定槽位顺序；运营同类型区块覆盖对应槽位，未配置的自动补默认） |
| 骨架范围 | **6 段**：轮播 Banner → 功能十宫格 → 品牌闪购 → 品质专区 → 热门商品 → 推荐商品 |
| 分类导航 | **常驻顶栏**，不进骨架、不参与覆盖/补位；有分类数据即渲染（零回归） |
| 实现路径 | **A：前端骨架合并**（纯函数；后台零重构） |
| 显式移除 | `shopContent.hiddenSlots: string[]`（槽位 key），后台提供轻量开关 |
| 交付 | 实现 + 单测 + API/e2e 回归 + **手机浏览视图截图（390×844 / dpr=2）** 进操作手册 + 操作手册更新 |

### 0.1 不做项（有意排除）

| 不做 | 理由 |
| --- | --- |
| 后台骨架楼层「可视化编辑」（方案 B） | 本期只落地「自动补位 + 轻量开关」；后续可选叠加，不影响本期数据模型 |
| 服务端合并（方案 C） | 与现有前端 `pageConfig` 五级合并机制冲突，且需后端发版，收益不抵成本 |
| PC 版式（`lg:` 全屏）走积木 | PC 现状始终走京东全屏布局，不由 `shopContent` 驱动；本期不动，避免回归 |
| 重画任何楼层视觉 | 6 段默认楼层一律复用既有 `Jd*` 组件，零重画、零视觉回归 |
| 装修后台「拖拽排序」 | 后台现有实现仅「新增 + 删除」（无排序能力），故骨架锚定不损失既有能力 |

## 1. 现状（代码事实）

### 1.1 首页移动端的「二选一」

- `d:\zhao\nshop\app\pages\index.vue:262-288`：移动端 `hasBlocks === true` 时只渲染 `HomeBlockRenderer`；否则渲染京东兜底楼层（分类导航 / Banner / 十宫格 / 品牌闪购 / 品质专区 / 商品楼层 前10 + 10..20）。
- `hasBlocks` 定义在 `index.vue:51`：`shopSections.length > 0`（来自 `useShopContent()` → `pageConfig("home").sections`）。
- 兜底商品楼层数据来自 `useAsyncData("home-fallback-search")`（`index.vue:91-140`），并在 `hasBlocks` 为真时**直接返回空**（守请求数红线）。
- 结论：**只要运营配置了任意一个区块（例如只加「热门商品」），京东兜底楼层（品牌闪购 / 十宫格 / 品质专区）整块消失**；线上 t2 因此被还原为 `shopContent = null`。

### 1.2 现有区块类型与兜底楼层的映射

| 兜底楼层（移动端） | 组件 | 现有区块 type |
| --- | --- | --- |
| 分类导航 | `home/jd/JdCategoryNav.vue` | **无**（不在本次骨架内，改常驻） |
| 轮播 Banner | `home/jd/JdBannerCarousel.vue` | `banner`（`blocks/BannerBlock.vue`） |
| 功能十宫格 | `home/jd/JdFunctionGrid.vue` | `nav`（`blocks/NavGrid.vue` → `JdFunctionGrid`） |
| 品牌闪购 | `home/jd/JdBrandFloor.vue` | **无**（本次新增） |
| 品质专区 | `home/jd/JdPlazaGrid.vue` | **无**（本次新增） |
| 热门商品 | `home/jd/JdProductGrid.vue` | `hot`（`blocks/HotGoodsBlock.vue`） |
| 推荐商品 | `home/jd/JdProductGrid.vue` | `recommend`（`blocks/RecommendGoodsBlock.vue`） |

- 关键事实：`JdFunctionGrid` 的兜底默认是 `shape='round'` + `layout='grid5x2'` + 自动 items；而 `NavGrid` 传入的京东默认是 `shape='square'`（`shop-content.ts:67-70` 与 `NavGrid.vue:11-12`）。**骨架的十宫格槽位必须显式给 `shape:'round'` 才与现状一致**。
- `nav` 区块渲染 `JdFunctionGrid` 时 `items` 为空即回退自动 items（`JdFunctionGrid.vue:69-71`），因此「默认十宫格槽位」可表达为 `{ type:'nav', items:[], shape:'round', layout:'grid5x2' }`。
- `banner` 区块（`BannerBlock.vue`）只吃 `section.images`；而兜底 Banner 的图来自 `useHomeContent()`（`index.vue:36-47`）。需按「配置优先、自动兜底」补一条取数分支（与 `JdFunctionGrid` 同模式）。

### 1.3 后台装修现状

- `d:\zhao\vshop\web-admin\src\pages\decorate\home\index.vue`：`sections` 列表 + 每个区块内联配置面板；底部 `addbar` 提供 7 个新增按钮（banner / notice / nav / goods / hot / recommend / richText）；`save()` 组装 JSON 并经 `isValidShopContent` 校验后写入 `Channel.customFields.shopContent`。
- `d:\zhao\vshop\web-admin\src\templates\shared\schema.ts`：`VALID_TYPES = ['banner','notice','nav','goods','richText','hot','recommend']`。
- `save()` 在 `sections.length === 0` 时直接提示并拒绝保存（`index.vue:297-300`）。

## 2. 问题

1. 「装修模式」与「京东兜底楼层」是**整页互斥**关系：启用任意区块 = 兜底楼层全消失。
2. 运营的真实诉求是「**在保留京东风格首页的基础上，加热门 / 推荐楼层**」，当前模型无法表达。
3. 线上现以 `shopContent = null` 规避，等于永远放弃装修能力（或每次启用都要人工确认哪些楼层会丢）。

## 3. 设计

### 3.1 骨架定义（前端常量，纯函数模块）

新增 `d:\zhao\nshop\layers\base\app\utils\home-skeleton.ts`：

```ts
export type SkeletonSlotKey = 'banner' | 'functionGrid' | 'brandFloor' | 'plaza' | 'hot' | 'recommend';

export interface SkeletonSlot {
  key: SkeletonSlotKey;              // 槽位 key（用于 hiddenSlots）+ 默认区块标识
  match: ShopSection['type'];        // 运营同类型区块覆盖此槽位
  fallback: ShopSection;             // 未配置时自动补的默认区块
}

export const HOME_SKELETON: SkeletonSlot[] = [
  { key: 'banner',       match: 'banner',     fallback: { type: 'banner', images: [] } },                       // images 空 → BannerBlock 回退 useHomeContent()
  { key: 'functionGrid', match: 'nav',        fallback: { type: 'nav', items: [], shape: 'round', layout: 'grid5x2' } },
  { key: 'brandFloor',   match: 'brandFloor', fallback: { type: 'brandFloor' } },
  { key: 'plaza',        match: 'plaza',      fallback: { type: 'plaza' } },
  { key: 'hot',          match: 'hot',        fallback: { type: 'hot', source: 'auto', limit: 10, layout: 'compact' } },
  { key: 'recommend',    match: 'recommend',  fallback: { type: 'recommend', source: 'auto', limit: 10, layout: 'compact', dedupe: true } },
];
```

- 槽位 key 用**固定字符串**而非类型名：`functionGrid` 槽位由运营的 `nav` 区块覆盖，避免与「运营想额外加一个 nav 区块」混淆。

### 3.2 合并算法 `resolveHomeSections`

```ts
export interface ResolvedSection {
  section: ShopSection;
  slotKey: SkeletonSlotKey | null;   // null = 运营的额外区块
  auto: boolean;                     // true = 本次自动补位生成
}

export function resolveHomeSections(content: ShopContent | null): ResolvedSection[];
```

> `resolveHomeSections` 只做「区块编排」，**不做取数**；自动补位的商品槽位（`hot` / `recommend`）所需数据由页面注入（见 §3.5），因此商品查询仍只有一处、可守请求数红线。

规则（逐条、确定性、纯函数）：

| # | 输入 | 行为 |
| --- | --- | --- |
| 1 | `content` 为 `null` / 坏 JSON / `sections` 非数组 | 骨架 6 段**全部**自动补位（`auto: true`） |
| 2 | 运营 sections 中存在与槽位 `match` 同类型的区块 | 取**第一个**未消费的同类型区块覆盖该槽位（`auto: false`），保留其全部配置 |
| 3 | 槽位未被覆盖 | 补 `fallback` 默认区块（`auto: true`） |
| 4 | 槽位 key ∈ `hiddenSlots` | 该槽位（无论覆盖还是补位）**不进入结果**；已被消费的运营区块同时作废 |
| 5 | 运营 sections 中未被任何槽位消费的区块 | 保持原序，追加到骨架**末尾**（`slotKey: null`） |
| 6 | 未知 `type` 的区块 | 丢弃（不渲染，不阻断其它槽位） |

输出顺序 = 骨架顺序（Banner → 十宫格 → 品牌闪购 → 品质专区 → 热门 → 推荐）+ 额外区块（末尾）。

示例（运营只加一个「热门商品」）：

```
输入 sections: [ { type:'hot', layout:'sliding', limit:8 } ]
输出: banner(auto) · functionGrid(auto) · brandFloor(auto) · plaza(auto) · hot(运营) · recommend(auto)
```

### 3.3 分类导航常驻

- `JdCategoryNav` **不进骨架、不进区块类型**；在 `HomeBlockRenderer` 之外、渲染器**上方**常驻渲染，`v-if="topCategories.length"`。
- 依据：`menuCollections` 由 `useMenuCollections()`（800ms 护栏 + 客户端兜底）提供，且 `GetMenuCollections` 实测 t2 仅 116–327ms，SSR 可直出。
- 收益：`shopContent = null` 与装修模式**都**保留分类横条，直接保住「问题 2 分类可见」的成果。

### 3.4 新增区块类型（前台 schema）

`d:\zhao\nshop\layers\base\app\utils\shop-content.ts`：

```ts
export interface BrandFloorSection { type: 'brandFloor'; title?: LocalizedText; }  // 品牌闪购：数据自 menuCollections
export interface PlazaSection      { type: 'plaza';      title?: LocalizedText; }  // 品质专区：数据自 menuCollections
export type ShopSection = ... | BrandFloorSection | PlazaSection;

export interface ShopContent {
  version: 1;
  sections: ShopSection[];
  hiddenSlots?: string[];   // 新增：显式移除的骨架槽位 key
}
```

- 两者均无重数据配置：`title` 走 `LocalizedText` 回退链，缺省回退 i18n 字典（复用既有 `messages.nav.brandFlash` / `messages.nav.qualityZone`）。
- `hiddenSlots` 解析须逐项过滤非字符串，并在 `parseShopContent` 中容错（非法项丢弃，不影响 `sections`）。

### 3.5 前台渲染改造

- `d:\zhao\nshop\app\pages\index.vue`
  - 移动端去掉「`hasBlocks` 二选一」，统一：
    ```
    <JdCategoryNav :categories="topCategories" />
    <HomeBlockRenderer :sections="resolvedSections" />
    ```
  - `resolvedSections` = `resolveHomeSections(shopContent)`（`shopContent` 取 `useShopContent()` 的原始 sections + `hiddenSlots`）。
  - 兜底商品取数条件从「`hasBlocks === false`」改为「**结果中存在 `auto` 的商品槽位**」：仅当热门/推荐槽位为自动补位时才发 `home-fallback-search`，并把结果按 `hot`(前 10) / `recommend`(10..20) 注入对应槽位。
    - 运营若已配置 hot / recommend 覆盖，则**不发**兜底搜索（沿用各自 `useCuratedGoods` 取数），请求数与现状装修模式一致。
  - PC 版式（`lg:block`）**完全不动**。
- `d:\zhao\nshop\layers\base\app\components\home\HomeBlockRenderer.vue`
  - `componentMap` 增 `brandFloor: BrandFloorBlock`、`plaza: PlazaBlock`。
  - 接收 `ResolvedSection[]`；渲染分支：`auto === true` 且 `slotKey` 为 `hot` / `recommend` 时，**不再走 `HotGoodsBlock` / `RecommendGoodsBlock`**（避免二次 `useCuratedGoods` 请求），而是直接以 `GoodsCardBlock` 渲染页面注入的商品数据（`layout: 'compact'`）；其余情况按 `section.type` 走 `componentMap`。
- 新增组件（薄适配，复用既有视觉）：
  - `blocks/BrandFloorBlock.vue` → `JdBrandFloor`（数据自 `useState('menuCollections')`）。
  - `blocks/PlazaBlock.vue` → `JdPlazaGrid`（`categories` 自 `menuCollections`；空则 `v-if` 自然隐藏）。
- `blocks/BannerBlock.vue`：`images` 为空时回退 `useHomeContent()` 的 Banner（与 `JdFunctionGrid` 的「配置优先、自动兜底」同模式）。

### 3.6 后台（web-admin）

- `src/templates/shared/schema.ts`
  - `VALID_TYPES` 增 `brandFloor` / `plaza`；新增两接口；`ShopContent` 增 `hiddenSlots?: string[]`。
  - `isValidShopContent`：`hiddenSlots` 若存在须为字符串数组（非法项视为校验失败，由后台提交前保证合法）。
- `src/pages/decorate/home/index.vue`
  - 新增按钮「+ 品牌闪购」「+ 品质专区」（配置面板仅「区块标题」）；`typeLabel()` 增两分支。
  - 页面顶部新增**骨架槽位只读区**：列出 6 个骨架槽位，逐行标注状态（`已覆盖` / `自动兜底` / `已移除`）+ 一个「移除兜底 / 恢复兜底」开关 → 写 `hiddenSlots`。
  - `buildContent()` 输出 `hiddenSlots`（空数组不写入）；`save()` 的「`sections.length === 0` 拒绝保存」放宽为「`sections.length === 0` **且** `hiddenSlots.length === 0` 时才拒绝」——否则运营无法表达「全部走兜底、但移除某个楼层」。
- i18n：`zh-Hans.json` / `en.json` 同步补齐新增 `decorateHome.*` 词条（含槽位名称、状态文案、开关）。

## 4. 错误处理与兜底

| 场景 | 行为 |
| --- | --- |
| `shopContent = null`（当前线上） | 骨架 6 段全部自动补位 + 分类导航常驻 = **与现状像素级一致**（除 `hot`/`recommend` 由 `JdProductGrid` 同口径渲染） |
| 坏 JSON / 缺字段 | `parseShopContent` 返回 `null` → 走自动补位（同第 1 行），不白屏 |
| 未知 `type` 区块 | 丢弃该区块，其余槽位照常补位 |
| `hiddenSlots` 覆盖全部 6 槽 | 首页仅剩分类导航 + 运营额外区块（可能为空） |
| 运营额外区块为空且全槽位 hidden | 首页仅分类导航；若分类也为空则渲染空白容器（不报错） |
| 分类取数失败 | 分类导航 / 品牌闪购 / 品质专区自然隐藏（`v-if`），不渲染空壳 |
| 兜底商品搜索失败 | 热门 / 推荐自动槽位降级为不渲染，不阻断其它槽位 |
| 骨架默认 `nav` 区块 `items: []` | `JdFunctionGrid` 回退自动 items（与现状十宫格一致，不触发后台 `nav` 校验，因默认区块仅前端生成） |

## 5. 测试与验收

### 5.1 单元测试（纯函数，`resolveHomeSections`）

- `null` / 坏 JSON → 输出 6 段且全部 `auto: true`，顺序 = 骨架顺序。
- 运营配置 `hot` → `hot` 槽位 `auto:false` 并保留其配置（`layout` / `limit`）。
- 运营配置 `nav` → 覆盖 `functionGrid` 槽位，`hot`/`recommend` 仍自动补位。
- 运营配置一个 `notice` → 6 段自动补位 + `notice` 追加末尾。
- 运营配置两个 `hot` → 第一个覆盖槽位，第二个追加末尾。
- `hiddenSlots: ['brandFloor']` → 结果无品牌闪购槽位，其余 5 段不变。
- `hiddenSlots` 含运营已覆盖的槽位 → 该运营区块一并不渲染。
- 未知 `type` → 丢弃且不影响其它槽位。
- `hiddenSlots` 含非字符串项 → 被过滤，不抛错。

### 5.2 线上回归

| # | 断言 |
| --- | --- |
| 1 | `shopContent = null` 时 t2 首页楼层 = 分类导航 + Banner + 十宫格 + 品牌闪购 + 品质专区 + 热门(10) + 推荐(10..20)，与改动前一致 |
| 2 | 写入 `sections: [hot, recommend]` 后，品牌闪购 / 十宫格 / 品质专区**仍然存在**（自动补位生效） |
| 3 | 写入 `hiddenSlots: ['brandFloor']` 后品牌闪购消失、其余 5 段仍在 |
| 4 | `shopContent = null` 时 `home-fallback-search` 请求数与改动前一致（守请求数红线） |
| 5 | `/t2/`、`/t2/category/*`、`/t2/product/*`、`/t1/`、`/` 全部 200，无 `[nuxt] instance unavailable` |

### 5.3 手机截图（硬规范）

390×844 / dpr=2，三张进操作手册：① t2 首页仅兜底；② t2 首页加热门+推荐（兜底楼层仍在）；③ `hiddenSlots` 关闭品牌闪购。

### 5.4 文档

更新 `d:\zhao\nshop\docs\superpowers\manual\t2-visibility\README.md`：
- 移除「装修配置存在时不再渲染京东兜底楼层」的旧说明，改为「未配置的楼层自动补位」。
- 新增「骨架槽位与自动补位」「如何移除某个兜底楼层（hiddenSlots）」两节 + 后台截图。

## 6. 改动面清单

| 层 | 文件 | 动作 |
| --- | --- | --- |
| nshop utils | `layers/base/app/utils/home-skeleton.ts`（新） | 骨架定义 + `resolveHomeSections` |
| nshop utils | `layers/base/app/utils/shop-content.ts` | `brandFloor` / `plaza` 类型 + `hiddenSlots` |
| nshop composables | `layers/base/app/composables/useShopContent.ts` | 暴露 `hiddenSlots` + `resolvedSections` |
| nshop app | `app/pages/index.vue` | 分类导航常驻 + 统一走渲染器 + 兜底取数条件改造 |
| nshop components | `components/home/HomeBlockRenderer.vue` | 注册两块 + 接收 `ResolvedSection[]` |
| nshop components | `components/home/blocks/BrandFloorBlock.vue` / `PlazaBlock.vue`（新） | 新块薄适配 |
| nshop components | `components/home/blocks/BannerBlock.vue` | `images` 空 → 回退 `useHomeContent()` |
| nshop components | `components/home/blocks/GoodsCardBlock.vue` | 作为自动补位商品槽位的复用渲染（无需改动，仅被渲染器直渲） |
| web-admin | `src/templates/shared/schema.ts` | 两类型 + `hiddenSlots` 校验 |
| web-admin | `src/pages/decorate/home/index.vue` | 两新增按钮 + 骨架槽位只读区 + 移除开关 |
| web-admin | `src/locale/zh-Hans.json` / `en.json` | 同步补词条 |
| docs | `nshop/docs/superpowers/manual/t2-visibility/README.md` | 说明与截图更新 |

## 7. 已知取舍与风险

| 项 | 说明 |
| --- | --- |
| 额外区块固定在末尾 | 骨架锚定的代价：运营的公告 / 富文本 / 第二个热门统一追加到末尾，无法插在骨架中间（后台现有实现本就无排序能力，不构成能力回退） |
| 装修模式请求数 | 运营**只加一个非商品区块**（如公告）时，骨架自动补位的热门 / 推荐会各发一次商品查询（较 `null` 多 2 次）。属「有兜底」的必要代价；已在 §5.2 断言 `null` 场景请求数不变 |
| `hot` / `recommend` 自动槽位 | 复用 `home-fallback-search` 单次查询结果（`GoodsCardBlock` + `layout:'compact'` → 内部 `JdProductGrid`），与现状兜底楼层视觉一致；运营覆盖后改走 `useCuratedGoods`，两套取数口径已对齐（同为 `SearchProducts` + 城市/配送后置过滤），排序细节可能有细微差异 |
| 骨架的十宫格默认 `shape` | 必须显式 `round` 才与现状一致（`NavGrid` 的京东默认是 `square`），实施时以 §5.2 断言 1 兜底校验 |
| PC 版式未纳入 | PC 仍走京东全屏布局；若将来要 PC 也走积木，需另立设计 |
| 文案默认标题来源 | 品牌闪购 / 品质专区标题复用既有 `messages.nav.brandFlash` / `qualityZone`，12 语言包已存在，无需新增 |