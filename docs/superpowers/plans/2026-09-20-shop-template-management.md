# 店铺覆盖风格模板库 · 管理增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 shop-template-plugin 补齐版本历史（快照/回滚）、模板引用可见性（被哪些店铺引用）、合并预览（模板+全局配置+店铺覆盖深合并可视化），增强 web-admin 模板库管理体验。

**Architecture:** 后端新增 `ShopTemplateVersion` 实体（幂等建表）与 resolver（templateVersions/restoreTemplateVersion/templateReferences/templateMergedPreview）；update/copy 时写旧值快照。合并预览复用前端 `merge-config.ts` 深合并纯函数语义，后端以 JSON 返回最终合并结果 + 键来源标注。web-admin 模板列表行显示引用徽标，编辑弹层加「历史版本」与「合并预览」区。

**Tech Stack:** Vendure@3.6.4 / NestJS / TypeGraphQL / uni-app (web-admin H5)

**Spec:** `vshop/docs/superpowers/specs/2026-09-20-shop-template-management-design.md`

---

### Task 1: 后端实体 + 幂等建表迁移

**Files:**
- Create: `d:\zhao\vendure\packages\shop-template-plugin\src\shop-template-version.entity.ts`
- Create: `d:\zhao\vendure\packages\shop-template-plugin\src\migrate.ts`
- Modify: `d:\zhao\vendure\packages\shop-template-plugin\src\plugin.ts`

- [ ] **Step 1: 新增版本快照实体**

创建 `src/shop-template-version.entity.ts`：

```ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { VendureEntity } from '@vendure/core';

@Entity('shop_template_version')
export class ShopTemplateVersion extends VendureEntity {
    constructor(input?: Partial<ShopTemplateVersion>) {
        super(input);
    }

    @Index()
    @Column()
    templateId!: number;

    @Column()
    version!: number;

    @Column({ type: 'varchar', nullable: true })
    name?: string | null;

    @Column({ type: 'simple-json', nullable: true })
    theme?: any;

    @Column({ type: 'simple-json', nullable: true })
    pages?: any;

    @Column({ default: true })
    enabled!: boolean;

    @Column({ type: 'varchar', nullable: true })
    note?: string | null;
}
```

> VendureEntity 提供 `id`（`@PrimaryGeneratedColumn()`）、`createdAt`、`updatedAt`。

- [ ] **Step 2: 幂等建表迁移**

创建 `src/migrate.ts`（沿用 cjk-plugin 幂等模式：driver 分支 + CREATE TABLE IF NOT EXISTS）：

```ts
import { DataSource } from 'typeorm';
import { Logger } from '@vendure/core';

const loggerCtx = 'ShopTemplatePlugin';

/** 幂等建表：生产关闭 synchronize 时显式创建 shop_template_version */
export async function ensureVersionTable(ds: DataSource): Promise<void> {
    const driver = ds.options.type;
    try {
        const qb = (sql: string) => ds.query(sql);
        if (driver === 'postgres') {
            await qb(`CREATE TABLE IF NOT EXISTS "shop_template_version" (
                "id" SERIAL PRIMARY KEY,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "templateId" integer NOT NULL,
                "version" integer NOT NULL,
                "name" character varying,
                "theme" text,
                "pages" text,
                "enabled" boolean NOT NULL DEFAULT true,
                "note" character varying
            )`);
            await qb(`CREATE INDEX IF NOT EXISTS "idx_shop_template_version_templateId" ON "shop_template_version" ("templateId")`);
        } else {
            await qb(`CREATE TABLE IF NOT EXISTS "shop_template_version" (
                "id" integer PRIMARY KEY AUTOINCREMENT,
                "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
                "templateId" integer NOT NULL,
                "version" integer NOT NULL,
                "name" varchar,
                "theme" text,
                "pages" text,
                "enabled" boolean NOT NULL DEFAULT 1,
                "note" varchar
            )`);
            await qb(`CREATE INDEX IF NOT EXISTS "idx_shop_template_version_templateId" ON "shop_template_version" ("templateId")`);
        }
        Logger.info('shop_template_version 表就绪', loggerCtx);
    } catch (e: any) {
        Logger.warn(`shop_template_version 建表失败(忽略): ${e.message}`, loggerCtx);
    }
}
```

- [ ] **Step 3: 注册实体 + OnApplicationBootstrap 迁移**

