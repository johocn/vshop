# 主题风格体系联通（G1 + G2）设计 · 2026-09-20

> 来源：`docs/superpowers/specs/2026-09-20-web-admin-gap3-inventory.md` 的 G1、G2。
> 本批目标：让「主题风格」页成为五级可回退风格体系里 **L3 店铺覆盖** 的正式入口，并把模板库 / 全局配置从手写 JSON 升级为结构化表单。
> 用户已拍板（2026-09-20）：**版式 A 模板优先** · **补 L3 令牌层 + themeId 只读兼容** · **主题页收口为唯一风格入口**。

---

## 1. 现状证据

| # | 事实 | 证据 |
|---|---|---|
| 1 | 「主题风格」页只有 3 个硬编码色卡，写 `channel.customFields.themeId` | [pages/decorate/theme/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/decorate/theme/index.vue#L19-L36) |
| 2 | 其中 `fresh` / `dark` 在 C 端 theme.css 中并不存在（只有 `jd-red`/`taobao-orange`/`modern-minimal`/`brand`/`default`） | [nshop theme.css](file:///d:/zhao/nshop/app/assets/css/theme.css#L13-L20) |
| 3 | nshop 侧 `themeId` 虽驱动 `data-theme`，但被令牌链以更高特异性压过 | [nshop/app/app.vue](file:///d:/zhao/nshop/app/app.vue#L36-L48) 用 `html:root:root` 内联 `--ui-primary` |
| 4 | vshop 侧 `themeId` 查询了但全仓无消费 | [vshop/src/api/queries/channel.ts](file:///d:/zhao/vshop/src/api/queries/channel.ts#L58) |
| 5 | 同一件事已有第二套体系：店铺信息页可选 `ShopTemplate` 并写 `templateId` | [pages/decorate/shop-info/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/decorate/shop-info/index.vue#L319) |
| 6 | 模板库 / 全局配置的 theme、pages 仍是手写 JSON 文本框 | [platform/templates/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/platform/templates/index.vue#L266-L272)、[platform/global-config/index.vue](file:///d:/zhao/vshop/web-admin/src/pages/platform/global-config/index.vue#L36-L40) |
| 7 | 后端合并预览 `mergedPreview` 把 L2 原样并入，**不展开 `palette.scheme`** | [shop-template-plugin/src/merge-config.ts](file:///d:/zhao/vendure/packages/shop-template-plugin/src/merge-config.ts#L18-L38) |
| 8 | vshop C 端 `mergeThemeTokens` **没有** palette 展开（nshop 有 `resolvePaletteTokens`） | [vshop/src/utils/merge-config.ts](file:///d:/zhao/vshop/src/utils/merge-config.ts#L63-L72) vs [nshop merge-config.ts](file:///d:/zhao/nshop/layers/base/app/utils/merge-config.ts#L82-L92) |

结论：主题页选的主色在当前链路上**大概率不生效**（被 L1/L2 令牌压过，且 vshop 端 `themeId` 完全无消费）；「联通」的实质是把主题页收敛到令牌链上，并补齐缺失的 L3。

---

## 2. 五级体系不变声明（硬约束）

本批**不改合并算法的语义与层级顺序**：

- 层级仍为 `L0 全局默认 ← L1 全局配置 ShopGlobalConfig ← L2 风格模板 ShopTemplate ← L3 店铺覆盖（渠道 customFields）← L4 页面/模块内建默认`。
- 改动仅两处：**新增 L3 令牌入参**（此前 L3 只有页面配置，无令牌层）、**补 L2 palette 展开**（vshop 对齐 nshop）。
- 回退语义不变：未引用 / 引用无效 / 跨 app 模板时服务端返回 null → C 端回退 L1。
- 合并仍为纯函数深合并：数组与标量直接覆盖、`null` 跳过、坏 JSON 返回 null 逐级退回默认。
- 既有 `themeId`（`data-theme`）保留为只读兼容层，不参与新链优先级。

---

## 3. 数据层

### 3.1 新增 L3 令牌层 `themeTokensOverride`

- 声明位置：`vendure/packages/shop-template-plugin/src/plugin.ts` 的 configuration 回调，与现有 `templateId` 同处对 `config.customFields.Channel` 做 merge（不散落到 `dev-config.ts`）。
- 字段定义：`{ name: 'themeTokensOverride', type: 'text', nullable: true, public: true }`。
- 存储形态：JSON 字符串（与既有 `detailConfig` 同模式），形如
  `{"primaryColor":"#E1251B","accentColor":"#FFF3E6","radius":8}`。
- 语义：只存增量差异；缺字段或 `null` 跳过；空串、非法 JSON 一律视为「不覆盖」（不报错、不阻断）。
- 写入路径：web-admin 复用既有 `myUpdateChannelCustomFields`（resolver 对未列入保护名单的字段直通，[tenant-member.resolver.ts](file:///d:/zhao/vendure/packages/cjk-plugin/src/tenant/tenant-member.resolver.ts#L99-L107)），**不新增权限**。

### 3.2 合并链改造

| 端 | 文件 | 改动 |
|---|---|---|
| nshop | [merge-config.ts](file:///d:/zhao/nshop/layers/base/app/utils/merge-config.ts#L82-L92) + 调用点 | `mergeThemeTokens(globalCfg, template, channelCf)` 增加 L3 入参；优先级 `L1 < L2 < L3` |
| vshop | [merge-config.ts](file:///d:/zhao/vshop/src/utils/merge-config.ts#L63-L72) + `stores/tenant.ts` | 同签名；**并补上 palette 展开**（对齐 nshop 的 `resolvePaletteTokens`） |

- 解析 L3 的函数为纯函数：`parseThemeTokensOverride(raw)`，坏数据返回 `null`。
- 仅在渠道 customFields 中该字段非空时才传入，避免无谓的合并开销。

### 3.3 `themeId` 存量兼容

- **不写入、不删除**；C 端 `data-theme` 保留（它仍提供 success / warning / error 与字号基准）。
- 当渠道 `themeId` 非空且不属于默认值时，主题页顶部显示「旧版主题」提示条，并给出**一键迁移**。
- 迁移映射（旧色卡 → L3 令牌），映射表内置在 web-admin：

| themeId | primaryColor | radius |
|---|---|---|
| `taobao-orange` | `#FF5000` | 8 |
| `jd-red` | `#E1251B` | 6 |
| `modern-minimal` | `#111827` | 6 |
| `brand` / `default` / 空 | 不产生覆盖 | — |

- 迁移动作：**显式确认弹窗**展示映射结果 → 写 `themeTokensOverride` → 清空 `themeId` → toast 说明已转换。绝不静默迁移。

---

## 4. 后台页面改造（web-admin）

### 4.1 主题风格页（版式 A，纵列单页）

自上而下：

1. **目标端分段器**：`nshop 商城` / `vshop 商城`，切端即重取该端的模板列表与当前生效配置。
2. **当前生效摘要卡**：模板名（或「未引用模板」）+ 生效主色色块 + 来源徽标（`L1` / `L2` / `L3` / `L4`）。
3. **风格模板卡片网格**：首项为「不引用模板」，其余为该端 `enabled` 且 app 匹配的模板（**沿用「店铺覆盖页模板列表需过滤 app」既有规则**）。选中即写 `templateId`，允许清空。
4. **令牌覆盖（可选）**：主色 / 辅色 / 圆角三项结构化输入，留空即不覆盖；写 `themeTokensOverride`。
5. **旧版主题提示条**（条件渲染）：见 3.3。
6. **合并结果预览**：按下文 §5 的接口取真实合并结果，展示生效令牌 + 每项来源层级。

保存语义：一次提交同时写 `templateId` 与 `themeTokensOverride`；两项互相独立，清空任一不影响另一项。

### 4.2 店铺信息页

- **移除**「风格模板」卡片与 `tplApp` 分段器（消除与主题页互相覆盖 `templateId` 的双入口）。
- 保留：店铺名称 / 客服电话 / 简介 / Logo / 分享图 / 税率模式 / 库存模式（含 odoo）/ 详情页版式（`priceStyle`、`detailConfig.layout`）。
- 详情页版式处增加一行「更多块级设置 →」跳转详情装修页，避免用户以为版式能力被删。

### 4.3 模板库 / 全局配置（G2）

- **theme**：「配色方案」下拉（8 套预设，取自后端 `palettePresets`）+ 令牌三项（primaryColor / accentColor / radius）。
- **pages**：「页面选择」+「版式分段器」（product 用 `classic/floor/dualBuy`）+「功能块显隐开关」（复用详情装修页的块清单常量）。
- **JSON 高级兜底**：原 textarea 折叠保留，仅作逃生口；表单与 JSON 双向同步，冲突时以表单为准并提示。
- **就地合并预览**：两页均挂常驻预览卡（不再是模板库独有的「预览」页签），保存后自动刷新。
- 非法输入做**内联校验**（色值格式、圆角范围、JSON 可解析），而非提交后报错重填。

---

## 5. 预览链路修正（否则「看合并结果」是假的）

1. 后端 `shop-template-plugin` 补一份 palette 预设表（8 套，与 C 端同语义，后端成为权威副本）。
2. 新增 `palettePresets` query，供 web-admin 的「配色方案」下拉直接消费，**避免后台再抄一份常量**。
3. `mergedPreview` 在合并前先展开 L2 的 `palette.scheme`，使预览与 C 端实际渲染一致。
4. 修正模板库预览中 `overrides` 的占位示例：现写作 `{"theme":{"primaryColor":...}}`，会多出一层 `theme` 键，应为扁平键 `{"primaryColor":"#123456","product":{"layout":"list"}}`。

---

## 6. 权限与 i18n

- 主题页读写 `templateId` / `themeTokensOverride`：沿用渠道成员校验，无新增权限。
- 模板库 / 全局配置：沿用 `ShopTemplatesRead` / `ShopTemplatesUpdate`；配色下拉所需 `palettePresets` 走同一读权限或 shop 侧公开查询。
- 新增文案必须同时补 `zh-Hans.json` 与 `en.json`，禁止单语言写死。

---

## 7. 验收标准

1. 在主题页选模板 → C 端首帧即变（判定以**手机视口 390×844、dpr=2 截图**为准）。
2. 在主题页改 L3 令牌主色 → C 端首帧主色变化，且摘要卡来源徽标显示 `L3`。
3. 选择「不引用模板」→ 回退 L1 全局配置，不空白、不错色。
4. 引用被停用 / 跨 app 的模板 → 仍回退 L1。
5. 存量 `themeId` 渠道：迁移前行为不回归；执行一键迁移后 `themeId` 清空、令牌生效。
6. 模板库与全局配置：**不改任何 JSON** 即可完成「建模板 → 选配色 → 选版式 → 保存 → 预览」。
7. 店铺信息页不再出现模板选择；两页不再互相覆盖 `templateId`。

---

## 8. 风险与边界

| 风险 | 处理 |
|---|---|
| L3 令牌与 `data-theme` 残留并存导致颜色来源混淆 | 迁移后显式清空 `themeId`；摘要卡展示来源层级，不做静默合并 |
| vshop 补 palette 展开后视觉与线上不一致 | 属修复（此前 vshop 不识别 `palette.scheme`）；上线后按 §7.1 截图逐端验收 |
| 后端预设表与 C 端常量漂移 | 后端为权威副本并对外提供 query；C 端两份保留为 SSR 运行时副本，改动时三处同步（在预设表文件头注明） |
| 表单与 JSON 双向同步冲突 | 以表单为准并提示；JSON 仅兜底，不承载高频编辑 |

**非目标（本批不做）**：不改合并算法的层级与语义；不动订单多版式渲染器；home / category / cart / profile 的积木数组仍走 JSON 兜底，不做积木编辑器；G3 库存单据闭环、G9 配送能力派生各自独立批次。

---

## 9. 交付与部署

- 构建：web-admin **本地构建** + `node scripts/deploy.mjs`；vendure 与 nshop / vshop 走 git push + 服务器 pull + `pm2 restart`。**禁止服务器构建。**
- 每项功能 = 实现 + API/e2e 回归 + 390×844 dpr=2 手机截图（存 `web-admin/src/static/manual/shots/`）+ 手册章节补充。
- 速查卡 `nshop/docs/domains/shop-style-theme.md` 需同步补充 L3 令牌层与新入口说明。