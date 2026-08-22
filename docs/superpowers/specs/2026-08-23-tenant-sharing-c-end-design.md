# C 端租户共享接入 + 装修 JSON 驱动 设计文档

> 版本：1.0（2026-08-23）
> 状态：已获用户认可（5 节全部通过），待实施

## 背景与目标

vshop 手机管理后台（web-admin，e.joho.cn/guanli）已上线。C 端（vshop 前端）目前的租户处理存在核心痛点：

- 租户配置（token/名称/模板）硬编码在 `src/stores/tenant.ts` 的 `TENANT_CONFIGS` 里，**新增租户必须改代码重新构建**，无法由 web-admin 后台开通即生效。
- 装修字段（`displayTemplate`/`themeId`/`shopName`/`shopLogo`/`shopIntro`/`servicePhone`/`shopContent`）已建库（Channel.customFields，PostgreSQL），但 **C 端完全没有消费**。
- 无域名租户共享 `e.joho.cn` 时的 `?tenant=code` URL 参数接入方式，code 必须命中硬编码配置才能工作。

**目标**：把租户解析改为「后端动态拉取」，使新增租户仅在数据库建 Channel 即可、C 端无需改代码；同时让装修 JSON 在 C 端真正生效，实现「web-admin 后台装修 → C 端首页渲染」的闭环。

## 关键决策（已确认）

1. **配置来源**：后端动态拉取（Channel.customFields），前端不再硬编码租户配置。
2. **装修生效**：C 端消费装修 JSON（shopContent）。
3. **JSON 结构**：通用 sections schema，web-admin 装修页与 C 端渲染共用。
4. **渲染方式**：首页 JSON 驱动，无装修数据时回退现有静态模板首页。

## 架构与数据流

### 有域名租户（已有，保留）
`shop.youshop.cn` → C 端 `initTenant()` → `resolveChannelByDomain(host)` → `{token, code}` → 存 token，GraphQL 客户端带 `vendure-channel-token`。

### 无域名租户（本次新增）
`e.joho.cn/?tenant=code` → C 端 `initTenant()` 识别 `?tenant` → 调新增 `resolveChannelByCode(code)` → `{token, code, customFields}` → 存 token + 装修 → 后续请求带 `vendure-channel-token`。

### 装修数据流
web-admin 装修页产出 `shopContent`（text 字段存字符串化 JSON）→ 写入 `channel.customFields.shopContent` → C 端启动解析 → 首页按 sections 渲染；无数据回退现有模板首页。

### 新增后端能力
`resolveChannelByCode(code)`（cjk-plugin）—— 按 code 而非域名解析，复用 `resolveByDomain` 的跨渠道查询模式。

## 装修 JSON Schema（通用 sections）

web-admin 装修页与 C 端渲染的「共同语言」，两端严格一致。

### 顶层结构

```json
{
  "version": 1,
  "theme": { "primaryColor": "#ff6600", "accentColor": "#fff3e6" },
  "sections": [ ... ]
}
```

- `version`：schema 版本，未来扩展兼容（必填，当前固定 1）。
- `theme`：可选，动态主题色（主色/辅色）。
- `sections`：有序区块数组。

### 支持的 section 类型（MVP）

| type | 用途 | 关键字段 |
|------|------|---------|
| `banner` | 轮播图 | `images: [{image, link}]` |
| `notice` | 公告栏 | `text` |
| `nav` | 宫格导航 | `items: [{label, icon, link}]` |
| `goods` | 商品推荐位 | `title`, `collectionId` |
| `richText` | 富文本 | `html` |

### 示例

```json
{
  "version": 1,
  "theme": { "primaryColor": "#07c160", "accentColor": "#e6f7ee" },
  "sections": [
    { "type": "banner", "images": [{ "image": "https://assets.example.com/b1.jpg", "link": "/pkg-product/pages/detail?slug=apple" }] },
    { "type": "notice", "text": "全场满 99 包邮，新客立减 10 元" },
    { "type": "nav", "items": [{ "label": "秒杀", "icon": "⚡", "link": "/pkg-promotion/pages/flash-sale" }] },
    { "type": "goods", "title": "本周热销", "collectionId": "2" },
    { "type": "richText", "html": "<p>店铺公告...</p>" }
  ]
}
```

