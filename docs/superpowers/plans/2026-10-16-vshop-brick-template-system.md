# 五级积木模板体系实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 vshop 首页模板机制升级为「五级积木模板体系」：版式插件注册表 + layout 五级解析链，保持原五级体系行为逐字节兼容，并新增 video/coupon/pointsGoods 三种装修楼层。

**Architecture:** 两阶段实施。阶段一为行为等价重构（解析纯函数 + 组件表替代 v-if 硬分支，截图对比验证零回归）；阶段二在注册表上加 web-admin 编辑器与 3 个新楼层。后端 shop-template 插件零改动（layout 存于 `ShopTemplate.pages.home.layout` JSON）。

**Tech Stack:** uni-app (Vue3) + vitest + GraphQL（Vendure shop-api/admin-api）+ Playwright（390×844 dpr=2 截图规范）。

**Spec:** `docs/superpowers/specs/2026-10-16-vshop-brick-template-system-design.md`

**关键现状锚点（实施者必读）：**
- `src/pages/home/index.vue:4-7` 现状分支：`hasShopContent → DynamicHome`，否则按 `templateCode` 走 FreshHome/MarketplaceHome/DefaultHome
- `src/stores/tenant.ts:145` `templateCode.value = cf.displayTemplate || 'default'`；`:178-206` `loadTemplateConfig()` 五级合并
- `src/templates/shared/DynamicHome.vue:11-18` 6 个 section 组件 v-if 链
- `src/templates/shared/schema.ts:74` `VALID_TYPES` 全局白名单；`isValidShopContent` 为整体校验（保持不动，新容错在渲染层过滤）
- `src/utils/merge-config.ts` 纯函数风格：坏值返回 null、deepMerge 数组/标量直接覆盖
- 根 `vitest.config.ts:9` include 仅 `src/pkg-diy/**/*.test.ts`，需扩展
- i18n 四语言：`src/i18n/locales/{zh-CN,en,zh-TW,ja}.json`，新增词条四语言同步
- 可复用查询：`src/api/queries/coupon.ts` `getCouponCentre()`；`src/api/queries/points-mall.ts` `getPointsProducts({skip,take})`
- PowerShell 环境：不支持 `&&`；多行 commit message 用 `[IO.File]::WriteAllText` 无 BOM UTF8 + `git commit -F`

---

## 阶段一：行为等价重构（Tasks 1-5）

### Task 1: resolveHomeLayout 纯函数（TDD）

**Files:**
- Modify: `d:\zhao\vshop\vitest.config.ts`（include 扩展）
- Test: `d:\zhao\vshop\src\utils\merge-config.test.ts`（新建）
- Modify: `d:\zhao\vshop\src\utils\merge-config.ts`（文件末尾追加）

- [ ] **Step 1.1 扩展 vitest include**

```ts
// vitest.config.ts 的 test.include 改为：
include: ['src/pkg-diy/**/*.test.ts', 'src/utils/**/*.test.ts'],
```

- [ ] **Step 1.2 写失败测试**

```ts
// src/utils/merge-config.test.ts
import { describe, it, expect } from 'vitest';
import { resolveHomeLayout } from './merge-config';

describe('resolveHomeLayout（五级解析链）', () => {
  it('全空 → default（L0）', () => {
    expect(resolveHomeLayout(null, null, null)).toBe('default');
  });
  it('L1 defaults.home.layout 生效', () => {
    expect(resolveHomeLayout({ defaults: { home: { layout: 'fresh' } } } as any, null, null)).toBe('fresh');
  });
  it('L2 模板 pages.home.layout 覆盖 L1', () => {
    expect(resolveHomeLayout({ defaults: { home: { layout: 'fresh' } } } as any, { pages: { home: { layout: 'marketplace' } } } as any, null)).toBe('marketplace');
  });
  it('L3 displayTemplate 覆盖 L2', () => {
    expect(resolveHomeLayout(null, { pages: { home: { layout: 'fresh' } } } as any, { displayTemplate: 'marketplace' })).toBe('marketplace');
  });
  it('L3 空字符串视为未配置，不覆盖', () => {
    expect(resolveHomeLayout(null, { pages: { home: { layout: 'fresh' } } } as any, { displayTemplate: '' })).toBe('fresh');
  });
  it('未知 layout 值 → default', () => {
    expect(resolveHomeLayout(null, { pages: { home: { layout: 'usemall-typo' } } } as any, null)).toBe('default');
  });
  it('坏类型（数字/对象）→ default', () => {
    expect(resolveHomeLayout(null, { pages: { home: { layout: 123 } } } as any, null)).toBe('default');
  });
});
```