在 `plugin.ts`：
- `entities: [ShopTemplate, ShopGlobalConfig, ShopTemplateVersion]`。
- 类内已有 `OnApplicationBootstrap`，在其中调用 `await ensureVersionTable(this.connection.rawConnection)`（用现有 `onApplicationBootstrap` 内已有 connection 初始化后追加）。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\vendure
git add packages/shop-template-plugin/src/shop-template-version.entity.ts packages/shop-template-plugin/src/migrate.ts packages/shop-template-plugin/src/plugin.ts
git commit -m "feat(shop-template): ShopTemplateVersion 实体 + 幂等建表"
```

---

### Task 2: 后端服务层 —— 快照/回滚/引用/合并预览

**Files:**
- Modify: `d:\zhao\vendure\packages\shop-template-plugin\src\shop-template.service.ts`
- Create: `d:\zhao\vendure\packages\shop-template-plugin\src\merge-config.ts`（纯函数深合并）

- [ ] **Step 1: 深合并纯函数（合并预览/回退链核心）**

创建 `src/merge-config.ts`：

```ts
/**
 * 五级合并模型深合并（数组/标量直接覆盖、null 跳过、对象递归）。
 * 与前端 vshop/src/utils/merge-config.ts 语义一致，供合并预览复用。
 */
export function deepMerge(base: any, override: any): any {
    if (override === null || override === undefined) return base;
    if (base === null || base === undefined) return override;
    if (typeof base !== 'object' || typeof override !== 'object') return override;
    if (Array.isArray(base) || Array.isArray(override)) return override;
    const out: Record<string, any> = { ...base };
    for (const k of Object.keys(override)) {
        out[k] = deepMerge(base[k], override[k]);
    }
    return out;
}

/** 合并预览：L1 全局配置 → L2 模板 → L3 店铺覆盖，返回 { merged, sourceByKey } */
export function mergePreview(
    globalConfig: any,   // L1 themeTokens/defaults
    template: any,       // L2 theme/pages
    overrides: any,      // L3 店铺覆盖
): { merged: any; sourceByKey: Record<string, string> } {
    const merged = deepMerge(deepMerge(globalConfig ?? {}, template ?? {}), overrides ?? {});
    const sourceByKey: Record<string, string> = {};
    const walk = (obj: any, path: string, src: string) => {
        if (!obj || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) {
            const p = path ? `${path}.${k}` : k;
            sourceByKey[p] = src;
            if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
                walk(obj[k], p, src);
            }
        }
    };
    walk(overrides ?? {}, '', 'L3');
    walk(template ?? {}, '', 'L2');
    walk(globalConfig ?? {}, '', 'L1');
    return { merged, sourceByKey };
}
```

- [ ] **Step 2: 服务层扩展**

在 `shop-template.service.ts` 追加：

```ts
import { ShopTemplateVersion } from './shop-template-version.entity';
import { deepMerge, mergePreview } from './merge-config';

private versionRepo(ctx: RequestContext) {
    return this.connection.getRepository(ctx, ShopTemplateVersion);
}

/** 写快照（保存前调用：把旧值入版本表） */
async snapshot(ctx: RequestContext, tpl: ShopTemplate, note?: string): Promise<void> {
    const v = new ShopTemplateVersion({
        templateId: Number(tpl.id),
        version: tpl.version ?? 1,
        name: tpl.name,
        theme: tpl.theme ?? {},
        pages: tpl.pages ?? {},
        enabled: tpl.enabled ?? true,
        note,
    });
    await this.versionRepo(ctx).save(v);
}

/** 版本历史 */
async versions(ctx: RequestContext, id: ID): Promise<ShopTemplateVersion[]> {
    return this.versionRepo(ctx).find({ where: { templateId: Number(id) as any }, order: { version: 'DESC' } });
}

/** 回滚：当前值入快照 → 目标版本写回 → version+1 */
async restore(ctx: RequestContext, id: ID, version: number): Promise<ShopTemplate> {
    const repo = this.connection.getRepository(ctx, ShopTemplate);
    const tpl = await repo.findOne({ where: { id: id as any } });
    if (!tpl) throw new UserInputError('模板不存在');
    const snap = await this.versionRepo(ctx).findOne({ where: { templateId: Number(id) as any, version } });
    if (!snap) throw new UserInputError(`版本 ${version} 不存在`);
    await this.snapshot(ctx, tpl, `回滚前备份 v${tpl.version}`);
    tpl.name = snap.name ?? tpl.name;
    tpl.theme = snap.theme ?? {};
    tpl.pages = snap.pages ?? {};
    tpl.enabled = snap.enabled ?? true;
    tpl.version = (tpl.version ?? 1) + 1;
    return repo.save(tpl);
}

