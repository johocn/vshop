# 首页装修积木 · 骨架自动补位兜底 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「装修积木」与「京东兜底楼层」从整页互斥变为骨架自动补位——运营只加热门/推荐时，Banner / 十宫格 / 品牌闪购 / 品质专区仍按固定槽位自动出现。

**Architecture:** 纯前端方案（方案 A）：新增 `layers/base/app/utils/home-skeleton.ts` 存放 10 个骨架槽位（6 兜底 + 4 可选）与纯函数 `resolveHomeSections(content)`；页面把 `shopContent` 交给它得到 `ResolvedSection[]` 后统一交给 `HomeBlockRenderer` 渲染。分类导航不进骨架、常驻渲染器上方。自动补位的商品槽位复用页面既有的**单次** `home-fallback-search` 结果，运营覆盖后走各自的 `useCuratedGoods`，请求数不增。后台零重构，仅加 4 个新区块按钮 + 骨架槽位只读区 + `hiddenSlots` 移除开关。

**Tech Stack:** Nuxt 4（`d:\zhao\nshop`，layer = `layers/base`）、Vue 3 `<script setup>`、vitest 4（`pnpm test`）、uni-app + Vue3（`d:\zhao\vshop\web-admin`，`npm run build:h5`）。

**权威设计文档：** `d:\zhao\vshop\web-admin\docs\superpowers\specs\2026-09-28-home-skeleton-fallback-design.md`

---

## File Structure

### nshop（C 端前台）

| 文件 | 责任 |
| --- | --- |
| `layers/base/app/utils/home-skeleton.ts`（新） | 骨架槽位常量 + `resolveHomeSections` 纯函数（唯一编排来源） |
| `layers/base/app/utils/__tests__/home-skeleton.spec.ts`（新） | 合并算法单测（设计 §5.1） |
| `layers/base/app/utils/__tests__/shop-content.spec.ts`（新） | `sanitizeHiddenSlots` 单测 |
| `layers/base/app/utils/shop-content.ts` | 4 个新 section 类型 + `hiddenSlots` + `sanitizeHiddenSlots` + `GoodsSection.limit` |
| `layers/base/app/composables/useShopContent.ts` | 暴露 `hiddenSlots` / `resolvedSections` |
| `layers/base/app/components/home/blocks/BrandFloorBlock.vue`（新） | 品牌闪购薄适配 |
| `layers/base/app/components/home/blocks/PlazaBlock.vue`（新） | 品质专区薄适配 |
| `layers/base/app/components/home/blocks/CouponFloorBlock.vue`（新） | 领券楼层（`useCoupon.ts`） |
| `layers/base/app/components/home/blocks/LatestGoodsBlock.vue`（新） | 最新商品（新品集合，复用 `GoodsFloor`） |
| `layers/base/app/components/home/jd/JdBrandFloor.vue` | 加可选 `title` prop（缺省回退既有 i18n） |
| `layers/base/app/components/home/jd/JdPlazaGrid.vue` | 加可选 `title` prop（缺省回退既有 i18n） |
| `layers/base/app/components/home/blocks/GoodsFloor.vue` | 支持 `section.limit` |
| `layers/base/app/components/home/blocks/BannerBlock.vue` | `images` 为空 → 回退 `useHomeContent()` |
| `layers/base/app/components/home/HomeBlockRenderer.vue` | 接收 `ResolvedSection[]` + 注册 4 新块 + 自动商品槽位直渲 |
| `app/pages/index.vue` | 分类导航常驻 + 移动端统一走渲染器 + 兜底取数条件改造 |
| `layers/base/i18n/locales/*.ts`（12 个） | `messages.home.couponFloor` / `latestGoods` |

### vshop web-admin（装修后台）

| 文件 | 责任 |
| --- | --- |
| `src/templates/shared/schema.ts` | 4 新类型 + `hiddenSlots` 校验 |
| `src/pages/decorate/home/index.vue` | 4 新增按钮 + 骨架槽位只读区 + 移除开关 + `save()` 放宽 |
| `src/locale/zh-Hans.json` / `src/locale/en.json` | 新增 `decorateHome.*` 词条 |

### docs

| 文件 | 责任 |
| --- | --- |
| `nshop/docs/superpowers/manual/t2-visibility/README.md` | 自动补位说明 + 槽位表 + 手机截图 |

---

## Task 1: 前台 schema — 4 个新类型 + hiddenSlots + sanitizeHiddenSlots

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\utils\shop-content.ts`
- Test: `d:\zhao\nshop\layers\base\app\utils\__tests__\shop-content.spec.ts`（新）

- [ ] **Step 1: 写失败测试**

创建 `d:\zhao\nshop\layers\base\app\utils\__tests__\shop-content.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { sanitizeHiddenSlots } from '../shop-content';