- [ ] **Step 1.3 运行确认失败**：`npm test`（cwd=d:\zhao\vshop）→ FAIL（resolveHomeLayout 未导出）
- [ ] **Step 1.4 最小实现**（merge-config.ts 末尾追加）

```ts
/** 版式注册白名单（与 src/templates/layouts.ts LAYOUT_COMPONENTS 同步；'dynamic' = 积木装修渲染器） */
export const KNOWN_LAYOUTS = ['default', 'fresh', 'marketplace', 'dynamic'] as const;
export type HomeLayout = (typeof KNOWN_LAYOUTS)[number];

/** layout 五级解析：L0 'default' ← L1 defaults.home.layout ← L2 pages.home.layout ← L3 displayTemplate；
 *  坏值/未知值回 'default'（纯函数，SSR/双端安全） */
export function resolveHomeLayout(
  globalConfig: ShopGlobalConfigData | null,
  template: ShopTemplateData | null,
  channelCfs: Record<string, any> | null,
): HomeLayout {
  const pick = (v: unknown): string | null =>
    typeof v === 'string' && v && KNOWN_LAYOUTS.includes(v as HomeLayout) ? v : null;
  const l1 = pick((globalConfig?.defaults as any)?.home?.layout);
  const l2 = pick(template?.pages?.home?.layout);
  const l3 = pick(channelCfs?.displayTemplate);
  return (l3 ?? l2 ?? l1 ?? 'default') as HomeLayout;
}
```

- [ ] **Step 1.5 运行确认通过**：`npm test` → PASS（7 用例）
- [ ] **Step 1.6 提交**：`git add vitest.config.ts src/utils/merge-config.ts src/utils/merge-config.test.ts` → `git commit -m "feat(vshop): resolveHomeLayout layout 五级解析纯函数"`

### Task 2: 版式注册表（跨端纯数据 + C 端组件绑定）+ 首页查表化

**Files:**
- Create: `d:\zhao\vshop\src\templates\shared\layout-meta.ts`（纯数据，web-admin 跨目录引用）
- Create: `d:\zhao\vshop\src\templates\layouts.ts`（组件绑定，仅 C 端）
- Modify: `d:\zhao\vshop\src\pages\home\index.vue:4-7,19-22`

- [ ] **Step 2.1 写 layout-meta.ts（跨端共享纯数据，组件不可跨端故分离）**

```ts
// 五级积木模板体系 · 版式注册元数据（纯数据，供 C 端与 web-admin 共用）
export interface LayoutMeta {
  code: string;
  labelZh: string;
  labelEn: string;
  /** 是否消费 sections（积木楼层） */
  consumesSections: boolean;
  /** 该版式认识的楼层类型（consumesSections=false 时为空） */
  sectionTypes: string[];
}

export const LAYOUT_META: LayoutMeta[] = [
  { code: 'default', labelZh: '默认模板', labelEn: 'Default', consumesSections: false, sectionTypes: [] },
  { code: 'fresh', labelZh: '清新模板', labelEn: 'Fresh', consumesSections: false, sectionTypes: [] },
  { code: 'marketplace', labelZh: '市场模板', labelEn: 'Marketplace', consumesSections: false, sectionTypes: [] },
  {
    code: 'dynamic', labelZh: '积木装修', labelEn: 'Dynamic', consumesSections: true,
    sectionTypes: ['banner', 'notice', 'nav', 'goods', 'richText', 'flash', 'video', 'coupon', 'pointsGoods'],
  },
];
```

- [ ] **Step 2.2 写 C 端组件注册表**

