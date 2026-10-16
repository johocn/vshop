import type { Component } from 'vue';

export const FALLBACK_LAYOUT = 'default';

/** 版式骨架组件表：key 与 merge-config.ts KNOWN_LAYOUTS / layout-meta.ts LAYOUT_META.code 同步。
 *  行为契约：sections 优先（home/index.vue 决策），本表仅在无 sections 时被查。
 *  H5 端按需 chunk（defineAsyncComponent 动态 import）；小程序端无运行时动态加载，保持静态。 */

// #ifdef H5
import { defineAsyncComponent } from 'vue';
export const LAYOUT_COMPONENTS: Record<string, Component> = {
  default: defineAsyncComponent(() => import('./default/pages/HomeContent.vue')),
  fresh: defineAsyncComponent(() => import('./fresh/pages/HomeContent.vue')),
  marketplace: defineAsyncComponent(() => import('./marketplace/pages/HomeContent.vue')),
  dynamic: defineAsyncComponent(() => import('./shared/DynamicHome.vue')),
};
// #endif

// #ifndef H5
import DefaultHome from './default/pages/HomeContent.vue';
import FreshHome from './fresh/pages/HomeContent.vue';
import MarketplaceHome from './marketplace/pages/HomeContent.vue';
import DynamicHome from './shared/DynamicHome.vue';
export const LAYOUT_COMPONENTS: Record<string, Component> = {
  default: DefaultHome,
  fresh: FreshHome,
  marketplace: MarketplaceHome,
  dynamic: DynamicHome,
};
// #endif
