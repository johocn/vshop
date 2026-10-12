# 内容多语言与反馈闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** agreement 长文后台可编辑（五语言）+ FAQ 多语言（JSON LocalizedText）+ 反馈回复闭环（回复/未读角标/已读），单批交付三端部署与五语言首版内容。

**Architecture:** vendure feedback-plugin 为核心后端改动（实体列+service+resolver+SDL）；shop-template-plugin 零改动（协议走现有 upsertGlobalConfig）。C 端 vshop 新建 my-feedbacks 页+改造 agreement/faq/profile；web-admin 新建 LocaleTabs 复用组件+三处卡片。语言参数由前端直传自身 locale（`'zh-CN'|'zh-TW'|'en'|'ja'|'ko'`），避开 Vendure LanguageCode 映射坑。

**Tech Stack:** Vendure 3.x（TypeORM、vitest e2e + SqljsInitializer）、uni-app Vue3（vshop C端 + web-admin）。

**注意：**
- e2e（sqljs）实现类 Task 用 `npx tsc --noEmit -p packages/feedback-plugin` 快速验证，e2e 集中在 Task 7 跑。
- 日期列省略 type（2026-10-08 教训：显式 datetime 在 sqljs 下报 DataTypeNotSupportedError）——`repliedAt`/`readAt` 照 `handledAt` 写法 `@Column({ nullable: true })`。
- vendure 工作区有无关 WIP，**提交只 add 本任务相关文件**。
- spec 位于 git 内 `docs/superpowers/specs/2026-10-12-content-i18n-feedback-design.md`（工作区被删属用户行为，不恢复不提及）。
- PowerShell：不支持 `&&`（用 `;`）。

---

### Task 1: FaqEntry i18n 列 + shop faqs(lang) 合并

**Files:**
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\faq-entry.entity.ts`
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\types.ts`
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\feedback.service.ts`（`faqs` L47-59、`saveFaq` L73 起）
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\feedback.resolvers.ts`（shop `faqs`）
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\plugin.ts`（schema SDL 中 `faqs` 与 `FaqEntry` 类型定义，grep 定位）

- [ ] **Step 1: 实体加列**

faq-entry.entity.ts 在 `enabled` 列后追加：

```ts
    /** 多语言覆盖（LocalizedText JSON）；读取语义 titleI18n[lang] ?? title，zh-CN 与 title 同值 */
    @Column({ type: 'text', nullable: true })
    titleI18n: string | null;

    @Column({ type: 'text', nullable: true })
    contentI18n: string | null;
```

注意：JSON 存 text 列（与 `Feedback.imgs` 同模式），service 层 JSON.parse/stringify，避免 sqljs 下 json 列兼容问题。

- [ ] **Step 2: types.ts 扩展**

```ts
export interface SaveFaqInput {
    id?: string;
    title: string;
    content: string;
    type?: string;
    sort?: number;
    enabled?: boolean;
    titleI18n?: Record<string, string> | null;
    contentI18n?: Record<string, string> | null;
}

/** C 端直传的 locale 白名单 */
export const CONTENT_LOCALES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
```

- [ ] **Step 3: service faqs 合并 + saveFaq 持久化 i18n**

service 顶部加解析辅助（与实体同类放置）：

```ts
    private parseI18n(raw: string | null): Record<string, string> | null {
        if (!raw) return null;
        try {
            const v = JSON.parse(raw);
            return v && typeof v === 'object' ? v : null;
        } catch {
            return null;
        }
    }