### 关键设计点

1. `version` 顶字段，未来扩展兼容。
2. 未知 section type → C 端渲染跳过（不报错），向后兼容。
3. web-admin 保存前校验（type 合法、必填字段存在）；C 端解析失败回退默认首页。
4. `shopContent` 是 text 字段，存 `JSON.stringify` 后字符串（沿用现有约定，Vendure 3.6.4 无 `type:'json'`）。

## 后端 `resolveChannelByCode` + C 端 store 改造

### 后端新增查询（cjk-plugin）

`cjk-plugin/src/tenant/` 新增 `resolveChannelByCode`：

```graphql
# shop-api
resolveChannelByCode(code: String!): ChannelResolveResult

type ChannelResolveResult {
  token: String!
  code: String!
  customFields: ChannelResolveCustomFields
}
type ChannelResolveCustomFields {
  shopName: String
  shopLogo: String
  shopIntro: String
  servicePhone: String
  shopContent: String
  displayTemplate: String
  themeId: String
}
```

实现要点：
- `@Allow(Permission.Public)`，用 `RequestContext.empty()` 跨渠道查询（与 `resolveByDomain` 一致）。
- 按 `channel.code` 精确匹配，找不到返回 `null`。
- 返回 `token` + 全部装修 customFields 字段。
- `channelService.findAll` 遍历所有频道按 code 匹配（租户量小，性能可接受）。

### C 端 `tenant.ts` store 改造

**移除**：硬编码 `TENANT_CONFIGS`（default/shop-a/marketplace 的 token/name/template/features 映射）。

**`initTenant()` 流程改造**：
1. H5：`?tenant=code` URL 参数 → 优先。
2. 有域名租户：`resolveChannelByDomain(host)` → 已有逻辑保留。
3. localStorage 缓存 `tenant_code` → 兜底。
4. 默认 `default`。

**解析到 code 后** → 调 `resolveChannelByCode(code)` 拿 `{token, customFields}`：
- `token` → 存 store，GraphQL 客户端自动带 `vendure-channel-token`。
- `shopName/shopLogo/shopIntro/servicePhone` → 存 store（店铺信息展示）。
- `shopContent` → 解析装修 JSON → 存 store（首页渲染用）。
- `displayTemplate/themeId` → 映射模板/主题色。

**失败回退**：`resolveChannelByCode` 返回 null 或网络错误 → 回退 `default`（默认 token、默认模板、无装修），页面不白屏。

**缓存**：解析结果缓存到 sessionStorage（复用域名解析已有模式），减少重复请求。

## C 端首页 JSON 驱动渲染

### 新增通用首页渲染组件

新建 `src/templates/shared/DynamicHome.vue`，按 sections 顺序渲染：

```
sections JSON
  ├─ banner  → 轮播组件
  ├─ notice  → 公告栏组件
  ├─ nav     → 宫格导航组件
  ├─ goods   → 商品推荐组件（按 collectionId 拉商品）
  └─ richText→ 富文本组件
```

- 每个 section 一个子组件，放 `src/templates/shared/sections/` 目录。
- 未知 type → 跳过（不渲染、不报错）。
- `theme` 从 JSON 取主色/辅色，注入 CSS 变量。

### 首页路由改造

现有 `home/index.vue` 用 `templateCode` 切换三个静态模板组件（default/fresh/marketplace）。改为：

```
首页加载 →
  有 shopContent 装修 JSON？→ 渲染 DynamicHome(按 sections)
  无？                     → 保持现有 templateMap 切换
```

即 `DynamicHome` 是「channel 有装修数据时」的优先渲染路径，无数据时兼容现有模板。

### 主题色动态化

装修 JSON 的 `theme.primaryColor/accentColor` → 动态注入页面 CSS 变量（`--brand-color`），覆盖现有 `$brand-color/$accent-color`。

兼容性：现有 default/fresh/marketplace 模板无装修数据时不受影响；仅当装修 JSON 提供 theme 时覆盖。

### 现有模板兜底逻辑不变

