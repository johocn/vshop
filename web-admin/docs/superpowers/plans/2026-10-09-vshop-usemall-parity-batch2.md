# usemall→vshop 批次 2 补齐 实施计划（F17 会员价下单收尾）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收尾 F17 会员价下单：e2e 固化 `tier_discount` Promotion 在 shop-api 下单的生效链路 + web-admin 会员等级/权益配置页 + C 端结账会员折扣行动态化。

**Architecture:** 零全局价格策略改动。事实采集（2026-10-09）证实：等级折扣经 member-level-plugin 的 `tier_discount` PromotionOrderAction（`packages/member-level-plugin/src/tier-discount-action.ts`，execute: `discount = Math.floor((order.subTotalWithTax * rate)/1000)`，注册于 plugin.ts:237-241）在 shop-api 下单已全端生效——checkout.vue 已展示会员折扣行；真正的缺口是①无 e2e 固化 ②web-admin 无等级配置入口（specialDiscountRate 只能手改库）③C 端折扣行文案硬编码。**POS 式 MemberPriceRule（等级×分类规则价）进 shop-api 被明确暂缓**：全局 OrderItemPriceCalculationStrategy 存在 bootstrap 覆盖链（core bootstrap.ts:365-374 按插件顺序 Object.assign，CjkPlugin(377) 已覆盖 dev-config:228 的 Sales 策略，member-level(474) 再注册会覆盖 hotel 逐晚计价），复合兜底风险高、收益低，记录不迁移。

**Tech Stack:** Vendure 3.6.4（member-level-plugin e2e 扩展）+ web-admin uni-app + vshop C 端小改。提交全在 `d:\zhao\vshop` 与 `d:\zhao\vendure` 两仓。

设计依据：[2026-10-09-vshop-usemall-parity-design.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-design.md) ｜ 矩阵：[2026-10-09-vshop-usemall-parity-matrix.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-10-09-vshop-usemall-parity-matrix.md)

---

## 0. 前置事实与执行口径（已一手核实，写代码前不要再猜）

**两仓提交规范**
1. `d:\zhao\vshop`（前端两件）与 `d:\zhao\vendure`（本计划 e2e 改动）。中文 message、临时文件 `git commit -F`（`[IO.File]::WriteAllText($p,$m,[Text.UTF8Encoding]::new($false))`）、PowerShell 5.1 禁止 `&&`、只 add 本 Task 文件。
2. **2026-10-08 教训**：新实体 Date 列一律省略 type（`@Column({ nullable: true })`）或用 `type:'timestamp'`，禁止 `type:'datetime'`。本计划无新实体，仅备忘。
3. vendure 包 e2e 跑前删除缓存：`Remove-Item -Recurse -Force packages\member-level-plugin\e2e\__data__`（存在才删）。