```ts
// src/templates/layouts.ts
import type { Component } from 'vue';
import DefaultHome from './default/pages/HomeContent.vue';
import FreshHome from './fresh/pages/HomeContent.vue';
import MarketplaceHome from './marketplace/pages/HomeContent.vue';
import DynamicHome from './shared/DynamicHome.vue';

export const FALLBACK_LAYOUT = 'default';
/** 版式骨架组件表：key 与 KNOWN_LAYOUTS / LAYOUT_META.code 同步。
 *  行为契约：sections 优先（home/index.vue 决策），本表仅在无 sections 时被查。 */
export const LAYOUT_COMPONENTS: Record<string, Component> = {
  default: DefaultHome,
  fresh: FreshHome,
  marketplace: MarketplaceHome,
  dynamic: DynamicHome,
};
```

- [ ] **Step 2.3 首页查表化（行为等价替换）**——`home/index.vue` 模板与脚本改动：

```vue
<template>
  <view class="home-page" @scroll="broadcastScroll">
    <TenantBar />
    <component :is="layoutComponent" />
    <BackTop />
  </view>
</template>
```

```ts
// script setup 增改（替换原 4 个 import + v-if 三分支）：
import { computed } from 'vue';
import { LAYOUT_COMPONENTS, FALLBACK_LAYOUT } from '../../templates/layouts';
// 保留：useTenantStore/useAuthStore/useShare/TenantBar/BackTop 等既有 import
const hasShopContent = computed(() => !!tenantStore.mergedShopContent?.sections?.length);
const layoutKey = computed(() => {
  if (hasShopContent.value) return 'dynamic';            // sections 优先（原体系行为）
  const k = tenantStore.homeLayout || 'default';
  return LAYOUT_COMPONENTS[k] ? k : FALLBACK_LAYOUT;
});
const layoutComponent = computed(() => LAYOUT_COMPONENTS[layoutKey.value]);
```

注意：本步先依赖 `tenantStore.homeLayout`（Task 4 才实现）——**本任务先临时回退为** `tenantStore.templateCode || 'default'` 保持可编译，Task 4 完成后切换为 `homeLayout`（保证每个 task 结束都是可编译绿态）。

- [ ] **Step 2.4 编译验证**：`npm run dev:h5`（cwd=d:\zhao\vshop，需 `$env:VITE_API_URL='https://e.joho.cn'`）→ 首页正常渲染无控制台报错
- [ ] **Step 2.5 提交**：`git commit -m "refactor(vshop): 首页版式 v-if 硬分支改注册表查表（行为等价）"`

### Task 3: SECTION_COMPONENTS + DynamicHome 查表化 + 未知楼层渲染过滤

**Files:**
- Create: `d:\zhao\vshop\src\templates\shared\sections.ts`
- Modify: `d:\zhao\vshop\src\templates\shared\DynamicHome.vue:11-31`

- [ ] **Step 3.1 写 sections.ts**

```ts
// 积木楼层组件表（dynamic 版式专用）：未知 type 由渲染层过滤跳过（容错），不整单拒绝
import type { Component } from 'vue';
import BannerSection from './sections/BannerSection.vue';
import NoticeSection from './sections/NoticeSection.vue';
import NavSection from './sections/NavSection.vue';
import GoodsSection from './sections/GoodsSection.vue';
import RichTextSection from './sections/RichTextSection.vue';
import FlashSection from './sections/FlashSection.vue';
import VideoSection from './sections/VideoSection.vue';
import CouponSection from './sections/CouponSection.vue';
import PointsGoodsSection from './sections/PointsGoodsSection.vue';

export const SECTION_COMPONENTS: Record<string, Component> = {
  banner: BannerSection,
  notice: NoticeSection,
  nav: NavSection,
  goods: GoodsSection,
  richText: RichTextSection,
  flash: FlashSection,
  video: VideoSection,
  coupon: CouponSection,
  pointsGoods: PointsGoodsSection,
};
```

注意：`VideoSection/CouponSection/PointsGoodsSection` 在 Task 7-9 才创建——**本步先只注册现有 6 个**，Task 7-9 各自完成后回来补一行注册（保持绿态）。

- [ ] **Step 3.2 DynamicHome.vue 改造**

```vue
<!-- template 中 L11-18 的 v-for 改为 -->
<template v-for="(sec, i) in visibleSections" :key="i">
  <component :is="SECTION_COMPONENTS[sec.type]" :section="sec" />
</template>
```

