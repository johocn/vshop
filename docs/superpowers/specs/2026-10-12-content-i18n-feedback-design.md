# 内容多语言与反馈闭环设计（agreement 可编辑 + FAQ 多语言 + 反馈回复）

日期：2026-10-12 ｜ 状态：待用户审阅

## 1. 目标与范围

三块功能，一次交付：

1. **协议长文后台可编辑**：用户协议/隐私政策五语言文案存 `shopGlobalConfig.defaults.agreement`，web-admin 编辑，C 端按语言读取。
2. **FAQ 多语言**：`FaqEntry` 加 `titleI18n`/`contentI18n` JSON 字段（LocalizedText），shop 接口按语言合并返回，web-admin 编辑卡五语言签。
3. **反馈回复闭环**：管理员回复反馈（reply/repliedAt/repliedBy），C 端「我的反馈」展示回复，个人中心入口未读角标（readAt 已读标记）。

**不做**（YAGNI）：富文本（纯文本+换行分段）、推送通知、FAQ 翻译表、公告机制改造、租户级协议覆盖（协议存全局 globalConfig，全租户统一；后续如需租户独立协议走渠道覆盖机制）。

**五语言首版内容**：agreement（service/privacy）×5 + FAQ 存量条目×5，机翻+术语审校基线，交付时以 seed 脚本经 admin API 写入（不内置机翻代码），脚本用完删除。

## 2. 数据模型

```ts
// shopGlobalConfig.defaults（JSON，现有字段，新增键）
defaults.agreement = {
  service: { 'zh-CN': '…', 'zh-TW': '…', en: '…', ja: '…', ko: '…' },
  privacy: { 'zh-CN': '…', … },
  updatedAt: '2026-10-12T10:00:00+08:00',   // 后台保存时自动写入
}

// FaqEntry（feedback-plugin）新增列
titleI18n?: Record<string, string> | null   // 含全部语言；zh-CN 与 title 同值
contentI18n?: Record<string, string> | null
// 读取语义：value = xxxI18n?.[lang] ?? xxx（title/content 基线兜底，向后兼容）

// Feedback（feedback-plugin）新增列
reply?: string | null
repliedAt?: Date | null
repliedBy?: string | null      // admin 用户 identifier
readAt?: Date | null           // 用户已读标记
```

迁移：生产 `getDbConfig()` postgres 分支 `synchronize:true` 已验证自动加列，无 migration 文件。多渠道：FaqEntry 已有 channels 机制不变；agreement 全局单条（`findGlobalConfig` 现状）。

## 3. 后端接口

### feedback-plugin

| 接口 | 变更 |
|---|---|
| shop `faqs(lang)` | 新增可选参数 `lang: String`（前端直接传自身 locale：`'zh-CN'|'zh-TW'|'en'|'ja'|'ko'`，**避开 Vendure LanguageCode 映射坑**）；service 合并 `titleI18n[lang] ?? title`；不传 = 原行为（向后兼容） |
| admin `saveFaq` | input 增加 `titleI18n: JSON`、`contentI18n: JSON`（可空）；新建时若提供则与 title/content 同存 |
| admin `replyFeedback(id, reply, resolve)` | 新 mutation：写 reply/repliedAt/repliedBy(=ctx 用户 identifier)；`resolve=true` 时 status→resolved + handledAt；`resolve=false` 且当前 pending 时 status→processing；仅 pending/processing 可回复，否则 UserInputError |
| shop `myFeedbacks` | 透出 `reply/repliedAt/repliedBy/readAt` |
| shop `markFeedbacksRead` | 新 mutation：当前用户全部 `readAt IS NULL AND status != 'pending'` 写入 readAt，幂等；返回最新 unreadCount |
| shop `unreadFeedbackCount` | 新 query：count(userId, readAt null, status != pending)，需认证 |

### shop-template-plugin

**零改动**——`upsertGlobalConfig` 已接受任意 JSON defaults，协议保存走现有 admin mutation（web-admin 读改写 `defaults.agreement` 键）。

## 4. C 端（vshop）

- **agreement.vue 重写数据源**：onMounted 从 tenant store（已有 shopGlobalConfig 缓存）读 `defaults.agreement`；`localizeText` 回退链：当前 locale → `'zh-CN'` → 首个非空 → 内建占位（**现有硬编码文案抽为常量兜底，未配置时页面永不空白**）；页脚显示 `agreement.updatedAt`；标题/`isPrivacy` 逻辑保留。
- **faq.vue**：`getFaqs` 增加 `lang: locale.value` 参数。
- **feedback.vue**：提交侧不变。
- **my-feedbacks.vue（新建页，pkg-user 路由 + pages.json 注册；后端 `myFeedbacks` resolver 已存在但 C 端从未消费）**：卡片加状态 chip / 回复面板（品牌色，回复人+时间）/ 时间行；onShow 拉 `myFeedbacks` + `unreadFeedbackCount`，随后调 `markFeedbacksRead` 清角标；空态/加载态走 i18n。
- **profile/index.vue**：「意见反馈」入口加未读角标（unreadFeedbackCount，登录态 onShow 拉取）。
- **api/queries/feedback.ts**：`getFaqs` +lang；`myFeedbacks` 字段扩展；新增 `markFeedbacksRead`、`unreadFeedbackCount`。
- **i18n**：my-feedbacks 新词条 + 角标无障碍文案，五语言同步。

## 5. web-admin

- **新组件 `LocaleTabs.vue`**（五语言签编辑器，顶部签 A 版式）：props = `{ locales, modelValue(Record<locale,string>), fallbackLocale:'zh-CN' }`；缺省语言虚线签 + 回退提示；32KB/语言校验。FAQ 卡、协议卡两处复用。
- **feedback/faq/index.vue**：编辑卡改造为 LocaleTabs（title/content 双字段 per 语言）；保存时组装 `titleI18n`（全量）+ `title`/`content`（=zh-CN 值，保持基线同步）；列表/筛选/启用开关不变。
- **feedback/list/index.vue**：pending/processing 行加「回复」操作——弹卡 textarea + 「同时标记已解决」勾选 + `replyFeedback`；已回复行展示回复摘要（只读）。
- **platform/global-config/index.vue**：新增「协议文案」编辑卡（LocaleTabs 双字段 service/privacy），保存时读改写 `defaults.agreement` 走现有 upsert mutation。
- **双语包**：中英词条同步（103 命名空间基线上追加）。

## 6. 测试与交付

**e2e（vitest + SqljsInitializer）**：
- faqs lang 合并：zh 命中 / en 命中 / ko 未配置回退 zh-CN / 不传参数原行为
- saveFaq 带 i18n 字段存取；replyFeedback 状态流转（pending→processing、resolve→resolved、illegal 状态拒绝）
- markFeedbacksRead 幂等；unreadFeedbackCount 边界（pending 不计、已读清零、只统计本人）

**截图（硬性）**：手机 390×844 dpr=2——agreement en 态（含更新日期）、my-feedbacks 回复态+角标、profile 角标；web-admin 1440×900——FAQ 编辑卡、回复弹卡、协议卡。

**部署**：vendure git pull + pm2 restart → vshop build:h5 + scp → web-admin deploy.mjs；线上冒烟（faqs?lang=en、协议页、回复闭环）。

**手册**：usemall-parity-points-mall/index.md 变更记录 + 截图清单；操作说明（协议卡/FAQ 多语言编辑/回复操作）。