/** 引用查询：哪些渠道引用了该模板（channel.customFields.templateId == id） */
async references(ctx: RequestContext, id: ID): Promise<Array<{ channelId: string; channelCode: string; channelName: string; app: string }>> {
    const channels = await this.connection.getRepository(ctx, Channel).find({ loadEagerRelations: false });
    const idStr = String(id);
    return channels
        .filter((c: any) => String((c as any).customFields?.templateId ?? '') === idStr)
        .map((c: any) => ({
            channelId: String(c.id),
            channelCode: c.code,
            channelName: (c as any).customFields?.name ?? c.code,
            app: (c as any).customFields?.app ?? '',
        }));
}

/** 合并预览：L1 → L2 → L3 深合并，返回 merged + sourceByKey */
async mergedPreview(
    ctx: RequestContext,
    app: TemplateApp,
    templateId?: ID,
    overrides?: any,
): Promise<{ merged: any; sourceByKey: Record<string, string> }> {
    const cfg = await this.findGlobalConfig(ctx, app);
    const tpl = templateId ? await this.findOne(ctx, templateId) : null;
    const l1 = { ...(cfg?.themeTokens ?? {}), ...(cfg?.defaults ?? {}) };
    const l2 = tpl ? { ...(tpl.theme ?? {}), ...(tpl.pages ?? {}) } : {};
    return mergePreview(l1, l2, overrides ?? {});
}
```

> `Channel` 需 import：`import { Channel } from '@vendure/core';`

- [ ] **Step 3: 在 update/create 中触发快照**

修改 `update()` 与 `copy()`：
- `update()`：保存前 `await this.snapshot(ctx, tpl, '更新前快照')`（在字段赋值前取旧值）。
- `copy()`：新模板 version+1（现状保留），无需快照。

- [ ] **Step 4: 提交**

```bash
cd d:\zhao\vendure
git add packages/shop-template-plugin/src/shop-template.service.ts packages/shop-template-plugin/src/merge-config.ts
git commit -m "feat(shop-template): 版本快照/回滚/引用查询/合并预览服务"
```

---

### Task 3: 后端 resolver + SDL + 编译提交

**Files:**
- Modify: `d:\zhao\vendure\packages\shop-template-plugin\src\plugin.ts`（SDL）
- Modify: `d:\zhao\vendure\packages\shop-template-plugin\src\shop-template-admin.resolver.ts`

- [ ] **Step 1: SDL 追加类型与接口**

在 `plugin.ts` 的 `adminApiExtensions.schema` 追加（`${templateType}` 同级，独立命名）：

```graphql
type ShopTemplateVersionType {
    id: ID!
    templateId: ID!
    version: Int!
    name: String
    theme: JSON
    pages: JSON
    enabled: Boolean!
    note: String
    createdAt: DateTime!
}
type TemplateReference {
    channelId: ID!
    channelCode: String!
    channelName: String!
    app: String!
}
type MergedPreview {
    merged: JSON!
    sourceByKey: JSON!
}
extend type Query {
    templateVersions(id: ID!): [ShopTemplateVersionType!]!
    templateReferences(id: ID!): [TemplateReference!]!
    templateMergedPreview(app: String!, templateId: ID, overrides: JSON): MergedPreview!
}
extend type Mutation {
    restoreTemplateVersion(id: ID!, version: Int!): ShopTemplate!
}
```

- [ ] **Step 2: resolver 实现**

在 `shop-template-admin.resolver.ts` 追加对应 4 个 handler，注入 `ShopTemplateService` 并调用（`templateVersions/restoreTemplateVersion/templateReferences/templateMergedPreview`），`@Args({ name, type: () => ... })` 模式与现有 resolver 一致。

- [ ] **Step 3: 编译 + 提交（含 lib）**

Run: `cd d:\zhao\vendure && npx lerna run build --scope @vendure/shop-template-plugin`
Expected: 构建成功，`lib/` 更新。

```bash
cd d:\zhao\vendure
git add packages/shop-template-plugin/lib packages/shop-template-plugin/src
git commit -m "feat(shop-template): 管理增强 SDL + resolver + 编译产物"
```

---

### Task 4: web-admin —— 模板库管理增强

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\template.ts`
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\templates\index.vue`

- [ ] **Step 1: API 扩展**

在 `template.ts` 追加：

```ts
export interface TemplateVersion { id: string; templateId: string; version: number; name: string | null; theme: any; pages: any; enabled: boolean; note: string | null; createdAt: string }
export interface TemplateReference { channelId: string; channelCode: string; channelName: string; app: string }
export interface MergedPreview { merged: any; sourceByKey: Record<string, string> }