**已核实的 SDL/代码事实**
4. `tier_discount` action（`tier-discount-action.ts:18-29`）：condition `tier-discount-condition.ts:30-39` 返回 `{tierLevel, specialDiscountRate}`（读 customer.customFields.growthValue → MemberTier 表按 channelId 过滤取最大达标档）；execute `discount = Math.floor((order.subTotalWithTax * rate)/1000)` 返回负数。specialDiscountRate=0 的 tier 无折扣（condition 应判 0 不命中——执行时读该文件确认，若未判 0 则 Task 1 e2e 顺带覆盖断言）。
5. member-level-plugin admin SDL（写 Task 2 前必须 Read `packages/member-level-plugin/src/*admin*.ts` 摘出精确 Query/Mutation 与 input 类型，已知 service 方法：`listMemberTiers(877)/saveMemberTiers(837)/getLevelConfig(607)/updateLevelConfig(625)`；Task 5 时点确认存在 admin mutations：`adjustPoints/adjustMemberGrowth/updateLevelConfig/saveTiers`，SDL 名以源码为准）。
6. e2e 模板（`packages/member-level-plugin/e2e/member-level.e2e-spec.ts`）：`registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname,'__data__')))` + `mergeConfig(testConfig(), { plugins: [MemberLevelPlugin.init({})], paymentOptions: { paymentMethodHandlers: [singleStageRefundablePaymentMethod] } })` + `createTestEnvironment(config)`；beforeAll：`server.init({ initialData, productsCsvPath: path.join(__dirname,'../../core/e2e/fixtures/e2e-products-minimal.csv'), customerCount: 1 })` → `adminClient.asSuperAdmin()` → `await shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com','test')`。下单辅助：`../../core/e2e/utils/test-order-utils` 的 `proceedToArrangingPayment`/`addPaymentToOrder`（import 路径以该 e2e 文件实际为准）。断言先例：member-level.e2e-spec.ts:279 `expect(o.subTotalWithTax).toBe(ORIGINAL_PRICE)`。
7. 现有 7 个套件注册了 MemberLevelPlugin，其断言依赖「无规则时原价直通」——本计划不改策略、只加 Promotion 数据，不触碰这些断言；但跑回归确认。
8. C 端 checkout.vue：`memberDiscountYuan` 计算 L468-475 只累加 `order.discounts` 中 `description === MEMBER_TIER_PROMO_NAME`（L448 硬编码 `'金卡及以上专属95折'`，源自 dev-server/china-data/sources.ts:878-887 播种 Promotion 的 name）；展示行 L297。
9. 部署（本批仅前端两件 + vendure e2e 不上生产）：C 端 tar→scp→sudo 解压 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`（批次 1 实操命令）；web-admin `node scripts/deploy.mjs`；vendure 无代码变更不部署。
10. 验证口径：build:h5 双端 0 error；e2e 全绿；手机截图（390×844 dpr=2）入 `web-admin/docs/superpowers/manual/usemall-parity-batch2/`；一气呵成收尾（提交→推送→部署）。

---

## Task 1: e2e 固化 tier_discount 在 shop-api 下单生效

**Files:**
- Create: `d:\zhao\vendure\packages\member-level-plugin\e2e\tier-discount-shop.e2e-spec.ts`
- Modify: `d:\zhao\vendure\packages\member-level-plugin\package.json`（如 e2e script 用 glob 无需改，确认 vitest config 收录新 spec 即可，不改则跳过）

- [ ] **Step 1: 读基准文件**

Read `packages/member-level-plugin/e2e/member-level.e2e-spec.ts` 全文与 `packages/member-level-plugin/src/tier-discount-action.ts`、`tier-discount-condition.ts` 全文。确认：condition 对 specialDiscountRate=0 的处理；Promotion 创建所需 admin mutation 输入形状（`createPromotion`，conditions/actions 以 core SDL 为准，参考 dev-server/china-data/sources.ts:878-887 播种的 tier_discount Promotion 完整输入——直接仿照该播种输入最稳）。

- [ ] **Step 2: 写 e2e spec**

骨架（补全 Step 1 确认的真实输入；断言三件：折扣行存在、totalWithTax 减少、原价路径不破坏）：

```ts
import { mergeConfig } from '@vendure/core';
import { createTestEnvironment, registerInitializer, SqljsInitializer } from '@vendure/testing';
import path from 'path';
import { initialData } from '../../../e2e-common/e2e-initial-data';
import { testConfig, TEST_SETUP_TIMEOUT_MS } from '../../../e2e-common/test-config';
import { singleStageRefundablePaymentMethod } from '../../../core/e2e/fixtures/test-payment-methods';
import { MemberLevelPlugin } from '../lib/index';   // 仿 member-pricing.e2e-spec.ts 用 lib 产物，避免双实例

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')));