```ts
// script setup：删除 6 个组件 import（sections.ts 引入），新增：
import { SECTION_COMPONENTS } from './sections';
const visibleSections = computed(() =>
  (tenantStore.mergedShopContent?.sections || tenantStore.shopContent?.sections || [])
    .filter((s: any) => s && typeof s === 'object' && SECTION_COMPONENTS[s.type]),
);
```

- [ ] **Step 3.3 验证**：dev:h5 首页渲染与改造前一致（含 DIY 入口、楼层顺序）
- [ ] **Step 3.4 提交**：`git commit -m "refactor(vshop): DynamicHome 楼层渲染改组件表 + 未知 type 过滤容错"`

### Task 4: tenant store 接入 homeLayout

**Files:**
- Modify: `d:\zhao\vshop\src\stores\tenant.ts`（L145 附近与 L177-206）

- [ ] **Step 4.1 store 改动**（三处）：

```ts
// ① state 新增：
const rawChannelCfs = ref<Record<string, any> | null>(null);
const homeLayout = ref<HomeLayout>('default');

// ② loadTenantDetails 成功分支（L145 templateCode 赋值处，保持原行不动）追加：
rawChannelCfs.value = isPlainObjectLike(cf) ? cf : null;
// （cf 即现有局部变量 channel customFields 对象；若 cf 非对象则置 null。
//   文件内若无现成 isPlainObjectLike 工具，用 `cf && typeof cf === 'object' ? cf : null`）
// 同文件回退分支（L158-174）追加：rawChannelCfs.value = null; homeLayout.value = 'default';

// ③ loadTemplateConfig() 内（L198 sections 计算后）追加：
homeLayout.value = resolveHomeLayout(globalConfig, template, rawChannelCfs.value);
// 顶部 import 增加：import { resolveHomeLayout, type HomeLayout } from '../utils/merge-config';
// return/暴露列表（store 返回对象）追加 homeLayout
```

- [ ] **Step 4.2 home/index.vue 切换数据源**：Task 2.3 临时用的 `tenantStore.templateCode` 改为 `tenantStore.homeLayout`
- [ ] **Step 4.3 验证（行为等价关键回归）**：
  1. `npm test` 全绿
  2. dev:h5 + Playwright 390×844 截图脚本（参照 `web-admin/_e2e/_shot_coupon82_layout.py` 惯例，注入 `localStorage` 后访问）分别验证：默认店（无模板配置→DefaultHome 骨架）、t2 店（模板 sections→DynamicHome）、手工改 displayTemplate='fresh' 的店（FreshHome）——与 git stash 改造前基线截图逐像素级目检一致
- [ ] **Step 4.4 提交**：`git commit -m "feat(vshop): tenant store 接入 homeLayout 解析链（displayTemplate 无损迁移）"`

### Task 5: 阶段一收尾（H5 懒加载 + 推送）

**Files:**
- Modify: `d:\zhao\vshop\src\templates\layouts.ts`

- [ ] **Step 5.1 H5 懒加载（条件编译，小程序端保持静态）**

```ts
// #ifdef H5
import { defineAsyncComponent } from 'vue';
const LAYOUT_COMPONENTS: Record<string, Component> = {
  default: defineAsyncComponent(() => import('./default/pages/HomeContent.vue')),
  fresh: defineAsyncComponent(() => import('./fresh/pages/HomeContent.vue')),
  marketplace: defineAsyncComponent(() => import('./marketplace/pages/HomeContent.vue')),
  dynamic: defineAsyncComponent(() => import('./shared/DynamicHome.vue')),
};
// #endif
// #ifndef H5
（静态 import 版本，同 Task 2.2）
// #endif
```

验证：H5 构建产物 `dist/build/h5/assets/` 中三套骨架拆为独立 chunk；小程序构建 `npm run build:mp-weixin` 通过。
- [ ] **Step 5.2 提交并推送**：`git commit -m "perf(vshop): H5 版式组件按需 chunk（条件编译，小程序保持静态）"` → `git push origin master`

---

## 阶段二：编辑器 + 新楼层（Tasks 6-13）

### Task 6: schema 类型扩展 + 单测

