# 配送档案自提点受控（C端仅显已勾选） 设计文档

> 方案标识：任务4 — 以「档案复选框选中即受控」收敛 C 端自提点候选，不做大改。
> 存续：本方案经确认定稿，写入存档待实现。

## 1. 目标与范围

管理后台 `https://e.joho.cn/guanli/#/pages/shipping/profile/index` 的配送档案在「指定自提点」时
默认把全部自提点当作可添加项；需求是**每个配送档案的自提点为一份受控名单**：
未勾选的自提点不参与该档案，C 端结账时**不显示**。编辑时已勾选的自提点默认回选。

**本次交付**
- 明确「受控名单」= 档案在某自提配送方式下勾选的 `options.pickupLocationIds`（rangeMode='selected'）。
- 让 C 端所有「选自提点」入口只展示该档案 `box.pickupLocations`，未勾选点不显示。
- 管理端复选框选择/编辑回选维持现状（已实现）。

**非目标（YAGNI）**
- 不加区域/分组模型；不引入超管分权表；不改后端 `resolveBoxFulfilment`/`getEffectivePickupIdsForConfig` 语义。

## 2. 现状与关键结论（已核）

后端 `vendure/packages/cjk-plugin/src/shipping/shipping-profile.service.ts`：
- `resolveBoxFulfilment`（L391-433）：按档案方法级 `methodConfigs` 计算 `box.pickupLocations`。
- `getEffectivePickupIdsForConfig`（L441-453）：`rangeMode==='all'` → 聚合该类型全部渠道可见启用点；
  否则 → `options.pickupLocationIds` 并**限定该自提类型**。

结论：**「档案勾选的点 = C 端候选」且未勾选点已被排除，本机制后端已存在**（rangeMode='selected' 路径）。

前端 `vshop`/`nshop`：
- 管理端 `web-admin/src/pages/shipping/profile/index.vue`：`onEdit` 用 `cfg.options.pickupLocationIds` 回填
  （`isPickupChecked`），未勾选即不勾选——编辑回选已正确。
- C 端缺口候选：
  - `nshop/layers/base/app/components/checkout/BoxPickupBlock.vue`：用 `box.pickupLocations`（正确域）。
  - `nshop/layers/base/app/components/checkout/PickupLocationSelect.vue`（L28-37）：用
    `GqlGetPickupLocations({type,lat,lng})` **取全量**，未按档案过滤——疑似泄漏源。
  - `nshop/layers/base/app/components/checkout/DeliveryModeBlock.vue`（L30-38）：用
    `GqlGetPickupLocations({type,...})` 探点存在性——疑似泄漏源。

## 3. 已确认决策

1. 受控名单 = 档案方法级 `options.pickupLocationIds`（rangeMode='selected'），**不改后端**。
2. C 端自提点选择统一收敛到 **`box.pickupLocations`**；弃用/替换按 `type` 取全量的 `GqlGetPickupLocations`
   作为"选择源"（仍可用于探存在性等非选择用途时不受影响——按实测定夺）。
3. 管理端勾选行为与编辑回选维持现状，不做改动；如候选池需要仅显本档案点属可选微调，默认不做。
4. 交付含一步**实测验证**：取消勾选某点 → C 端该点消失。

## 4. C 端改动方向（nshop）

待计划阶段以 `BoxPickupBlock.vue` 为基准，排查 `PickupLocationSelect.vue`/`DeliveryModeBlock.vue`
是否在结账自提选择流程中暴露全量点；若是，改为读取当前箱 `box.pickupLocations`（含其类型与可见性），
保证未勾选点不渲染。具体删除/替换边界以计划内快速验证结果为准。

## 5. 约束与一致性

- 复用现有令牌/组件风格，不造新 UI。
- 不改后端接口返回结构，避免破坏 `rangeMode='all'`（同城全部）既有语义——本改动针对"希望受控"的档案采用
  `selected` 场景，`all` 保留原行为。
- C 端改动集中在 nshop checkout 自提选择组件，不触碰订单/支付核心。

## 6. 非目标

- 区域/分组建模、超管分权、按配送方式细分弹窗等不做。
- 不做"同城全部"模式的强制收紧。

## 7. 测试与交付

- C 端构建 + 手机视口截图回归（390×844，dpr=2）：档案仅勾选 a → C 端仅见 a；不勾选 a → a 消失。
- 管理端编辑回选取含已勾选点的回归。
- 部署：nshop 前端本地产物 → 服务器解压/拷入（勿在服务器构建）。

## 8. 风险

- 若 C 端实际选择流转仍走全局 `GqlGetPickupLocations`，需在计划中先定位真实调用链再改，
  避免误删用途（如 `DeliveryModeBlock` 仅探存在）。计划含一次现状验证步骤以钉死缺口。