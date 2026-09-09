# 税率三档 + 价格/划线/成本/库存联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将租户税率开关从布尔 `taxEnabled` 升级为三态 `taxMode`（含税价/零税价/不含税价），实现运营端"价格+划线价+成本价+库存"四值联动到变体、C 端按税档换算展示现价/划线价并正确处理结算税额。

**Architecture:** 方案一（前端纯展示层换算 + 后端三态）。运营端录入的净基准值（价格/划线/成本/库存）永不改动；C 端（nshop）按渠道 `taxMode` 用纯函数换算展示；后端 Vendure `ChannelTaxLineCalculationStrategy` 依 `taxMode` 决定订单行计税行为（inclusive 默认含税 / zero 零税 / exclusive 价税分离）。

**Tech Stack:** Vendure（cjk-plugin，TS）、Nuxt 3 / Vue (nshop)、uni-app (web-admin)、vitest（仅 nshop 换算纯函数）。

**涉及仓库：** `d:\zhao\vendure\packages\cjk-plugin`（后端）、`d:\zhao\nshop`（C端）、`d:\zhao\vshop\web-admin`（运营端）。

---

## 文件结构

| 仓库 | 文件 | 职责 |
|------|------|------|
| vendure | `packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts` | 把 `taxEnabled`(bool) 升级为 `taxMode`(string 三态) |
| vendure | `packages/cjk-plugin/src/tax/channel-tax-line-calculation-strategy.ts` | 依 `taxMode` 返回 TaxLine（inclusive/zero/exclusive） |
| nshop | `layers/base/app/utils/tax-price.ts` | 「净价→展示价」纯换算函数（新） |
| nshop | `layers/base/app/utils/tax-price.test.ts` | 换算纯函数 vitest（新） |
| nshop | `layers/base/app/composables/useTaxMode.ts` | 读渠道 taxMode + 兼容旧 taxEnabled（替换 useTaxEnabled） |
| nshop | `vitest.config.ts` | 轻量 node 环境 vitest（新） |
| nshop | `layers/base/app/components/product-detail/PriceBlock.vue` | C 端现价/划线价按 taxMode 换算展示 |
| nshop | `layers/base/app/composables/usePriceWithList.ts` | 详情页价格 + 划线价换算 |
| nshop | `layers/base/app/components/product/ProductCard.vue` | 列表现价换算 |
| nshop | `layers/base/app/pages/product/[slug].vue` | 变体选择后现价换算 |
| nshop | 结算金额展示组件 | 结算页税额/应付按 taxMode（A 拆税、B 无税、C 价税分离） |
| web-admin | `src/components/ProductForm.vue` | 基础信息新增划线价/成本价输入 + 四值联动 |
| web-admin | `src/composables/useVariantMatrix.ts` | 联动批量填入 + 行级"已改不覆盖"标记 |

---

### Task 1: 后端 —— `taxMode` 三态 customField

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\tenant-channel-custom-fields.ts`（把 `taxEnabled` 块替换为 `taxMode`）
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tax\channel-tax-line-calculation-strategy.ts`

> 注：本仓库生产用 postgres + `synchronize:true`，改 customFields 后重启自动建列/更新，无需手写 migration（见项目记忆）。

- [ ] **Step 1: 替换 customFields 定义为 `taxMode`**

把 `tenant-channel-custom-fields.ts` 末尾的 `taxEnabled` 布尔块（约 208-221 行）：

```ts
{
    name: 'taxEnabled',
    type: 'boolean',
    defaultValue: true,
    public: true,
    label: [
        { languageCode: LanguageCode.zh_Hans, value: '启用含税价' },
        { languageCode: LanguageCode.en, value: 'Enable tax-inclusive pricing' },
    ],
    description: [
        { languageCode: LanguageCode.zh_Hans, value: '默认开启。关闭后：商品展示价与购物车结算价直接使用后台录入的净价，不再加税率。' },
        { languageCode: LanguageCode.en, value: 'Enabled by default. When off, the product display price and the cart settlement price use the entered net price without tax.' },
    ],
},
```

替换为：