describe('tier_discount promotion applies in shop-api checkout', () => {
    const { server, adminClient, shopClient } = createTestEnvironment(
        mergeConfig(testConfig(), {
            plugins: [MemberLevelPlugin.init({})],
            paymentOptions: { paymentMethodHandlers: [singleStageRefundablePaymentMethod] },
        }),
    );

    beforeAll(async () => {
        await server.init({
            initialData,
            productsCsvPath: path.join(__dirname, '../../core/e2e/fixtures/e2e-products-minimal.csv'),
            customerCount: 1,
        });
        await adminClient.asSuperAdmin();
    }, TEST_SETUP_TIMEOUT_MS);

    it('applies tier discount for eligible customer', async () => {
        // 1) 提升种子客户到达标档：adminClient 调 adjustMemberGrowth（SDL 名以 Task 1 Step 1 确认为准）
        //    使 growthValue 落入带 specialDiscountRate>0 的 tier（若无则先用 saveMemberTiers 建档，仿 china-data 播种）
        // 2) adminClient.mutate(createPromotion, 仿 sources.ts:878-887 的 tier_discount 输入，enabled:true)
        // 3) shopClient.asUserWithCredentials('hayden.zieme12@hotmail.com', 'test')
        // 4) 加购（仿 member-level.e2e-spec.ts 的 addItemToOrder helper，取第一个变体）
        // 5) const { activeOrder } = await shopClient.query(GET_ORDER);  // 查询字段含 discounts { description amountWithTax } totalWithTax subTotalWithTax
        //    expect(activeOrder.discounts.length).toBe(1);
        //    expect(activeOrder.discounts[0].amountWithTax).toBeLessThan(0);
        //    expect(activeOrder.totalWithTax).toBe(activeOrder.subTotalWithTax + activeOrder.discounts[0].amountWithTax /* + 运费0 */);
    });

    it('no discount for ineligible customer', async () => {
        // 6) adminClient 把该客户 growthValue 调回 0（adjustMemberGrowth 负值或 adjust API），重查 activeOrder
        // 7) expect(activeOrder.discounts.length).toBe(0); total == subTotal
    });

    afterAll(async () => { await server.destroy(); });
});
```

执行要求：注释里的步骤必须落成真实代码（SDL 字段名以 Step 1 读源码为准；growth 提升若 adjustMemberGrowth 不存在则用 `updateCustomer` customFields 或 service 暴露的 admin mutation）。断言金额计算若含税差异以实际 e2e 环境输出为准调整（先跑一次打印 activeOrder 再定断言是允许的调试步骤）。

- [ ] **Step 3: 跑 e2e**

```powershell
Remove-Item -Recurse -Force d:\zhao\vendure\packages\member-level-plugin\e2e\__data__ -ErrorAction SilentlyContinue
cd d:\zhao\vendure\packages\member-level-plugin; npm run e2e
```
Expected：新 spec 全绿 + 既有 member-level/member-tier spec 不回归。

- [ ] **Step 4: 提交（vendure 仓）**

```powershell
git -C d:\zhao\vendure add packages/member-level-plugin/e2e/tier-discount-shop.e2e-spec.ts packages/member-level-plugin/e2e/__data__ packages/member-level-plugin/package.json
$msg = 'test(member-level): tier_discount 促销在 shop-api 下单生效的 e2e 固化（F17 批次2）'
[IO.File]::WriteAllText("$env:TEMP\cm_b2t1.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vendure commit -F "$env:TEMP\cm_b2t1.txt"
```
（`__data__/*.sqlite` 若被 gitignore 则不 add；以实际 status 为准。）

---

## Task 2: web-admin 会员等级与权益配置页

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\apis\memberLevel.ts`
- Create: `d:\zhao\vshop\web-admin\src\pages\member\level-config\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\pages.json`、`src\constants\menus.ts`（菜单放哪个组：新增「会员」项到 distribution 组（L109-116）或 marketing 组，执行时按组容量与语义定，label key `menu.memberLevel`）、`src\locale\zh-Hans.json` + `en.json`

- [ ] **Step 1: 摘 admin SDL**

Read `d:\zhao\vendure\packages\member-level-plugin\src` 下 admin resolver 文件，摘出：tiers 查询/保存（service `listMemberTiers/saveMemberTiers`）、等级配置（`getLevelConfig/updateLevelConfig`）、会员列表/调整（`findAllMembers/adjustPoints/adjustMemberGrowth`）的精确 SDL 名与 input 类型。以下代码按「字段名以 Step 1 实摘为准」编写。

- [ ] **Step 2: apis/memberLevel.ts**

仿 `src/apis/coupon.ts` 模式（`getAdminClient()` + TS interface + 导出函数 + `graphQlErrorMsg` 错误处理）：

```ts
import { getAdminClient } from './client';

export interface MemberTier { id: string; tierLevel: number; threshold: number; name: string;
    pointsMultiplier: number; redeemDiscountRate: number; redeemCapRatio: number; specialDiscountRate: number; }
export interface LevelConfig { [key: string]: number | string; }

export async function fetchMemberTiers(): Promise<MemberTier[]> { /* query 名以 Step 1 为准，如 memberTiers */ }
export async function saveMemberTiers(tiers: Partial<MemberTier>[]): Promise<boolean> { /* mutation saveMemberTiers(input:[...]) */ }
export async function fetchLevelConfig(): Promise<LevelConfig> { /* levelConfig 查询 */ }
export async function updateLevelConfig(input: LevelConfig): Promise<boolean> { /* updateLevelConfig(input) */ }
```

（四个函数体按 Step 1 的真实 SDL 写全，禁止臆造字段。）

- [ ] **Step 3: 页面 pages/member/level-config/index.vue**

仿 `src/pages/coupon/edit/index.vue` 表单模式：两段——①「等级档位」：卡片列表每档可编辑 name/threshold/specialDiscountRate（千分比，0-1000，placeholder 注明 500=95折）+「新增一档」+ 保存按钮（saveMemberTiers 全量提交）；②「升级配置」：levelConfig 各数值字段（level1-5Threshold/Name 等，以 SDL 为准动态渲染数字/文本输入）+ 保存。保存后 `uni.showToast` + `page.refresh()` 模式（无列表页则直接留在本页）。展示折扣率时换算展示 `(1000-rate)/10 折`（与批次 1 Task 5 口径一致）。

- [ ] **Step 4: 注册+菜单+locale+构建**

pages.json 平铺段加 `{ "path": "pages/member/level-config/index", "style": { "navigationBarTitleText": "会员等级配置" } }`；menus.ts 目标组加 `{ label: 'menu.memberLevel', url: '/pages/member/level-config/index' }`（tier 值仿同组现有项）；zh-Hans.json/en.json 加 `menu.memberLevel`（"会员等级配置"/"Member Levels"）+ 页面通用文案 key（保存/新增等优先复用既有 key）。

```powershell
cd d:\zhao\vshop\web-admin; npm run build:h5
```
Expected：0 error。

- [ ] **Step 5: 提交（vshop 仓）**

```powershell
git -C d:\zhao\vshop add web-admin/src/apis/memberLevel.ts web-admin/src/pages/member web-admin/src/pages.json web-admin/src/constants/menus.ts web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
$msg = 'feat(web-admin): 会员等级/权益配置页（F17 批次2，specialDiscountRate 千分比）'
[IO.File]::WriteAllText("$env:TEMP\cm_b2t2.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b2t2.txt"
```

---

## Task 3: C 端结账会员折扣行动态化

**Files:**
- Modify: `d:\zhao\vshop\src\pkg-order\pages\checkout.vue`（L448 常量、L468-475 计算、L297 展示行）

- [ ] **Step 1: 去硬编码**

把「只累加 description === '金卡及以上专属95折'」改为展示 `order.discounts` 全部行的动态渲染：删除 `MEMBER_TIER_PROMO_NAME` 常量与过滤，`memberDiscountYuan` 改为 `order.discounts.reduce((s, d) => s + Math.abs(d.amountWithTax), 0)`；展示行 L297 文案改 `会员/促销优惠`（或按行渲染 discounts：`v-for` 每行 `{{ d.description }} -¥{{ (Math.abs(d.amountWithTax)/100).toFixed(2) }}`——二选一，推荐逐行动态渲染，能同时兼容未来新增促销类型）。同步修正汇总区「商品总额」与折扣行的语义：商品总额保持 originalSubTotal（不含 promo），折扣行展示省额（现状已如此，只移除硬编码过滤）。

- [ ] **Step 2: 构建验证 + 提交**

```powershell
cd d:\zhao\vshop; npm run build:h5
git -C d:\zhao\vshop add src/pkg-order/pages/checkout.vue
$msg = 'fix(c端): 结账会员/促销折扣行动态展示（去金卡95折硬编码）'
[IO.File]::WriteAllText("$env:TEMP\cm_b2t3.txt", $msg, [Text.UTF8Encoding]::new($false))
git -C d:\zhao\vshop commit -F "$env:TEMP\cm_b2t3.txt"
```
Expected：build 0 error。注意：china-data 播种 Promotion 的 name 建议顺带改为中性名（「会员专属折扣」）——这是 dev-server 播种数据，改了要重播种，**默认不改**，仅在代码注释中说明该 name 仅影响播种演示。

---

## Task 4: 截图、手册与收尾（一气呵成）

- [ ] **Step 1: 截图**（390×844 dpr=2，存 `web-admin/docs/superpowers/manual/usemall-parity-batch2/`）：等级配置页（web-admin serve-h5.mjs + 本地 dev-server）、结账会员折扣行（本地登录种子客户建含 tier_discount 促销的订单）。截图脚本存临时目录不入库。
- [ ] **Step 2: 手册** `usemall-parity-batch2/index.md`：范围表、等级配置操作步骤（含千分比换算说明）、结账折扣展示说明、已知边界（**POS 规则型 MemberPriceRule 不进 shop-api：bootstrap 覆盖链风险，记录暂缓**；specialDiscountRate=0 的档位无折扣）、验证记录（e2e 绿/build 0 error）。
- [ ] **Step 3: 提交手册（vshop 仓）**：`git add web-admin/docs/superpowers/manual/usemall-parity-batch2` + `docs(manual): 批次2 操作手册与截图（F17 会员价收尾）`。
- [ ] **Step 4: 全量回归+构建**：member-level e2e 全绿（含既有 7 套件中注册 MemberLevelPlugin 的 member-level/checkin/vcash-pos member-pricing 代表性套件至少各跑 1）+ 双端 build:h5 0 error。
- [ ] **Step 5: 部署+推送**：C 端 tar→scp→sudo 站点替换（命令同批次 1）→ curl https://e.joho.cn 200；web-admin `node scripts/deploy.mjs`；`git -C d:\zhao\vshop push` + `git -C d:\zhao\vendure push`；汇报（交付/验证/部署结果 + 暂缓项说明）。