describe('sanitizeHiddenSlots 容错（后台/历史脏数据）', () => {
  it('非数组 → 空数组', () => {
    expect(sanitizeHiddenSlots(null)).toEqual([]);
    expect(sanitizeHiddenSlots(undefined)).toEqual([]);
    expect(sanitizeHiddenSlots('brandFloor')).toEqual([]);
    expect(sanitizeHiddenSlots({ 0: 'brandFloor' })).toEqual([]);
  });
  it('逐项过滤非字符串与空白，并 trim + 去重', () => {
    expect(sanitizeHiddenSlots(['brandFloor', 1, null, '  ', 'plaza', 'brandFloor'])).toEqual([
      'brandFloor',
      'plaza',
    ]);
  });
  it('合法数组原序返回', () => {
    expect(sanitizeHiddenSlots(['hot', 'recommend'])).toEqual(['hot', 'recommend']);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run（cwd = `d:\zhao\nshop`）：`npx vitest run layers/base/app/utils/__tests__/shop-content.spec.ts`
Expected: FAIL — `sanitizeHiddenSlots is not a function`（或导入报错）

- [ ] **Step 3: 实现类型与函数**

在 [shop-content.ts](file:///d:/zhao/nshop/layers/base/app/utils/shop-content.ts) 中：

(a) 把 `GoodsSection` 改为带 `limit`：

```ts
export interface GoodsSection {
  type: 'goods';
  collectionId?: string;   // 为空则自动推荐（fallback 现有 SearchProducts）
  layout?: GoodsLayout;
  title?: LocalizedText;
  limit?: number;          // 显式条数（1-30）；缺省按版式默认（compact/single 10、masonry 8）
}
```

(b) 在 `RecommendGoodsSection` 之后新增 4 个类型：

```ts
/** 品牌闪购楼层：数据自 menuCollections（与京东兜底楼层同源），无重数据配置 */
export interface BrandFloorSection { type: 'brandFloor'; title?: LocalizedText; }
/** 品质专区楼层：数据自 menuCollections，无重数据配置 */
export interface PlazaSection { type: 'plaza'; title?: LocalizedText; }
/** 领券楼层：数据自 shop 侧券接口（useCoupon.ts），无兜底 */
export interface CouponSection { type: 'coupon'; title?: LocalizedText; limit?: number; }
/** 最新商品楼层：用「新品集合」（collectionSlug）出楼，非 createdAt 排序 */
export interface LatestSection {
  type: 'latest';
  title?: LocalizedText;
  collectionId?: string;
  limit?: number;
  layout?: GoodsLayout;
}
```

(c) 扩展联合体与顶层类型：

```ts
export type ShopSection =
  | BannerSection
  | NoticeSection
  | NavSection
  | GoodsSection
  | RichTextSection
  | HotGoodsSection
  | RecommendGoodsSection
  | BrandFloorSection
  | PlazaSection
  | CouponSection
  | LatestSection;

export interface ShopContent {
  version: 1;
  sections: ShopSection[];
  /** 显式移除的骨架槽位 key（见 home-skeleton.ts 的 SkeletonSlotKey） */
  hiddenSlots?: string[];
}
```

(d) 在 `getSections` 之前新增（放在 `parseShopContent` 下方即可）：

```ts
/**
 * hiddenSlots 容错：仅保留非空字符串（trim + 去重，保持原序）。
 * 非数组 / 混入数字或 null / 空白项一律丢弃，不影响 sections 解析。
 */
export function sanitizeHiddenSlots(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run（cwd = `d:\zhao\nshop`）：`npx vitest run layers/base/app/utils/__tests__/shop-content.spec.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: 全量单测回归**

Run（cwd = `d:\zhao\nshop`）：`npm test`
Expected: 全部 PASS，无新增失败

- [ ] **Step 6: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/utils/shop-content.ts layers/base/app/utils/__tests__/shop-content.spec.ts
git -C d:/zhao/nshop commit -m "feat(home): shopContent 新增品牌闪购/品质专区/领券/最新商品类型与 hiddenSlots 容错"
```

---

## Task 2: 骨架合并纯函数 `resolveHomeSections`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\home-skeleton.ts`
- Test: `d:\zhao\nshop\layers\base\app\utils\__tests__\home-skeleton.spec.ts`

- [ ] **Step 1: 写失败测试（设计 §5.1 全量用例）**

创建 `d:\zhao\nshop\layers\base\app\utils\__tests__\home-skeleton.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { HOME_SKELETON, resolveHomeSections } from '../home-skeleton';
import type { ShopContent } from '../shop-content';

const keys = (content: ShopContent | null) => resolveHomeSections(content).map((r) => r.slotKey);

describe('resolveHomeSections · 空配置自动补位', () => {
  it('null → 只产出 6 个兜底槽位，全部 auto，顺序为骨架顺序', () => {
    const out = resolveHomeSections(null);
    expect(keys(null)).toEqual(['banner', 'functionGrid', 'brandFloor', 'plaza', 'hot', 'recommend']);
    expect(out.every((r) => r.auto)).toBe(true);
  });
  it('坏 JSON（sections 非数组）等同 null', () => {
    expect(keys({ version: 1, sections: undefined as any })).toEqual([
      'banner', 'functionGrid', 'brandFloor', 'plaza', 'hot', 'recommend',
    ]);
  });
  it('十宫格兜底必须显式 round（与京东现状一致）', () => {
    const grid = resolveHomeSections(null).find((r) => r.slotKey === 'functionGrid')!;
    expect(grid.section).toMatchObject({ type: 'nav', shape: 'round', layout: 'grid5x2', items: [] });
  });
  it('banner 兜底 images 为空（由 BannerBlock 回退 useHomeContent）', () => {
    const banner = resolveHomeSections(null).find((r) => r.slotKey === 'banner')!;
    expect(banner.section).toMatchObject({ type: 'banner', images: [] });
  });
});

describe('resolveHomeSections · 运营区块覆盖槽位', () => {
  it('配置 hot → hot 槽位 auto:false 且保留其配置', () => {
    const out = resolveHomeSections({ version: 1, sections: [{ type: 'hot', layout: 'sliding', limit: 8 }] });
    const hot = out.find((r) => r.slotKey === 'hot')!;
    expect(hot.auto).toBe(false);
    expect(hot.section).toMatchObject({ type: 'hot', layout: 'sliding', limit: 8 });
    // 其余兜底槽位仍自动补位
    expect(keys({ version: 1, sections: [] })).toEqual(['banner', 'functionGrid', 'brandFloor', 'plaza', 'hot', 'recommend']);
  });
  it('配置 nav → 覆盖 functionGrid，hot/recommend 仍自动补位', () => {
    const out = resolveHomeSections({ version: 1, sections: [{ type: 'nav', items: [{ label: 'A' }] }] });
    const grid = out.find((r) => r.slotKey === 'functionGrid')!;
    expect(grid.auto).toBe(false);
    expect(grid.section).toMatchObject({ type: 'nav', items: [{ label: 'A' }] });
    expect(out.filter((r) => r.auto && r.slotKey === 'hot').length).toBe(1);
  });
  it('配置 notice → 锚定十宫格上方（banner 之后、functionGrid 之前）', () => {
    const out = resolveHomeSections({ version: 1, sections: [{ type: 'notice', text: '公告' }] });
    expect(out.map((r) => r.slotKey ?? r.section.type)).toEqual([
      'banner', 'notice', 'functionGrid', 'brandFloor', 'plaza', 'hot', 'recommend',
    ]);
  });
  it('配置 coupon / latest → 各自锚定（coupon 在十宫格与品牌闪购之间；latest 在 recommend 之后）', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'coupon' }, { type: 'latest', collectionId: 'new' }],
    });
    expect(out.map((r) => r.slotKey ?? r.section.type)).toEqual([
      'banner', 'notice', 'functionGrid', 'coupon', 'brandFloor', 'plaza', 'goods', 'hot', 'recommend', 'latest',
    ].filter((k) => k !== 'notice' && k !== 'goods'));
  });
  it('配置 goods → 锚定品质专区与热门之间', () => {
    const out = resolveHomeSections({ version: 1, sections: [{ type: 'goods', collectionId: 'c1' }] });
    expect(out.map((r) => r.slotKey ?? r.section.type)).toEqual([
      'banner', 'functionGrid', 'brandFloor', 'plaza', 'goods', 'hot', 'recommend',
    ]);
  });
  it('两个 hot → 第一个覆盖槽位，第二个追加末尾', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'hot', limit: 4 }, { type: 'hot', limit: 6 }],
    });
    const hot = out.find((r) => r.slotKey === 'hot')!;
    expect(hot.section).toMatchObject({ limit: 4 });
    const extra = out.filter((r) => r.slotKey === null);
    expect(extra.length).toBe(1);
    expect(extra[0].section).toMatchObject({ type: 'hot', limit: 6 });
    expect(out[out.length - 1]).toBe(extra[0]);
  });
  it('未纳入骨架的类型（richText）保持原序追加末尾', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'richText', html: '<p>a</p>' }, { type: 'richText', html: '<p>b</p>' }],
    });
    const extra = out.filter((r) => r.slotKey === null);
    expect(extra.map((r) => (r.section as any).html)).toEqual(['<p>a</p>', '<p>b</p>']);
  });
});

describe('resolveHomeSections · hiddenSlots 显式移除', () => {
  it("hiddenSlots:['brandFloor'] → 结果无品牌闪购槽位，其余兜底不变", () => {
    expect(keys({ version: 1, sections: [], hiddenSlots: ['brandFloor'] })).toEqual([
      'banner', 'functionGrid', 'plaza', 'hot', 'recommend',
    ]);
  });
  it('hiddenSlots 含运营已覆盖的槽位 → 该运营区块一并不渲染（不追加到末尾）', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'hot', limit: 8 }],
      hiddenSlots: ['hot'],
    });
    expect(out.some((r) => r.section.type === 'hot')).toBe(false);
    expect(out.map((r) => r.slotKey)).toEqual(['banner', 'functionGrid', 'brandFloor', 'plaza', 'recommend']);
  });
  it('hiddenSlots 含非字符串项 → 被过滤，不抛错', () => {
    expect(() =>
      resolveHomeSections({ version: 1, sections: [], hiddenSlots: [1 as any, 'plaza'] }),
    ).not.toThrow();
    expect(keys({ version: 1, sections: [], hiddenSlots: [1 as any, 'plaza'] })).toEqual([
      'banner', 'functionGrid', 'brandFloor', 'hot', 'recommend',
    ]);
  });
});

describe('resolveHomeSections · 未知 type', () => {
  it('未知 type 丢弃且不影响其它槽位', () => {
    const out = resolveHomeSections({
      version: 1,
      sections: [{ type: 'flashSale' } as any, { type: 'richText', html: 'x' }],
    });
    expect(out.some((r) => (r.section as any).type === 'flashSale')).toBe(false);
    expect(out.filter((r) => r.slotKey === null).length).toBe(1);
    expect(out.filter((r) => r.auto).length).toBe(6);
  });
});

describe('HOME_SKELETON 常量', () => {
  it('10 个槽位，6 兜底 + 4 可选，顺序即最终渲染顺序', () => {
    expect(HOME_SKELETON.map((s) => s.key)).toEqual([
      'banner', 'notice', 'functionGrid', 'coupon', 'brandFloor', 'plaza', 'goods', 'hot', 'recommend', 'latest',
    ]);
    expect(HOME_SKELETON.filter((s) => s.fallback).length).toBe(6);
    expect(HOME_SKELETON.filter((s) => !s.fallback).map((s) => s.key)).toEqual([
      'notice', 'coupon', 'goods', 'latest',
    ]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run（cwd = `d:\zhao\nshop`）：`npx vitest run layers/base/app/utils/__tests__/home-skeleton.spec.ts`
Expected: FAIL — 模块 `../home-skeleton` 不存在

- [ ] **Step 3: 实现 `home-skeleton.ts`**

创建 `d:\zhao\nshop\layers\base\app\utils\home-skeleton.ts`：

```ts
// 首页骨架槽位与「自动补位」合并纯函数（SSR 友好，无副作用、不做取数）。
//
// 语义：京东兜底楼层被抽象为 6 个「兜底槽位」（fallback 非空，未配置即自动补位）；
// 另有 4 个「可选槽位」（fallback 为 null，运营不配置即不渲染）。
// 运营的同类型区块覆盖对应槽位；未被任何槽位消费的区块按原序追加到骨架末尾。
//
// 注意：分类导航（JdCategoryNav）不进骨架、不进 ShopSection 类型，由页面常驻渲染。
import { sanitizeHiddenSlots } from './shop-content';
import type { ShopContent, ShopSection } from './shop-content';

export type SkeletonSlotKey =
  // 6 个兜底槽位
  | 'banner'
  | 'functionGrid'
  | 'brandFloor'
  | 'plaza'
  | 'hot'
  | 'recommend'
  // 4 个可选槽位（无兜底）
  | 'notice'
  | 'coupon'
  | 'goods'
  | 'latest';

export interface SkeletonSlot {
  /** 槽位 key：用于 hiddenSlots，也是自动补位区块的标识 */
  key: SkeletonSlotKey;
  /** 运营同 type 的区块覆盖此槽位 */
  match: ShopSection['type'];
  /** null = 可选槽位（京东兜底楼本就没有此楼层，不补默认） */
  fallback: ShopSection | null;
}

/**
 * 骨架顺序 = 最终渲染顺序。
 * functionGrid 槽位的默认值必须显式 `shape: 'round'`：JdFunctionGrid 自身兜底是 round，
 * 而 NavGrid 传入的京东默认是 square，不显式给 round 会与改动前的十宫格视觉不一致。
 */
export const HOME_SKELETON: SkeletonSlot[] = [
  { key: 'banner',       match: 'banner',     fallback: { type: 'banner', images: [] } },
  { key: 'notice',       match: 'notice',     fallback: null },
  { key: 'functionGrid', match: 'nav',        fallback: { type: 'nav', items: [], shape: 'round', layout: 'grid5x2' } },
  { key: 'coupon',       match: 'coupon',     fallback: null },
  { key: 'brandFloor',   match: 'brandFloor', fallback: { type: 'brandFloor' } },
  { key: 'plaza',        match: 'plaza',      fallback: { type: 'plaza' } },
  { key: 'goods',        match: 'goods',      fallback: null },
  { key: 'hot',          match: 'hot',        fallback: { type: 'hot', source: 'auto', limit: 10, layout: 'compact' } },
  { key: 'recommend',    match: 'recommend',  fallback: { type: 'recommend', source: 'auto', limit: 10, layout: 'compact', dedupe: true } },
  { key: 'latest',       match: 'latest',     fallback: null },
];

export interface ResolvedSection {
  section: ShopSection;
  /** null = 运营的额外区块（未纳入骨架） */
  slotKey: SkeletonSlotKey | null;
  /** true = 本次自动补位生成 */
  auto: boolean;
}

/** 合法 section type 白名单：未知 type 一律丢弃，避免渲染器拿到无法映射的区块 */
const KNOWN_TYPES = new Set<string>(HOME_SKELETON.map((s) => s.match));

/**
 * 骨架合并（纯函数、确定性）：
 * 1. content 为 null / sections 非数组 → 所有兜底槽位自动补位（可选槽位不产出）；
 * 2. 同类型区块取「第一个未被消费」的覆盖对应槽位，保留其全部配置；
 * 3. 槽位 key ∈ hiddenSlots → 无论覆盖还是补位都不产出（已消费的运营区块同时作废）；
 * 4. 未被消费的区块保持原序追加到末尾（slotKey: null）；
 * 5. 未知 type 丢弃（不渲染、不阻断其它槽位）。
 */
export function resolveHomeSections(content: ShopContent | null | undefined): ResolvedSection[] {
  const hidden = new Set(sanitizeHiddenSlots(content?.hiddenSlots));
  const raw = Array.isArray(content?.sections) ? content!.sections : [];
  const pool = raw.filter(
    (s): s is ShopSection => !!s && typeof s === 'object' && KNOWN_TYPES.has((s as ShopSection).type),
  );

  const consumed = new Set<number>();
  const out: ResolvedSection[] = [];

  for (const slot of HOME_SKELETON) {
    const idx = pool.findIndex((s, i) => !consumed.has(i) && s.type === slot.match);
    const covered = idx >= 0;
    if (covered) consumed.add(idx);
    if (hidden.has(slot.key)) continue;
    if (covered) out.push({ section: pool[idx], slotKey: slot.key, auto: false });
    else if (slot.fallback) out.push({ section: slot.fallback, slotKey: slot.key, auto: true });
  }

  pool.forEach((s, i) => {
    if (!consumed.has(i)) out.push({ section: s, slotKey: null, auto: false });
  });

  return out;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run（cwd = `d:\zhao\nshop`）：`npx vitest run layers/base/app/utils/__tests__/home-skeleton.spec.ts`
Expected: PASS（17 passed）

- [ ] **Step 5: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无新增 error

- [ ] **Step 6: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/utils/home-skeleton.ts layers/base/app/utils/__tests__/home-skeleton.spec.ts
git -C d:/zhao/nshop commit -m "feat(home): 新增骨架槽位与 resolveHomeSections 自动补位纯函数（含单测）"
```

---

## Task 3: `useShopContent` 暴露 hiddenSlots / resolvedSections

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\composables\useShopContent.ts`

- [ ] **Step 1: 改写 composable**

把 [useShopContent.ts](file:///d:/zhao/nshop/layers/base/app/composables/useShopContent.ts) 全文替换为：

```ts
// home 页配置走五级合并（L1 全局 defaults.home → L2 模板 pages.home → L3 店铺 shopContent）。
// sections 数组整段覆盖（模板配了整页积木则整体生效，店铺 shopContent 为空时回退模板/全局）。
// resolvedSections：把原始配置交给骨架合并（未配置的兜底楼层自动补位），页面只消费它。
import { sanitizeHiddenSlots, type ShopContent, type ShopSection } from "../utils/shop-content";
import { resolveHomeSections, type ResolvedSection } from "../utils/home-skeleton";

export function useShopContent() {
  const { pageConfig } = useThemeConfig();

  const cfg = computed(() => pageConfig("home"));
  const sections = computed<ShopSection[]>(() => {
    const s = cfg.value?.sections;
    return Array.isArray(s) ? (s as ShopSection[]) : [];
  });
  const hiddenSlots = computed<string[]>(() => sanitizeHiddenSlots(cfg.value?.hiddenSlots));
  const content = computed<ShopContent>(() => ({
    version: 1,
    sections: sections.value,
    hiddenSlots: hiddenSlots.value,
  }));
  const resolvedSections = computed<ResolvedSection[]>(() => resolveHomeSections(content.value));

  return { sections, hiddenSlots, resolvedSections };
}
```

- [ ] **Step 2: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无新增 error（此时 `app/pages/index.vue` 仍用 `sections`，返回值未删，兼容）

- [ ] **Step 3: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/composables/useShopContent.ts
git -C d:/zhao/nshop commit -m "feat(home): useShopContent 暴露 hiddenSlots 与 resolvedSections"
```

---

## Task 4: JD 楼层组件支持自定义标题（JdBrandFloor / JdPlazaGrid）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\home\jd\JdBrandFloor.vue`
- Modify: `d:\zhao\nshop\layers\base\app\components\home\jd\JdPlazaGrid.vue`

> 视觉零改动：仅把写死的标题变成「可选 prop 优先、缺省回退原 i18n 文案」。

- [ ] **Step 1: `JdBrandFloor` 加可选 title prop**

在 [JdBrandFloor.vue](file:///d:/zhao/nshop/layers/base/app/components/home/jd/JdBrandFloor.vue) 的 `<script setup>` 中，把 `const cats = computed(...)` 之后加入：

```ts
const props = withDefaults(defineProps<{ title?: string }>(), { title: undefined });
/** 标题：装修配置优先，缺省回退既有 i18n 文案（视觉零改动） */
const heading = computed(() => props.title?.trim() || t('messages.nav.brandFlash'));
```

并把模板中的 `{{ t('messages.nav.brandFlash') }}` 改为 `{{ heading }}`。

- [ ] **Step 2: `JdPlazaGrid` 加可选 title prop**

把 [JdPlazaGrid.vue](file:///d:/zhao/nshop/layers/base/app/components/home/jd/JdPlazaGrid.vue) 的 props 声明改为：

```ts
const props = withDefaults(
  defineProps<{
    categories: Array<{
      name: string;
      slug: string;
      featuredAsset?: { preview?: string } | null;
      children?: Array<{ name: string }> | null;
    }>;
    title?: string;
  }>(),
  { title: undefined },
);
const heading = computed(() => props.title?.trim() || t('messages.nav.qualityZone'));
```

并把模板中的 `{{ t('messages.nav.qualityZone') }}` 改为 `{{ heading }}`。

- [ ] **Step 3: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无新增 error（`app/pages/index.vue` 现有调用未传 title，走默认）

- [ ] **Step 4: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/components/home/jd/JdBrandFloor.vue layers/base/app/components/home/jd/JdPlazaGrid.vue
git -C d:/zhao/nshop commit -m "feat(home): JdBrandFloor/JdPlazaGrid 支持自定义楼层标题（缺省回退 i18n）"
```

---

## Task 5: `GoodsFloor` 支持 `section.limit`

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\home\blocks\GoodsFloor.vue`

> 供「最新商品」楼层（复用 `GoodsFloor`）表达「显示条数」。

- [ ] **Step 1: 改造 take 与 useAsyncData key**

在 [GoodsFloor.vue](file:///d:/zhao/nshop/layers/base/app/components/home/blocks/GoodsFloor.vue) 中，把

```ts
const take = computed(() => (layout.value === "masonry" ? 8 : 10));
```

替换为：

```ts
// 显式 limit（1-30）优先；缺省按版式默认（compact/single 10、masonry 8）
const take = computed(() => {
  const l = props.section.limit;
  if (typeof l === "number" && Number.isInteger(l) && l > 0) return Math.min(l, 30);
  return layout.value === "masonry" ? 8 : 10;
});
```

并把 key 行

```ts
const key = `goods-block-${props.section.collectionId ?? "auto"}`;
```

替换为（同集合不同条数不可共用同一份取数结果）：

```ts
const key = `goods-block-${props.section.collectionId ?? "auto"}${props.section.limit ? `-${take.value}` : ""}`;
```

- [ ] **Step 2: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无新增 error

- [ ] **Step 3: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/components/home/blocks/GoodsFloor.vue
git -C d:/zhao/nshop commit -m "feat(home): GoodsFloor 支持 section.limit 显式条数"
```

---

## Task 6: 新增薄适配块 BrandFloorBlock / PlazaBlock

**Files:**
- Create: `d:\zhao\nshop\layers/base\app\components\home\blocks\BrandFloorBlock.vue`
- Create: `d:\zhao\nshop\layers/base\app\components\home\blocks\PlazaBlock.vue`

- [ ] **Step 1: 创建 `BrandFloorBlock.vue`**

```vue
<script setup lang="ts">
// 品牌闪购区块适配：复用京东兜底楼层组件（数据自 useMenuCollections 写入的 useState('menuCollections')）
import JdBrandFloor from "../jd/JdBrandFloor.vue";
import { localizeText } from "../../../utils/detail-config";
import type { BrandFloorSection } from "../../../utils/shop-content";

const props = defineProps<{ section: BrandFloorSection }>();
const { locale } = useI18n();

// 标题 LocalizedText 回退链；未配置时传 undefined，由 JdBrandFloor 回退 i18n 文案
const title = computed(() => localizeText(props.section?.title, locale.value) || undefined);
</script>

<template>
  <JdBrandFloor :title="title" />
</template>
```

- [ ] **Step 2: 创建 `PlazaBlock.vue`**

```vue
<script setup lang="ts">
// 品质专区区块适配：分类数据自 useState('menuCollections')；无分类则整层隐藏（与现状一致）
import type { MenuCollections } from "~~/types/collection";
import JdPlazaGrid from "../jd/JdPlazaGrid.vue";
import { localizeText } from "../../../utils/detail-config";
import type { PlazaSection } from "../../../utils/shop-content";

const props = defineProps<{ section: PlazaSection }>();
const { locale } = useI18n();

const menuCollections = useState<MenuCollections>("menuCollections");
const categories = computed(() => menuCollections.value?.collections?.items ?? []);
const title = computed(() => localizeText(props.section?.title, locale.value) || undefined);
</script>

<template>
  <div v-if="categories.length" class="mt-2">
    <JdPlazaGrid :categories="categories" :title="title" />
  </div>
</template>
```

- [ ] **Step 3: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无新增 error（组件暂未被引用，Nuxt 自动注册会扫描到）

- [ ] **Step 4: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/components/home/blocks/BrandFloorBlock.vue layers/base/app/components/home/blocks/PlazaBlock.vue
git -C d:/zhao/nshop commit -m "feat(home): 新增品牌闪购/品质专区积木块（复用 Jd 楼层）"
```

---

## Task 7: 新增 `LatestGoodsBlock.vue`（最新商品 · 新品集合）

**Files:**
- Create: `d:\zhao\nshop\layers/base\app\components\home\blocks\LatestGoodsBlock.vue`

- [ ] **Step 1: 创建组件**

```vue
<script setup lang="ts">
// 最新商品区块：固定用「新品集合」出楼（collectionSlug = section.collectionId），复用 goods 楼层取数/渲染。
// 注意：Vendure SearchResultSortParameter 只有 name/price，无 createdAt 排序，故「最新」由运营维护集合表达。
// 未选择集合 → 整层隐藏（同 goods 的空集合行为）。
import GoodsFloor from "./GoodsFloor.vue";
import type { GoodsSection, LatestSection } from "../../../utils/shop-content";

const props = defineProps<{ section: LatestSection }>();

const goodsSection = computed<GoodsSection | null>(() => {
  const cid = (props.section?.collectionId ?? "").trim();
  if (!cid) return null;
  return {
    type: "goods",
    collectionId: cid,
    title: props.section.title,
    layout: props.section.layout,
    limit: props.section.limit,
  };
});
</script>

<template>
  <GoodsFloor v-if="goodsSection" :section="goodsSection" />
</template>
```

- [ ] **Step 2: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无新增 error

- [ ] **Step 3: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/components/home/blocks/LatestGoodsBlock.vue
git -C d:/zhao/nshop commit -m "feat(home): 新增最新商品积木块（新品集合复用 goods 楼层）"
```

---

## Task 8: 新增 `CouponFloorBlock.vue`（领券楼层）

**Files:**
- Create: `d:\zhao\nshop\layers/base\app\components\home\blocks\CouponFloorBlock.vue`

> 复用 `useCoupon.ts` 的 `getCouponCentre` / `claimCoupon` / `couponErrorMessage` 与 `messages.coupon.*` 文案；
> 卡片视觉为移动端紧凑版（横向滑动），不引入新接口。
> 过滤口径：仅 `claimable === true` 且未过期（`endsAt` 为空或晚于当前）且未抢完（`claimedCount < totalCount`）；
> 无券 / 请求失败 → 整层隐藏。

- [ ] **Step 1: 创建组件**

```vue
<script setup lang="ts">
// 领券楼层：数据自 shop 侧券接口（useCoupon.ts），无兜底——不配置即不渲染，无券即整层隐藏。
import {
  getCouponCentre,
  claimCoupon,
  couponErrorMessage,
  type CouponTemplate,
  type CouponType,
} from "../../../composables/useCoupon";
import { localizeText } from "../../../utils/detail-config";
import type { CouponSection } from "../../../utils/shop-content";

const props = defineProps<{ section: CouponSection }>();
const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());

const coupons = ref<CouponTemplate[]>([]);
const claimingId = ref<string | null>(null);

const MAX = computed(() => {
  const l = props.section?.limit;
  if (typeof l === "number" && Number.isInteger(l) && l > 0) return Math.min(l, 30);
  return 6;
});
const title = computed(() => localizeText(props.section?.title, locale.value) || t("messages.home.couponFloor"));

/** 仅展示：可领取 + 未过期 + 未抢完 */
const visible = computed(() =>
  coupons.value
    .filter((c) => c.claimable !== false)
    .filter((c) => !c.endsAt || new Date(c.endsAt).getTime() > Date.now())
    .filter((c) => !c.totalCount || c.claimedCount == null || c.claimedCount < c.totalCount)
    .slice(0, MAX.value),
);

function typeTip(type?: CouponType): string {
  if (type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  if (type === "FULL") return t("messages.coupon.typeFull");
  if (type === "PERCENT") return t("messages.coupon.typePercent");
  return t("messages.coupon.typeFixed");
}

function amount(type?: CouponType, discountValue = 0): string {
  if (type === "FREE_SHIPPING") return "";
  if (type === "PERCENT") {
    const zhe = discountValue / 10;
    return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
  }
  return (discountValue / 100).toString();
}

function unit(type?: CouponType): string {
  if (type === "FREE_SHIPPING" || type === "PERCENT") return type === "PERCENT" ? t("messages.coupon.unitDiscount") : "";
  return t("messages.coupon.unitYuan");
}

function condition(c: CouponTemplate): string {
  const minSpend = c.minSpend ? c.minSpend / 100 : 0;
  if (c.type === "FREE_SHIPPING") return c.description || t("messages.coupon.typeFreeShipping");
  if (c.type === "FULL") return t("messages.coupon.noThresholdFull");
  if (!minSpend) return t("messages.coupon.noThreshold");
  return t("messages.coupon.minSpend", { n: minSpend });
}

async function load() {
  try {
    coupons.value = await getCouponCentre();
  } catch {
    coupons.value = []; // 取数失败整层隐藏，不阻断首页其它区块
  }
}

async function claim(c: CouponTemplate) {
  if (!isAuthenticated.value) {
    await navigateTo(localePath("/account/login"));
    return;
  }
  if (claimingId.value) return;
  claimingId.value = c.id;
  try {
    await claimCoupon(c.id);
    toast.add({ title: t("messages.coupon.claimSuccess"), color: "success" });
    c.claimedCount += 1;
  } catch (e) {
    toast.add({ title: t("messages.coupon.claimFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    claimingId.value = null;
  }
}

await load();
</script>

<template>
  <section v-if="visible.length" class="mt-2 rounded-lg bg-white p-3">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-base font-bold text-gray-800">{{ title }}</h2>
      <NuxtLink :to="localePath('/coupon')" class="text-xs text-primary">{{ t('messages.nav.viewMore') }} ›</NuxtLink>
    </div>
    <div class="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      <div
        v-for="c in visible"
        :key="c.id"
        class="flex w-[220px] shrink-0 items-stretch gap-2 rounded-lg border border-gray-100 p-2"
      >
        <div class="flex w-16 shrink-0 flex-col items-center justify-center rounded bg-primary text-white">
          <span class="text-lg font-bold">
            <span v-if="c.type === 'FIXED' || c.type === 'FULL'">¥</span>{{ amount(c.type, c.discountValue) }}
          </span>
          <span class="text-[10px] opacity-90">{{ typeTip(c.type) }}</span>
        </div>
        <div class="flex min-w-0 flex-1 flex-col">
          <p class="truncate text-xs font-semibold text-gray-800">{{ c.name }}</p>
          <p class="mt-0.5 truncate text-[11px] text-gray-400">{{ condition(c) }}</p>
          <button
            class="mt-auto rounded bg-primary py-1 text-[11px] text-white disabled:opacity-60"
            :disabled="claimingId === c.id"
            @click="claim(c)"
          >
            {{ claimingId === c.id ? t('messages.coupon.claiming') : t('messages.coupon.claim') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
```

- [ ] **Step 2: 校验引用的 i18n key 均存在**

Run（cwd = `d:\zhao\nshop`）：

```bash
grep -n "claiming\|claimSuccess\|claimFailed\|unitYuan\|typeFixed\|typePercent\|typeFull\|typeFreeShipping\|noThresholdFull\|noThreshold\|minSpend\b" layers/base/i18n/locales/zh-CN.ts
```

Expected: 上面每个 key 都能在 zh-CN 的 `messages.coupon` 段命中（`claiming` 若缺失见 Step 3）

- [ ] **Step 3: 若 `messages.coupon.claiming` 缺失，补中文词条**

在 [zh-CN.ts](file:///d:/zhao/nshop/layers/base/i18n/locales/zh-CN.ts) 的 `messages.coupon` 段、`claim` 词条旁新增：

```ts
      claiming: '领取中…',
```

若要避免「领取中…」硬塞进 12 语言包的工作量，也可把模板里的 `t('messages.coupon.claiming')` 改回 `t('messages.coupon.claim')`（二选一，实施时以 zh-CN 实际存在的 key 为准）。

- [ ] **Step 4: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无新增 error

- [ ] **Step 5: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/components/home/blocks/CouponFloorBlock.vue
git -C d:/zhao/nshop commit -m "feat(home): 新增领券楼层积木块（复用 useCoupon 券接口）"
```

---

## Task 9: `BannerBlock` 空配置回退首页运营 Banner

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\home\blocks\BannerBlock.vue`

- [ ] **Step 1: 全文替换组件**

把 [BannerBlock.vue](file:///d:/zhao/nshop/layers/base/app/components/home/blocks/BannerBlock.vue) 替换为：

```vue
<script setup lang="ts">
// banner 区块适配：配置优先、自动兜底（与 JdFunctionGrid「items 为空回退自动数据」同模式）。
// images 为空 → 回退首页运营内容（GetHomeContent）的 Banner 块；都为空时由 JdBannerCarousel 渲染占位。
import JdBannerCarousel from "../jd/JdBannerCarousel.vue";
import { isHero } from "../../../utils/home-content";
import type { BannerSection } from "../../../utils/shop-content";

const props = defineProps<{ section: BannerSection }>();

// useHomeContent 与首页页面级调用共用同一 useAsyncData key（payload 去重，不额外发请求）
const { content } = await useHomeContent();

const slides = computed(() => {
  const configured = (props.section?.images ?? []).filter((im) => !!im?.image);
  if (configured.length) {
    return configured.map((im, i) => ({ imageUrl: im.image, link: im.link, title: `slide-${i}` }));
  }
  return (content.value ?? [])
    .map((b) => b.data ?? {})
    .filter((d: any) => isHero(d))
    .map((d: any) => ({
      imageUrl: (d as any).imageUrl,
      link: (d as any).link,
      title: (d as any).title || (d as any).subTitle,
    }));
});
</script>

<template>
  <JdBannerCarousel :slides="slides" />
</template>
```

- [ ] **Step 2: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无新增 error

- [ ] **Step 3: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/components/home/blocks/BannerBlock.vue
git -C d:/zhao/nshop commit -m "feat(home): BannerBlock 空配置回退首页运营 Banner"
```

---

## Task 10: `HomeBlockRenderer` 接收 ResolvedSection[] 并注册 4 个新块

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\home\HomeBlockRenderer.vue`

- [ ] **Step 1: 全文替换渲染器**

```vue
<script setup lang="ts">
// 积木化统一渲染入口：按 section.type 映射组件（显式 import 组件对象，
// 避免字符串组件名被当作 custom element 渲染成空标签——与既有 home 修复模式一致）。
//
// 输入为骨架合并结果 ResolvedSection[]：
//  - auto === true 且 slotKey 为 hot/recommend 的槽位，直接以 GoodsCardBlock 渲染页面注入的
//    home-fallback-search 结果（避免二次 useCuratedGoods 请求，守请求数红线）；
//  - 其余按 section.type 走 componentMap。
import BannerBlock from "./blocks/BannerBlock.vue";
import NoticeBlock from "./blocks/NoticeBlock.vue";
import NavGrid from "./blocks/NavGrid.vue";
import GoodsFloor from "./blocks/GoodsFloor.vue";
import RichTextView from "./blocks/RichTextView.vue";
import HotGoodsBlock from "./blocks/HotGoodsBlock.vue";
import RecommendGoodsBlock from "./blocks/RecommendGoodsBlock.vue";
import BrandFloorBlock from "./blocks/BrandFloorBlock.vue";
import PlazaBlock from "./blocks/PlazaBlock.vue";
import CouponFloorBlock from "./blocks/CouponFloorBlock.vue";
import LatestGoodsBlock from "./blocks/LatestGoodsBlock.vue";
import GoodsCardBlock from "./blocks/GoodsCardBlock.vue";
import type { SearchResult } from "~~/types/product";
import type { ResolvedSection } from "../../utils/home-skeleton";

const props = defineProps<{
  sections: ResolvedSection[];
  /** 自动补位商品槽位的数据：页面单次 home-fallback-search 注入 */
  autoGoods?: { hot: SearchResult; more: SearchResult } | null;
}>();

const { t } = useI18n();

const componentMap: Record<string, any> = {
  banner: BannerBlock,
  notice: NoticeBlock,
  nav: NavGrid,
  goods: GoodsFloor,
  richText: RichTextView,
  hot: HotGoodsBlock,
  recommend: RecommendGoodsBlock,
  brandFloor: BrandFloorBlock,
  plaza: PlazaBlock,
  coupon: CouponFloorBlock,
  latest: LatestGoodsBlock,
};

/** 自动补位的商品槽位：直渲注入数据，不再走 HotGoodsBlock/RecommendGoodsBlock */
function isAutoGoods(r: ResolvedSection): boolean {
  return r.auto && (r.slotKey === "hot" || r.slotKey === "recommend");
}
function autoProducts(r: ResolvedSection): SearchResult {
  return (r.slotKey === "hot" ? props.autoGoods?.hot : props.autoGoods?.more) ?? [];
}
function autoTitle(r: ResolvedSection): string {
  return r.slotKey === "hot" ? t("messages.home.hotGoods") : t("messages.general.recommendations");
}
</script>

<template>
  <template v-for="(item, index) in props.sections" :key="index">
    <GoodsCardBlock
      v-if="isAutoGoods(item)"
      :title="autoTitle(item)"
      :products="autoProducts(item)"
      layout="compact"
    />
    <component
      v-else
      :is="componentMap[item.section.type] ?? null"
      :section="item.section"
    />
  </template>
</template>
```

- [ ] **Step 2: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: `app/pages/index.vue` 处报 1 个「`ShopSection[]` 不能赋给 `ResolvedSection[]`」——由 Task 11 修掉（若报错即符合预期，继续）

- [ ] **Step 3: 提交**

```bash
git -C d:/zhao/nshop add layers/base/app/components/home/HomeBlockRenderer.vue
git -C d:/zhao/nshop commit -m "feat(home): HomeBlockRenderer 消费骨架合并结果并注册 4 个新块"
```

---

## Task 11: `app/pages/index.vue` 移动端统一渲染 + 兜底取数条件改造

**Files:**
- Modify: `d:\zhao\nshop\app\pages\index.vue`

- [ ] **Step 1: 改造 script（第 22-24 行 import 与第 49-51 行配置消费）**

删除不再使用的两行 import：

```ts
import JdFunctionGrid from "../../layers/base/app/components/home/jd/JdFunctionGrid.vue";
import JdBrandFloor from "../../layers/base/app/components/home/jd/JdBrandFloor.vue";
```

把

```ts
// 3) 装修配置：GetChannelTheme → sections（useShopContent 内部单个 useAsyncData + 单次 useAsyncGql）
const { sections: shopSections } = useShopContent();
const hasBlocks = computed(() => shopSections.value.length > 0);
```

替换为：

```ts
// 3) 装修配置：GetChannelTheme → 骨架合并后的区块编排（useShopContent 内部单个 useAsyncData + 单次 useAsyncGql）
//    resolvedSections 已把「未配置的京东兜底楼层」自动补齐为对应槽位（见 utils/home-skeleton.ts）
const { resolvedSections } = useShopContent();
// 仅当热门/推荐槽位是自动补位时才发兜底商品搜索；运营覆盖后走各自 useCuratedGoods（请求数与改动前一致）
const needFallbackGoods = computed(() =>
  resolvedSections.value.some((r) => r.auto && (r.slotKey === "hot" || r.slotKey === "recommend")),
);
```

- [ ] **Step 2: 改造兜底搜索的短路条件**

把 [index.vue](file:///d:/zhao/nshop/app/pages/index.vue) 中

```ts
    if (hasBlocks.value) return { hot: [], more: [] };
```

替换为：

```ts
    // 运营已覆盖 hot/recommend 时不发兜底搜索（沿用各自 useCuratedGoods）；骨架自动补位时复用这一次结果
    if (!needFallbackGoods.value) return { hot: [], more: [] };
```

并在 `hotProducts` / `moreProducts` 之后新增注入对象：

```ts
const hotProducts = computed(() => fallbackSearch.value?.hot ?? []);
const moreProducts = computed(() => fallbackSearch.value?.more ?? []);
/** 注入给渲染器的自动补位商品数据（与兜底楼层同源、单次请求） */
const autoGoods = computed(() => ({ hot: hotProducts.value, more: moreProducts.value }));
```

- [ ] **Step 3: 改造移动端模板（第 262-288 行整段）**

把移动端 `<main data-layout="mobile">` 整段替换为：

```html
  <!-- ═══ 移动端降级版（<1024px 显示）：分类导航常驻 + 骨架自动补位渲染 ═══ -->
  <main class="mx-auto max-w-md bg-[#f5f5f5] pb-20 lg:hidden" data-layout="mobile">
    <!-- 分类导航（常驻顶栏，不进骨架、不参与覆盖/补位；有分类数据即渲染） -->
    <JdCategoryNav v-if="topCategories.length" :categories="topCategories" />
    <HomeBlockRenderer :sections="resolvedSections" :auto-goods="autoGoods" />
  </main>
```

- [ ] **Step 4: 类型检查 + 全量单测**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck && npm test`
Expected: typecheck 无 error；单测全部 PASS

- [ ] **Step 5: 本地起服务做冒烟（`shopContent = null` 无回归）**

Run（cwd = `d:\zhao\nshop`，后台运行）：`npm run dev`
然后在另一个终端：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

Expected: `200`；页面 HTML 中同时出现「分类导航」「品牌闪购」「品质专区」三个楼层标题（即 6 兜底槽位 + 分类导航常驻均已渲染）。
完成后停掉 dev server。

- [ ] **Step 6: 提交**

```bash
git -C d:/zhao/nshop add app/pages/index.vue
git -C d:/zhao/nshop commit -m "feat(home): 首页移动端统一走骨架渲染，分类导航常驻、兜底商品复用单次搜索"
```

---

## Task 12: nshop i18n 12 语言包补齐领券 / 最新商品默认标题

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`、`en-US.ts`、`bg-BG.ts`、`ru-RU.ts`、`fa-IR.ts`、`de-DE.ts`、`es-ES.ts`、`fr-FR.ts`、`it-IT.ts`、`pt-BR.ts`、`ja-JP.ts`、`ko-KR.ts`

- [ ] **Step 1: 每个语言包在 `messages.home` 段补两个 key**

在**每个** locale 文件的 `messages.home` 段内（紧随 `hotGoods` / `recommendGoods` 之后）加两行，取值按下表：

| 文件 | `couponFloor` | `latestGoods` |
| --- | --- | --- |
| `zh-CN.ts` | `'领券中心'` | `'新品首发'` |
| `en-US.ts` | `'Coupons'` | `'New Arrivals'` |
| `bg-BG.ts` | `'Купони'` | `'Нови продукти'` |
| `ru-RU.ts` | `'Купоны'` | `'Новинки'` |
| `fa-IR.ts` | `'کوپنها'` | `'تازهها'` |
| `de-DE.ts` | `'Gutscheine'` | `'Neuheiten'` |
| `es-ES.ts` | `'Cupones'` | `'Novedades'` |
| `fr-FR.ts` | `'Coupons'` | `'Nouveautés'` |
| `it-IT.ts` | `'Coupon'` | `'Novità'` |
| `pt-BR.ts` | `'Cupons'` | `'Novidades'` |
| `ja-JP.ts` | `'クーポン'` | `'新着商品'` |
| `ko-KR.ts` | `'쿠폰'` | `'신상품'` |

例如 `zh-CN.ts`：

```ts
      hotGoods: '热门商品',
      recommendGoods: '为你推荐',
      couponFloor: '领券中心',
      latestGoods: '新品首发',
```

- [ ] **Step 2: 校验 12 个语言包均已补齐**

Run（cwd = `d:\zhao\nshop`）：

```bash
grep -c "couponFloor" layers/base/i18n/locales/*.ts
```

Expected: 12 个文件各输出 `1`

- [ ] **Step 3: 类型检查**

Run（cwd = `d:\zhao\nshop`）：`npm run typecheck`
Expected: 无新增 error

- [ ] **Step 4: 提交**

```bash
git -C d:/zhao/nshop add layers/base/i18n/locales
git -C d:/zhao/nshop commit -m "i18n(home): 12 语言包补齐领券/最新商品楼层默认标题"
```

---

## Task 13: web-admin schema — 4 新类型 + hiddenSlots 校验

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\templates\shared\schema.ts`

- [ ] **Step 1: 新增类型与常量**

在 [schema.ts](file:///d:/zhao/vshop/web-admin/src/templates/shared/schema.ts) 中，把 `ShopSection` 联合体与 `ShopContent` 替换为：

```ts
// 新增楼层（与前台 shop-content schema 对齐；本工程无 LocalizedText，标题用 string）
export interface BrandFloorSection { type: 'brandFloor'; title?: string; }
export interface PlazaSection { type: 'plaza'; title?: string; }
export interface CouponSection { type: 'coupon'; title?: string; limit?: number; }
export interface LatestSection { type: 'latest'; title?: string; collectionId?: string; limit?: number; layout?: GoodsLayout; }

export type ShopSection =
  | BannerSection | NoticeSection | NavSection | GoodsSection | RichTextSection
  | HotGoodsSection | RecommendGoodsSection
  | BrandFloorSection | PlazaSection | CouponSection | LatestSection;

export interface ShopContent {
  version: number;
  theme?: ShopTheme;
  sections: ShopSection[];
  /** 显式移除的骨架槽位 key（与前台 home-skeleton.ts 的 SkeletonSlotKey 对齐） */
  hiddenSlots?: string[];
}

const VALID_TYPES = ['banner', 'notice', 'nav', 'goods', 'richText', 'hot', 'recommend', 'brandFloor', 'plaza', 'coupon', 'latest'];
```

- [ ] **Step 2: 扩展校验**

在 `isValidShopContent` 的 `for (const sec of data.sections)` 循环内、`if (sec.type === 'hot' || sec.type === 'recommend') { ... }` 之后追加：

```ts
    // 新增楼层：标题可选字符串；limit 正整数 ≤30；latest 的集合可空字符串；layout 三选一
    if (sec.type === 'brandFloor' || sec.type === 'plaza') {
      if (sec.title != null && typeof sec.title !== 'string') return false;
    }
    if (sec.type === 'coupon') {
      if (sec.title != null && typeof sec.title !== 'string') return false;
      if (sec.limit != null && (!Number.isInteger(sec.limit) || sec.limit < 1 || sec.limit > 30)) return false;
    }
    if (sec.type === 'latest') {
      if (sec.title != null && typeof sec.title !== 'string') return false;
      if (sec.collectionId != null && typeof sec.collectionId !== 'string') return false;
      if (sec.limit != null && (!Number.isInteger(sec.limit) || sec.limit < 1 || sec.limit > 30)) return false;
      if (sec.layout != null && !['compact', 'masonry', 'single'].includes(sec.layout)) return false;
    }
```

并在 `return true;` 之前（循环之后）追加：

```ts
  // hiddenSlots：存在则必须是字符串数组（非法项视为校验失败，由后台提交前保证合法）
  if (data.hiddenSlots != null) {
    if (!Array.isArray(data.hiddenSlots)) return false;
    if (!data.hiddenSlots.every((k: any) => typeof k === 'string')) return false;
  }
```

- [ ] **Step 3: 类型检查（构建）**

Run（cwd = `d:\zhao\vshop\web-admin`）：`npm run build:h5`
Expected: 构建成功（无 TS error）

- [ ] **Step 4: 提交**

```bash
git -C d:/zhao/vshop add web-admin/src/templates/shared/schema.ts
git -C d:/zhao/vshop commit -m "feat(decorate): shopContent schema 支持品牌闪购/品质专区/领券/最新商品与 hiddenSlots"
```

---

## Task 14: web-admin 装修页 — 4 个新增按钮 + 骨架槽位只读区 + hiddenSlots

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\home\index.vue`

- [ ] **Step 1: 模板 —— 顶部新增「骨架槽位」只读区**

在 [index.vue](file:///d:/zhao/vshop/web-admin/src/pages/decorate/home/index.vue) 模板的 `<view class="page">` 内、`<view v-if="sections.length === 0" ...>` 之前插入：

```html
    <!-- 骨架槽位（只读）：展示最终渲染顺序与每个槽位的状态；兜底槽位可「移除 / 恢复」 -->
    <view class="slots">
      <view class="slots-head">{{ $t('decorateHome.slotOrderTitle') }}</view>
      <view class="slot" v-for="s in SLOTS" :key="s.key">
        <text class="slot-name">{{ $t(`decorateHome.${s.labelKey}`) }}</text>
        <text class="slot-tag">{{ s.fallback ? $t('decorateHome.slotFallback') : $t('decorateHome.slotOptional') }}</text>
        <text class="slot-state">{{ $t(`decorateHome.${slotStateKey(s)}`) }}</text>
        <text v-if="s.fallback" class="slot-toggle" @tap="toggleSlot(s)">
          {{ hiddenSlots.includes(s.key) ? $t('decorateHome.slotRestore') : $t('decorateHome.slotRemove') }}
        </text>
      </view>
      <view class="muted hint">{{ $t('decorateHome.slotHint') }}</view>
    </view>
```

并把空态行改为：

```html
    <view v-if="sections.length === 0 && hiddenSlots.length === 0" class="muted empty">{{ $t('decorateHome.empty') }}</view>
```

- [ ] **Step 2: 模板 —— 4 个新配置面板（插在 `recommend` 面板之后、`richText` 面板之前）**

```html
      <!-- brandFloor：品牌闪购 -->
      <view v-else-if="sec.type === 'brandFloor'" class="field">
        <text class="lbl">{{ $t('decorateHome.title') }}</text>
        <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        <view class="muted hint">{{ $t('decorateHome.brandFloorHint') }}</view>
      </view>

      <!-- plaza：品质专区 -->
      <view v-else-if="sec.type === 'plaza'" class="field">
        <text class="lbl">{{ $t('decorateHome.title') }}</text>
        <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        <view class="muted hint">{{ $t('decorateHome.plazaHint') }}</view>
      </view>

      <!-- coupon：领券楼层 -->
      <template v-else-if="sec.type === 'coupon'">
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.title') }}</text>
          <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.couponLimit') }}</text>
          <input type="number" v-model.number="sec.limit" />
        </view>
        <view class="muted hint">{{ $t('decorateHome.couponHint') }}</view>
      </template>

      <!-- latest：最新商品 -->
      <template v-else-if="sec.type === 'latest'">
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.title') }}</text>
          <input v-model="sec.title" :placeholder="$t('decorateHome.titlePlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.newCollection') }}</text>
          <input v-model="sec.collectionId" :placeholder="$t('decorateHome.collectionIdPlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.limit') }}</text>
          <input type="number" v-model.number="sec.limit" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.cardLayout') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: !sec.layout || sec.layout === 'compact' }" @tap="sec.layout = 'compact'">{{ $t('decorateHome.layoutCompact') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'masonry' }" @tap="sec.layout = 'masonry'">{{ $t('decorateHome.layoutMasonry') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'single' }" @tap="sec.layout = 'single'">{{ $t('decorateHome.layoutSingle') }}</text>
          </view>
        </view>
        <view class="muted hint">{{ $t('decorateHome.latestHint') }}</view>
      </template>
```

- [ ] **Step 3: 模板 —— `addbar` 增 4 个按钮**

在 `<view class="addbar">` 的 `addRichText` 按钮之前插入：

```html
      <button class="mini" @tap="addBrandFloor">{{ $t('decorateHome.addBrandFloor') }}</button>
      <button class="mini" @tap="addPlaza">{{ $t('decorateHome.addPlaza') }}</button>
      <button class="mini" @tap="addCoupon">{{ $t('decorateHome.addCoupon') }}</button>
      <button class="mini" @tap="addLatest">{{ $t('decorateHome.addLatest') }}</button>
```

- [ ] **Step 4: script —— 常量、状态与槽位工具**

在 `const sections = ref<SectionVM[]>([]);` 之后加入：

```ts
/** 骨架槽位表（与前台 utils/home-skeleton.ts 的 HOME_SKELETON 一一对应，顺序即最终渲染顺序） */
const SLOTS: { key: string; match: string; labelKey: string; fallback: boolean }[] = [
  { key: 'banner', match: 'banner', labelKey: 'slotBanner', fallback: true },
  { key: 'notice', match: 'notice', labelKey: 'slotNotice', fallback: false },
  { key: 'functionGrid', match: 'nav', labelKey: 'slotFunctionGrid', fallback: true },
  { key: 'coupon', match: 'coupon', labelKey: 'slotCoupon', fallback: false },
  { key: 'brandFloor', match: 'brandFloor', labelKey: 'slotBrandFloor', fallback: true },
  { key: 'plaza', match: 'plaza', labelKey: 'slotPlaza', fallback: true },
  { key: 'goods', match: 'goods', labelKey: 'slotGoods', fallback: false },
  { key: 'hot', match: 'hot', labelKey: 'slotHot', fallback: true },
  { key: 'recommend', match: 'recommend', labelKey: 'slotRecommend', fallback: true },
  { key: 'latest', match: 'latest', labelKey: 'slotLatest', fallback: false },
];

/** 已显式移除的兜底槽位 key（写回 shopContent.hiddenSlots） */
const hiddenSlots = ref<string[]>([]);

/** 槽位状态：removed（已移除）> covered（已被同类型区块覆盖）> auto（自动兜底）> unset（可选未配置） */
function slotStateKey(slot: { key: string; match: string; fallback: boolean }): string {
  if (hiddenSlots.value.includes(slot.key)) return 'slotRemoved';
  if (sections.value.some((s) => s.type === slot.match)) return 'slotCovered';
  return slot.fallback ? 'slotAuto' : 'slotUnset';
}

/** 兜底槽位「移除 / 恢复」开关；可选槽位无兜底，不可移除 */
function toggleSlot(slot: { key: string; fallback: boolean }) {
  if (!slot.fallback) return;
  const i = hiddenSlots.value.indexOf(slot.key);
  if (i >= 0) hiddenSlots.value.splice(i, 1);
  else hiddenSlots.value.push(slot.key);
}
```

- [ ] **Step 5: script —— 读取 hiddenSlots**

把 `onMounted` 中

```ts
    const parsed = parseShopContent(raw);
    sections.value = parsed ? (parsed.sections as unknown as SectionVM[]).map(toViewModel) : [];
```

替换为：

```ts
    const parsed = parseShopContent(raw);
    sections.value = parsed ? (parsed.sections as unknown as SectionVM[]).map(toViewModel) : [];
    hiddenSlots.value =
      parsed && Array.isArray((parsed as any).hiddenSlots)
        ? ((parsed as any).hiddenSlots as unknown[]).filter((k): k is string => typeof k === 'string')
        : [];
```

- [ ] **Step 6: script —— `typeLabel` 补 4 个分支**

在 `typeLabel` 的 `switch` 中，`case 'recommend'` 之后插入：

```ts
    case 'brandFloor': return locale.t('decorateHome.typeBrandFloor');
    case 'plaza': return locale.t('decorateHome.typePlaza');
    case 'coupon': return locale.t('decorateHome.typeCoupon');
    case 'latest': return locale.t('decorateHome.typeLatest');
```

- [ ] **Step 7: script —— 4 个新增函数**

在 `addRecommend` 之后插入：

```ts
function addBrandFloor() { sections.value.push({ type: 'brandFloor', title: '' }); }
function addPlaza() { sections.value.push({ type: 'plaza', title: '' }); }
function addCoupon() { sections.value.push({ type: 'coupon', title: '', limit: 6 }); }
function addLatest() { sections.value.push({ type: 'latest', title: '', collectionId: '', limit: 10, layout: 'compact' }); }
```

- [ ] **Step 8: script —— `toSection` 修正空字段与 latest/coupon**

把现有 `toSection` 替换为下面两段（先抽出 curated 分支，再统一处理空值）：

```ts
// 编辑态 → 落库 JSON：空字符串字段不写入，缺失项由前台按默认值兜底
function toSection(vm: SectionVM): any {
  if (vm.type === 'hot' || vm.type === 'recommend') return toCuratedSection(vm);
  const sec: any = { ...vm };
  delete sec.slugsText;
  if (typeof sec.title === 'string' && !sec.title.trim()) delete sec.title;
  if (sec.type === 'latest' && typeof sec.collectionId === 'string' && !sec.collectionId.trim()) delete sec.collectionId;
  if (sec.type === 'latest' || sec.type === 'coupon') {
    if (typeof sec.limit === 'number' && Number.isFinite(sec.limit)) {
      sec.limit = Math.min(30, Math.max(1, Math.round(sec.limit)));
    } else {
      delete sec.limit;
    }
  }
  return sec;
}

function toCuratedSection(vm: SectionVM): any {
  const sec: any = { type: vm.type };
  const title = (vm.title ?? '').trim();
  if (title) sec.title = title;
  const source = vm.source || 'auto';
  sec.source = source;
  if (source === 'collection') {
    const cid = (vm.collectionId ?? '').trim();
    if (cid) sec.collectionId = cid;
  }
  if (vm.type === 'recommend' && source === 'slugs') {
    const slugs = parseSlugs(vm.slugsText ?? '');
    if (slugs.length) sec.slugs = slugs;
  }
  if (typeof vm.limit === 'number' && Number.isFinite(vm.limit)) {
    sec.limit = Math.min(30, Math.max(1, Math.round(vm.limit)));
  }
  sec.layout = vm.layout || 'compact';
  if (vm.type === 'recommend') sec.dedupe = vm.dedupe !== false;
  return sec;
}
```

- [ ] **Step 9: script —— `save()` 放宽 + `buildContent()` 输出 hiddenSlots**

把 `save()` 开头

```ts
  if (sections.value.length === 0) {
    uni.showToast({ title: locale.t('decorateHome.needSection'), icon: 'none' });
    return;
  }
```

替换为：

```ts
  // 允许「全部走兜底、但移除某个楼层」的表达：只有既无区块又无 hiddenSlots 才拒绝
  if (sections.value.length === 0 && hiddenSlots.value.length === 0) {
    uni.showToast({ title: locale.t('decorateHome.needSection'), icon: 'none' });
    return;
  }
```

把 `buildContent()` 替换为：

```ts
// 组装顶层 JSON 并经 schema 校验；非法返回 null
function buildContent(): ShopContent | null {
  const content: ShopContent = {
    version: 1,
    sections: sections.value.map(toSection) as unknown as ShopSection[],
  };
  const hidden = hiddenSlots.value.filter((k) => typeof k === 'string' && k.trim().length > 0);
  if (hidden.length) content.hiddenSlots = hidden;
  return isValidShopContent(content) ? content : null;
}
```

- [ ] **Step 10: 样式 —— 骨架槽位区**

在 `<style lang="scss" scoped>` 的 `.page { ... }` 内追加（与既有 `$wa-*` 变量一致）：

```scss
  .slots { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 32rpx; margin-bottom: 24rpx;
    .slots-head { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 16rpx; }
    .slot { display: flex; align-items: center; gap: 12rpx; padding: 12rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-of-type { border-bottom: 0; }
      .slot-name { flex: 1; font-size: 26rpx; color: $wa-ink; }
      .slot-tag { font-size: 22rpx; color: $wa-muted; }
      .slot-state { font-size: 22rpx; color: $wa-accent; }
      .slot-toggle { font-size: 22rpx; color: $wa-danger; }
    }
  }
```

- [ ] **Step 11: 构建验证**

Run（cwd = `d:\zhao\vshop\web-admin`）：`npm run build:h5`
Expected: 构建成功

- [ ] **Step 12: 提交**

```bash
git -C d:/zhao/vshop add web-admin/src/pages/decorate/home/index.vue
git -C d:/zhao/vshop commit -m "feat(decorate): 首页装修新增 4 类楼层与骨架槽位只读区/移除开关"
```

---

## Task 15: web-admin 双语言包补齐 `decorateHome.*` 词条

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: 在 `decorateHome` 段补中文词条**

在 [zh-Hans.json](file:///d:/zhao/vshop/web-admin/src/locale/zh-Hans.json) 的 `"decorateHome"` 段、`"saveFailed"` 之后（注意补逗号）追加：

```json
    "addBrandFloor": "+ 品牌闪购",
    "addPlaza": "+ 品质专区",
    "addCoupon": "+ 领券楼层",
    "addLatest": "+ 最新商品",
    "typeBrandFloor": "品牌闪购",
    "typePlaza": "品质专区",
    "typeCoupon": "领券楼层",
    "typeLatest": "最新商品",
    "brandFloorHint": "复用顶部分类封面图作为品牌墙，无需额外配置",
    "plazaHint": "展示店铺分类专区卡片，无需额外配置",
    "couponLimit": "最多显示张数（1-30）",
    "couponHint": "仅展示「可领取且未过期未抢完」的券；无券时该楼层自动隐藏",
    "newCollection": "新品集合 slug",
    "latestHint": "用「新品集合」出楼（不是按上架时间排序）；未填集合则整层隐藏",
    "slotOrderTitle": "骨架楼层（最终渲染顺序）",
    "slotFallback": "兜底",
    "slotOptional": "可选",
    "slotCovered": "已覆盖",
    "slotAuto": "自动兜底",
    "slotUnset": "未配置",
    "slotRemoved": "已移除",
    "slotRemove": "移除",
    "slotRestore": "恢复",
    "slotHint": "未配置的「兜底」楼层会自动补位；「可选」楼层不配置即不渲染",
    "slotBanner": "轮播 Banner",
    "slotNotice": "公告",
    "slotFunctionGrid": "功能十宫格",
    "slotCoupon": "领券楼层",
    "slotBrandFloor": "品牌闪购",
    "slotPlaza": "品质专区",
    "slotGoods": "分类商品楼层",
    "slotHot": "热门商品",
    "slotRecommend": "推荐商品",
    "slotLatest": "最新商品",
```

并把 `"needSection"` 的值改为 `"请至少添加一个区块或移除一个兜底楼层"`。

- [ ] **Step 2: 在 `en.json` 的 `decorateHome` 段补英文词条**

```json
    "addBrandFloor": "+ Brand Flash",
    "addPlaza": "+ Quality Zone",
    "addCoupon": "+ Coupons",
    "addLatest": "+ New Arrivals",
    "typeBrandFloor": "Brand Flash",
    "typePlaza": "Quality Zone",
    "typeCoupon": "Coupons",
    "typeLatest": "New Arrivals",
    "brandFloorHint": "Reuses top-level collection covers as the brand wall; no extra config needed",
    "plazaHint": "Shows collection zone cards; no extra config needed",
    "couponLimit": "Max coupons (1-30)",
    "couponHint": "Only claimable, unexpired and in-stock coupons are shown; the floor hides itself when empty",
    "newCollection": "New-arrivals collection slug",
    "latestHint": "Powered by a new-arrivals collection (not sorted by creation time); hidden when empty",
    "slotOrderTitle": "Skeleton floors (final render order)",
    "slotFallback": "Fallback",
    "slotOptional": "Optional",
    "slotCovered": "Overridden",
    "slotAuto": "Auto fallback",
    "slotUnset": "Not configured",
    "slotRemoved": "Removed",
    "slotRemove": "Remove",
    "slotRestore": "Restore",
    "slotHint": "Unconfigured fallback floors are filled automatically; optional floors render only when configured.",
    "slotBanner": "Banner",
    "slotNotice": "Notice",
    "slotFunctionGrid": "Function grid",
    "slotCoupon": "Coupons",
    "slotBrandFloor": "Brand Flash",
    "slotPlaza": "Quality Zone",
    "slotGoods": "Category goods",
    "slotHot": "Hot goods",
    "slotRecommend": "Recommended",
    "slotLatest": "New Arrivals",
```

并把英文的 `needSection` 改为 `"Please add at least one block or remove a fallback floor"`。

- [ ] **Step 3: 词条一致性校验**

Run（cwd = `d:\zhao\vshop\web-admin`）：

```bash
python scripts/i18n_verify.py
```

Expected: 无缺失 key 报告（若脚本要求指定语言目录，按其 `--help` 提示传参）

- [ ] **Step 4: 提交**

```bash
git -C d:/zhao/vshop add web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git -C d:/zhao/vshop commit -m "i18n(decorate): 补充骨架槽位与 4 类新楼层文案"
```

---

## Task 16: 本地构建 + 部署 + 线上回归 + 手机截图 + 操作手册

**Files:**
- Modify: `d:\zhao\nshop\docs\superpowers\manual\t2-visibility\README.md`

> 部署铁律：**本地构建**，服务器只解压 / 重启。nshop 走 `node scripts/deploy.mjs`；web-admin 走 `node scripts/deploy.mjs`（在 `d:\zhao\vshop\web-admin`）。

- [ ] **Step 1: nshop 本地构建**

Run（cwd = `d:\zhao\nshop`）：`npm run build`
Expected: 构建成功，产物在 `.output/`

- [ ] **Step 2: web-admin 本地构建**

Run（cwd = `d:\zhao\vshop\web-admin`）：`npm run build:h5`
Expected: 构建成功，产物在 `dist/build/h5/`

- [ ] **Step 3: 部署两个前端**

Run：`node scripts/deploy.mjs`（cwd = `d:\zhao\nshop`），再 `node scripts/deploy.mjs`（cwd = `d:\zhao\vshop\web-admin`）
Expected: 两次均输出上传 + 服务器解压成功；nshop 侧按脚本提示重启进程

- [ ] **Step 4: 线上回归（设计 §5.2 全 7 条）**

```bash
for p in / /t1/ /t2/ /t2/category/all /t2/product/; do
  printf "%s -> " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "https://www.youshop.cn$p"
done
```

逐条人工核对（浏览器打开 `https://www.youshop.cn/t2/`）：

| # | 断言 |
| --- | --- |
| 1 | `shopContent = null` 时楼层 = 分类导航 + Banner + 十宫格 + 品牌闪购 + 品质专区 + 热门(10) + 推荐(10..20)，无公告/领券/最新商品 |
| 2 | 写入 `sections: [hot, recommend]` 后，品牌闪购 / 十宫格 / 品质专区**仍在** |
| 3 | 写入 `sections: [notice]` 后，公告出现在**十宫格上方** |
| 4 | 写入 `sections: [coupon, latest]`（latest 选「新品」集合）后，领券在十宫格下方、最新商品在推荐之后，兜底槽位仍在 |
| 5 | `hiddenSlots: ['brandFloor']` 后品牌闪购消失、其余兜底槽位仍在 |
| 6 | `shopContent = null` 时网络面板中 `home-fallback-search` 请求数与改动前一致（仍是 1 次商品搜索） |
| 7 | 五个路径全 200，控制台无 `[nuxt] instance unavailable` |

- [ ] **Step 5: 手机浏览视图截图（390×844 / dpr=2）**

在 `d:\zhao\nshop\_e2e\` 新建 `shot_home_skeleton.py`（与仓库既有 Playwright 脚本同风格）：

```python
# 首页骨架自动补位 · 手机视图截图（390×844 / dpr=2），供操作手册引用
import asyncio, pathlib
from playwright.async_api import async_playwright

OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
CASES = [
    ("01-fallback-only", "https://www.youshop.cn/t2/"),
    ("02-hot-recommend", "https://www.youshop.cn/t2/"),
    ("03-notice-above-grid", "https://www.youshop.cn/t2/"),
    ("04-coupon-latest", "https://www.youshop.cn/t2/"),
    ("05-hidden-brand-floor", "https://www.youshop.cn/t2/"),
]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page = await ctx.new_page()
        for name, url in CASES:
            await page.goto(url, wait_until="networkidle")
            await page.wait_for_timeout(800)
            await page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
            print("saved", name)
        await b.close()

asyncio.run(main())
```

Run（cwd = `d:\zhao\nshop`）：`python _e2e/shot_home_skeleton.py`
Expected: `_e2e/shots/01..05-*.png` 生成，尺寸宽 780px（= 390×2）

- [ ] **Step 6: 更新操作手册**

更新 [README.md](file:///d:/zhao/nshop/docs/superpowers/manual/t2-visibility/README.md)：

1. 删除「装修配置存在时不再渲染京东兜底楼层」的旧说明，改为「未配置的楼层自动补位」。
2. 新增四节：
   - 「骨架槽位表（6 兜底 + 4 可选）与自动补位顺序」（贴 `HOME_SKELETON` 顺序表）
   - 「公告锚定在十宫格上方」
   - 「领券 / 分类商品楼层 / 最新商品怎么配」（后台操作步骤 + 后台截图）
   - 「如何移除某个兜底楼层（hiddenSlots）」+ 后台「骨架楼层」区截图
3. 插入 Step 5 的 5 张手机截图，逐张标注对应断言编号。

- [ ] **Step 7: 提交 + 推送 + 部署**

```bash
git -C d:/zhao/nshop add _e2e/shot_home_skeleton.py docs/superpowers/manual/t2-visibility/README.md
git -C d:/zhao/nshop commit -m "docs(home): 骨架自动补位操作手册与手机视图截图"
git -C d:/zhao/nshop push
git -C d:/zhao/vshop push
```

---

## Self-Review

### 1. Spec 覆盖检查

| Spec 章节 | 对应任务 |
| --- | --- |
| §3.1 骨架定义 | Task 2 |
| §3.2 `resolveHomeSections` 规则 1-7 | Task 2（17 条单测覆盖 7 条规则） |
| §3.3 分类导航常驻 | Task 11 Step 3 |
| §3.4 新增区块类型 + `hiddenSlots` + 解析容错 | Task 1（前台）、Task 13（后台） |
| §3.5 前台渲染改造 | Task 3（composable）、Task 9（BannerBlock）、Task 10（渲染器）、Task 11（页面） |
| §3.5 新增四个薄块 | Task 6（brandFloor / plaza）、Task 7（latest）、Task 8（coupon） |
| §3.5 `GoodsCardBlock` 直渲自动商品槽位 | Task 10 |
| §3.5 `NoticeBlock` 不改动 | 未列入任务（正确：仅被槽位锚定） |
| §3.6 后台 schema + 页面 + i18n | Task 13、14、15 |
| §4 错误处理 | Task 2（坏 JSON/未知 type）、Task 7（空集合隐藏）、Task 8（无券隐藏）、Task 9（Banner 回退）、Task 11（不发多余请求） |
| §5.1 单测 | Task 1、2 |
| §5.2 线上回归 | Task 16 Step 4 |
| §5.3 手机截图 | Task 16 Step 5 |
| §5.4 文档 | Task 16 Step 6 |
| §6 改动面清单 | Task 1-16 全覆盖 |
| §8 闪购/拼团 | 本期不实现（与 spec 一致，无任务） |

**已知偏离 spec 的两处，均为必要修正（已在任务内注明）：**
1. 新增 `JdBrandFloor` / `JdPlazaGrid` 的**可选 `title` prop**（Task 4）——否则 spec §3.4 的 `title?: LocalizedText` 会变成无效字段。
2. `GoodsSection` 新增可选 `limit`（Task 1 Step 3a）并在 `GoodsFloor` 生效（Task 5）——否则 `LatestSection.limit` 无法落地。

### 2. 占位符扫描

- 无 TBD / TODO / 「类似 Task N」。
- 每个代码步骤均给出可直接粘贴的完整代码块。
- Task 8 Step 3 给出二选一（补 `claiming` 词条 / 改回 `claim`），已明确「以 zh-CN 实际存在的 key 为准」，实施时用 grep 结果判定，不是占位符。

### 3. 类型一致性检查

- `SkeletonSlotKey` / `HOME_SKELETON` / `ResolvedSection` 在 Task 2 定义，Task 3、10、11 引用名称一致。
- `sanitizeHiddenSlots` 在 Task 1 定义（`shop-content.ts`），Task 2（`home-skeleton.ts` 内引用）、Task 3（`useShopContent.ts`）引用一致，均从 `../utils/shop-content` 导出。
- `LatestGoodsBlock` 构造的 `GoodsSection` 字段（`type/collectionId/title/layout/limit`）与 Task 1 Step 3a 的 `GoodsSection` 定义一致。
- 后台 `SLOTS` 的 `key` 与前台 `HOME_SKELETON` 的 `key` 逐项一致（banner…latest，共 10 项）。
- 后台 `hiddenSlots` 写入的 key 与前台 `sanitizeHiddenSlots` + `slot.key` 比对口径一致（纯字符串 key，非 type 名）。
- `HomeBlockRenderer` 的 `autoGoods: { hot, more }` 与 Task 11 的 `autoGoods` computed 结构一致。
- 后台 `ShopContent.version: number` 与前台 `version: 1` 均通过 `version !== 1` 校验（后台 `isValidShopContent` 要求 `=== 1`）。