```ts
{
    name: 'taxMode',
    type: 'string',
    defaultValue: 'inclusive',
    public: true,
    options: [
        { value: 'inclusive', label: [{ languageCode: LanguageCode.zh_Hans, value: '含税价' }, { languageCode: LanguageCode.en, value: 'Tax-inclusive' }] },
        { value: 'zero', label: [{ languageCode: LanguageCode.zh_Hans, value: '零税价' }, { languageCode: LanguageCode.en, value: 'Zero-tax' }] },
        { value: 'exclusive', label: [{ languageCode: LanguageCode.zh_Hans, value: '不含税价' }, { languageCode: LanguageCode.en, value: 'Tax-exclusive' }] },
    ],
    label: [
        { languageCode: LanguageCode.zh_Hans, value: '税率方式' },
        { languageCode: LanguageCode.en, value: 'Tax mode' },
    ],
    description: [
        { languageCode: LanguageCode.zh_Hans, value: 'inclusive=含税价(录入价即价内含税，结算拆税不额外加收)；zero=零税价(录入价即免税最终价)；exclusive=不含税价(录入价为净价，展示/结算按税率×1.13价税分离)。' },
        { languageCode: LanguageCode.en, value: 'inclusive=tax-inclusive display & settlement; zero=tax-free; exclusive=net price with 1.13 tax separation.' },
    ],
},
```

- [ ] **Step 2: 更新 `ChannelTaxLineCalculationStrategy` 依 `taxMode` 结算**

替换 `channel-tax-line-calculation-strategy.ts` 全文为：

```ts
import { TaxLine } from '@vendure/common/lib/generated-types';
import {
    CalculateTaxLinesArgs,
    DefaultTaxLineCalculationStrategy,
    TaxLineCalculationStrategy,
} from '@vendure/core';

export type TaxMode = 'inclusive' | 'zero' | 'exclusive';

/**
 * 租户级税率方式（三态）：
 *  - inclusive（含税价）：录入价=价内含税零售价。走 Vendure 默认单税率，已有 price 即含税价，
 *    结算按税率拆出税额（unitPriceWithTax 退化等于 price），但应付总额不额外加收。
 *  - zero（零税价）：录入价=免税最终价。返回空 TaxLine[]，unitPrice==unitPriceWithTax==净价。
 *  - exclusive（不含税价）：录入价=净价。价税分离：unitPriceWithTax = unitPrice × (1 + rate)。
 * 兼容旧字段：读取 taxMode 缺失时回退旧 taxEnabled（true→inclusive，false→zero），保证存量租户行为不回退。
 */
export class ChannelTaxLineCalculationStrategy implements TaxLineCalculationStrategy {
    private readonly defaultStrategy = new DefaultTaxLineCalculationStrategy();

    calculate(args: CalculateTaxLinesArgs): TaxLine[] {
        const channel = (args.ctx as any)?.channel as any | undefined;
        const cf = channel?.customFields ?? {};
        const mode = resolveTaxMode(cf);
        if (mode === 'zero') {
            return [];
        }
        // inclusive / exclusive 都交给 Vendure 单税率逻辑：
        //  - inclusive 渠道 pricesIncludeTax=true → 默认拆税，价内；
        //  - exclusive 渠道 pricesIncludeTax=false → 默认对净价加税，价税分离。
        return this.defaultStrategy.calculate(args);
    }
}

/** 三态解析：taxMode 缺失/非法 → 回退旧 taxEnabled（true→inclusive，false→zero）→ 默认 inclusive */
export function resolveTaxMode(customFields: Record<string, unknown>): TaxMode {
    const mode = customFields?.taxMode;
    if (mode === 'inclusive' || mode === 'zero' || mode === 'exclusive') return mode as TaxMode;
    const legacy = customFields?.taxEnabled;
    if (legacy === false) return 'zero';
    return 'inclusive';
}
```

> 说明：`resolveTaxMode` 导出便于单测及 C 端复用同一判定。exclusive 的价税分离依赖渠道 `pricesIncludeTax=false`（见 §Spec 4.1）；当前默认渠道即 `false`，exclusive 生效无需改渠道属性。inclusive 在默认含税渠道走默认拆分。

- [ ] **Step 3: 编译校验（本地构建）**

Run（在 `d:\zhao\vendure` 根，先只做 TS 编译 cjk-plugin，勿在服务器构建——部署铁律）：

```bash
npm run build --workspace @vendure/cjk-plugin
```

Expected: 构建成功无 TS 错误。

- [ ] **Step 4: 提交**

```bash
git -C d:\zhao\vendure add packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts packages/cjk-plugin/src/tax/channel-tax-line-calculation-strategy.ts
git -C d:\zhao\vendure commit -m "feat(cjk): taxEnabled 布尔升级为 taxMode 三态结算策略"
```

