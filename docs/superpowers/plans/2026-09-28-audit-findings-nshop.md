# 审查发现 — nshop

## 概览

本次为**只读**全域扫描，覆盖 `d:\zhao\nshop`（nuxtless 二次开发分支）的 `app/**`、`layers/base/**`（app/components、composables、stores、plugins、middleware、pages、utils、i18n 12 个语言包）、`server/**`、`nuxt.config.ts`、`.env*`、`public/**`，共约 200+ 源文件（排除 node_modules/.nuxt/.output/shots/tmp*/_e2e）。未修改任何源码，未执行 git 提交。

已核实**无问题**的维度（一句话说明）：
- **交易入口**：下单/支付/优惠券/积分均以 `variantId+quantity`、`method`、`code` 提交后端 mutation（`useOrderStore.ts`、`useCoupon.ts`），无前端计算金额/折扣后提交，服务端计价；支付回调页仅做结果展示与跳转。未发现问题。
- **SSR 渠道头一致性**：`tenant-channel.ts` 服务端用 `useRequestURL().pathname` 逐请求解析租户，`useGqlHeaders/useGqlHost` 写入的是 `nuxtApp._gqlState`（useState，SSR 每请求隔离），不存在全局单例串号；header 键与后端一致（`vendure-token`）。未发现问题。
- **XSS 之 JSON-LD**：结构化数据统一走 `nuxt-schema-org`（`defineProduct/defineWebPage`），未见手写 `JSON.stringify` 直插 `<script>` 的模式。未发现问题。
- **文件与上传**：C 端无上传逻辑，未发现 `uploads` 目录直访问题。未发现问题。
- **死链**：`navigateTo`/`localePath`/`to` 目标（/account、/account/orders、/account/addresses、/account/after-sales、/coupon、/messages、/order/lookup、/checkout、/account/login 等）均存在对应 `pages/*.vue`。未发现问题。
- **console 残留**：仅 2 处被注释的 `console.log`（`layers/base/app/pages/checkout/index.vue:101-102`）与若干业务 `console.warn/error`，无真实调试残留。
- **i18n 数组型文案**：数组均用 `tm()` 取值（`app/pages/index.vue:151`、`PromoteBlock`/`ServiceBlock` 等），未见 `t()` 误用数组。

## 发现清单

