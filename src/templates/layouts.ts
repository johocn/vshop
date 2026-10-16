import type { Component } from 'vue';
import DefaultHome from './default/pages/HomeContent.vue';
import FreshHome from './fresh/pages/HomeContent.vue';
import MarketplaceHome from './marketplace/pages/HomeContent.vue';
import DynamicHome from './shared/DynamicHome.vue';

export const FALLBACK_LAYOUT = 'default';
/** 版式骨架组件表：key 与 merge-config.ts KNOWN_LAYOUTS / layout-meta.ts LAYOUT_META.code 同步。
 *  行为契约：sections 优先（home/index.vue 决策），本表仅在无 sections 时被查。 */
export const LAYOUT_COMPONENTS: Record<string, Component> = {
  default: DefaultHome,
  fresh: FreshHome,
  marketplace: MarketplaceHome,
  dynamic: DynamicHome,
};
