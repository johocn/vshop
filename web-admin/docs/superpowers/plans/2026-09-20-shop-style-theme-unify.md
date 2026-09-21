# 主题风格体系联通（G1 + G2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **提交约束（用户要求）**：本计划中的 commit 步骤**仅在用户明确要求时执行**；未获明确指示前，完成代码与验证即可，不要自行 commit。

**Goal:** 把「主题风格」页收敛为五级可回退风格体系里 L3 店铺覆盖的正式入口，补齐 L3 令牌层与 L2 palette 展开，并把模板库 / 全局配置从手写 JSON 升级为结构化表单。

**Architecture:** 五级合并链语义与层级顺序**不变**（`L0 ← L1 ShopGlobalConfig ← L2 ShopTemplate ← L3 渠道 customFields ← L4 内建默认`）。本批只做三件事：① 新增 L3 令牌入参 `themeTokensOverride`（渠道 text customField），② 给 vshop 补上 nshop 已有的 palette 展开，③ 把 web-admin 的三处风格入口（主题页 / 模板库 / 全局配置）接到这条链上，并修正合并预览（palette 不展开、sourceByKey 层级倒置、overrides 占位示例多一层 `theme`）。既有 `themeId`（`data-theme`）保留为只读兼容层，提供显式一键迁移。

**Tech Stack:** Vendure 3.6.4 插件（TypeScript / NestJS / GraphQL SDL）、Nuxt 4 + Vue 3（nshop）、uni-app Vue 3（vshop C 端与 web-admin）、vitest（nshop / vendure 根）。

---

## 关键约束（实现时勿破）

- **五级体系不得被破坏**：不改层级顺序、不改「未引用/停用/跨 app 模板 → 服务端返回 null → C 端回退 L1」的回退语义、不改深合并规则（数组与标量直接覆盖、`null` 跳过、坏 JSON 返回 null 逐级退回默认）。
- `themeId`（`data-theme`）**不写入、不删除**，仅提供显式迁移；`themeTokensOverride` 与 `templateId` 互相独立，清空任一不影响另一项。
- 多语言新增文案必须**同时**补 `zh-Hans.json` 与 `en.json`，禁止单语言写死。
- `vendure` 后端**禁止服务器构建**：本地 `pnpm build` 后提交 `lib/` 产物，服务器只 `git pull` + `pm2 restart`。
- web-admin 本地构建 + `node scripts/deploy.mjs`。

## 文件结构（改动清单）

| 文件 | 职责 |
|---|---|
| `vendure/packages/shop-template-plugin/src/palette-presets.ts`（新建） | 配色预设权威副本（8 套），与 C 端同语义 |
| `vendure/packages/shop-template-plugin/src/merge-config.ts` | 新增 `resolvePaletteTokens`；`mergePreview` 展开 palette + 修正 sourceByKey 覆盖顺序 |
| `vendure/packages/shop-template-plugin/src/shop-template.service.ts` | `mergedPreview` 走新 `mergePreview` |
| `vendure/packages/shop-template-plugin/src/plugin.ts` | 注册 `themeTokensOverride` 渠道字段 + `palettePresets` query |
| `vendure/packages/shop-template-plugin/src/shop-template-admin.resolver.ts` | `palettePresets` resolver |
| `vendure/packages/shop-template-plugin/src/__tests__/merge-config.spec.ts`（新建） | 合并预览纯函数单测 |
| `nshop/layers/base/app/utils/merge-config.ts` | `mergeThemeTokens` 增 L3 入参 + `parseThemeTokensOverride` |
| `nshop/layers/base/app/utils/__tests__/merge-config.spec.ts` | 补 L3 用例 |
| `nshop/layers/base/app/composables/useThemeConfig.ts` | 把渠道 `themeTokensOverride` 传入合并 |
| `vshop/src/utils/palette-presets.ts`（新建） | 与 nshop 同份预设（SSR 运行时副本） |
| `vshop/src/utils/merge-config.ts` | 补 palette 展开 + L3 入参 + `parseThemeTokensOverride` |
| `vshop/src/stores/tenant.ts` | 把渠道 `themeTokensOverride` 传入合并 |
| `vshop/web-admin/src/apis/channel.ts` | `themeTokensOverride` 读写 |
| `vshop/web-admin/src/apis/template.ts` | `palettePresets()` |
| `vshop/web-admin/src/constants/theme-migration.ts`（新建） | 旧 `themeId` → L3 令牌映射表 |
| `vshop/web-admin/src/pages/decorate/theme/index.vue` | 重写为版式 A（模板优先纵列单页） |
| `vshop/web-admin/src/pages/decorate/shop-info/index.vue` | 移除模板分区 |
| `vshop/web-admin/src/pages/platform/templates/index.vue` | theme/pages 结构化表单 + 内联校验 + 常驻预览 |
| `vshop/web-admin/src/pages/platform/global-config/index.vue` | defaults 结构化表单 |
| `vshop/web-admin/src/locale/zh-Hans.json` / `en.json` | 新增文案 |

---

## Task 1: 后端配色预设权威副本

**Files:**
- Create: `d:\zhao\vendure\packages\shop-template-plugin\src\palette-presets.ts`
- Create: `d:\zhao\vendure\packages\shop-template-plugin\src\__tests__\palette-presets.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `d:\zhao\vendure\packages\shop-template-plugin\src\__tests__\palette-presets.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { PALETTE_PRESETS } from '../palette-presets';