**Files:**
- Modify: `d:\zhao\vshop\src\templates\shared\schema.ts`（类型 union + VALID_TYPES + 校验分支）
- Test: `d:\zhao\vshop\src\pkg-diy\schema-home-sections.test.ts`（沿用 vitest include 现有目录约定）

- [ ] **Step 6.1 失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { isValidShopContent } from '../../templates/shared/schema';

const base = { version: 1 };
describe('新楼层类型校验', () => {
  it('video：缺 videoUrl 拒绝', () => {
    expect(isValidShopContent({ ...base, sections: [{ type: 'video', poster: 'a.png' }] })).toBe(false);
  });
  it('video：合法通过', () => {
    expect(isValidShopContent({ ...base, sections: [{ type: 'video', videoUrl: 'https://x/a.mp4', poster: 'https://x/p.png' }] })).toBe(true);
  });
  it('coupon/pointsGoods：均合法（字段全可选）', () => {
    expect(isValidShopContent({ ...base, sections: [{ type: 'coupon' }, { type: 'pointsGoods' }] })).toBe(true);
  });
  it('未知 type 仍整单拒绝（parseShopContent 语义不变，渲染层另有过滤）', () => {
    expect(isValidShopContent({ ...base, sections: [{ type: 'mystery' }] })).toBe(false);
  });
});
```

- [ ] **Step 6.2 确认失败** → **Step 6.3 实现**（schema.ts 追加）：

```ts
export interface VideoSection {
    type: 'video';
    /** 标题；字符串或 locale 字典（LocalizedText） */
    title?: string | Record<string, string>;
    poster?: string;
    videoUrl: string;
}
export interface CouponSection {
    type: 'coupon';
    title?: string | Record<string, string>;
    /** 最多展示张数，默认 6，范围 1..20 */
    limit?: number;
}
export interface PointsGoodsSection {
    type: 'pointsGoods';
    title?: string | Record<string, string>;
    /** 最多展示件数，默认 6，范围 1..20 */
    limit?: number;
}
// ShopSection union 追加三者；VALID_TYPES 追加 'video','coupon','pointsGoods'；
// isValidShopContent 循环内追加校验分支：
if (sec.type === 'video') {
    if (typeof sec.videoUrl !== 'string' || !sec.videoUrl) return false;
    if (sec.poster != null && typeof sec.poster !== 'string') return false;
    if (sec.title != null && typeof sec.title !== 'string' && typeof sec.title !== 'object') return false;
}
if (sec.type === 'coupon' || sec.type === 'pointsGoods') {
    if (sec.limit != null && (typeof sec.limit !== 'number' || sec.limit < 1 || sec.limit > 20)) return false;
    if (sec.title != null && typeof sec.title !== 'string' && typeof sec.title !== 'object') return false;
}
```

- [ ] **Step 6.4 通过 + 提交**：`git commit -m "feat(vshop): 装修 schema 扩展 video/coupon/pointsGoods 楼层类型"`

### Task 7: SectionVideo.vue

**Files:**
- Create: `d:\zhao\vshop\src\templates\shared\sections\VideoSection.vue`
- Modify: `src\templates\shared\sections.ts`（注册 video）

- [ ] **Step 7.1 组件实现**

```vue
<template>
  <view class="sec-video">
    <text v-if="titleText" class="sec-video__title">{{ titleText }}</text>
    <video
      class="sec-video__player"
      :src="section.videoUrl"
      :poster="section.poster || ''"
      :controls="true"
      object-fit="contain"
      @error="onError"
    />
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { localizedText } from '../../../../utils/localized-text';
import type { VideoSection as VideoSectionData } from '../schema';

const props = defineProps<{ section: VideoSectionData }>();
const { locale } = useI18n();
const titleText = computed(() =>
  props.section.title ? localizedText(props.section.title, locale.value) : '');