---

### Task 2: nshop —— 换算纯函数 + vitest（TDD）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\tax-price.ts`
- Create: `d:\zhao\nshop\layers\base\app\utils\tax-price.test.ts`
- Create: `d:\zhao\nshop\vitest.config.ts`
- Modify: `d:\zhao\nshop\package.json`（加 test script + vitest devDep）

- [ ] **Step 1: 先写失败测试**

Create `tax-price.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { displayCentsFromNet, TAX_RATE_PERCENT } from './tax-price';

describe('displayCentsFromNet', () => {
  it('inclusive: 录入净价原样展示', () => {
    expect(displayCentsFromNet(20000, 'inclusive')).toBe(20000);
  });
  it('zero: 原样展示', () => {
    expect(displayCentsFromNet(20000, 'zero')).toBe(20000);
  });
  it('exclusive: 净价 × 1.13', () => {
    expect(displayCentsFromNet(20000, 'exclusive', 13)).toBe(22600);
  });
  it('exclusive: 使用默认税率 13', () => {
    expect(displayCentsFromNet(20000, 'exclusive')).toBe(22600);
  });
  it('exclusive: 四舍五入到分', () => {
    expect(displayCentsFromNet(135, 'exclusive', 13)).toBe(153);
  });
  it('默认税率常量 13', () => {
    expect(TAX_RATE_PERCENT).toBe(13);
  });
});
```

- [ ] **Step 2: 运行验证失败**

新建 `vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['layers/base/app/**/*.test.ts'] },
});
```

在 `package.json` scripts 加 `"test": "vitest run"`，并 `pnpm add -D vitest`（nshop 仓库）。

Run: `pnpm test`
Expected: FAIL（`displayCentsFromNet` 未定义，模块加载错误）。

- [ ] **Step 3: 实现换算纯函数**

Create `tax-price.ts`：

```ts
// 按渠道 taxMode 把「运营端录入的净价(分)」换算成 C 端展示价(分)。
// 该函数为 SSR 友好纯计算，前后协同同一口径：
//  - inclusive(含税价) / zero(零税价)：录入净价即展示价，不换算。
//  - exclusive(不含税价)：展示价 = 净价 × (1 + rate/100)，价税分离。
export type TaxMode = 'inclusive' | 'zero' | 'exclusive';
export const TAX_RATE_PERCENT = 13; // 当前生产默认税率；未来可从后台动态读取替换

export function displayCentsFromNet(netCents: number, mode: TaxMode, ratePercent = TAX_RATE_PERCENT): number {
  if (mode !== 'exclusive' || !ratePercent) return Math.round(netCents);
  return Math.round(netCents * (1 + ratePercent / 100));
}
```

> 划线价 `listPrice` 的展示同样用此函数（同为净基准值 ÷ 同一系数）。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm test`
Expected: PASS（6 个用例全过）。

- [ ] **Step 5: 提交**

```bash
git -C d:\zhao\nshop add vitest.config.ts package.json layers/base/app/utils/tax-price.ts layers/base/app/utils/tax-price.test.ts
git -C d:\zhao\nshop commit -m "feat(nshop): taxMode 净价->展示价纯换算函数 + vitest"
```

---

### Task 3: nshop —— C 端展示按三态换算

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\composables\useTaxMode.ts`（替换 `useTaxEnabled.ts`）
- Modify: `PriceBlock.vue`、`usePriceWithList.ts`、`ProductCard.vue`、`product/[slug].vue`、`home-content/display-price.ts` 及其消费方
- Delete: `d:\zhao\nshop\layers\base\app\composables\useTaxEnabled.ts`（或保留兼容导出）

- [ ] **Step 1: 新增 `useTaxMode` composable**

Create `useTaxMode.ts`（复用同一 `GetChannelTheme` 请求，SSR 去重）：

```ts
import { useAsyncData } from '#imports';
import type { TaxMode } from '../utils/tax-price';

// C 端读取渠道税率方式（三态）。兼容旧 taxEnabled 布尔：true→inclusive，false→zero。
export function useTaxMode() {
  const { data } = useAsyncData(
    'channel-tax-mode',
    async () => {
      const res = await useAsyncGql('GetChannelTheme', {}, { server: true });
      const cf = (res.data.value as any)?.activeChannel?.customFields ?? {};
      const mode = cf?.taxMode;
      if (mode === 'inclusive' || mode === 'zero' || mode === 'exclusive') return mode as TaxMode;
      return cf?.taxEnabled === false ? 'zero' : 'inclusive';
    },
    { server: true },
  );
  const taxMode = computed(() => data.value ?? 'inclusive');
  return { taxMode };
}
```