describe('PALETTE_PRESETS 权威副本', () => {
    it('包含 8 套预设且与 C 端 scheme 同名', () => {
        expect(Object.keys(PALETTE_PRESETS).sort()).toEqual([
            'dawn-gold',
            'fresh-green',
            'jd-red',
            'midnight',
            'pdd-red',
            'taobao-orange',
            'tech-blue',
            'vip-blue',
        ]);
    });
    it('每套都有 primaryColor 且 scheme 与 key 一致', () => {
        for (const [key, def] of Object.entries(PALETTE_PRESETS)) {
            expect(def.scheme).toBe(key);
            expect(typeof def.tokens.primaryColor).toBe('string');
            expect(def.tokens.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
    it('jd-red 与 C 端字典一致', () => {
        expect(PALETTE_PRESETS['jd-red'].tokens).toEqual({
            primaryColor: '#e1251b',
            accentColor: '#ffeceb',
            radius: 8,
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `d:\zhao\vendure` 下）：
```bash
npx vitest run packages/shop-template-plugin/src/__tests__/palette-presets.spec.ts
```
Expected: FAIL —— `Failed to resolve import "../palette-presets"`。

- [ ] **Step 3: 实现预设表**

创建 `d:\zhao\vendure\packages\shop-template-plugin\src\palette-presets.ts`：

```ts
/**
 * 配色预设权威副本（后端）。
 *
 * ⚠️ 三处同步：本文件为权威副本；C 端保留 SSR 运行时副本
 *   - nshop: layers/base/app/utils/palette-presets.ts
 *   - vshop: src/utils/palette-presets.ts
 * 任何新增/改色必须三处同改，否则后台预览与 C 端渲染会漂移。
 */
export interface PaletteToken {
    primaryColor?: string;
    accentColor?: string;
    radius?: number | string;
    [key: string]: unknown;
}

export interface ThemePaletteDef {
    scheme: string;
    name: string;
    tokens: PaletteToken;
}

/** 8 套预设（平台对标风 4 + 气质品牌风 4），默认 dawn-gold */
export const PALETTE_PRESETS: Record<string, ThemePaletteDef> = {
    'dawn-gold': { scheme: 'dawn-gold', name: '晨曦金', tokens: { primaryColor: '#d4a574', accentColor: '#fdf6ee', radius: 8 } },
    'jd-red': { scheme: 'jd-red', name: '京东红', tokens: { primaryColor: '#e1251b', accentColor: '#ffeceb', radius: 8 } },
    'taobao-orange': { scheme: 'taobao-orange', name: '淘宝橙', tokens: { primaryColor: '#ff5000', accentColor: '#fff0e6', radius: 8 } },
    'pdd-red': { scheme: 'pdd-red', name: '拼多多红', tokens: { primaryColor: '#e02e24', accentColor: '#ffe9e7', radius: 8 } },
    'vip-blue': { scheme: 'vip-blue', name: '唯品会蓝紫', tokens: { primaryColor: '#4a5cff', accentColor: '#edefff', radius: 8 } },
    'tech-blue': { scheme: 'tech-blue', name: '科技蓝', tokens: { primaryColor: '#0066ff', accentColor: '#e6f0ff', radius: 10 } },
    'fresh-green': { scheme: 'fresh-green', name: '清雅绿', tokens: { primaryColor: '#07b873', accentColor: '#e6f9f0', radius: 10 } },
    'midnight': { scheme: 'midnight', name: '极夜黑', tokens: { primaryColor: '#1c1c1e', accentColor: '#333333', radius: 8 } },
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run packages/shop-template-plugin/src/__tests__/palette-presets.spec.ts`
Expected: PASS（3 passed）。

---

## Task 2: 后端合并预览展开 palette + 修正来源层级

**Files:**
- Modify: `d:\zhao\vendure\packages\shop-template-plugin\src\merge-config.ts`
- Create: `d:\zhao\vendure\packages\shop-template-plugin\src\__tests__\merge-config.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `d:\zhao\vendure\packages\shop-template-plugin\src\__tests__\merge-config.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { mergePreview, resolvePaletteTokens } from '../merge-config';

const g = { primaryColor: '#000000', radius: 4 };

describe('resolvePaletteTokens', () => {
    it('scheme 命中预设展开 tokens', () => {
        expect(resolvePaletteTokens({ scheme: 'jd-red' }).primaryColor).toBe('#e1251b');
    });
    it('未知 scheme → 空对象（回退），不抛错', () => {
        expect(resolvePaletteTokens({ scheme: 'nope' })).toEqual({});
    });
    it('无 palette / 坏数据 → 空对象', () => {
        expect(resolvePaletteTokens(null)).toEqual({});
        expect(resolvePaletteTokens('x')).toEqual({});
    });
    it('显式 tokens 覆盖预设同名', () => {
        expect(resolvePaletteTokens({ scheme: 'jd-red', tokens: { radius: 2 } }).radius).toBe(2);
    });
});

describe('mergePreview 预览 = C 端实际渲染', () => {
    it('L2 palette.scheme 被展开为令牌（与 C 端一致）', () => {
        const l2 = { palette: { scheme: 'jd-red' } };
        const { merged } = mergePreview(g, l2, {});
        expect(merged.primaryColor).toBe('#e1251b');
    });
    it('L3 overrides 覆盖 L2 展开值', () => {
        const l2 = { palette: { scheme: 'jd-red' } };
        const { merged } = mergePreview(g, l2, { primaryColor: '#123456' });
        expect(merged.primaryColor).toBe('#123456');
    });
    it('sourceByKey 取最高生效层级（L3 > L2 > L1）', () => {
        const l2 = { palette: { scheme: 'jd-red' } };
        const { sourceByKey } = mergePreview(g, l2, { accentColor: '#fff' });
        expect(sourceByKey.primaryColor).toBe('L2');
        expect(sourceByKey.accentColor).toBe('L3');
        expect(sourceByKey.radius).toBe('L2');
    });
    it('L2 无 palette 时 L1 值不回退丢失', () => {
        const { merged } = mergePreview({ primaryColor: '#0f0f0f' }, {}, {});
        expect(merged.primaryColor).toBe('#0f0f0f');
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run packages/shop-template-plugin/src/__tests__/merge-config.spec.ts`
Expected: FAIL —— `resolvePaletteTokens is not a function`。

- [ ] **Step 3: 实现**

把 `d:\zhao\vendure\packages\shop-template-plugin\src\merge-config.ts` **整体替换**为：

```ts
/**
 * 五级合并模型深合并（数组/标量直接覆盖、null 跳过、对象递归）。
 * 与 C 端 vshop/src/utils/merge-config.ts、nshop/layers/base/app/utils/merge-config.ts 语义一致，供合并预览复用。
 */
import { PALETTE_PRESETS } from './palette-presets';

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

/**
 * 展开 L2 模板的 theme.palette：scheme → 预设 tokens，再叠加显式 palette.tokens。
 * 无 scheme / 未知 scheme / 坏数据 → {}（回退上一级），与 C 端 resolvePaletteTokens 同语义。
 */
export function resolvePaletteTokens(palette: any): Record<string, any> {
    if (!palette || typeof palette !== 'object') return {};
    const preset = typeof palette.scheme === 'string' ? PALETTE_PRESETS[palette.scheme] : undefined;
    return deepMerge(deepMerge({}, preset?.tokens ?? {}), palette.tokens ?? {});
}

/**
 * 合并预览：L1 全局配置 → L2 模板（palette 展开 + 显式 theme/pages）→ L3 店铺覆盖。
 * 注意：入参 template 为「已扁平化」的 L2（theme 的键与 pages 的键同处顶层，palette 为顶层键）。
 */
export function mergePreview(
    globalConfig: any,
    template: any,
    overrides: any,
): { merged: any; sourceByKey: Record<string, string> } {
    const paletteTokens = resolvePaletteTokens(template?.palette);
    const l2 = deepMerge(deepMerge({}, paletteTokens), template ?? {});
    const merged = deepMerge(deepMerge(globalConfig ?? {}, l2), overrides ?? {});

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
    // 顺序即优先级：后写覆盖先写 → L3 > L2 > L1
    walk(globalConfig ?? {}, '', 'L1');
    walk(paletteTokens, '', 'L2');
    walk(template ?? {}, '', 'L2');
    walk(overrides ?? {}, '', 'L3');
    return { merged, sourceByKey };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run packages/shop-template-plugin/src/__tests__/merge-config.spec.ts`
Expected: PASS（8 passed）。

- [ ] **Step 5: 构建插件**

Run（在 `d:\zhao\vendure` 下）：
```bash
pnpm --filter @vendure/shop-template-plugin build
```
Expected: 无报错，`packages/shop-template-plugin/lib/src/merge-config.js` 与 `lib/src/palette-presets.js` 生成。

---

## Task 3: 后端注册 L3 字段与 palettePresets 查询

**Files:**
- Modify: `d:\zhao\vendure\packages\shop-template-plugin\src\plugin.ts`
- Modify: `d:\zhao\vendure\packages\shop-template-plugin\src\shop-template-admin.resolver.ts`

- [ ] **Step 1: 注册渠道字段 `themeTokensOverride`**

在 `src/plugin.ts` 的 `configuration` 回调里，把既有 `mergeCustomFields(config.customFields.Channel, [...])` 那段改为：

```ts
        // 店铺「选模板」引用字段 + L3 令牌覆盖（与既有店铺装修字段并存）
        config.customFields.Channel = mergeCustomFields(config.customFields.Channel, [
            { name: 'templateId', type: 'string', public: true },
            { name: 'themeTokensOverride', type: 'text', nullable: true, public: true },
        ]);
```

- [ ] **Step 2: 加 `palettePresets` query 到 admin API SDL**

在 `src/plugin.ts` 的 `adminApiExtensions.schema` 里，给 `extend type Query` 增加一行（放在 `templateMergedPreview` 之后）：

```
                palettePresets: JSON!
```

完整片段（便于核对）：

```ts
            extend type Query {
                shopTemplates(app: String): [ShopTemplate!]!
                shopTemplate(id: ID!): ShopTemplate
                shopGlobalConfig(app: String!): ShopGlobalConfig
                templateVersions(id: ID!): [ShopTemplateVersionType!]!
                templateReferences(id: ID!): [TemplateReference!]!
                templateMergedPreview(app: String!, templateId: ID, overrides: JSON): MergedPreview!
                palettePresets: JSON!
            }
```

- [ ] **Step 3: 加 resolver**

在 `src/shop-template-admin.resolver.ts` 顶部 import 后加入预设导入，并在类内 `templateMergedPreview` 之后追加 resolver：

```ts
import { PALETTE_PRESETS } from './palette-presets';
```

```ts
    @Query()
    @Allow(shopTemplatesRead.Permission)
    async palettePresets(): Promise<Record<string, any>> {
        return PALETTE_PRESETS;
    }
```

- [ ] **Step 4: 构建并核对 SDL 生效**

Run（在 `d:\zhao\vendure` 下）：
```bash
pnpm --filter @vendure/shop-template-plugin build
```
Expected: 无报错。

- [ ] **Step 5: API 核验（本地 admin-api）**

确保本地 vendure 已启动（`pnpm dev` 或既有本地实例），用管理员 token 执行：

```graphql
query { palettePresets }
```
Expected: 返回 8 套预设对象（非 null、非报错）。

```graphql
query { activeChannel { id customFields { templateId themeTokensOverride } } }
```
Expected: `themeTokensOverride` 字段存在（值为 null 即可，证明 customField 已注册）。

- [ ] **Step 6: 提交构建产物（用户明确要求提交时）**

```bash
git add vendure/packages/shop-template-plugin/src vendure/packages/shop-template-plugin/lib
git commit -m "feat(shop-template): L3 令牌字段 + palette 预设权威副本 + 预览展开修正"
```

---

## Task 4: nshop 合并链支持 L3 令牌

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\utils\merge-config.ts`
- Modify: `d:\zhao\nshop\layers\base\app\utils\__tests__\merge-config.spec.ts`
- Modify: `d:\zhao\nshop\layers\base\app\composables\useThemeConfig.ts`

- [ ] **Step 1: 写失败测试**

在 `d:\zhao\nshop\layers\base\app\utils\__tests__\merge-config.spec.ts` 顶部 import 行改为：

```ts
import { mergePageConfig, mergeThemeTokens, parseThemeTokensOverride } from '../merge-config';
```

并在文件末尾追加：

```ts
describe('mergeThemeTokens L3 店铺令牌覆盖', () => {
  it('L3 覆盖 L2 palette 展开值', () => {
    const g = { themeTokens: { primaryColor: '#000000' } } as any;
    const t = { theme: { palette: { scheme: 'jd-red' } } } as any;
    const r = mergeThemeTokens(g, t, { primaryColor: '#123456' });
    expect(r.primaryColor).toBe('#123456');
  });
  it('L3 覆盖 L2 显式 theme 令牌', () => {
    const t = { theme: { primaryColor: '#aaaaaa' } } as any;
    const r = mergeThemeTokens(null, t, { primaryColor: '#bbbbbb' });
    expect(r.primaryColor).toBe('#bbbbbb');
  });
  it('L3 为 null/undefined 时结果与旧签名一致', () => {
    const g = { themeTokens: { primaryColor: '#000000' } } as any;
    expect(mergeThemeTokens(g, null, null).primaryColor).toBe('#000000');
    expect(mergeThemeTokens(g, null, undefined).primaryColor).toBe('#000000');
  });
  it('L3 缺字段不误伤其他层级', () => {
    const g = { themeTokens: { primaryColor: '#000000', radius: 4 } } as any;
    const r = mergeThemeTokens(g, null, { accentColor: '#eee' });
    expect(r.primaryColor).toBe('#000000');
    expect(r.radius).toBe(4);
    expect(r.accentColor).toBe('#eee');
  });
});

describe('parseThemeTokensOverride 坏数据一律不覆盖', () => {
  it('空值 → null', () => {
    expect(parseThemeTokensOverride('')).toBeNull();
    expect(parseThemeTokensOverride(null)).toBeNull();
    expect(parseThemeTokensOverride(undefined)).toBeNull();
  });
  it('坏 JSON / 非对象 → null', () => {
    expect(parseThemeTokensOverride('{bad')).toBeNull();
    expect(parseThemeTokensOverride('"x"')).toBeNull();
    expect(parseThemeTokensOverride('[1,2]')).toBeNull();
  });
  it('合法对象 → 原样返回', () => {
    expect(parseThemeTokensOverride('{"primaryColor":"#fff"}')).toEqual({ primaryColor: '#fff' });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `d:\zhao\nshop` 下）：
```bash
pnpm vitest run layers/base/app/utils/__tests__/merge-config.spec.ts
```
Expected: FAIL —— `parseThemeTokensOverride is not a function`。

- [ ] **Step 3: 实现**

在 `d:\zhao\nshop\layers\base\app\utils\merge-config.ts` 中，把 `mergeThemeTokens` 整段替换为：

```ts
/** 解析渠道 L3 令牌覆盖（Vendure text customField）；坏 JSON/非对象 → null（视为不覆盖） */
export function parseThemeTokensOverride(raw: string | null | undefined): Record<string, any> | null {
  return parseJsonText(raw);
}

/** 主题令牌合并：L1 全局 themeTokens ← L2 模板（palette 展开 + 显式 theme）← L3 店铺覆盖 */
export function mergeThemeTokens(
  globalConfig: ShopGlobalConfigData | null,
  template: ShopTemplateData | null,
  channelThemeOverride?: Record<string, any> | null,
): ThemeTokens {
  return deepMerge<ThemeTokens>(
    {},
    globalConfig?.themeTokens ?? null,
    resolvePaletteTokens(template),
    template?.theme ?? null,
    channelThemeOverride ?? null,
  );
}
```

> 注意：`parseJsonText` 定义在 `mergeThemeTokens` **之后**，但函数声明会提升，`parseThemeTokensOverride` 内调用安全；若 lint 报「no-use-before-define」，把 `parseThemeTokensOverride` 挪到 `parseJsonText` 定义之后。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run layers/base/app/utils/__tests__/merge-config.spec.ts`
Expected: PASS（含既有 3 条 palette 用例 + 新增 7 条）。

- [ ] **Step 5: 接入消费入口**

把 `d:\zhao\nshop\layers\base\app\composables\useThemeConfig.ts` 的 import 与 `themeTokens` 计算属性改为：

```ts
import { mergePageConfig, mergeThemeTokens, parseThemeTokensOverride } from "../utils/merge-config";
```

```ts
  const themeTokens = computed<ThemeTokens>(() =>
    mergeThemeTokens(
      globalConfig.value,
      template.value,
      parseThemeTokensOverride(channelCfs.value?.themeTokensOverride),
    ),
  );
```

- [ ] **Step 6: 类型检查**

Run（在 `d:\zhao\nshop` 下）：
```bash
pnpm typecheck
```
Expected: 无新增类型错误（既有历史错误不计）。

---

## Task 5: vshop C 端补齐 palette 展开与 L3

**Files:**
- Create: `d:\zhao\vshop\src\utils\palette-presets.ts`
- Modify: `d:\zhao\vshop\src\utils\merge-config.ts`
- Modify: `d:\zhao\vshop\src\stores\tenant.ts`

> vshop 仓无测试运行器（`package.json` 无 vitest、无 `scripts/`、无 `node_modules/vitest`），**不新增测试框架**；本 Task 的验证以 `build:h5` 通过 + Task 11 的手机视口截图为准。语义与 nshop 逐行对齐，nshop 的单测即为该实现的行为基准。

- [ ] **Step 1: 建立预设副本**

把 `d:\zhao\nshop\layers\base\app\utils\palette-presets.ts` 完整复制为 `d:\zhao\vshop\src\utils\palette-presets.ts`，并把文件头注释第一行改为：

```ts
// 模板配色方案预设字典（SSR 运行时副本，权威副本在后端 shop-template-plugin/src/palette-presets.ts）：
// C 端内置，与后端模板库的 theme.palette.scheme 一一对应；nshop/vshop 共用同一份语义。
// ⚠️ 改色/加预设必须与 nshop 同名文件 + 后端权威副本三处同改。
```

（其余内容——`PaletteToken`、`ThemePaletteDef`、`PALETTE_PRESETS` 8 套——保持与 nshop 完全一致。）

- [ ] **Step 2: 补 palette 展开与 L3 入参**

把 `d:\zhao\vshop\src\utils\merge-config.ts` 的头部 import 与 `mergeThemeTokens` 整段替换为：

```ts
import { PALETTE_PRESETS } from './palette-presets';
import type { PaletteToken } from './palette-presets';
```

```ts
export interface ThemePaletteData {
  scheme?: string;
  name?: string;
  tokens?: PaletteToken;
}
```

```ts
/** 解析模板 theme 中的配色：优先按 palette.scheme 从预设查询并展开 tokens；
 *  无 scheme 或未知 scheme → 回退 {}，有 scheme 且带显式 tokens 时二者并存（显式覆盖预设）。 */
export function resolvePaletteTokens(template: ShopTemplateData | null): PaletteToken | null {
  const palette = template?.theme?.palette as ThemePaletteData | null | undefined;
  if (!palette || typeof palette !== 'object') return null;
  const preset = typeof palette.scheme === 'string' ? PALETTE_PRESETS[palette.scheme] : undefined;
  const presetTokens = preset ? preset.tokens : {};
  return deepMerge<PaletteToken>({}, presetTokens, palette.tokens ?? null);
}

/** 解析渠道 L3 令牌覆盖（Vendure text customField）；坏 JSON/非对象 → null（视为不覆盖） */
export function parseThemeTokensOverride(raw: string | null | undefined): Record<string, any> | null {
  return parseJsonText(raw);
}

/** 主题令牌合并：L1 全局 themeTokens ← L2 模板（palette 展开 + 显式 theme）← L3 店铺覆盖 */
export function mergeThemeTokens(
  globalConfig: ShopGlobalConfigData | null,
  template: ShopTemplateData | null,
  channelThemeOverride?: Record<string, any> | null,
): ThemeTokens {
  return deepMerge<ThemeTokens>(
    {},
    globalConfig?.themeTokens ?? null,
    resolvePaletteTokens(template),
    template?.theme ?? null,
    channelThemeOverride ?? null,
  );
}
```

> `parseThemeTokensOverride` 依赖文件末尾的 `parseJsonText`（函数声明提升，安全）。

- [ ] **Step 3: 接入租户 store**

`d:\zhao\vshop\src\stores\tenant.ts`：

import 行改为：

```ts
import { mergeThemeTokens, mergePageConfig, parseThemeTokensOverride, ThemeTokens } from '../utils/merge-config';
```

渠道 customFields 需带出该字段——在 `loadTenantDetails` 里读取（放在 `rawShopContent.value = cf.shopContent || null;` 之后）：

```ts
                rawThemeOverride.value = cf.themeTokensOverride || null;
```

在 store 顶部 state 区（`const themeTokens = ref<ThemeTokens>({});` 之后）新增：

```ts
    const rawThemeOverride = ref<string | null>(null);
```

`loadTemplateConfig` 里第 154 行改为：

```ts
            themeTokens.value = mergeThemeTokens(
                globalConfig,
                template,
                parseThemeTokensOverride(rawThemeOverride.value),
            );
```

`loadTenantDetails` 回退分支里，在 `themeTokens.value = {};` 之后补一行：

```ts
        rawThemeOverride.value = null;
```

并在 `return { ... }` 的导出列表中加入 `rawThemeOverride`（放在 `themeTokens,` 之后）。

- [ ] **Step 4: 确认渠道解析接口返回该字段**

打开 `d:\zhao\vshop\src\api\queries\channel.ts`，找到 `resolveChannelByCode` 使用的查询（返回 `customFields { ... }` 的那段），确保 customFields 选择集包含 `themeTokensOverride`；若无则加上：

```
            themeTokensOverride
```

- [ ] **Step 5: 构建验证**

Run（在 `d:\zhao\vshop` 下）：
```bash
pnpm build:h5
```
Expected: 构建成功，无 TS 报错。

---

## Task 6: web-admin 渠道字段与预设 API

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\apis\channel.ts`
- Modify: `d:\zhao\vshop\web-admin\src\apis\template.ts`

- [ ] **Step 1: 渠道接口加 L3 字段**

`src/apis/channel.ts`：

`ChannelCustomFields` 接口中，在 `templateId?: string;` 之后加：

```ts
  // L3 店铺令牌覆盖（JSON 字符串，形如 {"primaryColor":"#E1251B","radius":8}）
  themeTokensOverride?: string;
```

`fetchActiveChannel` 的 query 选择集改为（在原字段后追加 `themeTokensOverride`）：

```
        customFields { displayTemplate themeId shopName shopLogo shopIntro servicePhone shopContent multilingualEnabled taxMode inventoryMode odooBaseUrl odooApiKey detailConfig promoSchemes serviceSchemes templateId themeTokensOverride pageCategoryConfig pageCartConfig pageProfileConfig }
```

- [ ] **Step 2: 模板 API 加 palettePresets**

`src/apis/template.ts` 在 `templateApi` 对象内、`globalConfig` 之前插入：

```ts
  async palettePresets(): Promise<Record<string, { scheme: string; name: string; tokens: Record<string, any> }>> {
    const r = await getAdminClient().request<{ palettePresets: Record<string, { scheme: string; name: string; tokens: Record<string, any> }> }>(
      `query { palettePresets }`,
    );
    return r.palettePresets ?? {};
  },
```

- [ ] **Step 3: 类型检查**

Run（在 `d:\zhao\vshop\web-admin` 下）：
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 无新增错误（若该仓库无 tsconfig 校验脚本，跳过并在 Task 11 由 `pnpm build:h5` 覆盖）。

---

## Task 7: 旧 themeId → L3 迁移映射表

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\constants\theme-migration.ts`

- [ ] **Step 1: 建映射表**

创建 `d:\zhao\vshop\web-admin\src\constants\theme-migration.ts`：

```ts
// 旧 themeId（channel.customFields.themeId → C 端 data-theme）→ L3 令牌覆盖 迁移映射。
// 仅覆盖 V 端实际存在的 3 个色卡（taobao-orange / jd-red / modern-minimal）；
// brand / default / 空值 不产生覆盖（迁移后仅清空 themeId）。
export interface ThemeIdMigrationResult {
  themeTokensOverride: Record<string, any> | null;
  matched: boolean;
}

const MAP: Record<string, { primaryColor: string; radius: number }> = {
  'taobao-orange': { primaryColor: '#FF5000', radius: 8 },
  'jd-red': { primaryColor: '#E1251B', radius: 6 },
  'modern-minimal': { primaryColor: '#111827', radius: 6 },
};

/** themeId 是否为「需要迁移的旧版主题」（brand/default/空 → false） */
export function isLegacyThemeId(themeId: string | null | undefined): boolean {
  const id = (themeId ?? '').trim();
  return !!id && id !== 'brand' && id !== 'default';
}

/** 生成迁移结果；未命中映射表时 matched=false（只清空 themeId，不写覆盖） */
export function buildThemeIdMigration(themeId: string | null | undefined): ThemeIdMigrationResult {
  const id = (themeId ?? '').trim();
  const hit = MAP[id];
  if (!hit) return { themeTokensOverride: null, matched: false };
  return { themeTokensOverride: { ...hit }, matched: true };
}
```

- [ ] **Step 2: 类型检查**

Run（在 `d:\zhao\vshop\web-admin` 下）：`npx tsc --noEmit -p tsconfig.json`
Expected: 无新增错误。

---

## Task 8: 主题风格页重写为版式 A（模板优先纵列单页）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\theme\index.vue`

版式 A 自上而下共 6 段：目标端分段器 → 当前生效摘要卡 → 风格模板卡片网格 → 令牌覆盖三项 → 旧版主题提示条（条件） → 合并结果预览。一次保存同时写 `templateId` 与 `themeTokensOverride`，两项独立。

- [ ] **Step 1: 替换 template 段**

把 `src/pages/decorate/theme/index.vue` 的 `<template>` 整段替换为：

```vue
<template>
  <view class="page">
    <view class="tip">{{ $t('decorateTheme.tip') }}</view>

    <!-- 1. 目标端分段器 -->
    <view class="seg">
      <text :class="{ on: app === 'nshop' }" @tap="switchApp('nshop')">{{ $t('decorateTheme.appNshop') }}</text>
      <text :class="{ on: app === 'vshop' }" @tap="switchApp('vshop')">{{ $t('decorateTheme.appVshop') }}</text>
    </view>

    <!-- 2. 当前生效摘要卡 -->
    <view class="card summary">
      <view class="swatch-lg" :style="{ background: effectivePrimary || '#d4a574' }" />
      <view class="sum-info">
        <text class="sum-tpl">{{ templateName || $t('decorateTheme.noTemplate') }}</text>
        <text class="sum-sub">{{ $t('decorateTheme.effectivePrimary') }}: {{ effectivePrimary || '—' }}</text>
      </view>
      <text class="src-badge" :class="'s' + effectiveSource">{{ effectiveSource }}</text>
    </view>

    <!-- 3. 风格模板卡片网格 -->
    <view class="card">
      <view class="sec-title">{{ $t('decorateTheme.tplSection') }}</view>
      <view class="tpl-wrap">
        <view class="tpl" :class="{ added: !templateId }" @tap="templateId = ''">
          <text class="tpl-zh">{{ $t('decorateTheme.tplNone') }}</text>
          <text class="tpl-plus">{{ !templateId ? '✓' : '' }}</text>
        </view>
        <view
          class="tpl"
          :class="{ added: templateId === t.id }"
          v-for="t in enabledTemplates"
          :key="t.id"
          @tap="templateId = t.id"
        >
          <view class="tpl-sw" :style="{ background: t.primaryColor || '#ddd' }" />
          <view class="tpl-body">
            <text class="tpl-zh">{{ t.name }}</text>
            <text class="tpl-sub">{{ t.paletteName || $t('decorateTheme.custom') }} · v{{ t.version }}</text>
          </view>
          <text class="tpl-plus">{{ templateId === t.id ? '✓' : '' }}</text>
        </view>
      </view>
      <text v-if="!enabledTemplates.length" class="hint-inline">{{ $t('decorateTheme.tplEmpty') }}</text>
    </view>

    <!-- 4. 令牌覆盖（可选） -->
    <view class="card">
      <view class="sec-title">{{ $t('decorateTheme.tokenSection') }}</view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateTheme.primaryColor') }}</text>
        <input v-model="ov.primaryColor" placeholder="#E1251B" @blur="validateTokens" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateTheme.accentColor') }}</text>
        <input v-model="ov.accentColor" placeholder="#FFF3E6" @blur="validateTokens" />
      </view>
      <view class="cell">
        <text class="lbl">{{ $t('decorateTheme.radius') }}</text>
        <input v-model="ov.radius" type="number" placeholder="8" @blur="validateTokens" />
      </view>
      <text class="hint-inline">{{ $t('decorateTheme.tokenHint') }}</text>
      <text v-if="tokenErr" class="err">{{ tokenErr }}</text>
    </view>

    <!-- 5. 旧版主题提示条 -->
    <view v-if="legacyThemeId" class="card legacy">
      <text class="legacy-title">{{ $t('decorateTheme.legacyTitle') }}</text>
      <text class="legacy-body">{{ $t('decorateTheme.legacyBody').replace('{id}', legacyThemeId) }}</text>
      <button class="legacy-btn" @tap="onMigrate">{{ $t('decorateTheme.legacyMigrate') }}</button>
    </view>

    <!-- 6. 合并结果预览 -->
    <view class="card">
      <view class="sec-title">{{ $t('decorateTheme.previewSection') }}</view>
      <view class="prev-row" v-for="k in previewKeys" :key="k">
        <text class="prev-k">{{ k }}</text>
        <text class="prev-v">{{ mergedTokens[k] ?? '—' }}</text>
        <text class="src-badge" :class="'s' + (previewSource[k] || 'L1')">{{ previewSource[k] || 'L1' }}</text>
      </view>
      <button class="btn ghost" :disabled="previewing" @tap="genPreview">{{ previewing ? $t('decorateTheme.previewing') : $t('decorateTheme.refreshPreview') }}</button>
    </view>

    <button class="save" :disabled="saving" @tap="save">{{ saving ? $t('decorateTheme.saving') : $t('decorateTheme.save') }}</button>
  </view>
</template>
```

- [ ] **Step 2: 替换 script 段**

把 `<script lang="ts" setup>` 整段替换为：

```vue
<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { fetchActiveChannel, updateChannelCustomFields } from '../../../apis/channel';
import { templateApi, type ShopTemplate } from '../../../apis/template';
import { graphQlErrorMsg } from '../../../apis/client';
import { isLegacyThemeId, buildThemeIdMigration } from '../../../constants/theme-migration';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const PREVIEW_KEYS = ['primaryColor', 'accentColor', 'radius'];

const app = ref<'nshop' | 'vshop'>('nshop');
const channelId = ref('');
const themeId = ref('');
const templateId = ref('');
const ov = ref<{ primaryColor: string; accentColor: string; radius: string }>({ primaryColor: '', accentColor: '', radius: '' });
const templates = ref<Array<ShopTemplate & { primaryColor?: string; paletteName?: string }>>([]);
const mergedTokens = ref<Record<string, any>>({});
const previewSource = ref<Record<string, string>>({});
const saving = ref(false);
const previewing = ref(false);
const tokenErr = ref('');

const legacyThemeId = computed(() => (isLegacyThemeId(themeId.value) ? themeId.value : ''));

/** 该端 enabled 且 app 匹配的模板（沿用「店铺覆盖页模板列表需过滤 app」规则） */
const enabledTemplates = computed(() => templates.value.filter((t) => t.enabled && t.app === app.value));

const templateName = computed(() => templates.value.find((t) => t.id === templateId.value)?.name ?? '');
const effectivePrimary = computed(() => mergedTokens.value.primaryColor ?? '');
const effectiveSource = computed(() => previewSource.value.primaryColor ?? 'L1');
const previewKeys = PREVIEW_KEYS;

onMounted(async () => {
  try {
    const ch = await fetchActiveChannel();
    channelId.value = ch.id;
    const cf = ch.customFields as any;
    themeId.value = cf.themeId || '';
    templateId.value = cf.templateId || '';
    const parsed = parseOverride(cf.themeTokensOverride);
    ov.value = {
      primaryColor: parsed?.primaryColor ?? '',
      accentColor: parsed?.accentColor ?? '',
      radius: parsed?.radius !== undefined ? String(parsed.radius) : '',
    };
    // 首次进页面即展开预览，避免「看合并结果」是假的
    await loadTemplates();
    await genPreview();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('decorateTheme.loadFailed')), icon: 'none' });
  }
});

function parseOverride(raw: string | null | undefined): Record<string, any> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

async function loadTemplates() {
  const list = await templateApi.list(app.value);
  const presets = await templateApi.palettePresets();
  templates.value = list.map((t) => {
    const scheme = (t.theme as any)?.palette?.scheme as string | undefined;
    const def = scheme ? presets[scheme] : undefined;
    const explicit = (t.theme as any)?.primaryColor as string | undefined;
    return { ...t, primaryColor: explicit || def?.tokens?.primaryColor, paletteName: def?.name };
  });
}

function switchApp(a: 'nshop' | 'vshop') {
  app.value = a;
  templateId.value = '';
  mergedTokens.value = {};
  previewSource.value = {};
  loadTemplates().then(genPreview);
}

/** 空 = 不覆盖；只收三项合法值 */
function buildOverridePayload(): Record<string, any> {
  const out: Record<string, any> = {};
  const p = ov.value.primaryColor.trim();
  const a = ov.value.accentColor.trim();
  const r = ov.value.radius.trim();
  if (p) out.primaryColor = p;
  if (a) out.accentColor = a;
  if (r) out.radius = Number(r);
  return out;
}

function validateTokens(): boolean {
  tokenErr.value = '';
  const hex = /^#[0-9a-fA-F]{3,8}$/;
  if (ov.value.primaryColor.trim() && !hex.test(ov.value.primaryColor.trim())) {
    tokenErr.value = locale.t('decorateTheme.errPrimary');
    return false;
  }
  if (ov.value.accentColor.trim() && !hex.test(ov.value.accentColor.trim())) {
    tokenErr.value = locale.t('decorateTheme.errAccent');
    return false;
  }
  const r = Number(ov.value.radius);
  if (ov.value.radius.trim() && (Number.isNaN(r) || r < 0 || r > 64)) {
    tokenErr.value = locale.t('decorateTheme.errRadius');
    return false;
  }
  return true;
}

/** 合并结果预览：走真实后端合并链（含 L2 palette 展开） */
async function genPreview() {
  previewing.value = true;
  try {
    const r = await templateApi.mergedPreview(app.value, templateId.value || undefined, buildOverridePayload());
    mergedTokens.value = r.merged ?? {};
    previewSource.value = r.sourceByKey ?? {};
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('decorateTheme.previewFailed')), icon: 'none' });
  } finally {
    previewing.value = false;
  }
}

async function onMigrate() {
  const mig = buildThemeIdMigration(themeId.value);
  const lines = mig.themeTokensOverride
    ? Object.entries(mig.themeTokensOverride).map(([k, v]) => `${k}: ${v}`).join('\n')
    : locale.t('decorateTheme.legacyNoMap');
  uni.showModal({
    title: locale.t('decorateTheme.legacyModalTitle'),
    content: locale.t('decorateTheme.legacyModalBody').replace('{map}', lines),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await updateChannelCustomFields(channelId.value, {
          themeId: null,
          themeTokensOverride: mig.themeTokensOverride ? JSON.stringify(mig.themeTokensOverride) : null,
        });
        themeId.value = '';
        if (mig.themeTokensOverride) {
          ov.value = {
            primaryColor: mig.themeTokensOverride.primaryColor ?? '',
            accentColor: mig.themeTokensOverride.accentColor ?? '',
            radius: mig.themeTokensOverride.radius !== undefined ? String(mig.themeTokensOverride.radius) : '',
          };
        }
        uni.showToast({ title: locale.t('decorateTheme.legacyMigrated'), icon: 'success' });
        await genPreview();
      } catch (e: any) {
        uni.showToast({ title: graphQlErrorMsg(e, locale.t('decorateTheme.saveFailed')), icon: 'none' });
      }
    },
  });
}

async function save() {
  if (saving.value) return;
  if (!validateTokens()) return;
  saving.value = true;
  const payload = buildOverridePayload();
  try {
    await updateChannelCustomFields(channelId.value, {
      templateId: templateId.value || null,
      themeTokensOverride: Object.keys(payload).length ? JSON.stringify(payload) : null,
    });
    uni.showToast({ title: locale.t('decorateTheme.saved'), icon: 'success' });
    await genPreview();
  } catch (e: any) {
    uni.showToast({ title: graphQlErrorMsg(e, locale.t('decorateTheme.saveFailed')), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
</script>
```

- [ ] **Step 3: 替换 style 段**

把 `<style lang="scss" scoped>` 整段替换为：

```scss
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .tip { font-size: 24rpx; color: $wa-muted; margin-bottom: 24rpx; }
  .seg { display: flex; background: $wa-rule; border-radius: 999rpx; padding: 4rpx; margin-bottom: 24rpx;
    text { flex: 1; text-align: center; font-size: 26rpx; color: $wa-muted; padding: 12rpx 0; border-radius: 999rpx; }
    text.on { background: $wa-accent; color: #fff; }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx; }
  .sec-title { font-size: 28rpx; font-weight: 700; color: $wa-ink; margin-bottom: 16rpx; }
  .summary { display: flex; align-items: center; gap: 20rpx;
    .swatch-lg { width: 72rpx; height: 72rpx; border-radius: 16rpx; flex: 0 0 auto; }
    .sum-info { flex: 1; min-width: 0; }
    .sum-tpl { display: block; font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .sum-sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }
  }
  .src-badge { flex: 0 0 auto; font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 999rpx; background: $wa-rule; color: $wa-muted; }
  .src-badge.sL1 { background: #e8f1ff; color: #2f6fe0; }
  .src-badge.sL2 { background: #e8f9ee; color: #2fa35c; }
  .src-badge.sL3 { background: #fff3e0; color: #fa8c16; }
  .src-badge.sL4 { background: #f2f2f5; color: #666; }
  .tpl-wrap { display: flex; flex-direction: column; gap: 16rpx; }
  .tpl { display: flex; align-items: center; gap: 16rpx; border: 2rpx solid $wa-rule; border-radius: 12rpx;
    padding: 20rpx 24rpx; background: $wa-card;
    &.added { border-color: $wa-accent; background: rgba(255, 102, 0, 0.06); }
    .tpl-sw { width: 40rpx; height: 40rpx; border-radius: 8rpx; flex: 0 0 auto; }
    .tpl-body { flex: 1; min-width: 0; }
    .tpl-zh { display: block; font-size: 28rpx; color: $wa-ink; }
    .tpl-sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
    .tpl-plus { color: $wa-accent; font-size: 30rpx; }
  }
  .cell { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
    .lbl { width: 220rpx; font-size: 26rpx; color: $wa-ink; flex-shrink: 0; }
    input { flex: 1; font-size: 28rpx; }
    &:last-child { border-bottom: none; }
  }
  .hint-inline { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 12rpx; }
  .err { display: block; font-size: 22rpx; color: #e6162d; margin-top: 8rpx; }
  .legacy { border: 2rpx solid #ffb020; background: #fffbf0;
    .legacy-title { display: block; font-size: 26rpx; font-weight: 600; color: #b45309; }
    .legacy-body { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; line-height: 1.6; }
    .legacy-btn { margin-top: 16rpx; font-size: 26rpx; background: #ffb020; color: #fff; border-radius: 999rpx; line-height: 2.2; }
  }
  .prev-row { display: flex; align-items: center; gap: 12rpx; padding: 12rpx 0; border-bottom: 1rpx dashed $wa-rule;
    .prev-k { flex: 1; font-size: 24rpx; color: $wa-ink; }
    .prev-v { font-size: 24rpx; color: $wa-muted; }
  }
  .btn.ghost { margin-top: 16rpx; background: transparent; border: 2rpx solid $wa-accent; color: $wa-accent; font-size: 26rpx; border-radius: 999rpx; line-height: 2.2; }
  .save { margin-top: 32rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
```

- [ ] **Step 4: 页面可编译**

Run（在 `d:\zhao\vshop\web-admin` 下）：
```bash
pnpm build:h5
```
Expected: 构建成功（此时 i18n 新键可能在 Task 10 才补齐；先确认无编译错误，文案缺失留到 Task 10 验证）。

---

## Task 9: 店铺信息页移除模板分区

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\shop-info\index.vue`

- [ ] **Step 1: 删模板卡片与分段器**

删除 `<template>` 中整个「风格模板」card（从 `<view class="card">` 内 `<view class="img-title">{{ $t('decorateShopInfo.tplTitle') }}</view>` 一直到该 card 结束的 `</view>`，即 `tpl-wrap` + `tplEmpty` 那段）。

- [ ] **Step 2: 版式处加跳转提示**

在最后一个 `<view class="hint">{{ $t('decorateShopInfo.layoutHint') }}</view>` **之后**、该 card 的 `</view>` 之前插入：

```vue
      <view class="hint link" @tap="goDetailDecorate">{{ $t('decorateShopInfo.moreBlocks') }}</view>
```

- [ ] **Step 3: 脚本清理与跳转函数**

`<script setup>` 中：

1. 删除 `import { templateApi, type ShopTemplate } from '../../../apis/template';`
2. 删除 `templateId` / `templateList` / `tplApp` / `APP_OPTS` / `enabledTemplates` / `switchTplApp` / `appLabel` 中仅服务于模板分区的部分，以及 `onMounted` 内加载模板列表的调用。
3. `save()` 中删除 `payload.templateId = templateId.value || null;` 这一行（**避免与主题页互相覆盖 `templateId`**）。
4. 新增跳转函数：

```ts
function goDetailDecorate() {
  uni.navigateTo({ url: '/pages/decorate/product/index' });
}
```

> 若 `pages/decorate/product/index` 不是详情装修页实际路径，用 Grep 在 `src/pages/decorate/` 下确认后替换为真实路径（不要留错路径）。

- [ ] **Step 4: 样式补充**

在 `<style>` 的 `.hint` 规则后追加：

```scss
  .hint.link { color: $wa-accent; }
```

- [ ] **Step 5: 确认模板选择不再出现**

Run（在 `d:\zhao\vshop\web-admin` 下）：
```bash
pnpm build:h5
```
Expected: 构建成功；全局搜索 `decorateShopInfo.tplTitle` 仅剩 locale 文件中的定义，无页面引用。

---

## Task 10: web-admin i18n 双语补齐

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: 替换 `decorateTheme` 段（zh-Hans）**

把 `zh-Hans.json` 的 `"decorateTheme"` 对象替换为：

```json
  "decorateTheme": {
    "tip": "主题风格（L3 店铺覆盖）：选模板 = 换整套配色与页面版式；令牌覆盖 = 只改本店主色/辅色/圆角。",
    "appNshop": "nshop 商城",
    "appVshop": "vshop 商城",
    "noTemplate": "未引用模板",
    "effectivePrimary": "生效主色",
    "tplSection": "风格模板",
    "tplNone": "不引用模板",
    "tplEmpty": "该端暂无启用中的模板，请到「平台 · 模板库」新建。",
    "custom": "自定义配色",
    "tokenSection": "令牌覆盖（可选，留空即不覆盖）",
    "primaryColor": "主色 primaryColor",
    "accentColor": "辅色 accentColor",
    "radius": "圆角 radius",
    "tokenHint": "仅存增量差异；留空字段自动回退上一级（L2 模板 → L1 全局配置）。",
    "errPrimary": "主色格式不合法，示例 #E1251B",
    "errAccent": "辅色格式不合法，示例 #FFF3E6",
    "errRadius": "圆角需为 0–64 的数字",
    "legacyTitle": "检测到旧版主题",
    "legacyBody": "本店仍在用旧版 themeId「{id}」。旧版色卡与新的令牌体系不互通，可一键迁移为 L3 令牌。",
    "legacyMigrate": "一键迁移为令牌覆盖",
    "legacyModalTitle": "确认迁移",
    "legacyModalBody": "将写入以下令牌覆盖，并清空旧版 themeId：\n{map}",
    "legacyNoMap": "（该旧主题无对应色值，仅清空 themeId）",
    "legacyMigrated": "已迁移",
    "previewSection": "合并结果预览（真实生效值）",
    "refreshPreview": "刷新预览",
    "previewing": "查询中…",
    "previewFailed": "预览获取失败",
    "loadFailed": "加载失败",
    "saving": "保存中…",
    "save": "保存主题",
    "saved": "主题已保存",
    "saveFailed": "保存失败"
  },
```

- [ ] **Step 2: 补 `decorateShopInfo.moreBlocks`（zh-Hans）**

在 `zh-Hans.json` 的 `decorateShopInfo` 对象内（`"layoutHint"` 之后）加：

```json
    "moreBlocks": "更多块级设置（价格/促销/服务/参数/评价等）→ 去详情装修页",
```

- [ ] **Step 3: 同步 en.json**

对 `en.json` 做同名键的英文版本（键名必须完全一致）：

```json
  "decorateTheme": {
    "tip": "Theme (L3 shop override): a template swaps the whole palette and page layout; tokens override only this shop's primary/accent/radius.",
    "appNshop": "nshop store",
    "appVshop": "vshop store",
    "noTemplate": "No template",
    "effectivePrimary": "Effective primary",
    "tplSection": "Style templates",
    "tplNone": "No template",
    "tplEmpty": "No enabled template for this app. Create one in Platform · Templates.",
    "custom": "Custom palette",
    "tokenSection": "Token override (optional, leave blank to skip)",
    "primaryColor": "Primary color",
    "accentColor": "Accent color",
    "radius": "Radius",
    "tokenHint": "Only deltas are stored; blank fields fall back to the level above (L2 template → L1 global config).",
    "errPrimary": "Invalid primary color, e.g. #E1251B",
    "errAccent": "Invalid accent color, e.g. #FFF3E6",
    "errRadius": "Radius must be a number between 0 and 64",
    "legacyTitle": "Legacy theme detected",
    "legacyBody": "This shop still uses the legacy themeId \"{id}\". Legacy presets are not connected to the token system; migrate in one click.",
    "legacyMigrate": "Migrate to token override",
    "legacyModalTitle": "Confirm migration",
    "legacyModalBody": "The following token override will be written and the legacy themeId cleared:\n{map}",
    "legacyNoMap": "(This legacy theme has no mapped colors; only themeId will be cleared.)",
    "legacyMigrated": "Migrated",
    "previewSection": "Merged preview (actual effective values)",
    "refreshPreview": "Refresh preview",
    "previewing": "Loading…",
    "previewFailed": "Failed to load preview",
    "loadFailed": "Failed to load",
    "saving": "Saving…",
    "save": "Save theme",
    "saved": "Theme saved",
    "saveFailed": "Save failed"
  },
```

并在 `en.json` 的 `decorateShopInfo` 内加：

```json
    "moreBlocks": "More block settings (price / promo / service / specs / reviews) → open detail decoration",
```

- [ ] **Step 4: JSON 合法性校验**

Run（在 `d:\zhao\vshop\web-admin` 下）：
```bash
node -e "JSON.parse(require('fs').readFileSync('src/locale/zh-Hans.json','utf8'));JSON.parse(require('fs').readFileSync('src/locale/en.json','utf8'));console.log('i18n OK')"
```
Expected: 输出 `i18n OK`。

- [ ] **Step 5: 键对齐校验**

Run（在 `d:\zhao\vshop\web-admin` 下）：
```bash
node -e "const z=require('./src/locale/zh-Hans.json'),e=require('./src/locale/en.json');const k=Object.keys(z.decorateTheme).filter(x=>!(x in e.decorateTheme));console.log(k.length?('missing in en: '+k.join(',')):'decorateTheme aligned')"
```
Expected: 输出 `decorateTheme aligned`。

---

## Task 11: 模板库 / 全局配置结构化表单（G2）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\global-config\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages\platform\templates\index.vue`

### 11.1 全局配置：defaults 结构化

- [ ] **Step 1: 页面选择 + 版式分段器替代裸 JSON**

在 `global-config/index.vue` 的 `defaultsTitle` 之后、`<textarea>` 之前插入结构化区（JSON textarea 折叠保留为逃生口）：

```vue
      <view class="img-title">{{ $t('platformGlobalConfig.pageSection') }}</view>
      <view class="chips">
        <text
          v-for="p in PAGE_OPTS"
          :key="p.key"
          class="chip"
          :class="{ on: curPage === p.key }"
          @tap="curPage = p.key"
        >{{ p.label }}</text>
      </view>
      <view v-if="curPage === 'product'" class="field">
        <text class="label">{{ $t('platformGlobalConfig.layoutLabel') }}</text>
        <view class="chips">
          <text
            v-for="l in LAYOUT_OPTS"
            :key="l.key"
            class="chip"
            :class="{ on: defLayout === l.key }"
            @tap="setLayout(l.key)"
          >{{ l.label }}</text>
        </view>
      </view>
      <view class="field">
        <text class="label">{{ $t('platformGlobalConfig.blocksLabel') }}</text>
        <view class="blk" v-for="b in BLOCK_OPTS" :key="b.key">
          <text class="blk-name">{{ b.label }}</text>
          <switch :checked="isBlockOn(b.key)" color="#4f8cff" @change="toggleBlock(b.key, $event.detail.value)" />
        </view>
      </view>
      <view class="field">
        <text class="label" @tap="jsonOpen = !jsonOpen">
          {{ jsonOpen ? $t('platformGlobalConfig.jsonCollapse') : $t('platformGlobalConfig.jsonExpand') }}
        </text>
        <textarea v-if="jsonOpen" class="ta tall" v-model="defaultsJson" @blur="syncFromJson" />
      </view>
```

- [ ] **Step 2: 脚本：常量与双向同步**

在 `global-config/index.vue` 的 `<script setup>` 中，`APP_OPTS` 之后加：

```ts
const PAGE_OPTS = [
  { key: 'product', label: '商品详情' },
  { key: 'home', label: '首页' },
  { key: 'category', label: '分类' },
  { key: 'cart', label: '购物车' },
  { key: 'profile', label: '我的' },
] as const;

const LAYOUT_OPTS = [
  { key: 'classic', label: '经典' },
  { key: 'floor', label: '楼层' },
  { key: 'dualBuy', label: '双通道' },
] as const;

/** 与详情装修页块清单保持一致（ProductDetailRenderer 的块 key） */
const BLOCK_OPTS = [
  { key: 'gallery', label: '主图' },
  { key: 'price', label: '价格' },
  { key: 'promo', label: '促销' },
  { key: 'service', label: '服务' },
  { key: 'params', label: '参数' },
  { key: 'reviews', label: '评价' },
  { key: 'description', label: '详情' },
] as const;

const curPage = ref<'product' | 'home' | 'category' | 'cart' | 'profile'>('product');
const jsonOpen = ref(false);
const defs = ref<Record<string, any>>({});

const defLayout = computed(() => defs.value.product?.layout ?? 'classic');

function isBlockOn(key: string): boolean {
  const b = defs.value.product?.blocks?.[key];
  return b?.show !== false;
}

function toggleBlock(key: string, on: boolean) {
  defs.value.product = defs.value.product ?? {};
  defs.value.product.blocks = defs.value.product.blocks ?? {};
  defs.value.product.blocks[key] = { ...(defs.value.product.blocks[key] ?? {}), show: on };
  syncToJson();
}

function setLayout(key: string) {
  defs.value.product = defs.value.product ?? {};
  defs.value.product.layout = key;
  syncToJson();
}

function syncToJson() {
  defaultsJson.value = JSON.stringify(defs.value, null, 2);
}

/** 逃生口：JSON 手改后合并回表单（以表单为准，冲突时表单值胜出） */
function syncFromJson() {
  const text = defaultsJson.value.trim();
  if (!text) return;
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) defs.value = v;
  } catch {
    /* 坏 JSON 保持表单值不变，保存时由 save() 统一报错 */
  }
}
```

`load()` 末尾加 `syncToJson()`，并在解析成功后同步 `defs`：

```ts
    defs.value = cfg?.defaults && typeof cfg.defaults === 'object' ? cfg.defaults : {};
    defaultsJson.value = JSON.stringify(defs.value, null, 2);
```

`save()` 内把 `defaults` 取值改为**以表单为准**：

```ts
    const defaults = { ...defs.value };
```
（保留原 JSON 解析校验作为逃生口校验：若 `jsonOpen` 为真且 JSON 非法，仍走原 `invalidDefaults` 报错分支。）

- [ ] **Step 3: 样式补充**

在 `global-config/index.vue` 样式中加：

```scss
.blk { display: flex; align-items: center; justify-content: space-between; padding: 16rpx 0; border-bottom: 1px solid #f2f2f2; }
.blk-name { font-size: 26rpx; color: #333; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.field { margin-bottom: 24rpx; }
```

### 11.2 模板库：theme / pages 结构化

- [ ] **Step 4: 配色方案下拉 + 令牌三项**

在 `templates/index.vue` 的 `themeLabel` field 之前插入：

```vue
          <view class="field">
            <text class="label">{{ $t('platformTemplates.paletteLabel') }}</text>
            <view class="chips">
              <text class="chip" :class="{ on: !paletteScheme }" @tap="pickPalette('')">{{ $t('platformTemplates.paletteNone') }}</text>
              <text
                v-for="(def, key) in paletteList"
                :key="key"
                class="chip"
                :class="{ on: paletteScheme === key }"
                @tap="pickPalette(String(key))"
              >{{ def.name }}</text>
            </view>
          </view>
          <view class="field"><text class="label">{{ $t('platformTemplates.primaryLabel') }}</text><input class="input" v-model="themeTokens.primaryColor" placeholder="#ff6600" @blur="syncThemeJson" /></view>
          <view class="field"><text class="label">{{ $t('platformTemplates.accentLabel') }}</text><input class="input" v-model="themeTokens.accentColor" placeholder="#fff3e6" @blur="syncThemeJson" /></view>
          <view class="field"><text class="label">{{ $t('platformTemplates.radiusLabel') }}</text><input class="input" v-model="themeTokens.radius" type="number" placeholder="8" @blur="syncThemeJson" /></view>
```

- [ ] **Step 5: pages 页面分段器 + 版式 + 块显隐**

在 `pagesLabel` field 之前插入：

```vue
          <view class="field">
            <text class="label">{{ $t('platformTemplates.pagesPick') }}</text>
            <view class="chips">
              <text
                v-for="p in PAGE_OPTS"
                :key="p.key"
                class="chip"
                :class="{ on: curPage === p.key }"
                @tap="curPage = p.key"
              >{{ p.label }}</text>
            </view>
          </view>
          <view v-if="curPage === 'product'" class="field">
            <text class="label">{{ $t('platformTemplates.layoutLabel') }}</text>
            <view class="chips">
              <text
                v-for="l in LAYOUT_OPTS"
                :key="l.key"
                class="chip"
                :class="{ on: pagesObj.product?.layout === l.key }"
                @tap="setPageLayout(l.key)"
              >{{ l.label }}</text>
            </view>
          </view>
          <view class="field" v-if="curPage === 'product'">
            <text class="label">{{ $t('platformTemplates.blocksLabel') }}</text>
            <view class="blk" v-for="b in BLOCK_OPTS" :key="b.key">
              <text class="blk-name">{{ b.label }}</text>
              <switch :checked="pagesObj.product?.blocks?.[b.key]?.show !== false" color="#4f8cff" @change="togglePageBlock(b.key, $event.detail.value)" />
            </view>
          </view>
```

- [ ] **Step 6: 脚本：状态与双向同步**

`templates/index.vue` `<script setup>` 内加：

```ts
const PAGE_OPTS = [
  { key: 'product', label: '商品详情' },
  { key: 'home', label: '首页' },
  { key: 'category', label: '分类' },
  { key: 'cart', label: '购物车' },
  { key: 'profile', label: '我的' },
] as const;
const LAYOUT_OPTS = [
  { key: 'classic', label: '经典' },
  { key: 'floor', label: '楼层' },
  { key: 'dualBuy', label: '双通道' },
] as const;
const BLOCK_OPTS = [
  { key: 'gallery', label: '主图' },
  { key: 'price', label: '价格' },
  { key: 'promo', label: '促销' },
  { key: 'service', label: '服务' },
  { key: 'params', label: '参数' },
  { key: 'reviews', label: '评价' },
  { key: 'description', label: '详情' },
] as const;

const paletteList = ref<Record<string, { name: string; tokens: Record<string, any> }>>({});
const paletteScheme = ref('');
const themeTokens = ref<{ primaryColor: string; accentColor: string; radius: string }>({ primaryColor: '', accentColor: '', radius: '' });
const pagesObj = ref<Record<string, any>>({});
const jsonOpenForm = ref(false);

async function loadPalettes() {
  try {
    paletteList.value = await templateApi.palettePresets();
  } catch {
    paletteList.value = {};
  }
}

function pickPalette(scheme: string) {
  paletteScheme.value = scheme;
  const def = scheme ? paletteList.value[scheme] : undefined;
  if (def) {
    themeTokens.value = {
      primaryColor: String(def.tokens.primaryColor ?? ''),
      accentColor: String(def.tokens.accentColor ?? ''),
      radius: String(def.tokens.radius ?? ''),
    };
  }
  syncThemeJson();
}

/** 表单 → JSON 串（theme）：scheme 与显式 token 并存 */
function syncThemeJson() {
  const theme: Record<string, any> = {};
  if (paletteScheme.value) theme.palette = { scheme: paletteScheme.value };
  const p = themeTokens.value.primaryColor.trim();
  const a = themeTokens.value.accentColor.trim();
  const r = themeTokens.value.radius.trim();
  if (p) theme.primaryColor = p;
  if (a) theme.accentColor = a;
  if (r) theme.radius = Number(r);
  form.value.themeJson = JSON.stringify(theme, null, 2);
}

/** JSON 串 → 表单（打开弹层时调用；冲突时以表单为准） */
function fillThemeForm(theme: Record<string, any> | null) {
  const t = theme ?? {};
  paletteScheme.value = (t.palette?.scheme as string) ?? '';
  themeTokens.value = {
    primaryColor: (t.primaryColor as string) ?? '',
    accentColor: (t.accentColor as string) ?? '',
    radius: t.radius !== undefined ? String(t.radius) : '',
  };
}

function fillPagesForm(pages: Record<string, any> | null) {
  pagesObj.value = pages && typeof pages === 'object' ? JSON.parse(JSON.stringify(pages)) : {};
}

function setPageLayout(key: string) {
  pagesObj.value.product = pagesObj.value.product ?? {};
  pagesObj.value.product.layout = key;
  syncPagesJson();
}

function togglePageBlock(key: string, on: boolean) {
  pagesObj.value.product = pagesObj.value.product ?? {};
  pagesObj.value.product.blocks = pagesObj.value.product.blocks ?? {};
  pagesObj.value.product.blocks[key] = { ...(pagesObj.value.product.blocks[key] ?? {}), show: on };
  syncPagesJson();
}

function syncPagesJson() {
  form.value.pagesJson = JSON.stringify(pagesObj.value, null, 2);
}
```

`onEdit(t)` 里在 `fillForm(t)` 之后补：

```ts
  fillThemeForm(t.theme);
  fillPagesForm(t.pages);
```

`onAdd()` 里在设置完 `form.value` 之后补：

```ts
  fillThemeForm(JSON.parse(form.value.themeJson));
  fillPagesForm(JSON.parse(form.value.pagesJson));
```

`onLoad(load)` 改为：

```ts
onLoad(async () => {
  await loadPalettes();
  await load();
});
```

`submit()` 在 `saving.value = true;` **之前**加「表单为准」的覆盖：

```ts
  syncThemeJson();
  syncPagesJson();
```

（即：保存时以结构化表单渲染出的 JSON 为准，手改 textarea 的差异被覆盖——符合「冲突时以表单为准并提示」；提示用内联校验错误呈现。）

- [ ] **Step 7: 修正 overrides 占位示例（多一层 `theme` 的错误层级）**

`templates/index.vue` 合并预览 Tab 的 textarea 占位改为扁平键：

```vue
            <textarea class="ta" v-model="overridesJson" placeholder='{"primaryColor":"#123456","product":{"layout":"list"}}' />
```

- [ ] **Step 8: i18n 补齐两页新增键**

`zh-Hans.json`：

`platformGlobalConfig` 增：`pageSection` = `各页默认配置（L0 兜底）`、`layoutLabel` = `商品详情版式`、`blocksLabel` = `功能块显隐`、`jsonExpand` = `展开 JSON 高级编辑`、`jsonCollapse` = `收起 JSON 高级编辑`。

`platformTemplates` 增：`paletteLabel` = `配色方案`、`paletteNone` = `不指定（用显式令牌）`、`primaryLabel` = `主色 primaryColor`、`accentLabel` = `辅色 accentColor`、`radiusLabel` = `圆角 radius`、`pagesPick` = `页面选择`、`layoutLabel` = `商品详情版式`、`blocksLabel` = `功能块显隐`。

`en.json` 同步同名键：`pageSection` = `Per-page defaults (L0 fallback)`、`layoutLabel` = `Product detail layout`、`blocksLabel` = `Block visibility`、`jsonExpand` = `Show raw JSON editor`、`jsonCollapse` = `Hide raw JSON editor`；`paletteLabel` = `Palette`、`paletteNone` = `None (explicit tokens)`、`primaryLabel` = `Primary color`、`accentLabel` = `Accent color`、`radiusLabel` = `Radius`、`pagesPick` = `Page`、`layoutLabel` = `Product detail layout`、`blocksLabel` = `Block visibility`。

- [ ] **Step 9: 构建**

Run（在 `d:\zhao\vshop\web-admin` 下）：
```bash
pnpm build:h5
```
Expected: 构建成功。

---

## Task 12: 端到端验收（含手机视口截图）

**Files:**
- Create（截图）: `d:\zhao\vshop\web-admin\src\static\manual\shots\`
- Modify: `d:\zhao\vshop\web-admin\docs\theme-admin-manual\theme-admin-manual.html`

- [ ] **Step 1: 启动本地服务**

Run（在 `d:\zhao\vshop\web-admin` 下，后台运行）：
```bash
pnpm dev:h5
```
Expected: 本地端口可访问（记录实际端口，下文以 `<WA>` 代替）。

- [ ] **Step 2: 逐条走 §7 验收标准（手机视口 390×844、dpr=2）**

用 Playwright 移动视口（`viewport: {width:390,height:844}, deviceScaleFactor:2`）逐条截图：

1. 主题页选模板 → C 端首帧即变（nshop、vshop 各一张）。
2. 主题页改 L3 令牌主色 → C 端首帧主色变化，且摘要卡来源徽标显示 `L3`。
3. 选「不引用模板」→ 回退 L1，不空白、不错色。
4. 引用被停用 / 跨 app 的模板 → 仍回退 L1。
5. 存量 `themeId` 渠道：迁移前行为不回归；执行一键迁移后 `themeId` 清空、令牌生效。
6. 模板库与全局配置：不改任何 JSON 即可完成「建模板 → 选配色 → 选版式 → 保存 → 预览」。
7. 店铺信息页不再出现模板选择；两页不再互相覆盖 `templateId`。

截图命名：`theme-unify-01-<描述>.png` … `theme-unify-07-<描述>.png`，存入 `src/static/manual/shots/`。

- [ ] **Step 3: 手册补章节**

在 `docs/theme-admin-manual/theme-admin-manual.html` 追加一节 `<section id="theme-unify">`，包含：L3 令牌层说明、主题页 6 段结构说明、旧 `themeId` 迁移步骤、模板库/全局配置结构化表单操作步骤、上述截图（沿用文件内既有 `figure.diagram.phone` 样式）、以及「五级回退链 L0→L4」速查表。同时在 `src/static/manual/index.html` 的目录里加该节入口。

- [ ] **Step 4: 回归 e2e**

Run（web-admin 既有 e2e 脚本，若仓库有 `scripts/` 下的 e2e 入口则按既有惯例执行）：
```bash
node scripts/e2e-theme.mjs
```
Expected: 全绿；若无该脚本，则以 Step 2 的 7 条手工验收 + 截图作为回归证据，并在手册中记录。

---

## Task 13: 部署

- [ ] **Step 1: 后续端（vendure + shop-template-plugin）**

```bash
# 本地（已在 Task 2/3 构建过 lib/）
git add vendure/packages/shop-template-plugin
git commit -m "feat(shop-template): L3 令牌字段 + palette 预设 + 预览修正"
git push
```
服务器：
```bash
cd <vendure 目录> && git pull && pm2 restart <vendure 进程名>
```
Expected: 启动日志出现 `ShopTemplatePlugin initialized`，无 schema 报错。

- [ ] **Step 2: C 端（nshop / vshop）**

本地构建后按各自仓库既有方式发布静态产物（nshop 走 `pnpm deploy`，vshop 走本地构建 + 上传静态目录）。**禁止服务器构建。**

- [ ] **Step 3: web-admin**

Run（在 `d:\zhao\vshop\web-admin` 下）：
```bash
pnpm build:h5
node scripts/deploy.mjs
```
Expected: 部署成功；线上 `/guanli` 主题页为版式 A。

- [ ] **Step 4: 速查卡同步**

在 `nshop/docs/domains/shop-style-theme.md` 补充：L3 令牌层 `themeTokensOverride`、主题页为唯一风格入口、`themeId` 只读兼容与迁移、后端 `palettePresets` 权威副本与三处同步提示。

---

## 自审记录（写完计划后自查）

**1. Spec 覆盖**

| Spec 章节 | 对应 Task |
|---|---|
| §3.1 新增 L3 令牌层 `themeTokensOverride` | Task 3（后端字段）、Task 6（web-admin 读写） |
| §3.2 合并链改造（nshop / vshop 增 L3、vshop 补 palette 展开） | Task 4、Task 5 |
| §3.3 `themeId` 存量兼容 + 一键迁移 | Task 7（映射表）、Task 8（提示条与迁移动作） |
| §4.1 主题页版式 A（6 段 + 保存语义） | Task 8 |
| §4.2 店铺信息页移除模板分区 + 跳转 | Task 9 |
| §4.3 模板库 / 全局配置结构化表单 + JSON 兜底 + 内联校验 | Task 11 |
| §5 预览链路修正（预设表 / `palettePresets` / 展开 palette / 修正 overrides 占位） | Task 1、Task 2、Task 3、Task 11 Step 7 |
| §6 权限与 i18n | Task 3（复用 `ShopTemplatesRead`，无新增权限）、Task 10、Task 11 Step 8 |
| §7 验收标准 7 条 | Task 12 |
| §9 交付与部署 + 手册 + 截图 | Task 12、Task 13 |

补充修正（自查发现，已纳入计划）：
- 原 `mergePreview` 的 `sourceByKey` **层级倒置**（先写 L3→L2→L1，最后写的 L1 反而胜出），与「上一级覆盖下一级」矛盾 → Task 2 已改为 L1→L2→L3 顺序。
- Task 9 删除了 shop-info 保存时的 `payload.templateId`，这是「两页互相覆盖」的直接病灶。

**2. 占位扫描**：无 TBD / TODO / 「类似 Task N」；每个改动步骤均给出可粘贴代码与可执行命令。Task 9 Step 3 的跳转路径给了「用 Grep 确认真实路径」的明确指令（因该路径未在读过的文件中出现），Task 12 Step 4 的 e2e 给了「无脚本时以 7 条手工验收为准」的兜底。

**3. 类型与命名一致性**：`themeTokensOverride`（渠道字段 / 接口字段 / parse 函数名）、`parseThemeTokensOverride`、`resolvePaletteTokens`、`mergeThemeTokens(globalConfig, template, channelThemeOverride?)` 在 Task 2/4/5/6 中签名一致；`PALETTE_PRESETS` 三处同名；`buildThemeIdMigration` / `isLegacyThemeId` 在 Task 7 定义、Task 8 使用一致。