| 编号 | 位置(文件:行号) | 级别 | 维度 | 证据(代码摘录) | 建议修法 | 验证状态 |
|---|---|---|---|---|---|---|
| F-NS-01 | layers/base/app/pages/admin/redemption.vue:14 | 中 | 越权与多租户 | `definePageMeta({ title: "admin-redemption" });` 该页无任何 middleware，C 端可直接访问；调用 admin-api 的 redemptionClaim/redemptionReissue | 已复核：页面在 C 端可直达，但所有写操作均需管理员手工录入的 admin token 且后端 `@Allow(Permission.UpdateOrder)` 兜底鉴权，**无提权效果**，降级为中；建议改为独立管理端承载或加角色守卫 | 确认(降级中) |
| F-NS-02 | layers/base/app/pages/admin/redemption.vue:18 | 中 | 硬编码与泄露 | `const adminApiBase = computed<string>(() => (cfg as any).adminApiBase || "https://e.joho.cn/admin-api");` 硬编码管理域名，违反动态 origin 规范 | 改为纯 runtimeConfig/环境变量注入，删除硬编码兜底 | 确认 |
| F-NS-03 | layers/base/app/components/product/ProductDescription.vue:8 | 高 | XSS | `<div class="prose dark:prose-invert" v-html="description" />` 商品描述富文本未经净化直接渲染 | 引入 DOMPurify/sanitize-html 白名单清洗后再 v-html，或按纯文本渲染 | 确认 |
| F-NS-04 | layers/base/app/components/home/blocks/RichTextView.vue:10 | 高 | XSS | `<section class="mx-2 ..." v-html="props.section.html" />` 首页装修富文本楼层（运营粘贴 HTML）未净化 | 同 F-NS-03，服务端/客户端均做白名单净化 | 确认 |
| F-NS-05 | layers/base/app/utils/vendure-session.ts:36 | 中 | 鉴权与会话 | `` `${VENDURE_SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax` `` 会话 token 写 cookie 缺 `Secure`，且 JS 可读（XSS 可窃取） | 生产环境追加 `Secure`；敏感会话建议改服务端下发 HttpOnly cookie | 确认 |
| F-NS-06 | layers/base/stores/useAuthStore.ts:47 | 中 | 鉴权与会话 | `persist: true,`（pinia-plugin-persistedstate 默认走 `useCookie` 且未传 cookieOptions）→ 含 token/user 的 auth store 落在无 Secure/httpOnly/SameSite 的 cookie | 在模块或 store 上配置 `cookieOptions: { secure: true, sameSite: "lax" }` | 确认 |
| F-NS-07 | nuxt.config.ts:60 | 中 | 硬编码与泄露 | `unsplashApiKey: process.env.UNSPLASH_API_KEY,` 位于 `runtimeConfig.public`，会随客户端 bundle 下发（且全仓未被使用） | 移至 `runtimeConfig`（私有）或直接删除 | 确认 |
| F-NS-08 | app/app.vue:49 | 中 | XSS与注入 | `useHead(() => ({ style: themeCssVars.value ? [{ innerHTML: themeCssVars.value }] : [] }));` 将渠道/CMS 主题变量直接以 innerHTML 注入 `<style>`，未校验 | 对颜色/半径做白名单校验（如 `^#[0-9a-fA-F]{3,8}$`、纯数字 px）后再拼接 | 确认 |
| F-NS-09 | layers/base/app/pages/category/[slug].vue:283 | 高 | 功能缺陷 | 模板用 `<SortBar v-model="sort" />`（另见 :363），但组件注册名为 `CategorySortBar`（`.nuxt/components.d.ts:51` 确认无 `SortBar`）；同页 :407 `<FilterDrawer>` 注册名实为 `CategoryFilterDrawer`（d.ts:50），将导致 SSR 渲染空注释/未知元素 + hydration mismatch | 已复核 `.nuxt/components.d.ts` 仅有 `CategorySortBar`/`CategoryFilterDrawer`：改为 `<CategorySortBar>` / `<CategoryFilterDrawer>` | 确认(升为高) |
| F-NS-10 | app/pages/index.vue:153 | 低 | 硬编码与泄露 | `{ src: "https://picsum.photos/seed/jp-ad-1/240/180", link: "/" },` PC 右栏占位广告硬编码外域，生产可见 | 移除占位数据或改为后台配置驱动 | 确认 |
| F-NS-11 | layers/base/app/components/home/jd/JdBannerCarousel.vue:13 | 低 | 硬编码与泄露 | `{ imageUrl: "https://picsum.photos/seed/jd-home-1/750/300", title: "京东 618 年中大促" },` 轮播兜底硬编码外域占位图 | 同上，走装修配置/本地静态资源 | 确认 |
| F-NS-12 | layers/base/app/components/header/CitySelector.vue:22 | 低 | 功能缺陷 | `{ info: { adcode: "110000", name: "北京市" }, coords: { lat: 39.9042, lng: 116.4074 } },` 热门城市硬编码，未走 useCityService/useAvailableCities | 热门城市改由城市服务/配置下发 | 确认 |
| F-NS-13 | layers/base/app/components/category/SortBar.vue:8 | 低 | i18n | `const options = [{ label: "综合", value: "RELEVANCE" }, { label: "新品", value: "NAME_ASC" },` 排序项写死中文，未走 i18n | 改为 `t("messages.…")` | 确认 |
| F-NS-14 | layers/base/app/components/order/OrderMetaCard.vue:18 | 低 | i18n | `: t("messages.general.na");` 但 `en-US.ts` 缺 `general.na`（实测非中文语言包缺 131~186 条：bg/ru/fa/de/es/fr/it/pt 各约 185，ja/ko 各 131） | 补齐各语言词条；当前靠 zh 兜底可避免显示原始 key，但仍会中文串版 | 确认 |
| F-NS-15 | layers/base/app/components/home/OperationalFloor.vue:28 | 低 | i18n | `<p v-if="!cards.length" ...>敬请期待</p>` 模板硬编码中文（另见 FlashSalePlaceholder.vue:3「限时秒杀」、CheckoutLayoutMall.vue:31、GoodsSingleList.vue:117「去购买」等 7 处） | 抽取为 i18n 词条 | 确认 |
| F-NS-16 | layers/base/app/composables/usePickupNavigation.ts:29 | 低 | 硬编码与泄露 | `` `https://uri.amap.com/navigation` + `` 高德导航域名硬编码在业务代码中 | 抽为常量/配置，或明确标注为固定外部服务端点 | 确认 |