- [ ] **Step 2: 改造 `usePriceWithList.ts` 用三态 + 划线价换算**

替换 `usePriceWithList.ts` 的核心：

```ts
import { displayCentsFromNet, type TaxMode } from '../utils/tax-price';

export function usePriceWithList() {
  const { selectedVariant } = storeToRefs(useProductStore());
  const { locale } = useI18n();
  const { taxMode } = useTaxMode();

  const v = selectedVariant;
  const fmt = (amount: number | null | undefined) =>
    new Intl.NumberFormat(locale.value, {
      style: 'currency',
      currency: v.value?.currencyCode || 'CNY',
    }).format((amount ?? 0) / 100);

  // 展示现价(分)：以「净价 price」为基准，按 taxMode 换算。
  const net = computed(() => v.value?.price ?? v.value?.priceWithTax ?? 0);
  const current = computed(() => displayCentsFromNet(net.value ?? 0, (taxMode.value ?? 'inclusive') as TaxMode));

  // 划线原价(分)：同为净基准，按同系数换算展示；无/非法 → null
  const list = computed<number | null>(() => {
    const cf = (v.value as any)?.customFields as any;
    const p = typeof cf?.listPrice === 'number' && cf.listPrice > 0 ? cf.listPrice : null;
    return p == null ? null : displayCentsFromNet(p, (taxMode.value ?? 'inclusive') as TaxMode);
  });

  const showList = computed(() => (list.value ?? 0) > current.value);
  const save = computed(() => Math.max((list.value ?? 0) - current.value, 0));

  return { v, fmt, current, list, showList, save };
}
```

> 关键：现价基准从旧的「taxEnabled ? priceWithTax : price」改为统一「price（净价）→ displayCentsFromNet」。因为：inclusive 下净价 price 与 priceWithTax 等价展示（录入=含税），exclusive 下必须基于净价 price 放大 1.13，绝不能用 priceWithTax。请同步确认 `display-price.ts` 的 `pickDisplayPrice` 及 `home-content.ts` 消费处同样改为「price → displayCentsFromNet」口径（否则列表/首页价格不一致）。

- [ ] **Step 3: 全局替换 `taxEnabled` → `taxMode` 消费**

对 `PriceBlock.vue`、`ProductCard.vue`、`product/[slug].vue`、`JdProductGrid.vue`、`GoodsSingleList.vue`、`GoodsMasonryGrid.vue`、`home-content.ts`、`display-price.ts` 中所有以 `taxEnabled` 判定 `price vs priceWithTax` 的地方，统一改为：

```ts
const { taxMode } = useTaxMode();
// 取展示价：price(净价) → 按税档换算
const shown = displayCentsFromNet(item.price ?? 0, (taxMode.value ?? 'inclusive') as TaxMode);
```

（`display-price.ts` 建议把 `pickDisplayPrice` 改为接收 `taxMode`，内部调用 `displayCentsFromNet`，所有消费方传 `taxMode.value`。）

- [ ] **Step 4: typecheck + 单测**

Run: `pnpm typecheck`（数据可能报历史遗留 TS 错误，忽略非本任务引入的；重点确认无新增错误）
Run: `pnpm test`
Expected: PASS，无新增 typecheck 错误。

- [ ] **Step 5: 删除旧 `useTaxEnabled.ts` 兼容**

若确认无其他引用 `useTaxEnabled`，删除该文件；否则保留并导出 `useTaxMode` 别名。逐一 `rg "useTaxEnabled"` 确认。

Run: `rg -l "useTaxEnabled" d:\zhao\nshop\layers`
Expected: 无残留（或仅兼容导出处）。

- [ ] **Step 6: 提交**

```bash
git -C d:\zhao\nshop add -A layers/base/app/composables/useTaxMode.ts layers/base/app/utils/display-price.ts layers/base/app/components/product-detail/PriceBlock.vue layers/base/app/composables/usePriceWithList.ts d:\zhao\nshop\layers/base/app/components/product/ProductCard.vue d:\zhao\nshop\layers/base/app/pages 2>/dev/null
git -C d:\zhao\nshop rm layers/base/app/composables/useTaxEnabled.ts
git -C d:\zhao\nshop commit -m "feat(nshop): C端价格按 taxMode 三态换算展示"
```