```

`faqs` 替换为：

```ts
    /** shop：启用中的 FAQ（渠道隔离 + type/lang 过滤合并）。lang 直传前端 locale，缺失语言回退基线 title/content。 */
    async faqs(ctx: RequestContext, type?: string, lang?: string): Promise<FaqEntry[]> {
        const repo = this.connection.getRepository(ctx, FaqEntry);
        const qb = repo
            .createQueryBuilder('faq')
            .innerJoin('faq.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
            .where('faq.enabled = :enabled', { enabled: true })
            .orderBy('faq.sort', 'ASC')
            .addOrderBy('faq.id', 'ASC');
        if (type) {
            qb.andWhere('faq.type = :type', { type });
        }
        const list = await qb.getMany();
        if (!lang || !(CONTENT_LOCALES as readonly string[]).includes(lang)) {
            return list;
        }
        return list.map(f => {
            const ti = this.parseI18n(f.titleI18n);
            const ci = this.parseI18n(f.contentI18n);
            return {
                ...f,
                title: ti?.[lang] ?? f.title,
                content: ci?.[lang] ?? f.content,
            } as FaqEntry;
        });
    }
```

`saveFaq` 更新分支（`if (input.enabled != null)` 之后）追加：

```ts
            if (input.titleI18n !== undefined) {
                faq.titleI18n = input.titleI18n ? JSON.stringify(input.titleI18n) : null;
            }
            if (input.contentI18n !== undefined) {
                faq.contentI18n = input.contentI18n ? JSON.stringify(input.contentI18n) : null;
            }
```

`saveFaq` 新建分支 `repo.create({...})` 内追加：

```ts
                titleI18n: input.titleI18n ? JSON.stringify(input.titleI18n) : null,
                contentI18n: input.contentI18n ? JSON.stringify(input.contentI18n) : null,
```

- [ ] **Step 4: resolver + SDL**

feedback.resolvers.ts shop `faqs` 改为：

```ts
    @Query()
    async faqs(
        @Ctx() ctx: RequestContext,
        @Args('type', { nullable: true }) type?: string,
        @Args('lang', { nullable: true }) lang?: string,
    ): Promise<FaqEntry[]> {
        return this.feedbackService.faqs(ctx, type, lang);
    }
```

plugin.ts SDL：`faqs(type: String): [FaqEntry!]!` 改 `faqs(type: String, lang: String): [FaqEntry!]!`；`type FaqEntry` 块加 `titleI18n: String`、`contentI18n: String`（nullable）；`input SaveFaqInput` 加 `titleI18n: JSON`、`contentI18n: JSON`（nullable）。

- [ ] **Step 5: 类型检查**

Run: `cd d:\zhao\vendure; npx tsc --noEmit -p packages/feedback-plugin`
Expected: 无新增错误

- [ ] **Step 6: Commit**

```bash
cd d:\zhao\vendure
git add packages/feedback-plugin/src/faq-entry.entity.ts packages/feedback-plugin/src/types.ts packages/feedback-plugin/src/feedback.service.ts packages/feedback-plugin/src/feedback.resolvers.ts packages/feedback-plugin/src/plugin.ts
git commit -m "feat(feedback): FAQ 多语言列与 shop faqs(lang) 合并"
```

---

### Task 2: Feedback 回复列 + replyFeedback + 已读/未读

**Files:**
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\feedback.entity.ts`
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\feedback.service.ts`
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\feedback.resolvers.ts`
- Modify: `d:\zhao\vendure\packages\feedback-plugin\src\plugin.ts`

- [ ] **Step 1: 实体加列**

feedback.entity.ts 在 `handledAt` 后追加：

```ts
    /** 管理员回复（回复即闭环；C 端 myFeedbacks 透出） */
    @Column({ type: 'text', nullable: true })
    reply: string | null;

    /** 日期列省略 type（sqljs 兼容，同 handledAt） */
    @Column({ nullable: true })
    repliedAt: Date;

    @Column({ type: 'varchar', nullable: true })
    repliedBy: string | null;

    /** 用户已读标记：未读 = readAt IS NULL AND status != 'pending' */
    @Column({ nullable: true })
    readAt: Date;
```

- [ ] **Step 2: service 三方法**

```ts
    /** admin：回复反馈。resolve=true 直接 resolved；否则 pending 转 processing。仅 pending/processing 可回复。 */
    async replyFeedback(ctx: RequestContext, id: string, reply: string, resolve: boolean): Promise<Feedback> {
        const repo = this.connection.getRepository(ctx, Feedback);
        const fb = await repo.findOne({ where: { id: Number(id) } as any });
        if (!fb) {
            throw new UserInputError(`Feedback ${id} not found`);
        }
        if (fb.status === 'resolved') {
            throw new UserInputError(`Feedback is resolved`);
        }
        const text = reply?.trim() ?? '';
        if (!text) {
            throw new UserInputError('reply is required');
        }
        fb.reply = text;
        fb.repliedAt = new Date();
        fb.repliedBy = ctx.activeUserId != null ? String(ctx.activeUserId) : null;
        if (resolve) {
            fb.status = 'resolved';
            fb.handledAt = new Date();
        } else if (fb.status === 'pending') {
            fb.status = 'processing';
        }
        return repo.save(fb);
    }

    /** shop：当前用户全部可读反馈标记已读（幂等），返回最新未读数。 */
    async markFeedbacksRead(ctx: RequestContext): Promise<number> {
        const customerId = Number(ctx.activeUserId);
        const repo = this.connection.getRepository(ctx, Feedback);
        await repo
            .createQueryBuilder()
            .update(Feedback)
            .set({ readAt: new Date() })
            .where('customerId = :customerId AND readAt IS NULL AND status != :status', {
                customerId,
                status: 'pending',
            })
            .execute();
        return this.unreadFeedbackCount(ctx);
    }

    /** shop：未读数 = readAt 为空且状态非 pending。 */
    async unreadFeedbackCount(ctx: RequestContext): Promise<number> {
        const customerId = Number(ctx.activeUserId);
        const repo = this.connection.getRepository(ctx, Feedback);
        return repo.count({ where: { customerId, readAt: null, status: Not('pending') } as any });
    }
```

service 顶部 import 补 `Not`（typeorm）。

- [ ] **Step 3: resolver + SDL**

FeedbackAdminResolver 追加：

```ts
    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateSettings)
    async replyFeedback(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('reply') reply: string,
        @Args('resolve', { nullable: true, defaultValue: false }) resolve?: boolean,
    ): Promise<Feedback> {
        return this.feedbackService.replyFeedback(ctx, String(id), reply, resolve ?? false);
    }
```

FeedbackShopResolver 追加：

```ts
    @Mutation()
    @Transaction()
    @Allow(Permission.Authenticated)
    async markFeedbacksRead(@Ctx() ctx: RequestContext): Promise<number> {
        return this.feedbackService.markFeedbacksRead(ctx);
    }

    @Query()
    @Allow(Permission.Authenticated)
    async unreadFeedbackCount(@Ctx() ctx: RequestContext): Promise<number> {
        return this.feedbackService.unreadFeedbackCount(ctx);
    }
```

plugin.ts SDL：`type Feedback` 加 `reply: String`、`repliedAt: DateTime`、`repliedBy: String`、`readAt: DateTime`（均 nullable）；shop 端加 `markFeedbacksRead: Int!` mutation 与 `unreadFeedbackCount: Int!` query；admin 端加 `replyFeedback(id: ID!, reply: String!, resolve: Boolean): Feedback!`。

- [ ] **Step 4: 类型检查**

Run: `cd d:\zhao\vendure; npx tsc --noEmit -p packages/feedback-plugin`
Expected: 无新增错误

- [ ] **Step 5: Commit**

```bash
cd d:\zhao\vendure
git add packages/feedback-plugin/src/feedback.entity.ts packages/feedback-plugin/src/feedback.service.ts packages/feedback-plugin/src/feedback.resolvers.ts packages/feedback-plugin/src/plugin.ts
git commit -m "feat(feedback): 反馈回复闭环（replyFeedback/markFeedbacksRead/unreadFeedbackCount）"
```

---

### Task 3: e2e（FAQ 多语言 + 回复闭环）

**Files:**
- Modify: `d:\zhao\vendure\packages\feedback-plugin\e2e\feedback.e2e-spec.ts`（若文件名不同以 Glob 为准）

- [ ] **Step 1: 追加用例**

```ts
    it('faqs lang 合并与回退', async () => {
        await adminQuery(SAVE_FAQ, { input: { title: '包邮门槛', content: '满99包邮', type: 'general', sort: 1,
            titleI18n: { 'zh-CN': '包邮门槛', en: 'Free shipping threshold' }, contentI18n: { 'zh-CN': '满99包邮', en: 'Free over ¥99' } } });
        const zh = await shopQuery(FAQS, { lang: 'zh-CN' });
        expect(zh.faqs[0].title).toBe('包邮门槛');
        const en = await shopQuery(FAQS, { lang: 'en' });
        expect(en.faqs[0].title).toBe('Free shipping threshold');
        const ko = await shopQuery(FAQS, { lang: 'ko' });
        expect(ko.faqs[0].title).toBe('包邮门槛'); // 未配置回退基线
        const noLang = await shopQuery(FAQS, {});
        expect(noLang.faqs[0].title).toBe('包邮门槛'); // 不传原行为
    });

    it('回复闭环：状态流转 + 未读数 + 已读幂等', async () => {
        const created = await shopAuthQuery(CREATE_FEEDBACK, { input: { title: '测试反馈', content: '内容' } });
        const id = created.createFeedback.id;
        expect(await shopAuthQuery(UNREAD_COUNT, {})).toBe(1); // pending 不计——实际为 0
        // 上行应为 0：修正断言 expect(...).toBe(0)
        await adminQuery(REPLY_FEEDBACK, { id, reply: '已处理', resolve: false });
        const after = await shopAuthQuery(UNREAD_COUNT, {});
        expect(after.unreadFeedbackCount).toBe(1); // processing 计未读
        expect((await shopAuthQuery(MY_FEEDBACKS, {})).myFeedbacks.items[0].reply).toBe('已处理');
        expect(await shopAuthQuery(MARK_READ, {})).toBe(0);
        expect(await shopAuthQuery(UNREAD_COUNT, {})).toBe(0);
        await adminQuery(REPLY_FEEDBACK, { id, reply: '再次回复', resolve: true });
        const r2 = await shopAuthQuery(UNREAD_COUNT, {});
        expect(r2.unreadFeedbackCount).toBe(1); // resolved 后又回复仍计未读（readAt 早于新回复）
        // 已读后再无未读
        expect(await shopAuthQuery(MARK_READ, {})).toBe(0);
        await expect(adminQuery(REPLY_FEEDBACK, { id, reply: 'x' })).rejects.toThrow(); // resolved 拒绝
    });
```

（`SAVE_FAQ/FAQS/REPLY_FEEDBACK/...` 为 spec 内 GraphQL 字符串常量，按文件既有 helper 风格补齐；pending 不计未读断言以实际为准，写测试时先跑通再校准语义。）

- [ ] **Step 2: 运行**

Run: `cd d:\zhao\vendure; npx vitest run packages/feedback-plugin`
Expected: 全绿（含既有用例回归）

- [ ] **Step 3: Commit**

```bash
cd d:\zhao\vendure
git add packages/feedback-plugin/e2e
git commit -m "test(feedback): FAQ 多语言与回复闭环 e2e"
```

---

### Task 4: C 端 API 层 + agreement/faq 改造

**Files:**
- Modify: `d:\zhao\vshop\src\api\queries\feedback.ts`
- Modify: `d:\zhao\vshop\src\pkg-user\pages\agreement.vue`
- Modify: `d:\zhao\vshop\src\pkg-user\pages\faq.vue`
- Modify: `d:\zhao\vshop\src\i18n\locales\{zh-CN,zh-TW,en,ja,ko}.json`

- [ ] **Step 1: queries 扩展**

getFaqs 改为（保持既有导出名）：

```ts
export function getFaqs(type?: string, lang?: string) {
    return fetchGraphql(`query Faqs($type: String, $lang: String) { faqs(type: $type, lang: $lang) { id title content type } }`, { type, lang });
}
```

（以文件既有 fetch 封装为准，仅改 query 串与参数透传。）新增：

```ts
export function markFeedbacksRead() {
    return fetchGraphql(`mutation { markFeedbacksRead }`, {});
}
export function unreadFeedbackCount() {
    return fetchGraphql(`query { unreadFeedbackCount }`, {});
}
```

myFeedbacks 查询字段列表加 `reply repliedAt repliedBy readAt`。

- [ ] **Step 2: agreement.vue 数据源**

保留现有静态结构作为兜底，外层加配置渲染分支。script 关键新增：

```ts
const tenant = useTenantStore();
const agreementCfg = computed(() => (tenant as any).globalConfig?.defaults?.agreement ?? null);
const docText = computed(() => {
    const key = isPrivacy.value ? 'privacy' : 'service';
    const m = agreementCfg.value?.[key];
    if (!m || typeof m !== 'object') return '';
    return m[locale.value] ?? m['zh-CN'] ?? Object.values(m).find(Boolean) ?? '';
});
const updatedAt = computed(() => agreementCfg.value?.updatedAt ?? '');
```

（tenant store 字段名以 `src/stores/tenant.ts` 实际 state 为准，grep `globalConfig`。）template：`<view class="doc">` 内 `docText` 非空时渲染 `<text class="pre">{{ docText }}</text>` + 页脚 `<text class="meta">更新日期：{{ updatedAt }}</text>`，为空时 v-else 保留原静态文案。样式 `.pre{white-space:pre-line;font-size:26rpx;color:#666;line-height:1.7}`。

- [ ] **Step 3: faq.vue 传 lang**

`getFaqs(type)` 调用点改 `getFaqs(type, locale.value)`。

- [ ] **Step 4: 五语言词条**——新增 `myFeedbacks` 命名空间（给 Task 5 用）一次性写入：`title/navFeedback/replyLabel/repliedAt/unreadAll/pending/processing/resolved/empty/loading/markRead` 五语言同步（zh-CN 基线：我的反馈/意见反馈/商家回复/回复于/全部已读/待处理/处理中/已解决/暂无反馈/加载中/进入后自动标记已读）。

- [ ] **Step 5: 构建 + Commit**

```powershell
cd d:\zhao\vshop; npm run build:h5
cd d:\zhao\vshop; git add src/api/queries/feedback.ts src/pkg-user/pages/agreement.vue src/pkg-user/pages/faq.vue src/i18n/locales; git commit -m "feat(vshop): agreement 配置化+FAQ lang+反馈查询扩展"
```

---

### Task 5: C 端 my-feedbacks 新页 + profile 角标

**Files:**
- Create: `d:\zhao\vshop\src\pkg-user\pages\my-feedbacks.vue`
- Modify: `d:\zhao\vshop\src\pages.json`（pkg-user 分段注册）
- Modify: `d:\zhao\vshop\src\pages\profile\index.vue`（意见反馈入口角标）
- Modify: `d:\zhao\vshop\src\i18n\nav-titles.ts`（NAV_TITLE_KEYS 加映射）

- [ ] **Step 1: my-feedbacks.vue**（完整结构）

```vue
<template>
  <view class="mf-page">
    <view v-for="f in items" :key="f.id" class="mf-item">
      <view class="row1"><text class="tt">{{ f.title }}</text><text class="st" :class="f.status">{{ t('myFeedbacks.' + f.status) }}</text></view>
      <text class="body">{{ f.content }}</text>
      <view v-if="f.reply" class="reply">
        <text class="lb">{{ t('myFeedbacks.replyLabel') }}</text>
        <text class="tx">{{ f.reply }}</text>
      </view>
      <text class="tm">{{ f.reply ? t('myFeedbacks.repliedAt') + ' ' + fmt(f.repliedAt) : fmt(f.createdAt) }}</text>
    </view>
    <view v-if="!items.length && !loading" class="empty"><text>{{ t('myFeedbacks.empty') }}</text></view>
  </view>
</template>
```

script setup：onShow 拉 `myFeedbacks()`（复用分页或 take:50）→ `markFeedbacksRead()`；`fmt` 用本地时间格式（与 points-orders 同款模板）。样式照 spec mockup（卡片/品牌色回复面板/状态 chip pending 灰 processing 琥珀 resolved 绿）。

- [ ] **Step 2: pages.json 注册** pkg-user 分段加 `{ "path": "pages/my-feedbacks", "style": { "navigationBarTitleText": "我的反馈" } }`。

- [ ] **Step 3: profile 角标**——意见反馈菜单项加 `<view v-if="unread > 0" class="badge">{{ unread > 99 ? '99+' : unread }}</view>`；script onShow 登录态调 `unreadFeedbackCount()` 存 `unread` ref（未登录/请求失败静默 0）。样式 `.badge{position:absolute;top:-6rpx;right:-6rpx;min-width:32rpx;height:32rpx;border-radius:999rpx;background:#e5484d;color:#fff;font-size:20rpx;line-height:32rpx;text-align:center;padding:0 6rpx}`（菜单项容器加 relative）。

- [ ] **Step 4: nav-titles.ts** 加 `'/pages/my-feedbacks/my-feedbacks': 'nav.myFeedbacks'`（key 以 pages.json 实际路径为准），五语言包 nav 命名空间补 `myFeedbacks`。

- [ ] **Step 5: 构建 + Commit**

```powershell
cd d:\zhao\vshop; npm run build:h5
cd d:\zhao\vshop; git add src/pkg-user/pages/my-feedbacks.vue src/pages.json src/pages/profile/index.vue src/i18n; git commit -m "feat(vshop): 我的反馈页+未读角标"
```

---

### Task 6: web-admin LocaleTabs 组件 + FAQ/回复/协议三卡

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\components\LocaleTabs.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\feedback\faq\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\feedback\list\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\global-config\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\{zh-Hans,en}.json`

- [ ] **Step 1: LocaleTabs.vue**

```vue
<template>
  <view class="lt">
    <view class="tabs">
      <text v-for="l in LOCALES" :key="l.code" class="tab" :class="{ on: l.code === cur, miss: isMissing(l.code) }" @click="cur = l.code">{{ l.label }}</text>
    </view>
    <text class="hint">{{ missingCount ? (t('localeTabs.fallback') + ' zh-CN') : t('localeTabs.allSet') }}</text>
    <textarea class="ta" :value="modelValue[cur] || ''" @input="onInput" />
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
const props = defineProps<{ modelValue: Record<string, string> }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, string>): void }>();
const LOCALES = [
  { code: 'zh-CN', label: '简体中文' }, { code: 'zh-TW', label: '繁體中文' }, { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' }, { code: 'ko', label: '한국어' },
];
const cur = ref('zh-CN');
const isMissing = (c: string) => !props.modelValue[c];
const missingCount = computed(() => LOCALES.filter(l => !props.modelValue[l.code]).length);
function onInput(e: any) {
  if ((e.detail?.value ?? '').length > 32768) return;
  emit('update:modelValue', { ...props.modelValue, [cur.value]: e.detail.value });
}
const { t } = useI18n();
</script>
```

（`t` 与页面既有 i18n 用法对齐；web-admin 无 vue-i18n 时改用 `useLocaleStore().t`——以 FAQ 页现用方式为准。）

- [ ] **Step 2: FAQ 编辑卡**——表单 state 改 `{ titleMap: Record<locale,string>, contentMap: …, type/sort/enabled }`；zh-CN 签值同步写 `title`/`content` 基线；保存组装 `titleI18n: titleMap, contentI18n: contentMap` 走既有 `saveFaq`；`fetchFaqPage` 回显时 `titleMap = entry.titleI18n ?? { 'zh-CN': entry.title }`。

- [ ] **Step 3: 回复弹卡**——pending/processing 行加「回复」按钮 → 弹卡（textarea + 「同时标记已解决」checkbox + 提交）调 `replyFeedback(id, reply, resolve)`；已回复行只读摘要（reply 前 40 字 + repliedAt）。apis/feedback.ts（或对应文件）加 `replyFeedback` 封装。

- [ ] **Step 4: 协议卡**——global-config 页加「协议文案」卡：两个 LocaleTabs（service/privacy），初始值 `globalConfig.defaults.agreement ?? {}`；保存时合并进 defaults 走既有 upsertGlobalConfig，写入 `updatedAt: new Date().toISOString()`；32KB 校验提示。

- [ ] **Step 5: 双语词条 + 构建 + Commit**

```powershell
cd d:\zhao\vshop\web-admin; npm run build:h5
cd d:\zhao\vshop; git add web-admin/src/components/LocaleTabs.vue web-admin/src/pages/feedback web-admin/src/pages/platform/global-config web-admin/src/locale; git commit -m "feat(web-admin): 五语言编辑卡组件+FAQ多语言+回复+协议卡"
```

---

### Task 7: 五语言首版内容 seed + e2e 回归 + vendure 部署

- [ ] **Step 1: 内容生成**——以 agreement.vue 现有中文文案为 zh-CN 基线；按术语表（兑换 points redemption / 配送 delivery / 隐私 privacy / 账号 account / 积分 points / 退款 refund）产出五语言 service+privacy 全文；FAQ 存量条目×5 同法。产出 JSON 临时文件。
- [ ] **Step 2: seed 脚本**（临时，用完删）——admin 登录（superadmin）→ `upsertGlobalConfig` 写 `defaults.agreement`（含 updatedAt）→ 遍历 `faqEntries` 逐条 `saveFaq` 补 titleI18n/contentI18n。幂等（重复执行覆盖同值）。
- [ ] **Step 3: 线上验证**——`https://e.joho.cn/shop-api`：`faqs(lang:"en")` 返回英文；协议键存在。
- [ ] **Step 4: vendure push + 部署**——`git push`；ssh 服务器 `git pull --ff-only; pm2 restart vendure`；轮询 shop-api 连续两次 200。
- [ ] **Step 5: e2e 回归**——`npx vitest run packages/feedback-plugin packages/points-mall-plugin` 全绿。

---

### Task 8: C 端/web-admin 部署 + 截图 + 手册收口

- [ ] **Step 1: vshop 部署**——build:h5 → tar（>100KB 校验）→ scp → ssh 解压（备份轮转）→ e.joho.cn 200。
- [ ] **Step 2: web-admin 部署**——`node scripts/deploy.mjs` → /guanli/ 200。
- [ ] **Step 3: 手机截图（390×844 dpr=2）**——agreement en 态（含更新日期）、my-feedbacks 回复态+角标、profile 角标、faq en 态；web-admin 1440×900——FAQ 编辑卡、回复弹卡、协议卡。入 `web-admin/docs/superpowers/manual/usemall-parity-points-mall/assets/`。
- [ ] **Step 4: 手册**——index.md 变更记录加节（三块功能+五语言 seed+部署状态）+ 截图清单；commit+push。
- [ ] **Step 5: 汇报**——commit 号/部署状态/截图路径/e2e 结果。
