# 后台多语言 i18n 地基（阶段 1）

日期：2026-09-20
仓库：`d:\zhao\vshop\web-admin`（uni-app Vue3 H5 手机管理后台）
状态：设计定稿

## 背景与目标

web-admin 是 uni-app Vue3（vue i18n 内置）H5 管理后台，当前 54 个页面所有固定文案**硬编码中文**，无任何 i18n 基础设施（`package.json` 无第三方 i18n，全项目无 `locale/` 目录、无 `$t()` 调用）。

本轮为「查遗补漏」批次 A 阶段 1，**只搭地基 + 抽取三处高频页作演示**，验证「语言包 → 切换 → 即时生效」闭环，为后续全量迁移打样。**不做全量文案迁移**，控制 diff 规模。

## 技术选型

用 **uni-app 官方内置 i18n**，不引第三方 `vue-i18n`：
- `pages.json` 顶层 `"locale"` + `"localeList"` 声明语言与切换面板
- 语言包目录 `src/locale/*.json`
- 模板内 `$t('key')`；setup 脚本逻辑用 `uni.$t()` / `i18n` 注入
- `uni.setLocale(locale)` 即时切换，vue3 自动重渲染
- 与 nshop 前台统一的 `LocalizedText` 后台文案规范保持对齐（本阶段不涉及后端多语言，仅前端字典）

## 新增/改动清单

### 1. 语言包（新增）
- `src/locale/zh-Hans.json`（主包，必须兜底完整）
- `src/locale/en.json`（英文演示包，体现双语切换能力）

键分层规则：`[页面域].[语义键]`，如：
```json
{
  "app": { "role": "角色", "logout": "退出登录" },
  "login": { "title": "登录", "passwordTab": "密码登录", "phoneTab": "手机号登录", "forgot": "忘记密码", "captcha": "验证码" },
  "order": { "list": { "search": "搜索", "all": "全部订单", "pending": "待发货", "done": "已完成" } }
}
```

### 2. 配置（修改）
- `src/pages.json` 顶层新增：
  ```json
  "locale": "zh-Hans",
  "localeList": [
    { "name": "简体中文", "value": "zh-Hans" },
    { "name": "English", "value": "en" }
  ]
  ```
  其余页配置不动。

### 3. 语言持久化与切换（修改/新增）
- `src/stores/app.ts`：新增 `locale` state + `setLocale()`，`localStorage` 键 `wa_locale` 持久化；首屏从本地读，无则默认 `zh-Hans`，并 `uni.setLocale`。

### 4. 文案抽取（三处示范）
- `src/pages/login/index.vue`：登录页全部固定文案改 `$t('login.*')`
- `src/pages/order/list/index.vue`：标题/筛选 tab/搜索/占位/状态改 `$t('order.list.*')`
- `src/App.vue`：菜单等固定文案改 `$t('app.*')`

### 5. 手册（修改）
- `src/static/manual/index.html`：op-1 附注或新增「后台多语言」说明（在哪切语言、如何生效）。

## 错误处理 / 兜底

- **键缺失回退**：`zh-Hans.json` 为主包确保完整，英文包缺键时落到中文，杜绝空白 UI。
- **异常 locale**：`uni.setLocale` 收到非法值时报错捕获，回退 `zh-Hans`。
- **本地持久化读取**：`localStorage` 无 `wa_locale` 或值非法 → `zh-Hans`。

## 验证

- H5 本地构建跑通，无编译 error。
- 手机视口 390×844 截图：登录页 **zh-Hans** 与 **en** 两版对照，切换后即时生效。
- 手册新增「后台多语言」小节并附中日对照（本轮中文+英文）截图。

## 不在范围内（后续批次）

- 全量 54 页面文案抽取（批次 B）
- 后端 `LocalizedText` 字段接入
- 多城市/语言联动深打磨