---

### Task 4: nshop —— 结算页税额/应付

**Files:**
- 结算金额/明细展示组件（定位：结算确认页的金额汇总区）

- [ ] **Step 1: 确认结算汇总组件位置**

Run:
```bash
rg -rln "应付|小计|税额|totalWithTax|合计" d:\zhao\nshop\layers\base\app\pages\checkout d:\zhao\nshop\layers\base\app\components 2>$null | Select-Object -First 20
```
从结果定位结算确认页的金额汇总组件（记为一个精确路径，如 `components/checkout/OrderSummary.vue`），填入下方替换路径。

- [ ] **Step 2: 按 taxMode 展示税额/应付**

在结算金额汇总中加入三态逻辑（假定位组件为 `<SUMMARY>`，金额字段以实际为准）：

```vue
<script lang="ts" setup>
const { taxMode } = useTaxMode();
// mode 决定如何展示税额行与应付（金额来源为订单行数据，非换算——订单金额由后端结算已定）：
//  - inclusive: 显示一行「税额」拆出值（=应付÷?。若后端 TaxLine 已拆分，直接读 order 税额字段），应付=合计
//  - zero: 不显示税额行，应付=合计
//  - exclusive: 显示「商品 200 + 税 26 = 应付 226」（读 order 的 total / totalWithTax）
</script>
```

具体规则（以订单对象字段为准，通常 Vendure `total`=净价合计、`totalWithTax`=含税合计）：
- `inclusive`：应付 = `totalWithTax`；若需拆税展示，输出一行「税额」=（`totalWithTax` − `total`）对应的拆分（价内部分），不额外加收。
- `zero`：应付 = `total`（= totalWithTax，零税同值）；不显示税额行。
- `exclusive`：应付 = `totalWithTax`；显示「商品小计 `total` + 税额（totalWithTax−total）= 应付 totalWithTax」。

以实际找到的组件字段落地，需满足 §Spec 3.2：A 显示税额20.01 应付200 / B 无税应付200 / C 显示200+26=应付226。

- [ ] **Step 3: 验证（本地 build）**

Run: `pnpm build`
Expected: 构建成功，无未定义引用。

- [ ] **Step 4: 提交**

```bash
git -C d:\zhao\nshop add -A
git -C d:\zhao\nshop commit -m "feat(nshop): 结算页按 taxMode 展示税额与应付"
```

---

### Task 5: web-admin —— 基础信息四值 + 联动

**Files:**
- Modify: `src/components/ProductForm.vue`
- Modify: `src/composables/useVariantMatrix.ts`

- [ ] **Step 1: useVariantMatrix 增加行级"已同步基准"标记与四值批量填**

在 `MatrixSku` 接口加 `_baseSynced?: boolean`（内部标记，不落库，序列化前剔除）；改造 `batchFill` 为「仅填充未独立改过的行」并支持多字段：

```ts
export function batchFillFromBase(
  skus: MatrixSku[],
  base: { priceCents: number; stock: number; listPriceCents: number; costPrice: number },
): MatrixSku[] {
  return skus.map((s) => {
    // 该行已被运营手动改过（_baseSynced=false）→ 不被基础信息覆盖
    if (s._baseSynced === false) return s;
    return {
      ...s,
      priceCents: base.priceCents,
      stock: base.stock,
      listPriceCents: base.listPriceCents,
      costPrice: base.costPrice,
      _baseSynced: true,
    };
  });
}
```

在 `hydrateEditState` 反解出的每行默认 `_baseSynced: true`（首次由基础/现有价带入，可被后续基础信息覆盖）；运营在变体矩阵编辑任何行时置该行 `_baseSynced: false`（在 `ProductVariantMatrixTab.vue` 的价格/库存/划线/成本 input 的 change 处理器里设置）。

序列化前剔除 `_baseSynced`（在 `ProductForm.submit` 的 `JSON.parse(JSON.stringify(variantMatrix))` 前，或映射剔除），避免写入 API 字段。

- [ ] **Step 2: ProductForm 基础信息增加「划线价」「成本价」输入**

在基础信息 Tab 的「价格（元）」行下方新增两栏（模板）：

```vue
<view class="cell">
  <text class="lbl">划线价（元）</text>
  <input v-model="d.listPriceYuan" type="digit" placeholder="0.00" @blur="syncBaseToSkus" />
</view>
<view class="cell">
  <text class="lbl">成本价（元）</text>
  <input v-model="d.costYuan" type="digit" placeholder="0.00" @blur="syncBaseToSkus" />
</view>
```