export const templateApi = {
  // ...既有 list/create/update/remove/copy/globalConfig 保留
  async versions(id: string): Promise<TemplateVersion[]> {
    const r = await getAdminClient().request<{ templateVersions: TemplateVersion[] }>(
      `query ($id: ID!) { templateVersions(id: $id) { id templateId version name theme pages enabled note createdAt } }`, { id });
    return r.templateVersions;
  },
  async references(id: string): Promise<TemplateReference[]> {
    const r = await getAdminClient().request<{ templateReferences: TemplateReference[] }>(
      `query ($id: ID!) { templateReferences(id: $id) { channelId channelCode channelName app } }`, { id });
    return r.templateReferences;
  },
  async mergedPreview(app: string, templateId?: string, overrides?: any): Promise<MergedPreview> {
    const r = await getAdminClient().request<{ templateMergedPreview: MergedPreview }>(
      `query ($app: String!, $templateId: ID, $overrides: JSON) { templateMergedPreview(app: $app, templateId: $templateId, overrides: $overrides) { merged sourceByKey } }`,
      { app, templateId, overrides });
    return r.templateMergedPreview;
  },
  async restore(id: string, version: number): Promise<ShopTemplate> {
    const r = await getAdminClient().request<{ restoreTemplateVersion: ShopTemplate }>(
      `mutation ($id: ID!, $version: Int!) { restoreTemplateVersion(id: $id, version: $version) { ${TPL_FIELDS} } }`, { id, version });
    return r.restoreTemplateVersion;
  },
};
```

- [ ] **Step 2: 列表行引用徽标 + 删除/停用警示**

`platform/templates/index.vue`：
- 加载列表时并行 `references()` 各模板，行内显示「引用 N 店」徽标（N>0 时）。
- `onRemove`/`onToggle`：若引用>0，弹确认框列出将回退的店铺（channelName），确认后才执行。

- [ ] **Step 3: 编辑弹层「历史版本」+「合并预览」区**

- 「历史版本」Tab：`versions(id)` 列表（v1/v2/... 时间+备注），每项「预览 JSON」「回滚」按钮（回滚前二次确认）。
- 「合并预览」区：`mergedPreview(app, editingId, overridesJson)`，展示 `merged` JSON + `sourceByKey` 标注（每键来源 L1/L2/L3 徽标）。
- 覆盖场景选择：无覆盖 / 输入覆盖 JSON。

- [ ] **Step 4: 构建 + 手机截图 + 手册 + 部署**

Run: `cd d:\zhao\vshop\web-admin && npm run build:h5`
Expected: 构建成功。

创建 `_e2e/_shot_template_mgmt.py`（390×844）：列表引用徽标、历史版本 Tab、合并预览、删除警示 各截图。

手册追加 op-28「风格模板库管理」章节，`node scripts/deploy.mjs` 部署，验证生产 grep op-28。

- [ ] **Step 5: 提交**

```bash
cd d:\zhao\vshop\web-admin
git add src/apis/template.ts src/pages/platform/templates/index.vue _e2e/_shot_template_mgmt.py src/static/manual
git commit -m "feat(admin): 风格模板库管理增强（版本/引用/合并预览）+ 手册 op-28"
```

---

### Task 5: 端到端回归（三任务合并验证）

**Files:**
- Create: `d:\zhao\scripts\2026-09-20-e2e-mgmt-regression.mjs`

- [ ] **Step 1: 合并回归脚本**

覆盖三任务关键链路：
- ① reservations/allocate/reconcile 命中 + 结构正确。
- ③ templateVersions/restore 往返（保存→版本+1→回滚→内容还原）、templateReferences 命中。
- ② 手机截图三版式存在且非空。

- [ ] **Step 2: 部署后端（含 shop-template 与 cjk-plugin lib）**

```bash
cd d:\zhao\vendure
git push origin master
ssh joho "cd /www/apps/vendure && git pull && pm2 restart vendure --update-env"
```

- [ ] **Step 3: 运行回归**

Run: `node d:\zhao\scripts\2026-09-20-e2e-mgmt-regression.mjs`
Expected: 全部 PASS。

- [ ] **Step 4: 最终提交（如脚本入库）**

---

## 自审

- **Spec 覆盖**：① 四接口 + 发货拆分（Task1-5）；② 三版式 + 回退 + 切换持久化 + 截图手册（Task1-3）；③ 版本/引用/合并预览 + web-admin + 手册（Task1-4）。全部 spec 项有对应 task。
- **占位符**：无 TBD；每步含完整代码与命令。
- **类型一致**：`ShopTemplateVersionType`（SDL）↔ `ShopTemplateVersion`（实体）↔ `TemplateVersion`（前端 API）命名一致；`templateMergedPreview`/`templateReferences`/`templateVersions`/`restoreTemplateVersion` 在 SDL/resolver/API/页面统一。
