# 微信分享标题/描述/主图兜底方案（vshop + nshop 双站）

日期：2026-09-15
状态：设计定稿

## 背景

商品详情页转发微信好友/朋友圈时，当前分享配置不完整：
- 描述字段传的是商品描述的 HTML 原文（微信卡片会显示乱码/标签）。
- 图片只取 `featuredAsset.preview`，商品无主图时不传图（空串），微信展示空白默认卡片。
- 标题/描述无统一的逐级兜底。

需要为标题、描述（过滤 HTML 后）、主图建立兜底链。

## 覆盖站点

| 站点 | 目录 | 域名 | 分享实现 |
|---|---|---|---|
| vshop | `d:\zhao\vshop` | e.joho.cn | `useH5Share.ts` / `useShare.ts` |
| nshop | `d:\zhao\nshop` | www.youshop.cn | `WechatShare.vue` |

两个前端工程独立（vshop 为 uni-app H5，nshop 为 Nuxt SSR），共享同一 Vendure 后端与 Channel customFields 体系。

## 兜底链定义

**主图兜底链**
```
featuredAsset.preview → assets[0].preview → 店铺配置 shareImageUrl → 内置默认图
```

**描述兜底链**
```
stripHtml(translations.description) [≤100字 + …] → 店铺简介 shopIntro → 内置推荐语
```

**标题兜底链**
```
product.name → 店铺名 shopName → 内置站点名（vshop:「VShop - 精选好物」/ nshop-site.title）
```

## 方案设计

### 1. 后端字段（vendure cjk-plugin，两站共享）

`packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts` 新增 Channel customField：

```ts
{
  name: 'shareImageUrl',
  type: 'string',
  nullable: true,
  label: [{ languageCode: LanguageCode.zh_Hans, value: '默认分享图 URL' }],
}
```

`packages/cjk-plugin/src/plugin.ts` 中 `resolveChannelByCode` / `resolveChannelByDomain` 的 SDL `ChannelResolveCustomFields` 增加 `shareImageUrl: String`，随 customFields 下发。

### 2. 后台配置（web-admin，管理 shareImageUrl）

`web-admin/src/pages/decorate/shop-info/index.vue` 新增「默认分享图」单元：
- 复用 `MediaPicker`（`max=1`），`@change` 产出 asset id。
- 保存时 `fetchAssets([id])` 回查 `.preview` 绝对 URL，连同其它字段一并 `updateChannelCustomFields`。

### 3. vshop（e.joho.cn）

- **新增 `src/utils/html.ts`**：纯函数 `stripHtmlToText(html, maxLen=100)`——剥离标签/解实体/压缩空白/截断加 `…`；输入非法或结果空返回 `''`。
- **`src/stores/tenant.ts`**：`loadTenantDetails` 读取 `cf.shareImageUrl`，暴露 `shareImageUrl` ref。
- **`src/composables/useH5Share.ts`**：
  - `useH5Share` 描述兜底、图片兜底（传 `desc`/`imageUrl` 为空时逐级回退）。
  - `useH5ProductShare` 接收计算后的 title/desc/image。
- **`src/composables/useShare.ts`**：`useProductShare(name, slug, imageUrl)` 描述默认改为内置推荐语（无商品描述时）。
- **`src/pkg-product/pages/detail.vue`**：分享调用处组装完整 share meta：
  - 标题 = `product.name`（空则店铺名→内置）
  - 描述 = `stripHtmlToText(pickTranslation(translations))`（空则 `shopIntro`→内置）
  - 主图 = `featuredAsset?.preview || assets[0]?.preview || tenant.shareImageUrl || 内置默认图`。

### 4. nshop（www.youshop.cn）

- **新增 HTML 过滤纯函数**（放置于 nshop 工具层，与 vshop 语义一致）：`stripHtmlToText`。
- **`layers/base/app/components/WechatShare.vue`**：
  - `shareData` 构建时叠加兜底：`desc` 为空 → 店铺简介 → i18n inviteTip；`imgUrl` 为空 → 商品 `assets[0].preview` → 店铺 `shareImageUrl` → 内置默认图。
  - 组件内对 `props.description` 若含 HTML 先过滤，或由页面过滤后传入（以页面组装为准）。
- **`layers/base/app/pages/product/[slug].vue`**：
  - 传 `:description="过滤后纯文本"`、`:image-url="主图兜底链"`。
  - 新增通过 `resolveChannelByCode` 动态拉取当前租户 `shareImageUrl`（nshop 用静态 tenant-channels.json 拿店铺名，但 URL 需动态 query）。

### 5. 内置默认图

- 两个站点各放一张静态默认分享图到自身可访问静态目录（vshop：`public`/静态资源；nshop：`public/`）。
- 前端以**绝对 URL**（当前域名 origin + 路径）引用，保证任意绑定域名下有效。

## 错误处理

- HTML 解析失败/非法输入 → `stripHtmlToText` 返回 `''` → 走下一级兜底，不阻断。
- WeChat JSSDK 加载或 `wx.config` 签名失败 → 沿用现有静默降级；兜底链仍保证 share meta 完整。
- 绝对 URL 归一：后台存的 `.preview` 需为前端可直接使用的完整 URL（如缺失 origin 则前端补当前 origin）。

## 测试

- 单测（node:test）：`stripHtmlToText`——标签剥离、HTML 实体、空白压缩、100 截断加 `…`、非法输入/空串返回 `''`。
- 兜底链单测：`buildShareMeta` 纯函数在 无图/无描述/无配置 各组合下的正确取值。
- e2e：后台店铺信息页配置默认分享图 → 商品详情页微信分享配置取到正确标题/纯文本描述/主图（手机视口截图）。
- 操作手册：新增章节记录「默认分享图配置」与商品详情页分享兜底说明（含截图）。

## 涉及文件

### vshop
- `vendure/packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts`
- `vendure/packages/cjk-plugin/src/plugin.ts`（SDL）
- `web-admin/src/pages/decorate/shop-info/index.vue`
- `vshop/src/utils/html.ts`（新增）
- `vshop/src/stores/tenant.ts`
- `vshop/src/composables/useH5Share.ts`
- `vshop/src/composables/useShare.ts`
- `vshop/src/pkg-product/pages/detail.vue`

### nshop
- `nshop/layers/base/app/components/WechatShare.vue`
- `nshop/layers/base/app/pages/product/[slug].vue`
- nshop HTML 过滤纯函数文件（新增）
- nshop 静态默认图 + vshop 内置默认图（public）