# 五级积木模板体系（Pluggable Brick Template System）设计

- 日期：2026-10-16
- 状态：已评审定稿
- 范围：vshop 仓库（C 端 `src/` + `web-admin/`）；后端 shop-template 插件零改动
- 关系：本文档是「五级可回退模板体系」的演进设计（原体系 = 五级合并模型 + 单一 DynamicHome 渲染器 + 全局 6 种 section）；命名沿用既有「积木式 UI」心智。

## 1. 背景与动机

源于「usemall 模板是否全部嵌入 vshop」的盘点：vshop 模板机制存在两层「模板」概念分离的问题——

- 模板库（`ShopTemplate.theme + pages.home.sections`）→ 唯一动态渲染器 `DynamicHome`，管内容与令牌；
- 三套硬编码版式（`DefaultHome` / `FreshHome` / `MarketplaceHome`）只是「无 sections 时的回退」，由渠道 `customFields.displayTemplate` 选择，与模板库无关联。

后续规划（usemall 成套移植、分类页/我的页装修、大促版式上新）都要求「新增一种模板形态不改内核」。为此将原体系升级为**五级积木模板体系**：五级合并降级为纯内核（只管配置值合并），每个版式注册为自治插件（自带渲染器、楼层 schema、预设包、编辑表单）。

## 2. 核心概念

| 概念 | 说明 |
|---|---|
| 积木块（section） | 首页楼层单元，type 由**当前版式自己的 schema** 校验；未知 type 渲染时跳过、编辑器中隐藏 |
| 积木桶（layout / 版式插件） | 四件套：`component`（渲染器）、`sectionSchemas`（楼层白名单）、`defaultPreset`（预设楼层包）、`editorForms`（后台编辑表单） |
| 拼装规则 | 五级合并不变：L0 全局默认 ← L1 `ShopGlobalConfig` ← L2 `ShopTemplate` ← L3 渠道 customFields ← L4 页面/模块内建默认；标量/数组直接覆盖、null 跳过 |

## 3. 数据模型（后端零改动）

版式标识落在模板 JSON，不加实体列、不迁移：

```jsonc
// ShopTemplate.pages
{
  "home": {
    "layout": "fresh",          // 新增：版式标识
    "sections": [ ... ]         // 现有：楼层内容
  }
}
```

`templateMergedPreview`、版本、引用、色板预设等既有后端能力原样透传。

## 4. 解析链：layout 五级合并（新增纯函数）

`resolveHomeLayout()`（放 `src/utils/merge-config.ts`，纯函数，坏值/未知值 → `'default'`）：

```
'default'(L0) ← ShopGlobalConfig.defaults.home.layout(L1)
    ← ShopTemplate.pages.home.layout(L2) ← channel.customFields.displayTemplate(L3 覆盖)
```

- L3 旧 `displayTemplate` 自然成为最高优先覆盖，**存量店铺配置无损迁移**；
- `templateCode`（租户列表展示用）语义不变。

## 5. 优先级仲裁：sections 优先（关键决策）

```
mergedShopContent.sections 有内容 → DynamicHome 渲染楼层（原体系行为，100% 保留）
sections 空/无效 → 按 layout 解析链选版式骨架组件
```

理由：default/fresh/marketplace 三套骨架为硬编码布局、不消费 sections；若 layout 优先，存量店铺已配楼层会静默丢失。`layout` 字段仅接管「无 sections 时的回退骨架选择」，并为未来版式预留注册位。

**混搭演进**：注册表项带 `consumesSections` 标志。`DynamicHome` 本质是 `consumesSections: true` 的特例版式；未来 usemall 骨架置 true 后即可实现「usemall 骨架 + 运营自配楼层」组合，无需改机制。

## 6. 版式注册表（共享模块）

新建顶层共享目录 `shared/template-registry/`（纯 TS，C 端 `src/` 与 `web-admin/src/` 相对引用，同仓库可行）：

```ts
export interface LayoutPlugin {
  code: string;                       // 'default' | 'fresh' | 'marketplace' | 'dynamic' | ...
  component: ...                      // uni-app 组件（H5 端动态 import 懒加载）
  consumesSections: boolean;          // 是否消费 sections
  sectionSchemas: SectionSchema[];    // 该版式认识的楼层类型（含字段定义、i18n key）
  defaultPreset: Section[];           // 预设楼层包（模板可一键引用）
  editorForms: ...;                   // web-admin 编辑表单映射
}
```

- 首期注册：`default` / `fresh` / `marketplace`（均 `consumesSections: false`，组件原样）、`dynamic`（现 DynamicHome，持有现有全局 6 种 section：banner/notice/nav/goods/richText/flash）；
- `DynamicHome` 内部渲染从 v-if 逐类型改为组件表 `SECTION_COMPONENTS`；
- 约定：注册表只增不删；未知 layout 回退 `default`（容错）。