function onError() {
  uni.showToast({ title: locale.value.startsWith('zh') ? '视频加载失败' : 'Video failed to load', icon: 'none' });
}
</script>
<style lang="scss" scoped>
.sec-video { padding: 20rpx 24rpx; background: #fff; margin-bottom: 16rpx;
  &__title { display: block; font-size: 30rpx; font-weight: 600; color: $text-color; margin-bottom: 16rpx; }
  &__player { width: 100%; height: 400rpx; border-radius: $radius-base; background: #000; } }
</style>
```

实施前先 `Grep localizedText src/utils` 确认既有工具函数真实签名与路径（若不存在则参考仓内其他楼层 title 双语渲染方式，如 FlashSection 的 title 处理，保持同一模式）。
- [ ] **Step 7.2 注册**：sections.ts `video: VideoSection`（补 import）
- [ ] **Step 7.3 验证**：dev:h5 手工向 t2 店模板 pages.home.sections 注入一条 video 楼层（web-admin 未就绪前可临时改 shopContent JSON 或等 Task 11 后统一验）→ 视频可播放
- [ ] **Step 7.4 提交**：`git commit -m "feat(vshop): video 视频楼层组件"`

### Task 8: SectionCoupon.vue（展示 + 跳券中心，不做内联领取）

**Files:**
- Create: `d:\zhao\vshop\src\templates\shared\sections\CouponSection.vue`
- Modify: `src\templates\shared\sections.ts`（注册 coupon）

- [ ] **Step 8.1 组件实现**（骨架；数据源 `getCouponCentre()`，`src/api/queries/coupon.ts:15`，实施时先读该函数返回结构对齐字段名）

```vue
<template>
  <view class="sec-coupon">
    <text v-if="titleText" class="sec-coupon__title">{{ titleText }}</text>
    <scroll-view scroll-x class="sec-coupon__scroll">
      <view class="sec-coupon__card" v-for="c in coupons.slice(0, limit)" :key="c.id" @tap="goCentre()">
        <view class="sec-coupon__amount"><text class="num">{{ c.amountText }}</text><text class="cond">{{ c.condText }}</text></view>
        <text class="sec-coupon__name">{{ c.name }}</text>
        <text class="sec-coupon__cta">{{ t('homeSections.coupon.claim') }}</text>
      </view>
      <view v-if="!coupons.length && !loading" class="sec-coupon__empty">{{ t('homeSections.coupon.empty') }}</view>
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getCouponCentre } from '../../../../api/queries/coupon';
// title 渲染同 Task 7 模式（localizedText）
const loading = ref(false);
const coupons = ref<any[]>([]);
const limit = computed(() => props.section.limit ?? 6);
onMounted(async () => {
  loading.value = true;
  try { coupons.value = (await getCouponCentre()) as any[] ?? []; }
  catch { /* 静默：楼层级失败不阻塞首页 */ }
  finally { loading.value = false; }
});
function goCentre() { uni.navigateTo({ url: '/pkg-promotion/pages/coupons' }); }
</script>
```

样式：横向卡片 `min-width: 240rpx` 红包风（左金额右文案），色值用主题令牌 `$primary`/既有 scss 变量，不硬编码域名。**范围决策：第一期点击整卡跳券中心页完成领取，不在楼层内实现领取接口调用**（避免登录态/领取参数耦合楼层组件；后续可加内联领取）。
- [ ] **Step 8.2 注册 + 验证 + 提交**：`git commit -m "feat(vshop): coupon 领券楼层（展示+跳券中心）"`

### Task 9: SectionPointsGoods.vue

**Files:**
- Create: `d:\zhao\vshop\src\templates\shared\sections\PointsGoodsSection.vue`
- Modify: `src\templates\shared\sections.ts`（注册 pointsGoods）

- [ ] **Step 9.1 组件实现**：数据源 `getPointsProducts({ skip: 0, take: limit })`（`src/api/queries/points-mall.ts:18`），横向卡片（图 + 名称 + 积分价），点击 `uni.navigateTo({ url: '/pkg-user/pages/points-goods-detail?id=' + id })`（实施时以 pkg-user 实际路由为准，Grep pages.json 确认 path）。onMounted 拉取、失败静默，与 Task 8 同模式。
- [ ] **Step 9.2 注册 + 验证 + 提交**：`git commit -m "feat(vshop): pointsGoods 积分商品楼层"`

### Task 10: C 端 i18n 词条（四语言同步）

**Files:**
- Modify: `d:\zhao\vshop\src\i18n\locales\zh-CN.json`、`en.json`、`zh-TW.json`、`ja.json`

- [ ] **Step 10.1 在四个文件相同位置（顶层 `homeSections` 键）追加**（值按语言翻译；ja/zh-TW 由 zh-CN 语义转写）：

```jsonc
"homeSections": {
  "coupon": { "claim": "去领取", "empty": "暂无可领优惠券" },
  "pointsGoods": { "empty": "暂无积分商品" },
  "video": { "loadFail": "视频加载失败" }
}
```

- [ ] **Step 10.2 验证**：`Grep '"homeSections"' src/i18n/locales/*.json` → 4 个文件均命中
- [ ] **Step 10.3 提交**：`git commit -m "feat(vshop): 新楼层 i18n 词条（四语言同步）"`

### Task 11: web-admin 装修页新增 3 楼层编辑

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\home\index.vue`（L268-281 添加入口列表、L385-397 addXxx 构造区、各楼层编辑表单区、类型标注）
- Modify: `d:\zhao\vshop\web-admin\src\apis\template.ts` 如有楼层类型联合需同步

- [ ] **Step 11.1 先读文件**：完整读取 `decorate/home/index.vue` 与 `web-admin/src/apis/` 中楼层相关类型定义，确认现有 section 类型声明位置与 addSection 模式（Grep `banner` 定位）
- [ ] **Step 11.2 类型扩展**：web-admin 侧 section 类型 union/接口追加 Video/Coupon/PointsGoods（字段与 Task 6 一致；title 为 `string | Record<string,string>` 双语文案控件沿用现有楼层的双语输入模式）
- [ ] **Step 11.3 添加入口 + 构造**：

```ts
// 「添加 section」按钮列表（L268-281 区）追加三项，label 走 i18n：
{ type: 'video', label: t('decorateHome.addVideo') },
{ type: 'coupon', label: t('decorateHome.addCoupon') },
{ type: 'pointsGoods', label: t('decorateHome.addPointsGoods') },
// addSection 构造（L385-397 区）追加：
case 'video': return { type: 'video', title: '', poster: '', videoUrl: '' };
case 'coupon': return { type: 'coupon', title: '', limit: 6 };
case 'pointsGoods': return { type: 'pointsGoods', title: '', limit: 6 };
```

- [ ] **Step 11.4 编辑表单**：video → 标题(双语) + 封面图(复用现有图片上传组件，Grep `upload` 定位) + 视频地址(text)；coupon/pointsGoods → 标题(双语) + 数量(number 1-20)。样式沿用同文件既有 form 控件类名
- [ ] **Step 11.5 验证**：`npm run dev:h5`（web-admin，`$env:VITE_API_URL='https://e.joho.cn'`，注入 t2 localStorage）→ 装修页添加三种楼层、保存 → C 端首页（dev:h5）刷新后楼层出现
- [ ] **Step 11.6 提交**：`git commit -m "feat(web-admin): 首页装修支持 video/coupon/pointsGoods 楼层编辑"`

### Task 12: web-admin 模板编辑 layout 下拉 + 楼层优先提示

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\theme\index.vue`（模板编辑页；实施时 Grep `pages` 编辑区定位 JSON 编辑/表单位置）
- Modify: `d:\zhao\vshop\web-admin\src\apis\template.ts`（如需）

- [ ] **Step 12.1 跨端引用版式元数据**：`import { LAYOUT_META } from '../../../../src/templates/shared/layout-meta'`（web-admin vite 对仓库内相对路径引用可用；构建验证在 Step 12.3，若报 fs 限制则将 layout-meta.ts 内容在 web-admin 侧建 `src/constants/layout-meta.ts` 镜像一份并在两文件头部互注「与对方同步维护」）
- [ ] **Step 12.2 UI**：模板编辑表单追加「首页版式」下拉（选项 = LAYOUT_META；选中值写 `pages.home.layout`；当前模板 `pages.home.sections` 非空时，下拉旁固定提示文案：楼层内容优先，版式仅作无楼层时兜底）
- [ ] **Step 12.3 验证**：web-admin 构建 `npm run build:h5` 通过；改 t2 模板 layout='fresh' 且清空 sections → C 端显示 FreshHome；恢复 sections → 回 DynamicHome
- [ ] **Step 12.4 提交**：`git commit -m "feat(web-admin): 模板编辑支持首页版式选择与楼层优先提示"`

### Task 13: web-admin i18n + 阶段二收尾

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`、`en-US.json`（以实际语言文件名为准，Grep `couponEdit` 定位）

- [ ] **Step 13.1 追加词条**：`decorateHome.addVideo/addCoupon/addPointsGoods`、楼层表单各字段 label/placeholder、`decorateTheme.homeLayoutLabel`、`decorateHome.sectionsFirstTip`（四语言若 web-admin 亦有多语言则同步，单一 zh/en 则两份）
- [ ] **Step 13.2 全量回归**：`npm test`（vshop 根）全绿；两端 dev:h5 手工过一遍 Step 11.5/12.3 场景
- [ ] **Step 13.3 提交推送**：`git commit -m "feat(web-admin): 装修/模板编辑 i18n 词条"` → `git push origin master`

### Task 14: e2e 验证 + 手机截图入手册

**Files:**
- Create: `d:\zhao\vshop\web-admin\_e2e\_verify_brick_template.py`（Playwright，390×844 dpr=2）

- [ ] **Step 14.1 脚本场景**（沿用 `_shot_coupon82_layout.py` 登录/注入 t2 惯例）：
  1. C 端首页（t2 有 sections）→ DynamicHome 正常
  2. web-admin 改模板 layout='fresh' + 清空 sections → C 端首页 = FreshHome
  3. web-admin 恢复 sections + 添加 video/coupon/pointsGoods → C 端三楼层渲染、coupon 卡片跳券中心、pointsGoods 卡片跳积分详情
  4. 每场景截图存 `web-admin/src/static/manual/shots/brick_01..04_390.png`
- [ ] **Step 14.2 手册更新**：向主题配置手册（`web-admin/docs/theme-admin-manual/`）追加「五级积木模板体系」章节：概念图、layout 配置说明、三新楼层说明 + 截图
- [ ] **Step 14.3 提交**：`git commit -m "test(vshop): 积木模板体系 e2e 回归与手册截图"`

### Task 15: 部署 + 生产冒烟

- [ ] **Step 15.1 部署 web-admin**：`node scripts/deploy.mjs`（cwd=d:\zhao\vshop\web-admin，本地构建→scp→服务器解压，绝不在服务器构建）
- [ ] **Step 15.2 C 端部署**：按 C 端既有部署机制执行（与 web-admin deploy.mjs 同仓库惯例，Grep 确认 C 端脚本；若 C 端走独立仓库/流程则按其规范）
- [ ] **Step 15.3 生产冒烟**：手机视口访问线上 → 三楼层渲染 + layout 切换生效 + 原有店铺（未配置模板的）首页与改造前一致
- [ ] **Step 15.4 汇报**：清单（改动文件）、验证结果、截图链接

---

## Self-Review 记录

- **Spec 覆盖**：§3 数据模型→Task 12.2；§4 解析链→Task 1/4；§5 仲裁→Task 2.3/4.2；§6 注册表→Task 2/3；§7 C 端→Task 1-5；§8 web-admin→Task 11/12；§9 新楼层→Task 6-9；§10 性能→Task 5.1；§11 兼容承诺→Task 1-5 等价重构 + Task 4.3 截图回归；§13 测试→Task 1/6/14。无缺口。
- **占位符**：无 TBD/TODO；两处「实施时先读文件确认」（Task 7 localizedText 签名、Task 11 web-admin 编辑器结构）为带明确 Grep 目标的探索步骤，非内容占位。
- **类型一致性**：`HomeLayout`/`KNOWN_LAYOUTS`（merge-config.ts）与 `LAYOUT_META.code`、`LAYOUT_COMPONENTS` key 三处同步要求已在 Task 2.2 注释中声明；`VideoSection/CouponSection/PointsGoodsSection` 接口在 Task 6 定义、Task 7-9 消费，字段一致。
- **已知实现决策**（与 spec 微调，已在任务内注明）：① coupon 楼层第一期「跳券中心领取」不做内联领取；② `parseShopContent` 整体校验语义保持不变，未知 type 容错仅在渲染层过滤（兼容双轨）；③ 跨端 layout-meta 若 web-admin 引用受 vite 限制则镜像一份并互注同步。