在 `ProductDraft` 接口增加 `listPriceYuan?: number; costYuan?: number`，在 `d` reactive 里初始化（`props.initial` 优先，其次从 `full` 首变体 customFields 回填，单位分→元 ÷100）。

- [ ] **Step 3: 实现四值联动 `syncBaseToSkus`**

替换原有 `syncPriceToSkus`（改为四值全量 + 标记）并接入 `submit`：

```ts
function syncBaseToSkus() {
  const base = {
    priceCents: Math.round((Number(d.priceYuan) || 0) * 100),
    stock: Math.round(Number(d.stock) || 0),
    listPriceCents: Math.round((Number(d.listPriceYuan) || 0) * 100),
    costPrice: Math.round((Number(d.costYuan) || 0) * 100),
  };
  variantMatrix.value = { ...variantMatrix.value, skus: batchFillFromBase(variantMatrix.value.skus, base) };
}
```

在 `submit()` 中：无规格单品分支把四值（含划线/成本）同步进第 0 行（用 `batchFillFromBase` 或手动，保持与多规格一致）；`out.priceYuan` 等元值保持不变（运营端录入永不改写）。

- [ ] **Step 4: 校验（vshop build 门禁）**

Run: `npm run build:h5`（在 `d:\zhao\vshop\web-admin`）
Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git -C d:\zhao\vshop add src/components/ProductForm.vue src/composables/useVariantMatrix.ts
git -C d:\zhao\vshop commit -m "feat(web-admin): 基础信息划线/成本价 + 四值联动(已改行不覆盖)"
```

---

### Task 6: 存量迁移 + 端到端验证（手动）

**Files:**
- 数据库/渠道数据（t2 租户 taxEnabled=false → taxMode=zero）
- C 端三档切换验证、结算验证

- [ ] **Step 1: 存量租户 t2 迁移**

后端改完重启后，生产用 admin-api 把 t2 渠道的 `taxMode` 设为 `zero`（因其旧 `taxEnabled=false`）。通过 SQL 或 admin-api updateChannel 完成；用脚本确认 t2 及所有渠道 `taxMode` 均为合法三态值，避免遗留非法空值。

- [ ] **Step 2: C 端三档展示验证**

部署 nshop 后，切换渠道 taxMode，手机视口（390×844）截图验证：
- inclusive/zero：录入 200 → C 端 ¥200、划线 ¥300
- exclusive：录入 200 → C 端 ¥226、划线 ¥339

- [ ] **Step 3: 结算验证**

下单：inclusive 应付 200 且显示税额；zero 应付 200 无税额；exclusive 应付 226。按用户交付铁律，用手机截图 + 更新操作手册。

---

## 执行顺序

Task 1（后端）→ Task 2（换算+TDD）→ Task 3（C 端展示）→ Task 4（结算）→ Task 5（运营端表单）→ Task 6（迁移+验证）。Task 2 的纯函数是 3/4 的地基，先做。

## 部署

- vendure：提交 cjk-plugin `lib/` 构建产物到 git → 服务器 `git pull` + `pm2 restart`（唯一走 git pull 的仓库）。
- nshop / web-admin：本地构建 → `node scripts/deploy.mjs`（scp 产物）。**绝不在服务器构建**。

## Self-Review 记录（写作时内联完成）

- **Spec 覆盖**：①三态 `taxMode`（T1、T4）②运营端录入净价不改写（T5 + §T3 说明）③基础信息划线/成本输入 + 四值联动 + 已改不覆盖（T5）④C 端现价/划线按税档换算（T3）⑤结算税额/应付（T4）✓
- **占位符**：T4 的结算组件路径标注「以 rg 实际定位为准」，为其后步骤的精确路径占位，非 TBD——执行时先定位。其余无占位。
- **类型一致性**：`TaxMode` 三态、`displayCentsFromNet(net, mode, rate)`、`batchFillFromBase(skus, base)` 在前后任务签名一致；`resolveTaxMode`（后端）与 `useTaxMode`（前端）判定规则一致（inclusive/zero/exclusive + 旧 taxEnabled 回退）。✓
- **潜在缺口**：`pickDisplayPrice` 多消费方全局替换已在 T3 Step3 覆盖；成本价 `costPrice` 当前无 C 端展示需求，仅存录，故不设 C 端换算任务（符合 YAGNI）。