## 7. C 端改造清单

| 文件 | 改动 |
|---|---|
| `src/utils/merge-config.ts` | +`resolveHomeLayout()` 纯函数 |
| `src/stores/tenant.ts` | `loadTemplateConfig` 后暴露 `homeLayout`（解析链见 §4）；既有合并逻辑不动 |
| `src/pages/home/index.vue` | v-if 硬分支 → 查注册表；`sections 优先`规则不变 |
| `src/templates/shared/DynamicHome.vue` | v-if → `SECTION_COMPONENTS` 组件表 |
| `src/templates/shared/schema.ts` | 白名单校验下放各版式 schema，保留全局兼容层 |
| `src/templates/shared/sections/SectionVideo.vue` 等 | 新增 3 个楼层组件（§9） |
| H5 构建 | 版式组件动态 `import()` 代码分割；异步组件 loading 占位防闪白 |

## 8. web-admin 改造清单

| 页面 | 改动 |
|---|---|
| `decorate/theme`（模板编辑） | `pages.home.layout` 下拉（注册表 code 列表）；sections 非空时提示「楼层内容优先，版式仅作无楼层兜底」 |
| `decorate/home`（首页装修） | 楼层类型集按当前模板 layout 动态加载（来自注册表 `sectionSchemas`/`editorForms`）；新增 3 种楼层的添加入口与编辑表单 |

## 9. 装修扩展：新增 3 种楼层（对接已有后端接口）

归属：3 种新楼层注册在 `dynamic` 版式的 `sectionSchemas` 下（即现有 6 种全局楼层 + 3 新 = 9 种，仅 `consumesSections: true` 的版式可见）；default/fresh/marketplace 骨架不受影响。

| type | 内容 | 交互 |
|---|---|---|
| `video` | 视频楼层（封面图 + mp4 url，静态资源走动态 origin） | 点击全屏播放 |
| `coupon` | 可领券卡片横滑 | 领取 / 跳券中心（复用券模板查询） |
| `pointsGoods` | 积分商品横滑 | 跳积分兑换页（复用积分商城查询） |

- 数据请求在组件挂载时才发（非首屏阻塞），缓存进 store 防重复；
- 全部走 i18n 词条，zh-CN / en-US 同步补充；
- 楼层 schema 预留 `schedule` 字段位（本期不实现，仅兼容占位）。

## 10. 性能预算

| 项 | 预算 |
|---|---|
| 网络请求 | 0 新增（layout 从已有模板/渠道数据解析；注册表编译进包） |
| H5 首屏 | 懒加载后 ≤ 现状（少加载未选用的骨架 chunk，约省 100KB gzip 级别） |
| 小程序 | 版式组件全进主包（平台无运行时动态加载），与现状持平 |
| 运行时 | 查表 O(1)；每楼层 schema 校验毫秒级 |

## 11. 与原五级体系的兼容承诺

1. `mergePageConfig` / `mergeThemeTokens` / `loadTemplateConfig` 既有逻辑一行不改；
2. `sections 优先` 仲裁规则与现状逐字节一致；
3. 三套现有版式组件零改动；
4. 未知 layout / 坏 JSON / 缺字段一律纯函数回退（`'default'` / null）；
5. 实施分两步：**第一步行为等价重构**（组件表化 + resolveHomeLayout，截图对比验证），**第二步**再上 web-admin 编辑器与 3 个新楼层。

## 12. 明确不做（本期）

- 低代码/运营自定义组件；
- 楼层定时上下线与 A/B（仅留 schema 扩展位）；
- 后端 shop-template 插件任何变更（不在本仓库）；
- 分类页/我的页装修（注册表已同构支持，属后续子项目）。

## 13. 测试与验收

| 层 | 用例 |
|---|---|
| 单测 | `resolveHomeLayout` 边界：无模板 / 坏 JSON / 未知 layout 值 / L3 覆盖优先 / L1 defaults 缺失 |
| 单测 | 注册表：未知 type 跳过、未知 layout 回退 default |
| e2e（第一步） | 现有主题令牌五级合并回归全绿；首页三版式截图与改造前对比一致 |
| e2e（第二步） | 改模板 layout → C 端版式切换；添加 video/coupon/pointsGoods 楼层 → C 端渲染正确、领券/跳转可用 |
| 交付 | 手机视口截图 390×844（dpr=2）补入操作手册；本地构建部署，绝不在服务器构建 |

## 14. 与后续子项目的关系

- **子项目 1（功能页面补齐：独立搜索页/足迹/签到/忘记密码/好友拼单/售后补快递）**：与本机制解耦，可并行；
- **子项目 3（usemall 成套移植）**：在本注册表上新增 `usemall` 版式插件（自有楼层 schema + 预设包 + `consumesSections: true`）+ 一条模板记录，机制零改动。