- 无装修数据 → 走原有 `templateMap` → 各模板 HomeContent.vue。
- 有装修但某 section 缺数据（如 goods 无 collectionId）→ 该 section 静默跳过，其余正常渲染。

## web-admin 装修页落地 + 校验 + 测试

### web-admin 装修页（decorate/home）升级

现状是占位版。改造为可真正产出 sections JSON：
- 轮播图：可增删轮播项（图片 URL + 跳转链接）。
- 宫格导航：可编辑宫格项（label/icon/link）。
- 公告栏：可输入公告文字。
- 商品推荐位：可选 collection（关联分类）。
- 富文本：MVP 可先放文本输入占位。
- 主题色：可选主色/辅色。

保存 → `updateChannelCustomFields(channelId, { shopContent: JSON.stringify(content) })` → 存 Channel.customFields.shopContent。

本次只做「能产出合法 sections JSON」，不做复杂拖拽编辑器（YAGNI）。

### Schema 校验

- 前端共用 schema 校验函数（C 端 `src/templates/shared/schema.ts`，web-admin 复制同逻辑）。
- 校验点：顶层 `version`、`sections` 是数组、每 section `type` 合法、`theme` 可选。
- web-admin 保存前校验，非法则提示不保存。
- C 端解析：`try/catch JSON.parse`，失败回退默认首页。

### 测试策略

1. 后端单测/e2e：`resolveChannelByCode` 有效 code 返回 token+customFields，无效 code 返回 null。
2. web-admin 装修页：编辑 → 保存 → 再次打开确认 shopContent 持久化。
3. C 端渲染：为 shop-a 填一份装修 JSON → 访问 `?tenant=shop-a` → 首页按 sections 渲染；清空 shopContent → 回退现有模板。
4. Playwright e2e：登录 → 选店 → 装修页保存 JSON → C 端首页验证渲染。

### 部署

- 后端（vendure/cjk-plugin）：本地构建 → 提交 dist → 服务器 git pull → pm2 restart（遵循部署铁律，服务器不构建）。
- C 端（vshop）：本地构建 → 提交 dist → 服务器 git pull。
- web-admin（e.joho.cn/guanli）：走已有 deploy.mjs（本地构建 → tar → scp → 解压 → nginx reload）。
- 数据库：无新表，仅用已有 customFields 列（displayTemplate/themeId/shopContent 已建），**无需迁移**。

## 范围边界（YAGNI）

- **不做** web-admin 复杂拖拽式装修编辑器（MVP 表单式够用）。
- **不做** 全站 JSON 驱动（仅首页）。
- **不做** 独立配置中心（配置存 Channel.customFields，不新增服务/存储）。
- **不做** 装修图片上传（图片 URL 直接在地址栏填，图片资源可先放静态目录）。

## 需新增/修改的关键文件

### 后端（d:\zhao\vendure）
- 新增：`packages/cjk-plugin/src/tenant/channel-resolve.resolver.ts`（或扩展 domain-shop.resolver.ts）
- 新增：`packages/cjk-plugin/src/tenant/channel-resolve.service.ts`（或扩展 domain-resolver.service.ts）
- 修改：`packages/cjk-plugin/src/tenant/types.ts`（ChannelResolveResult 类型）
- 修改：`packages/cjk-plugin/src/plugin.ts`（注册 schema/查询）

### C 端前端（d:\zhao\vshop）
- 修改：`src/stores/tenant.ts`（移除硬编码配置，动态拉取）
- 修改：`src/api/queries/channel.ts`（新增 `resolveChannelByCode`）
- 新增：`src/templates/shared/DynamicHome.vue`
- 新增：`src/templates/shared/sections/`（banner/notice/nav/goods/richText 组件）
- 新增：`src/templates/shared/schema.ts`（schema 校验 + 类型）
- 修改：`src/pages/home/index.vue`（装修数据优先渲染 DynamicHome）
- 修改：`src/templates/registry.ts`（模板映射改造，承接 themeId/displayTemplate）

### web-admin（d:\zhao\vshop\web-admin）
- 修改：`src/pages/decorate/home/index.vue`（占位 → 产出 sections JSON）
- 修改：`src/pages/decorate/theme/index.vue`（主题色编辑）
- （可选）复制 schema.ts 校验函数